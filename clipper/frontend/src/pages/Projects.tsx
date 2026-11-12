import { Film, FolderOpen, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, useLoad } from "../components/ui";
import { del, fmtDate, fmtTime, get, type Project } from "../services/api";
import { useApp } from "../stores/app";

export default function Projects() {
  const toast = useApp((s) => s.toast);
  const [projects, reload, error] = useLoad(() => get<Project[]>("/api/projects"));
  if (error) return <ErrorBox text={error} />;
  if (!projects) return <Spinner />;
  const remove = (p: Project) => {
    if (!confirm(`Delete "${p.name}"?\n\nThis removes the project, its transcript, candidates and clips, and the app's stored copy of the video. Exported MP4s stay in the exports folder. Your original file is not touched.`)) return;
    del(`/api/projects/${p.id}`).then(reload).catch((e) => toast(e.message, "error"));
  };
  return (
    <>
      <PageHeader title="My Projects" actions={<Link to="/new"><Button variant="primary">New project</Button></Link>} />
      {projects.length === 0 ? <Empty icon={<FolderOpen className="size-8" />} title="No projects yet" text="A project holds one long video, its transcript and the clips made from it." action={<Link to="/new"><Button variant="primary">Create your first project</Button></Link>} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="flex flex-col transition hover:border-accent/50">
              <Link to={`/projects/${p.id}`} className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-snug">{p.name}</h2>
                  {p.videos[0] && <Badge>{p.videos[0].status}</Badge>}
                </div>
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Film className="size-3.5" />
                  {p.videos[0] ? `${p.videos[0].filename} · ${fmtTime(p.videos[0].duration)}` : "No video yet"}
                </div>
              </Link>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                <span>{p.candidate_count} candidates · {p.clip_count} clips · {fmtDate(p.updated_at)}</span>
                <button aria-label={`Delete ${p.name}`} onClick={() => remove(p)} className="rounded p-1 hover:text-bad"><Trash2 className="size-4" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
