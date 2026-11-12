import { Activity, BadgeCheck, Clapperboard, DollarSign, Eye, Film, FolderOpen, Megaphone, Sparkles, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, useLoad } from "../components/ui";
import { JOB_LABEL, fmtDate, get, money, type Job } from "../services/api";
import { useApp } from "../stores/app";

function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: string | number; note?: string }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 text-xs text-muted">{icon}{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-muted">{note}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const finished = useApp((s) => s.finished);
  const [d, , error] = useLoad(() => get("/api/dashboard"), [finished]);
  if (error) return <ErrorBox text={error} />;
  if (!d) return <Spinner />;
  const i = "size-4";
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Everything here is read from your local database."
        actions={<Link to="/new"><Button variant="primary">New project</Button></Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={<FolderOpen className={i} />} label="Total projects" value={d.projects} />
        <Stat icon={<Film className={i} />} label="Videos processed" value={d.videos_processed} />
        <Stat icon={<Sparkles className={i} />} label="Clips generated" value={d.clips} />
        <Stat icon={<Clapperboard className={i} />} label="Exported clips" value={d.exported_clips} />
        <Stat icon={<Megaphone className={i} />} label="Campaigns joined" value={d.campaigns} />
        <Stat icon={<Eye className={i} />} label="Recorded views" value={d.self_reported_views.toLocaleString()} note="Self-reported by you" />
        <Stat icon={<BadgeCheck className={i} />} label="Verified views" value={d.verified_views.toLocaleString()} note="Marked verified by you" />
        <Stat icon={<DollarSign className={i} />} label="Estimated earnings" value={money(d.estimated_earnings)} note="Estimate from recorded views" />
        <Stat icon={<Wallet className={i} />} label="Received" value={money(d.received_earnings)} note="Payments you entered" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Recent projects</h2>
          {d.recent_projects.length === 0 ? <Empty title="No projects yet" text="Import a video to get started." action={<Link to="/new"><Button variant="primary">New project</Button></Link>} /> : (
            <ul className="divide-y divide-line">
              {d.recent_projects.map((p: any) => (
                <li key={p.id}><Link to={`/projects/${p.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-accent">
                  <span className="truncate">{p.name}</span><span className="shrink-0 text-xs text-muted">{fmtDate(p.updated_at)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Activity className="size-4" />Recent processing activity</h2>
          {d.recent_jobs.length === 0 ? <Empty title="Nothing processed yet" /> : (
            <ul className="divide-y divide-line">
              {d.recent_jobs.map((j: Job) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="truncate">{JOB_LABEL[j.type] || j.type} <span className="text-muted">#{j.id}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted">{fmtDate(j.created_at)}<Badge>{j.status}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
