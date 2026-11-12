// Typed client for the local backend. All calls are same-origin (/api), proxied by Vite in development.

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: any) {
    super(message);
  }
}

function message(detail: any, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ");
  return detail?.message || fallback;
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the backend. Is it running?");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, message(data?.detail, `Request failed (${res.status})`), data?.detail);
  return data as T;
}

export const get = <T = any>(url: string) => api<T>("GET", url);
export const post = <T = any>(url: string, body?: unknown) => api<T>("POST", url, body);
export const put = <T = any>(url: string, body?: unknown) => api<T>("PUT", url, body);
export const patch = <T = any>(url: string, body?: unknown) => api<T>("PATCH", url, body);
export const del = (url: string) => api<void>("DELETE", url);

/** Upload with a progress callback (fetch cannot report upload progress). */
export function upload<T = any>(url: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, "Upload failed: cannot reach the backend."));
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, message(data?.detail, `Upload failed (${xhr.status})`), data?.detail));
    };
    xhr.send(form);
  });
}

export interface Job {
  id: number; project_id: number | null; source_video_id: number | null; clip_id: number | null;
  type: string; status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number; stage: string; error: string | null; created_at: string; finished_at: string | null; log?: string;
}
export interface Video {
  id: number; project_id: number; filename: string; duration: number; width: number; height: number; fps: number;
  video_codec: string; audio_codec: string | null; audio_streams: number; size_bytes: number; status: string; source_url: string | null;
}
export interface Project {
  id: number; name: string; description: string; status: string; created_at: string; updated_at: string;
  videos: Video[]; candidate_count: number; clip_count: number;
}
export interface Candidate {
  id: number; project_id: number; source_video_id: number; start: number; end: number; transcript: string; title: string;
  hook: string; reason: string; score: number; status: "new" | "accepted" | "rejected";
  subscores: Record<string, any>;
}
export interface Word { text: string; start: number; end: number }
export interface Cue { start: number; end: number; words: Word[] }
export interface CaptionStyle {
  font: string; size: number; bold: boolean; uppercase: boolean; words_per_line: number; primary: string; highlight: string;
  outline_color: string; outline: number; shadow: number; pos_y: number; active_scale: number; pop: boolean; box: boolean; label?: string; id?: string;
}
export interface ClipSettings {
  aspect: string; crop_mode: "center" | "face" | "blur"; crop_x: number; crop_y: number; zoom: number; dynamic_zoom: boolean;
  remove_silence: boolean; silence_db: number; silence_min: number; normalize_audio: boolean; volume: number;
  captions: boolean; template: string; style: Partial<CaptionStyle>; watermark: string | null; watermark_pos: string;
  intro: string | null; outro: string | null;
}
export interface Clip {
  id: number; project_id: number; source_video_id: number; campaign_id: number | null; title: string; start: number; end: number;
  status: "draft" | "rendering" | "rendered" | "failed"; output_path: string | null; updated_at: string;
  settings: ClipSettings; words: Word[]; cues: Cue[]; style: CaptionStyle;
  video: { id: number; filename: string; duration: number; width: number; height: number; fps: number; audio_streams: number };
}
export interface Preset { id: number; name: string; short_side: number; fps: number | null; crf: number; x264_preset: string; audio_kbps: number; builtin: boolean }
export interface Rule { id?: number; kind: "hashtag" | "caption" | "branding" | "rule"; value: string }
export interface Campaign {
  id: number; name: string; brand: string; description: string; source_reference: string; url: string; allowed_platforms: string[];
  min_duration: number | null; max_duration: number | null; deadline: string | null; payment_model: "per_1000_views" | "flat_per_clip" | "none";
  rate_per_1000: number; flat_rate: number; max_payout: number | null; currency: string; notes: string; status: "active" | "paused" | "ended"; rules: Rule[];
}
export interface CheckItem { label: string; status: "pass" | "fail" | "manual" | "unknown"; detail: string; rule_id?: number }
export interface Submission {
  id: number; campaign_id: number; clip_id: number | null; platform: string; post_url: string; caption: string;
  status: "pending" | "submitted" | "approved" | "rejected"; notes: string; manual_checks: Record<string, boolean>; submitted_at: string | null;
  clip_title: string | null; campaign_name: string; currency: string; checklist: CheckItem[];
  metrics: { id: number; views: number; kind: string; recorded_at: string; note: string }[];
  self_reported_views: number; verified_views: number; estimate_basis: "verified" | "self_reported" | "none"; estimated: number;
}

// Timestamps are stored as naive UTC; add the Z so the browser converts to local time.
export const date = (s: string | null) => (s ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z") : null);
export const fmtDate = (s: string | null) => date(s)?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) ?? "-";
export function fmtTime(sec: number, tenths = false): string {
  const s = Math.max(0, sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const ss = tenths ? r.toFixed(1).padStart(4, "0") : String(Math.floor(r)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
export const fmtBytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
export const money = (n: number, currency = "") => `${currency ? currency + " " : ""}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const JOB_LABEL: Record<string, string> = {
  video_import: "Importing video", audio_extraction: "Extracting audio", transcription: "Transcribing speech",
  highlight_detection: "Finding highlights", video_render: "Rendering clip",
};
