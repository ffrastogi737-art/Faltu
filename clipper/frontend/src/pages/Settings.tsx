import { DatabaseBackup } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, NumberInput, PageHeader, Select, Slider, Spinner, useLoad } from "../components/ui";
import { fmtBytes, get, post, put } from "../services/api";
import { useApp } from "../stores/app";

const WEIGHTS: [string, string][] = [["hook", "Hook strength"], ["emotion", "Emotional impact"], ["curiosity", "Curiosity"], ["information", "Information value"], ["completeness", "Story completeness"], ["av_quality", "Audio and visual quality"]];

export default function SettingsPage() {
  const toast = useApp((s) => s.toast);
  const [loaded, , error] = useLoad(() => get("/api/settings"));
  const [health] = useLoad(() => get("/api/health"));
  const [backups, reloadB] = useLoad(() => get<{ name: string; size: number }[]>("/api/settings/backups"));
  const [s, setS] = useState<any>(null);
  const [durations, setDurations] = useState("");
  useEffect(() => { if (loaded) { setS(loaded); setDurations(loaded.clip_durations.join(", ")); } }, [loaded]);
  if (error) return <ErrorBox text={error} />;
  if (!s) return <Spinner />;
  const set = (p: object) => setS({ ...s, ...p });
  const total = WEIGHTS.reduce((a, [k]) => a + s.scoring_weights[k], 0);
  const save = () => put("/api/settings", { ...s, clip_durations: durations.split(",").map((x) => Number(x.trim())).filter((n) => n > 0) })
    .then((r) => { setS(r); toast("Settings saved"); }).catch((e) => toast(e.message, "error"));
  return (
    <>
      <PageHeader title="Settings" actions={<Button variant="primary" onClick={save}>Save settings</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="grid content-start gap-4">
          <h2 className="font-semibold">Speech recognition</h2>
          <Field label="Whisper model" hint="Bigger models are more accurate but slower and need more memory. On a laptop without a graphics card, 'small' is a good balance; use 'medium' or 'large-v3' for Hindi and Hinglish if you can wait. On a phone, start with 'tiny' or 'base': 'medium' needs about 2 GB of free memory and is very slow. Downloaded once on first use.">
            <Select value={s.whisper_model} onChange={(e) => set({ whisper_model: e.target.value })}>{s._whisper_models.map((m: string) => <option key={m}>{m}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Run on"><Select value={s.whisper_device} onChange={(e) => set({ whisper_device: e.target.value })}><option value="auto">Automatic (GPU if available)</option><option value="cpu">CPU only</option><option value="cuda">NVIDIA GPU (falls back to CPU)</option></Select></Field>
            <Field label="Default language"><Select value={s.whisper_language} onChange={(e) => set({ whisper_language: e.target.value })}><option value="auto">Auto-detect</option><option value="en">English</option><option value="hi">Hindi / Hinglish</option></Select></Field>
            <Field label="CPU threads" hint="0 lets the app decide"><NumberInput min={0} max={64} value={s.threads} onChange={(v) => v !== null && set({ threads: Math.round(v) })} /></Field>
            <Field label="Frames sampled for face detection" hint="Lower uses less memory and time"><NumberInput min={10} max={1000} value={s.frame_samples} onChange={(v) => v !== null && set({ frame_samples: Math.round(v) })} /></Field>
          </div>
          <h2 className="mt-2 font-semibold">Importing</h2>
          <Field label="Largest video you can import (MB)"><NumberInput min={1} value={s.max_upload_mb} onChange={(v) => v !== null && set({ max_upload_mb: Math.round(v) })} /></Field>
        </Card>
        <Card className="grid content-start gap-4">
          <h2 className="font-semibold">Highlight detection</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target clip lengths (seconds)" hint="Comma separated"><Input value={durations} onChange={(e) => setDurations(e.target.value)} /></Field>
            <Field label="Most candidates per video"><NumberInput min={1} max={50} value={s.max_candidates} onChange={(v) => v !== null && set({ max_candidates: Math.round(v) })} /></Field>
          </div>
          <div className="text-xs font-medium text-muted">Clip Quality Score weights</div>
          {WEIGHTS.map(([k, label]) => <Slider key={k} label={label} min={0} max={50} step={1} value={s.scoring_weights[k]} onChange={(v) => set({ scoring_weights: { ...s.scoring_weights, [k]: v } })}
            format={(v) => (total ? `${Math.round((v / total) * 100)}%` : "0%")} />)}
          <p className="text-xs text-muted">The score is a transparent estimate built from the transcript, pauses and sampled frames. It helps you sort candidates; it is not a prediction of views or virality.</p>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">System</h2>
          {!health ? <Spinner /> : (
            <dl className="grid gap-2 text-sm">
              {[["FFmpeg", health.ffmpeg?.split(" Copyright")[0] ?? "Not found - install FFmpeg"], ["Database", health.database],
                ["Whisper", health.whisper.installed ? `Installed (${health.whisper.engine ?? "faster-whisper"})` : `Not available: ${health.whisper.error}`], ["GPU (CUDA)", health.whisper.cuda ? "Available" : "Not available - using CPU"],
                ["AI clip rating", health.llm ?? "Off (set CLIPPER_LLM_KEY in .env)"], ["Storage folder", health.storage], ["Free disk space", `${health.disk_free_gb} GB`]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-muted">{k}</dt><dd className="break-all text-right">{v}</dd></div>))}
              <div className="flex justify-between"><dt className="text-muted">Overall</dt><dd><Badge tone={health.status === "ok" ? "good" : "bad"}>{health.status}</Badge></dd></div>
            </dl>
          )}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Database backup</h2>
            <Button small onClick={() => post("/api/settings/backup").then((r) => { toast(`Backup saved to ${r.path}`); reloadB(); }).catch((e) => toast(e.message, "error"))}><DatabaseBackup className="size-4" />Back up now</Button></div>
          <p className="mb-3 text-xs text-muted">Copies the database (projects, transcripts, clips, campaigns, earnings) into the backups folder inside your storage folder. Videos are not included. To restore, stop the app and replace clipper.db with a backup file.</p>
          {!backups?.length ? <p className="text-sm text-muted">No backups yet.</p> : <ul className="grid gap-1 text-sm">{backups.slice(0, 8).map((b) => <li key={b.name} className="flex justify-between"><span>{b.name}</span><span className="text-xs text-muted">{fmtBytes(b.size)}</span></li>)}</ul>}
        </Card>
      </div>
    </>
  );
}
