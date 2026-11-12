import { Check, Play, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, NumberInput, PageHeader, Select, Slider, Spinner, useLoad } from "../components/ui";
import { fmtTime, get, patch, post, put, type Candidate, type Clip, type Project } from "../services/api";
import { useApp, useJobs } from "../stores/app";

const PARTS: [string, string][] = [["hook", "Hook strength"], ["emotion", "Emotional impact"], ["curiosity", "Curiosity"], ["information", "Information value"], ["completeness", "Story completeness"], ["av_quality", "Audio and visual"]];
const level = (v: number) => (v >= 70 ? "High" : v >= 45 ? "Medium" : "Low");

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "var(--color-good)" : score >= 45 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <div className="grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--color-panel2) 0)` }}
      title="Clip Quality Score: a local estimate from the transcript, audio and frames. It is not a prediction of views.">
      <div className="grid size-[52px] place-items-center rounded-full bg-panel text-center leading-none">
        <div><span className="text-lg font-semibold tabular-nums">{Math.round(score)}</span><span className="block text-[9px] text-muted">/ 100</span></div>
      </div>
    </div>
  );
}

function CandidateCard({ c, rank, onChange, onPreview }: { c: Candidate; rank: number; onChange: () => void; onPreview: (c: Candidate) => void }) {
  const nav = useNavigate();
  const toast = useApp((s) => s.toast);
  const [start, setStart] = useState<number | null>(c.start);
  const [end, setEnd] = useState<number | null>(c.end);
  const dirty = start !== c.start || end !== c.end;
  const fail = (e: Error) => toast(e.message, "error");
  const saveTimes = () => patch(`/api/candidates/${c.id}`, { start, end }).then(onChange).catch(fail);
  const accept = () => (dirty ? patch(`/api/candidates/${c.id}`, { start, end }) : Promise.resolve())
    .then(() => post<Clip>(`/api/candidates/${c.id}/accept`)).then((clip) => nav(`/editor/${clip.id}`)).catch(fail);
  const setStatus = (status: string) => patch(`/api/candidates/${c.id}`, { status }).then(onChange).catch(fail);
  return (
    <Card className={c.status === "rejected" ? "opacity-60" : ""}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <ScoreRing score={c.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted">Clip #{rank}</span>
            <h3 className="font-semibold">{c.title}</h3>
            {c.status !== "new" && <Badge>{c.status}</Badge>}
            <span className="ml-auto text-xs tabular-nums text-muted">{Math.round(c.end - c.start)}s · {fmtTime(c.start)} – {fmtTime(c.end)}</span>
          </div>
          <p className="mt-1 text-sm text-muted"><span className="text-ink">Why: </span>{c.reason}</p>
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 md:grid-cols-3">
            {PARTS.map(([k, label]) => (
              <div key={k} className="text-xs">
                <div className="flex justify-between text-muted"><span>{label}</span><span className="text-ink">{level(c.subscores[k])} · {Math.round(c.subscores[k])}</span></div>
                <div className="mt-0.5 h-1 rounded-full bg-panel2"><div className="h-full rounded-full bg-accent" style={{ width: `${c.subscores[k]}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-base p-3"><p className="line-clamp-3 text-sm text-muted">{c.transcript}</p></div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Start (s)" className="w-24"><NumberInput step={0.1} min={0} value={start} onChange={setStart} /></Field>
            <Field label="End (s)" className="w-24"><NumberInput step={0.1} min={0} value={end} onChange={setEnd} /></Field>
            {dirty && <Button small onClick={saveTimes} disabled={start === null || end === null}>Save times</Button>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button onClick={() => onPreview({ ...c, start: start ?? c.start, end: end ?? c.end })}><Play className="size-4" />Preview</Button>
              {c.status === "rejected" ? <Button onClick={() => setStatus("new")}>Restore</Button>
                : c.status === "new" && <Button variant="danger" onClick={() => setStatus("rejected")}><X className="size-4" />Reject</Button>}
              <Button variant="primary" onClick={accept} disabled={start === null || end === null}><Check className="size-4" />{c.status === "accepted" ? "Open in editor" : "Accept and edit"}</Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Preview({ c, onClose }: { c: Candidate; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <Modal title={c.title} onClose={onClose} wide>
      <video ref={ref} src={`/api/videos/${c.source_video_id}/file#t=${c.start},${c.end}`} controls autoPlay className="aspect-video w-full rounded-lg bg-black"
        onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= c.end) e.currentTarget.pause(); }} />
      <p className="mt-2 text-xs text-muted">Playing the original video from {fmtTime(c.start, true)} to {fmtTime(c.end, true)}.</p>
    </Modal>
  );
}

function Regenerate({ videoId, onClose }: { videoId: number; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const [settings] = useLoad(() => get("/api/settings"));
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [durations, setDurations] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  useEffect(() => { if (settings) { setWeights(settings.scoring_weights); setDurations(settings.clip_durations.join(", ")); } }, [settings]);
  if (!settings) return <Modal title="Regenerate candidates" onClose={onClose}><Spinner /></Modal>;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const list = durations.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
  const go = async () => {
    try {
      if (asDefault) await api_put({ scoring_weights: weights, clip_durations: list });
      await post(`/api/videos/${videoId}/candidates/regenerate`, { weights, durations: list });
      toast("Finding highlights with your preferences");
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Modal title="Regenerate candidates" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">Untouched suggestions are replaced. Clips you accepted or rejected stay as they are.</p>
      <Field label="Target clip lengths in seconds" hint="Comma separated, each 5 to 600. Clips always start and end on sentence boundaries, so actual lengths vary by up to 30%.">
        <Input value={durations} onChange={(e) => setDurations(e.target.value)} />
      </Field>
      <div className="mt-4 grid gap-3">
        <div className="text-xs font-medium text-muted">What matters most to you</div>
        {PARTS.map(([k, label]) => <Slider key={k} label={label} min={0} max={50} step={1} value={weights[k] ?? 0} onChange={(v) => setWeights({ ...weights, [k]: v })}
          format={(v) => (total ? `${Math.round((v / total) * 100)}%` : "0%")} />)}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} />Save as my default for all projects</label>
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!total || !list.length} onClick={go}>Regenerate</Button></div>
    </Modal>
  );
}
const api_put = (body: unknown) => put("/api/settings", body);

export default function AIClips() {
  const [params, setParams] = useSearchParams();
  const finished = useApp((s) => s.finished);
  const [projects] = useLoad(() => get<Project[]>("/api/projects"), [finished]);
  const pid = Number(params.get("project")) || projects?.find((p) => p.candidate_count > 0)?.id || projects?.[0]?.id;
  const [cands, reload, error] = useLoad(() => (pid ? get<Candidate[]>(`/api/candidates?project_id=${pid}`) : Promise.resolve([])), [pid, finished]);
  const [preview, setPreview] = useState<Candidate | null>(null);
  const [regen, setRegen] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const busy = useJobs((j) => j.project_id === pid && (j.status === "running" || j.status === "queued") && j.type !== "video_render");
  const project = projects?.find((p) => p.id === pid);
  const video = project?.videos[0];

  if (error) return <ErrorBox text={error} />;
  if (!projects || !cands) return <Spinner />;
  const shown = cands.filter((c) => showRejected || c.status !== "rejected");
  return (
    <>
      <PageHeader title="AI Clips" subtitle="Candidates ranked by Clip Quality Score. The score is an estimate of how well a passage stands on its own; it does not predict views."
        actions={<>
          <Select className="!w-56" value={pid ?? ""} onChange={(e) => setParams({ project: e.target.value })} aria-label="Project">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {video && <Button onClick={() => setRegen(true)} disabled={busy.length > 0}><RefreshCw className="size-4" />Regenerate / adjust scoring</Button>}
        </>} />
      {busy.length > 0 && <Card className="mb-4 flex items-center gap-3 !py-3 text-sm"><Spinner label={`${busy[0].stage} (${Math.round(busy[0].progress)}%)`} /></Card>}
      {!projects.length ? <Empty icon={<Sparkles className="size-8" />} title="No projects yet" action={<Link to="/new"><Button variant="primary">New project</Button></Link>} />
        : !cands.length ? <Empty icon={<Sparkles className="size-8" />} title="No candidates for this project yet" text="Run the analysis on the project page. Candidates appear here when it finishes."
          action={<Link to={`/projects/${pid}`}><Button variant="primary">Open project</Button></Link>} />
          : <>
            <label className="mb-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} />Show rejected ({cands.filter((c) => c.status === "rejected").length})</label>
            <div className="grid gap-4">{shown.map((c, i) => <CandidateCard key={`${c.id}-${c.start}-${c.end}-${c.status}`} c={c} rank={i + 1} onChange={reload} onPreview={setPreview} />)}</div>
          </>}
      {preview && <Preview c={preview} onClose={() => setPreview(null)} />}
      {regen && video && <Regenerate videoId={video.id} onClose={() => setRegen(false)} />}
    </>
  );
}
