import { Link2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, ErrorBox, Field, Input, PageHeader, ProgressBar, Textarea, Toggle } from "../components/ui";
import { ApiError, del, fmtBytes, post, upload, type Project } from "../services/api";

export default function NewProject() {
  const nav = useNavigate();
  const picker = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<{ text: string; projectId?: number } | null>(null);

  const choose = (f: File | undefined) => { if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, "")); } };
  const ready = name.trim() && (mode === "file" ? file : url.trim() && rights);

  async function submit() {
    setError(null);
    setProgress(0);
    let project: Project | null = null;
    try {
      project = await post<Project>("/api/projects", { name: name.trim(), description });
      if (mode === "file") await upload(`/api/projects/${project.id}/videos`, file!, setProgress);
      else await post(`/api/projects/${project.id}/videos/url`, { url: url.trim(), confirm_rights: rights });
      nav(`/projects/${project.id}`);
    } catch (e) {
      if (project) await del(`/api/projects/${project.id}`).catch(() => {}); // do not leave an empty project behind
      const err = e as ApiError;
      setError({ text: err.message, projectId: err.detail?.project_id });
      setProgress(null);
    }
  }

  return (
    <>
      <PageHeader title="New Project" subtitle="Import a long video. Your original file is never changed; the app works on its own copy." />
      <div className="grid max-w-3xl gap-5">
        <Card className="grid gap-4">
          <Field label="Project name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Podcast episode 12" maxLength={200} /></Field>
          <Field label="Description (optional)"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </Card>
        <Card>
          <div className="mb-4 flex gap-2">
            <Button variant={mode === "file" ? "primary" : "soft"} onClick={() => setMode("file")}><UploadCloud className="size-4" />Local file</Button>
            <Button variant={mode === "url" ? "primary" : "soft"} onClick={() => setMode("url")}><Link2 className="size-4" />Direct video link</Button>
          </div>
          {mode === "file" ? (
            <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]); }}
              className={`rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${over ? "border-accent bg-accent/5" : "border-line"}`}>
              <UploadCloud className="mx-auto mb-3 size-8 text-muted" />
              {file ? <div className="text-sm"><span className="font-medium">{file.name}</span> <span className="text-muted">({fmtBytes(file.size)})</span></div>
                : <div className="text-sm text-muted">Drag a video here, or</div>}
              <Button className="mt-3" onClick={() => picker.current?.click()}>{file ? "Choose a different file" : "Choose file"}</Button>
              <input ref={picker} type="file" accept="video/*,.mkv,.mov,.webm,.avi,.ts,.flv,.wmv" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
              <p className="mt-3 text-xs text-muted">MP4, MOV, MKV, WebM and other formats FFmpeg can read</p>
            </div>
          ) : (
            <div className="grid gap-3">
              <Field label="Link to a video file" hint="Only direct links to a video file (for example a campaign's download link ending in .mp4). Pages on YouTube, Instagram, TikTok and similar platforms are not supported: export the file with the platform's own tools and upload it instead.">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/video.mp4" />
              </Field>
              <Toggle label="I own this video or I am authorised to use it" checked={rights} onChange={setRights} />
            </div>
          )}
        </Card>
        {error && <div className="grid gap-2"><ErrorBox text={error.text} />{error.projectId && <Link className="text-sm text-accent underline" to={`/projects/${error.projectId}`}>Open the project that already has this video</Link>}</div>}
        {progress !== null && mode === "file" && <div className="grid gap-1"><ProgressBar value={progress * 100} /><span className="text-xs text-muted">{progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Checking the video..."}</span></div>}
        <div><Button variant="primary" disabled={!ready} busy={progress !== null} onClick={submit}>Create project and import</Button></div>
      </div>
    </>
  );
}
