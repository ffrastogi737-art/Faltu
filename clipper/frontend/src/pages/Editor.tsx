import { Download, Pause, Play, RotateCcw, Scissors, SkipBack, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import CaptionOverlay from "../components/CaptionOverlay";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, JobRow, NumberInput, PageHeader, Select, Slider, Spinner, Toggle, useLoad } from "../components/ui";
import { del, fmtDate, fmtTime, get, patch, post, put, type Campaign, type CaptionStyle, type CheckItem, type Clip, type ClipSettings, type Preset, type Word } from "../services/api";
import { useApp, useJobs } from "../stores/app";

export default function Editor() {
  const { id } = useParams();
  return id ? <Workspace key={id} id={Number(id)} /> : <ClipPicker />;
}

function ClipPicker() {
  const [clips, , error] = useLoad(() => get<Clip[]>("/api/clips"));
  if (error) return <ErrorBox text={error} />;
  if (!clips) return <Spinner />;
  return (
    <>
      <PageHeader title="Video Editor" subtitle="Pick a clip to trim, caption, frame and export." />
      {!clips.length ? <Empty icon={<Scissors className="size-8" />} title="No clips yet" text="Accept a candidate in AI Clips, or cut a clip by hand on a project page." action={<Link to="/clips"><Button variant="primary">Go to AI Clips</Button></Link>} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clips.map((c) => (
            <Link key={c.id} to={`/editor/${c.id}`}><Card className="transition hover:border-accent/50">
              <div className="flex items-start justify-between gap-2"><h2 className="font-medium leading-snug">{c.title}</h2><Badge>{c.status}</Badge></div>
              <div className="mt-2 text-xs text-muted">{Math.round(c.end - c.start)}s · {fmtTime(c.start)} – {fmtTime(c.end)} · edited {fmtDate(c.updated_at)}</div>
            </Card></Link>
          ))}
        </div>
      )}
    </>
  );
}

const TABS = ["Trim", "Captions", "Frame", "Audio", "Export"] as const;
const ASPECT_CSS: Record<string, string> = { "9:16": "9 / 16", "1:1": "1 / 1", "16:9": "16 / 9", "4:5": "4 / 5" };

