import { create } from "zustand";
import { get, type Job } from "../services/api";

interface Toast { id: number; kind: "ok" | "error"; text: string }
interface AppState {
  jobs: Record<number, Job>;
  finished: number; // bumps whenever any job reaches a final state, so pages know to refetch
  connected: boolean;
  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;
  loadJobs: () => Promise<void>;
  connect: () => void;
}

let socket: WebSocket | null = null;
let nextToast = 1;

export const useApp = create<AppState>((set, getState) => ({
  jobs: {},
  finished: 0,
  connected: false,
  toasts: [],
  toast: (text, kind = "ok") => {
    const id = nextToast++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === "error" ? 8000 : 4000);
  },
  loadJobs: async () => {
    const list = await get<Job[]>("/api/jobs?limit=100");
    set({ jobs: Object.fromEntries(list.map((j) => [j.id, j])) });
  },
  connect: () => {
    if (socket) return;
    const open = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/jobs`);
      socket.onopen = () => { set({ connected: true }); getState().loadJobs().catch(() => {}); };
      socket.onmessage = (e) => {
        const job: Job = JSON.parse(e.data).job;
        const done = ["completed", "failed", "cancelled"].includes(job.status);
        const before = getState().jobs[job.id]?.status;
        set((s) => ({ jobs: { ...s.jobs, [job.id]: job }, finished: done && before !== job.status ? s.finished + 1 : s.finished }));
        if (done && before !== job.status && job.status === "failed") getState().toast(job.error || "A job failed", "error");
      };
      socket.onclose = () => { set({ connected: false }); setTimeout(open, 2000); }; // reconnect after a backend restart
    };
    open();
  },
}));

export const useJobs = (filter: (j: Job) => boolean) =>
  Object.values(useApp((s) => s.jobs)).filter(filter).sort((a, b) => b.id - a.id);
