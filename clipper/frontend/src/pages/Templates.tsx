import { Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import CaptionOverlay from "../components/CaptionOverlay";
import { Badge, Button, Card, ErrorBox, Field, Input, NumberInput, PageHeader, Select, Spinner, useLoad } from "../components/ui";
import { del, fmtBytes, get, post, put, type CaptionStyle, type Preset } from "../services/api";
import { useApp } from "../stores/app";

const SAMPLE = ["This", "is", "how", "your", "captions", "look"];
function TemplateCard({ t }: { t: CaptionStyle }) {
  const n = Math.min(t.words_per_line, 3); // three words fit the tile at any size
  const words = SAMPLE.slice(0, n).map((w, i) => ({ text: t.uppercase ? w.toUpperCase() : w, start: i, end: i + 1 }));
  return (
    <Card className="!p-3">
      <div className="relative h-36 overflow-hidden rounded-lg bg-gradient-to-br from-[#2b2f55] via-[#1b3a4b] to-[#3b2a4a]" style={{ containerType: "inline-size" }}>
        {/* shown at 1.5x so the text is readable in a small tile */}
        <CaptionOverlay cues={[{ start: 0, end: n, words }]} t={Math.min(1, n - 1) + 0.5} style={{ ...t, pos_y: 0.5, size: t.size * 1.5, outline: t.outline * 1.5, shadow: t.shadow * 1.5 }} />
      </div>
      <div className="mt-2 flex items-center justify-between px-1"><span className="text-sm font-medium">{t.label}</span><span className="text-xs text-muted">{t.words_per_line} word{t.words_per_line > 1 ? "s" : ""} per line</span></div>
    </Card>
  );
}

const NEW: Omit<Preset, "id" | "builtin"> = { name: "", short_side: 1080, fps: null, crf: 20, x264_preset: "medium", audio_kbps: 160 };

export default function Templates() {
  const toast = useApp((s) => s.toast);
  const [templates, , error] = useLoad(() => get<CaptionStyle[]>("/api/caption-templates"));
  const [presets, reloadP] = useLoad(() => get<Preset[]>("/api/presets"));
  const [assets, reloadA] = useLoad(() => get<{ name: string; kind: string; size: number }[]>("/api/assets"));
  const [form, setForm] = useState<Partial<Preset>>(NEW);
  const file = useRef<HTMLInputElement>(null);
  if (error) return <ErrorBox text={error} />;
  if (!templates || !presets || !assets) return <Spinner />;
  const fail = (e: Error) => toast(e.message, "error");
  const save = () => {
    const { id, builtin, ...body } = form as Preset;
    (id ? put(`/api/presets/${id}`, body) : post("/api/presets", body)).then(() => { setForm(NEW); reloadP(); toast("Preset saved"); }).catch(fail);
  };
  const addAsset = (f?: File) => {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    post("/api/assets", fd).then(reloadA).catch(fail);
  };
  return (
    <>
      <PageHeader title="Templates" subtitle="Caption looks, export quality presets and branding files." />
      <h2 className="mb-3 font-semibold">Caption templates</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{templates.map((t) => <TemplateCard key={t.id} t={t} />)}</div>
      <p className="mt-2 text-xs text-muted">Pick a template in the editor's Captions tab, then change its font, size, colours and position per clip. These are original designs; the active word is highlighted as it is spoken.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Export presets</h2>
          <ul className="mb-4 divide-y divide-line">
            {presets.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1"><span className="font-medium">{p.name}</span> {p.builtin && <Badge tone="muted">built-in</Badge>}
                  <span className="block text-xs text-muted">{p.short_side}p · quality CRF {p.crf} · speed {p.x264_preset} · {p.fps ?? "source"} fps · audio {p.audio_kbps} kbps</span></span>
                <Button small onClick={() => setForm(p)}>Edit</Button>
                {!p.builtin && <Button small variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => del(`/api/presets/${p.id}`).then(reloadP).catch(fail)}><Trash2 className="size-3.5" /></Button>}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
            <Field label={form.id ? "Editing preset" : "New preset name"} className="col-span-2"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Resolution (short side)"><Select value={form.short_side} onChange={(e) => setForm({ ...form, short_side: Number(e.target.value) })}>{[480, 720, 1080, 1440, 2160].map((v) => <option key={v} value={v}>{v}p</option>)}</Select></Field>
            <Field label="Frame rate"><Select value={form.fps ?? ""} onChange={(e) => setForm({ ...form, fps: e.target.value ? Number(e.target.value) : null })}><option value="">Same as source</option><option>24</option><option>25</option><option>30</option><option>50</option><option>60</option></Select></Field>
            <Field label="Quality (CRF)" hint="Lower is better and bigger. 17 to 26 is typical."><NumberInput min={10} max={40} value={form.crf ?? 20} onChange={(v) => v !== null && setForm({ ...form, crf: Math.round(v) })} /></Field>
            <Field label="Encoding speed" hint="Slower gives smaller files"><Select value={form.x264_preset} onChange={(e) => setForm({ ...form, x264_preset: e.target.value })}>{["ultrafast", "veryfast", "fast", "medium", "slow", "slower"].map((v) => <option key={v}>{v}</option>)}</Select></Field>
            <Field label="Audio bitrate (kbps)"><NumberInput min={64} max={320} value={form.audio_kbps ?? 160} onChange={(v) => v !== null && setForm({ ...form, audio_kbps: Math.round(v) })} /></Field>
            <div className="flex items-end gap-2"><Button variant="primary" disabled={!form.name?.trim()} onClick={save}>{form.id ? "Save changes" : "Add preset"}</Button>{form.id && <Button variant="ghost" onClick={() => setForm(NEW)}>Cancel</Button>}</div>
          </div>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Branding files</h2>
            <Button small onClick={() => file.current?.click()}><Upload className="size-3.5" />Add file</Button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,video/*" className="hidden" onChange={(e) => { addAsset(e.target.files?.[0]); e.target.value = ""; }} /></div>
          <p className="mb-3 text-xs text-muted">Logo images can be used as a watermark; short videos can be used as an intro or outro. Choose them in the editor's Frame tab.</p>
          {!assets.length ? <p className="text-sm text-muted">No files yet.</p> : (
            <ul className="divide-y divide-line">{assets.map((a) => (
              <li key={a.name} className="flex items-center gap-2 py-2 text-sm"><span className="flex-1 truncate">{a.name}</span><Badge tone="muted">{a.kind === "image" ? "logo" : "intro / outro"}</Badge>
                <span className="text-xs text-muted">{fmtBytes(a.size)}</span>
                <Button small variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => confirm(`Delete ${a.name}? Clips that use it will fail to render until you pick another file.`) && del(`/api/assets/${encodeURIComponent(a.name)}`).then(reloadA).catch(fail)}><Trash2 className="size-3.5" /></Button></li>))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