function Workspace({ id }: { id: number }) {
  const nav = useNavigate();
  const toast = useApp((s) => s.toast);
  const finished = useApp((s) => s.finished);
  const [clip, setClip] = useState<Clip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Trim");
  const [view, setView] = useState<"live" | "rendered">("live");
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0); // source-video time
  const [saving, setSaving] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const pending = useRef<Record<string, unknown>>({});
  const pendingWords = useRef<Word[] | null>(null);
  const timer = useRef<number>(0);
  const clipRef = useRef<Clip | null>(null);
  clipRef.current = clip;

  useEffect(() => { get<Clip>(`/api/clips/${id}`).then((c) => { setClip(c); setNow(c.start); }).catch((e) => setError(e.message)); }, [id]);

  // --- saving: edits apply to the screen at once and are written to the server shortly after -------------
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const body = pending.current, words = pendingWords.current;
    pending.current = {}; pendingWords.current = null;
    if (!Object.keys(body).length && !words) return;
    try {
      let fresh: Clip | null = null;
      if (Object.keys(body).length) fresh = await patch<Clip>(`/api/clips/${id}`, body);
      if (words) fresh = await put<Clip>(`/api/clips/${id}/subtitles`, { words });
      // only take the server's view when nothing newer was typed meanwhile
      if (fresh && !Object.keys(pending.current).length && !pendingWords.current) setClip(fresh);
    } catch (e) {
      toast((e as Error).message, "error");
      get<Clip>(`/api/clips/${id}`).then(setClip).catch(() => {}); // fall back to what is really saved
    } finally { setSaving(Object.keys(pending.current).length > 0 || pendingWords.current !== null); }
  }, [id, toast]);
  // "saving" turns on the moment something is edited, not when the request starts, so the status never claims too much
  const schedule = () => { setSaving(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 450); };
  useEffect(() => {
    if (!saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault(); // closing the tab mid-save would lose the edit
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  const update = (p: Partial<Pick<Clip, "title" | "start" | "end" | "campaign_id">>) => {
    setClip((c) => c && { ...c, ...p });
    Object.assign(pending.current, p);
    schedule();
  };
  const setting = (p: Partial<ClipSettings>) => {
    const settings = { ...clipRef.current!.settings, ...p };
    setClip((c) => c && { ...c, settings });
    pending.current.settings = settings;
    schedule();
  };
  const styleSet = (p: Partial<CaptionStyle>) => setting({ style: { ...clipRef.current!.settings.style, ...p } });
  const setWords = (words: Word[]) => { setClip((c) => c && { ...c, words }); pendingWords.current = words; schedule(); };
  useEffect(() => () => { flush(); }, [flush]); // save on leaving the page

  // --- render job tracking ---------------------------------------------------------------------------
  const jobs = useJobs((j) => j.clip_id === id && j.type === "video_render");
  useEffect(() => {
    if (!finished) return;
    get<Clip>(`/api/clips/${id}`).then((c) => setClip((cur) => cur && { ...cur, status: c.status, output_path: c.output_path, updated_at: c.updated_at })).catch(() => {});
  }, [finished, id]);

  // --- playback: stays inside the clip, and a frame loop keeps captions in step with the audio -----------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = video.current, c = clipRef.current;
      if (v && c) {
        if (v.currentTime >= c.end) { v.pause(); v.currentTime = c.start; setPlaying(false); setNow(c.start); return; }
        setNow(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const seek = (t: number) => { if (video.current) video.current.currentTime = t; setNow(t); };
  const toggle = () => {
    const v = video.current;
    if (!v || !clip) return;
    if (playing) { v.pause(); setPlaying(false); return; }
    if (v.currentTime < clip.start || v.currentTime >= clip.end - 0.05) v.currentTime = clip.start;
    v.play().then(() => setPlaying(true)).catch(() => toast("The browser cannot play this video format for preview. Rendering still works.", "error"));
  };
  useEffect(() => { if (video.current && clip) video.current.volume = Math.min(1, clip.settings.volume); }, [clip?.settings.volume]); // eslint-disable-line

  const [templates] = useLoad(() => get<CaptionStyle[]>("/api/caption-templates"));
  if (error) return <ErrorBox text={error} />;
  if (!clip) return <Spinner />;
  // the style as edited right now (template + overrides), so the preview reacts before the save round-trip
  const live: CaptionStyle = { ...(templates?.find((t) => t.id === clip.settings.template) ?? clip.style), ...clip.settings.style };
  const s = clip.settings, len = clip.end - clip.start, rel = now - clip.start;
  const cover = s.crop_mode !== "blur";

  return (
    <>
      <PageHeader title={clip.title} subtitle={`From ${clip.video.filename} · ${len.toFixed(1)}s · ${saving ? "saving..." : "all changes saved"}`}
        actions={<><Badge>{clip.status}</Badge><Link to={`/projects/${clip.project_id}`}><Button>Project</Button></Link>
          <Button variant="danger" onClick={() => { if (confirm("Delete this clip? An exported MP4 stays in the exports folder.")) del(`/api/clips/${id}`).then(() => nav("/editor")); }}><Trash2 className="size-4" /></Button></>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid content-start gap-4">
          <Card className="!p-4">
            <div className="mb-3 flex gap-2">
              <Button small variant={view === "live" ? "primary" : "soft"} onClick={() => setView("live")}>Live preview</Button>
              <Button small variant={view === "rendered" ? "primary" : "soft"} disabled={!clip.output_path} onClick={() => { video.current?.pause(); setPlaying(false); setView("rendered"); }}>Rendered export</Button>
            </div>
            <div className="flex justify-center rounded-lg bg-base p-3">
              {view === "rendered" && clip.output_path ? (
                <video key={clip.output_path} src={`/api/clips/${id}/file?v=${encodeURIComponent(clip.output_path)}`} controls className="max-h-[62vh] rounded" />
              ) : (
                <div className="relative overflow-hidden rounded bg-black" style={{ aspectRatio: ASPECT_CSS[s.aspect], height: "62vh", maxWidth: "100%", containerType: "inline-size" }}>
                  <video ref={video} src={`/api/videos/${clip.video.id}/file`} playsInline preload="metadata" onClick={toggle}
                    onLoadedMetadata={(e) => { e.currentTarget.currentTime = clip.start; }}
                    className="size-full cursor-pointer" style={{
                      objectFit: cover ? "cover" : "contain", objectPosition: `${s.crop_x * 100}% ${s.crop_y * 100}%`,
                      transform: `scale(${s.zoom})`, transformOrigin: cover ? `${s.crop_x * 100}% ${s.crop_y * 100}%` : "center",
                    }} />
                  {s.captions && <CaptionOverlay cues={clip.cues} style={live} t={rel} />}
                </div>
              )}
            </div>
            {view === "live" && <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
                <Button onClick={() => seek(clip.start)} aria-label="Back to start"><SkipBack className="size-4" /></Button>
                <span className="text-sm tabular-nums">{fmtTime(Math.max(0, rel), true)} <span className="text-muted">/ {fmtTime(len, true)}</span></span>
                <span className="text-xs text-muted sm:ml-auto">
                  {s.crop_mode === "face" && "Face position is found at export; preview shows the manual position. "}
                  {s.crop_mode === "blur" && "Blurred background is added at export. "}
                  {s.remove_silence && "Silence is cut at export."}
                </span>
              </div>
              <Timeline clip={clip} now={now} onSeek={seek} onTrim={(start, end) => update({ start, end })} />
            </>}
          </Card>
        </div>

        <Card className="!p-0 self-start">
          <div className="flex border-b border-line" role="tablist">
            {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`flex-1 px-2 py-3 text-sm font-medium transition ${tab === t ? "border-b-2 border-accent text-ink" : "text-muted hover:text-ink"}`}>{t}</button>)}
          </div>
          <div className="grid max-h-[calc(100vh-14rem)] gap-4 overflow-y-auto p-5">
            {tab === "Trim" && <>
              <Field label="Title"><Input value={clip.title} maxLength={200} onChange={(e) => e.target.value.trim() && update({ title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start (seconds)"><NumberInput step={0.1} min={0} max={clip.end - 1} value={clip.start} onChange={(v) => v !== null && v >= 0 && v <= clip.end - 1 && update({ start: v })} /></Field>
                <Field label="End (seconds)"><NumberInput step={0.1} min={clip.start + 1} max={clip.video.duration} value={clip.end} onChange={(v) => v !== null && v >= clip.start + 1 && v <= clip.video.duration && update({ end: v })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button disabled={now > clip.end - 1} onClick={() => update({ start: Number(now.toFixed(2)) })}>Start at playhead</Button>
                <Button disabled={now < clip.start + 1} onClick={() => update({ end: Number(now.toFixed(2)) })}>End at playhead</Button>
              </div>
              <p className="text-xs text-muted">Drag the handles on the timeline, type exact times, or play to a spot and use the buttons. Source video is {fmtTime(clip.video.duration)} long. Captions follow the new range automatically.</p>
            </>}
            {tab === "Captions" && <CaptionsTab clip={clip} st={live} templates={templates} setting={setting} styleSet={styleSet} setWords={setWords} seek={seek} now={now}
              reset={() => flush().then(() => post<Clip>(`/api/clips/${id}/subtitles/reset`)).then(setClip).catch((e) => toast(e.message, "error"))} />}
            {tab === "Frame" && <FrameTab s={s} setting={setting} />}
            {tab === "Audio" && <>
              {!clip.video.audio_streams && <p className="text-xs text-warn">This video has no audio track; the export gets a silent track.</p>}
              <Slider label="Volume" min={0} max={2} step={0.05} value={s.volume} onChange={(v) => setting({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <p className="-mt-2 text-xs text-muted">Preview playback tops out at 100%; the export applies the full value.</p>
              <Toggle label="Normalise loudness" hint="Evens the level to about -14 LUFS, the usual target for short-form video." checked={s.normalize_audio} onChange={(v) => setting({ normalize_audio: v })} />
              <Toggle label="Remove silent pauses" hint="Cuts quiet stretches out of the export. Captions shift to match." checked={s.remove_silence} onChange={(v) => setting({ remove_silence: v })} />
              {s.remove_silence && <>
                <Slider label="Quieter than this counts as silence" min={-60} max={-20} step={1} value={s.silence_db} onChange={(v) => setting({ silence_db: v })} format={(v) => `${v} dB`} />
                <Slider label="Shortest pause to cut" min={0.3} max={3} step={0.1} value={s.silence_min} onChange={(v) => setting({ silence_min: v })} format={(v) => `${v.toFixed(1)} s`} />
              </>}
            </>}
            {tab === "Export" && <ExportTab clip={clip} jobs={jobs} update={update} flush={flush} />}
          </div>
        </Card>
      </div>
    </>
  );
}

function Timeline({ clip, now, onSeek, onTrim }: { clip: Clip; now: number; onSeek: (t: number) => void; onTrim: (start: number, end: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const total = clip.video.duration;
  const span = (c: Clip): [number, number] => {
    if (total <= 300) return [0, total]; // short sources show whole; long ones show the neighbourhood of the clip
    const pad = Math.max(45, (c.end - c.start) * 1.5), mid = (c.start + c.end) / 2;
    const a = Math.max(0, Math.min(mid - pad, total - 2 * pad));
    return [a, Math.min(total, a + 2 * pad)];
  };
  const [win, setWin] = useState(() => span(clip));
  const drag = useRef<"start" | "end" | null>(null);
  const [w0, w1] = win;
  const pct = (t: number) => `${((Math.min(w1, Math.max(w0, t)) - w0) / (w1 - w0)) * 100}%`;
  const at = (x: number) => { const r = bar.current!.getBoundingClientRect(); return w0 + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (w1 - w0); };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const t = Number(at(e.clientX).toFixed(2));
    if (drag.current === "start") onTrim(Math.max(0, Math.min(t, clip.end - 1)), clip.end);
    else onTrim(clip.start, Math.min(total, Math.max(t, clip.start + 1)));
  };
  const handle = (which: "start" | "end") => (
    <div role="slider" tabIndex={0} aria-label={`Clip ${which}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={clip[which]}
      onPointerDown={(e) => { e.stopPropagation(); drag.current = which; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={move} onPointerUp={() => { drag.current = null; setWin(span(clip)); }}
      onKeyDown={(e) => {
        const d = e.key === "ArrowLeft" ? -0.1 : e.key === "ArrowRight" ? 0.1 : 0;
        if (!d) return;
        e.preventDefault();
        if (which === "start") onTrim(Math.max(0, Math.min(clip.start + d, clip.end - 1)), clip.end);
        else onTrim(clip.start, Math.min(total, Math.max(clip.end + d, clip.start + 1)));
      }}
      className="absolute top-0 z-10 h-full w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded bg-white shadow" style={{ left: pct(clip[which]) }} />
  );
  return (
    <div className="mt-4">
      <div ref={bar} className="relative h-12 cursor-pointer select-none rounded-lg bg-panel2" onPointerDown={(e) => onSeek(Math.min(clip.end - 0.05, Math.max(clip.start, at(e.clientX))))}>
        <div className="absolute top-0 h-full rounded bg-accent/35 ring-1 ring-accent" style={{ left: pct(clip.start), width: `calc(${pct(clip.end)} - ${pct(clip.start)})` }} />
        {clip.cues.map((c, i) => <div key={i} className="absolute bottom-1 h-1 rounded bg-accent2/70" style={{ left: pct(clip.start + c.start), width: `calc(${pct(clip.start + c.end)} - ${pct(clip.start + c.start)})` }} />)}
        {handle("start")}{handle("end")}
        <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-bad" style={{ left: pct(now) }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted"><span>{fmtTime(w0)}</span><span>clip {fmtTime(clip.start, true)} – {fmtTime(clip.end, true)}</span><span>{fmtTime(w1)}</span></div>
    </div>
  );
}

function CaptionsTab({ clip, st, templates, setting, styleSet, setWords, reset, seek, now }: {
  clip: Clip; st: CaptionStyle; templates?: CaptionStyle[]; setting: (p: Partial<ClipSettings>) => void; styleSet: (p: Partial<CaptionStyle>) => void; setWords: (w: Word[]) => void; reset: () => void; seek: (t: number) => void; now: number;
}) {
  const s = clip.settings;
  const [fonts] = useLoad(() => get<string[]>("/api/fonts"));
  const inClip = clip.words.map((w, i) => ({ w, i })).filter(({ w }) => w.end > clip.start && w.start < clip.end);
  const edit = (i: number, p: Partial<Word>) => setWords(clip.words.map((w, j) => (j === i ? { ...w, ...p } : w)));
  const color = (label: string, key: "primary" | "highlight" | "outline_color") => (
    <Field label={label}><input type="color" className="h-9 w-full cursor-pointer rounded border border-line bg-base" value={st[key]} onChange={(e) => styleSet({ [key]: e.target.value })} /></Field>
  );
  return <>
    <Toggle label="Show captions" checked={s.captions} onChange={(v) => setting({ captions: v })} />
    {s.captions && <>
      <Field label="Template"><Select value={s.template} onChange={(e) => setting({ template: e.target.value, style: {} })}>
        {templates?.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Font" hint="Any font installed on this computer"><Input list="fonts" value={st.font} onChange={(e) => e.target.value && styleSet({ font: e.target.value })} /><datalist id="fonts">{fonts?.map((f) => <option key={f} value={f} />)}</datalist></Field>
        <Field label="Words per line"><NumberInput min={1} max={12} value={st.words_per_line} onChange={(v) => v && v >= 1 && v <= 12 && styleSet({ words_per_line: Math.round(v) })} /></Field>
      </div>
      <Slider label="Size" min={30} max={160} step={2} value={st.size} onChange={(v) => styleSet({ size: v })} />
      <Slider label="Vertical position" min={0.05} max={0.95} step={0.01} value={st.pos_y} onChange={(v) => styleSet({ pos_y: v })} format={(v) => `${Math.round(v * 100)}% from top`} />
      <div className="grid grid-cols-3 gap-3">{color("Text", "primary")}{color("Active word", "highlight")}{color("Outline", "outline_color")}</div>
      <Slider label="Outline thickness" min={0} max={16} step={1} value={st.outline} onChange={(v) => styleSet({ outline: v })} />
      <Slider label="Shadow" min={0} max={10} step={1} value={st.shadow} onChange={(v) => styleSet({ shadow: v })} />
      <Slider label="Active word size" min={100} max={140} step={2} value={st.active_scale} onChange={(v) => styleSet({ active_scale: v })} format={(v) => `${v}%`} />
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="UPPERCASE" checked={st.uppercase} onChange={(v) => styleSet({ uppercase: v })} />
        <Toggle label="Bold" checked={st.bold} onChange={(v) => styleSet({ bold: v })} />
        <Toggle label="Pop-in animation" checked={st.pop} onChange={(v) => styleSet({ pop: v })} />
        <Toggle label="Background bar" checked={st.box} onChange={(v) => styleSet({ box: v })} />
      </div>
      {Object.keys(s.style).length > 0 && <Button small variant="ghost" onClick={() => setting({ style: {} })}>Reset style to template</Button>}
    </>}
    <div className="mt-2 flex items-center justify-between border-t border-line pt-4">
      <div><div className="text-sm font-medium">Caption text</div><div className="text-xs text-muted">Fix any word. Emoji typed here are kept. Click a time to jump there.</div></div>
      <Button small onClick={() => confirm("Replace all caption text with the original transcript? Your corrections will be lost.") && reset()}><RotateCcw className="size-3.5" />Reset</Button>
    </div>
    {!inClip.length ? <p className="text-sm text-muted">No words in this range. The video may not be transcribed yet.</p> : (
      <ul className="grid gap-1">
        {inClip.map(({ w, i }) => (
          <li key={i} className={`flex items-center gap-2 rounded px-1 ${now >= w.start && now < w.end ? "bg-accent/15" : ""}`}>
            <button className="w-14 shrink-0 text-left text-[11px] tabular-nums text-muted hover:text-accent" onClick={() => seek(w.start)}>{fmtTime(w.start - clip.start, true)}</button>
            <Input className="!py-1" aria-label="Caption word" value={w.text} maxLength={200} onChange={(e) => edit(i, { text: e.target.value })} />
            <button aria-label="Start earlier" title="Start 0.05s earlier" className="px-1 text-muted hover:text-ink" onClick={() => edit(i, { start: Math.max(0, Number((w.start - 0.05).toFixed(3))) })}>−</button>
            <button aria-label="Start later" title="Start 0.05s later" className="px-1 text-muted hover:text-ink" onClick={() => w.start + 0.05 < w.end && edit(i, { start: Number((w.start + 0.05).toFixed(3)) })}>+</button>
            <button aria-label="Delete word" className="px-1 text-muted hover:text-bad" onClick={() => setWords(clip.words.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    )}
  </>;
}

function FrameTab({ s, setting }: { s: ClipSettings; setting: (p: Partial<ClipSettings>) => void }) {
  const toast = useApp((st) => st.toast);
  const [assets, reload] = useLoad(() => get<{ name: string; kind: string }[]>("/api/assets"));
  const file = useRef<HTMLInputElement>(null);
  const add = (f?: File) => {
    if (!f) return;
    const form = new FormData();
    form.append("file", f);
    post("/api/assets", form).then(() => { reload(); toast("Asset added"); }).catch((e) => toast(e.message, "error"));
  };
  const pick = (label: string, key: "watermark" | "intro" | "outro", kind: string) => (
    <Field label={label}><Select value={s[key] ?? ""} onChange={(e) => setting({ [key]: e.target.value || null })}>
      <option value="">None</option>{assets?.filter((a) => a.kind === kind).map((a) => <option key={a.name}>{a.name}</option>)}
    </Select></Field>
  );
  return <>
    <Field label="Aspect ratio"><Select value={s.aspect} onChange={(e) => setting({ aspect: e.target.value })}>
      <option value="9:16">9:16 vertical (Shorts, Reels, TikTok)</option><option value="4:5">4:5 portrait</option><option value="1:1">1:1 square</option><option value="16:9">16:9 landscape</option>
    </Select></Field>
    <Field label="How to fit the video"><Select value={s.crop_mode} onChange={(e) => setting({ crop_mode: e.target.value as ClipSettings["crop_mode"] })}>
      <option value="center">Crop to fill (position below)</option><option value="face">Crop to fill, centred on the speaker's face</option><option value="blur">Fit whole frame on a blurred background</option>
    </Select></Field>
    {s.crop_mode !== "blur" && <>
      <Slider label="Horizontal position" min={0} max={1} step={0.01} value={s.crop_x} onChange={(v) => setting({ crop_x: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Vertical position" min={0} max={1} step={0.01} value={s.crop_y} onChange={(v) => setting({ crop_y: v })} format={(v) => `${Math.round(v * 100)}%`} />
      {s.crop_mode === "face" && <p className="-mt-2 text-xs text-muted">Used only if no face is found.</p>}
    </>}
    <Slider label="Zoom" min={1} max={3} step={0.05} value={s.zoom} onChange={(v) => setting({ zoom: v })} format={(v) => `${v.toFixed(2)}×`} />
    <Toggle label="Slow push-in" hint="Zooms in gently (8%) over the length of the clip. Applied at export." checked={s.dynamic_zoom} onChange={(v) => setting({ dynamic_zoom: v })} />
    <div className="grid gap-3 border-t border-line pt-4">
      <div className="flex items-center justify-between"><span className="text-sm font-medium">Branding</span>
        <Button small onClick={() => file.current?.click()}><Upload className="size-3.5" />Add logo or intro/outro</Button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,video/*" className="hidden" onChange={(e) => { add(e.target.files?.[0]); e.target.value = ""; }} /></div>
      {pick("Logo watermark", "watermark", "image")}
      {s.watermark && <Field label="Logo position"><Select value={s.watermark_pos} onChange={(e) => setting({ watermark_pos: e.target.value })}>
        <option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option>
      </Select></Field>}
      {pick("Intro video", "intro", "video")}{pick("Outro video", "outro", "video")}
    </div>
  </>;
}

function ExportTab({ clip, jobs, update, flush }: { clip: Clip; jobs: ReturnType<typeof useJobs>; update: (p: { campaign_id: number | null }) => void; flush: () => Promise<void> }) {
  const toast = useApp((s) => s.toast);
  const [presets] = useLoad(() => get<Preset[]>("/api/presets"));
  const [campaigns] = useLoad(() => get<Campaign[]>("/api/campaigns"));
  const [preset, setPreset] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [checks] = useLoad<CheckItem[]>(() => (clip.campaign_id ? get(`/api/campaigns/${clip.campaign_id}/checklist?clip_id=${clip.id}`) : Promise.resolve([])), [clip.campaign_id, clip.start, clip.end]);
  const rendering = jobs.some((j) => j.status === "queued" || j.status === "running");
  const render = async () => {
    setBusy(true);
    try { await flush(); await post(`/api/clips/${clip.id}/render`, { preset_id: preset || presets?.[0]?.id }); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  return <>
    <Field label="Quality preset" hint="Manage presets on the Templates page."><Select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
      {presets?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.short_side}p, H.264 + AAC)</option>)}
    </Select></Field>
    <Button variant="primary" busy={busy} disabled={rendering} onClick={render}>{rendering ? "Rendering..." : clip.output_path ? "Render again" : "Render MP4"}</Button>
    <p className="-mt-2 text-xs text-muted">Each render is saved as a new file; earlier exports are never overwritten and the original video is never changed.</p>
    {jobs.slice(0, 3).map((j) => <JobRow key={j.id} job={j} />)}
    {clip.output_path && <a href={`/api/clips/${clip.id}/file?download=1`}><Button className="w-full"><Download className="size-4" />Download latest export</Button></a>}
    {clip.output_path && <p className="-mt-2 break-all text-xs text-muted">Saved in your storage folder as {clip.output_path}</p>}
    <div className="grid gap-3 border-t border-line pt-4">
      <Field label="Campaign" hint="Link this clip to a campaign to check it against the campaign's requirements.">
        <Select value={clip.campaign_id ?? ""} onChange={(e) => update({ campaign_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Not linked</option>{campaigns?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      {clip.campaign_id && checks && (checks.length ? <Checklist items={checks} /> : <p className="text-xs text-muted">This campaign has no requirements to check.</p>)}
      {clip.campaign_id && <p className="text-xs text-muted">Caption and platform checks happen when you record a submission on the Campaigns page.</p>}
    </div>
  </>;
}

export function Checklist({ items, onConfirm }: { items: CheckItem[]; onConfirm?: (ruleId: number, done: boolean) => void }) {
  const mark = { pass: "✓", fail: "✕", manual: "?", unknown: "–" };
  const tone = { pass: "text-good", fail: "text-bad", manual: "text-warn", unknown: "text-muted" };
  return (
    <ul className="grid gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {it.rule_id !== undefined && onConfirm
            ? <input type="checkbox" className="mt-1" aria-label={`Confirm: ${it.label}`} checked={it.status === "pass"} onChange={(e) => onConfirm(it.rule_id!, e.target.checked)} />
            : <span className={`w-4 shrink-0 text-center font-bold ${tone[it.status]}`} aria-label={it.status}>{mark[it.status]}</span>}
          <span>{it.label}{it.detail && <span className="block text-xs text-muted">{it.detail}</span>}</span>
        </li>
      ))}
    </ul>
  );
}
