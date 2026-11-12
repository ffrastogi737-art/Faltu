import { Clapperboard, DollarSign, FolderOpen, LayoutDashboard, LayoutTemplate, Megaphone, PlusCircle, Scissors, Settings, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Toasts } from "../components/ui";
import { useApp, useJobs } from "../stores/app";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/new", label: "New Project", icon: PlusCircle },
  { to: "/projects", label: "My Projects", icon: FolderOpen },
  { to: "/clips", label: "AI Clips", icon: Sparkles },
  { to: "/editor", label: "Video Editor", icon: Scissors },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/earnings", label: "Earnings", icon: DollarSign },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout() {
  const connect = useApp((s) => s.connect);
  const connected = useApp((s) => s.connected);
  const active = useJobs((j) => j.status === "running" || j.status === "queued");
  useEffect(connect, [connect]);
  return (
    <div className="flex h-full">
      <aside className="flex w-16 shrink-0 flex-col border-r border-line bg-panel lg:w-60">
        <div className="flex h-16 items-center gap-2.5 px-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2"><Clapperboard className="size-5 text-white" /></div>
          <div className="hidden lg:block">
            <div className="text-sm font-semibold leading-tight">AI Clipper</div>
            <div className="text-[11px] text-muted">Personal · local-first</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} title={label}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-accent/15 text-ink" : "text-muted hover:bg-panel2 hover:text-ink"}`}>
              <Icon className="size-[18px] shrink-0" /><span className="hidden lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3 text-xs text-muted">
          <div className="flex items-center gap-2" title={connected ? "Connected to the backend" : "Backend not reachable"}>
            <span className={`size-2 shrink-0 rounded-full ${connected ? "bg-good" : "bg-bad"}`} />
            <span className="hidden lg:inline">{connected ? (active.length ? `${active.length} job${active.length > 1 ? "s" : ""} in progress` : "Idle") : "Backend offline"}</span>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-6 lg:p-8"><Outlet /></div>
      </main>
      <Toasts />
    </div>
  );
}
