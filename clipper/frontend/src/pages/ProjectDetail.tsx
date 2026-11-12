import { FileText, Scissors, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Empty, ErrorBox, Field, JobRow, PageHeader, Select, Spinner, useLoad } from "../components/ui";
import { fmtBytes, fmtTime, get, post, type Clip, type Project } from "../services/api";
import { useApp, useJobs } from "../stores/app";

export default function ProjectDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const toast = useApp((s) => s.toast);
  const finished = useApp((s) => s.finished);
  const jobs = useJobs((j) => j.project_id === pid);
  const [project, , error] = useLoad(() => get<Project>(`/api/projects/${pid}`), [pid, finished]);
  const video = project?.videos[0];
  const [transcript] = useLoad(() => (video ? get(`/api/videos/${video.id}/transcript`) : Promise.resolve(null)), [video?.id, finished]);
  const [clips] = useLoad(() => get<Clip[]>(`/api/clips?project_id=${pid}`), [pid, finished]);
  const [settings] = useLoad(() => get("/api/settings"));
  const [language, setLanguage] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const srt = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(0);

  if (error) return <ErrorBox text={error} />;
  if (!project) return <Spinner />;
  const working = jobs.some((j) => (j.status === "running" || j.status === "queued") && j.type !== "video_render");
  const run = (p: Promise<unknown>, ok: string) => { setBusy(true); p.then(() => toast(ok)).catch((e) => toast(e.message, "error")).finally(() => setBusy(false)); };
  const analyze = () => run(post(`/api/videos/${video!.id}/analyze`, { ...(language && { language }), ...(model && { model }) }), "Analysis started");
  const importSrt = (f?: File) => {
    if (!f) return;
    const form = new FormData();
    form.append("file", f);
    run(post(`/api/videos/${video!.id}/transcript/import`, form).then(() => post(`/api/videos/${video!.id}/candidates/regenerate`, {})), "Transcript imported; finding highlights");
  };
  const manualClip = () => {
    const start = Math.max(0, Math.min(now, video!.duration - 2));
    post<Clip>("/api/clips", { source_video_id: video!.id, start, end: Math.min(video!.duration, start + 30), title: `${project.name} clip` })
      .then((c) => nav(`/editor/${c.id}`)).catch((e) => toast(e.message, "error"));
  };

  return (
    <>
      <PageHeader title={project.name} subtitle={project.description || undefined}
        actions={<><Link to={`/clips?project=${pid}`}><Button><Sparkles className="size-4" />AI Clips ({project.candidate_count})</Button></Link></>} />
      {!video ? (
        jobs.some((j) => j.type === "video_import") ? <div className="grid gap-2">{jobs.map((j) => <JobRow key={j.id} job={j} />)}</div>
          : <Empty title="This project has no video" text="The import did not finish. Create a new project to import a video." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-6">
            <Card className="!p-0 overflow-hidden">
              <video ref={player} src={`/api/videos/${video.id}/file`} controls className="aspect-video w-full bg-black" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 p-4 text-xs text-muted">
                <span className="text-sm font-medium text-ink">{video.filename}</span>
                <span>{fmtTime(video.duration)}</span><span>{video.width}×{video.height}</span><span>{video.fps} fps</span>
                <span>{video.video_codec}{video.audio_codec ? ` / ${video.audio_codec}` : " / no audio"}</span><span>{fmtBytes(video.size_bytes)}</span>
                <Badge>{video.status}</Badge>
                <Button small className="ml-auto" onClick={manualClip}><Scissors className="size-3.5" />Clip 30s from {fmtTime(now)}</Button>
              </div>
            </Card>
            <Card>
              <h2 className="mb-1 font-semibold">Analyse with AI</h2>
              <p className="mb-4 text-sm text-muted">Extracts the audio, transcribes it with Whisper on this computer, then finds and scores candidate clips.</p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Language" className="w-40"><Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">Default ({settings?.whisper_language ?? "auto"})</option><option value="auto">Auto-detect</option><option value="en">English</option><option value="hi">Hindi / Hinglish</option>
                </Select></Field>
                <Field label="Whisper model" className="w-44"><Select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Default ({settings?.whisper_model ?? "small"})</option>
                  {(settings?._whisper_models ?? []).map((m: string) => <option key={m}>{m}</option>)}
                </Select></Field>
                <Button variant="primary" disabled={working || !video.audio_streams} busy={busy} onClick={analyze}>{transcript ? "Analyse again" : "Start analysis"}</Button>
                <Button disabled={working} onClick={() => srt.current?.click()}><FileText className="size-4" />Import transcript (.srt / .vtt)</Button>
                <input ref={srt} type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => { importSrt(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              {!video.audio_streams && <p className="mt-3 text-xs text-warn">This video has no audio track, so it cannot be transcribed. You can import a transcript or cut clips by hand.</p>}
            </Card>
            {jobs.length > 0 && <Card><h2 className="mb-3 font-semibold">Processing</h2><div className="grid gap-2">{jobs.slice(0, 8).map((j) => <JobRow key={j.id} job={j} />)}</div></Card>}
            <Card>
              <h2 className="mb-3 font-semibold">Clips</h2>
              {!clips?.length ? <p className="text-sm text-muted">No clips yet. Accept a candidate in AI Clips, or cut one by hand from the player above.</p> : (
                <ul className="divide-y divide-line">{clips.map((c) => (
                  <li key={c.id}><Link to={`/editor/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                    <span className="truncate">{c.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted">{fmtTime(c.start)} – {fmtTime(c.end)}<Badge>{c.status}</Badge></span>
                  </Link></li>))}
                </ul>
              )}
            </Card>
          </div>
          <Card className="flex max-h-[calc(100vh-8rem)] flex-col xl:sticky xl:top-6">
            <h2 className="mb-1 font-semibold">Transcript</h2>
            {transcript ? <>
              <p className="mb-3 text-xs text-muted">{transcript.segments.length} segments · {transcript.origin === "import" ? "imported file" : `Whisper ${transcript.model}`}{transcript.language && ` · ${transcript.language}`} · click a line to jump there</p>
              <ol className="-mx-2 flex-1 overflow-y-auto">
                {transcript.segments.map((s: any) => {
                  const active = now >= s.start && now < s.end;
                  return (
                    <li key={s.id}><button onClick={() => { if (player.current) { player.current.currentTime = s.start; player.current.play(); } }}
                      className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition ${active ? "bg-accent/15" : "hover:bg-panel2"}`}>
                      <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted">{fmtTime(s.start)}</span><span>{s.text}</span>
                    </button></li>
                  );
                })}
              </ol>
            </> : <Empty title="No transcript yet" text="Start the analysis, or import an .srt / .vtt file you already have." />}
          </Card>
        </div>
      )}
    </>
  );
}
