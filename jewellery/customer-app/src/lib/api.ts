// Thin client for the shared backend. Base URL is same-origin by default (VITE_API_URL to override).
const BASE = import.meta.env.VITE_API_URL || '';
const PUBLIC = /^\/(settings|categories|products|cart\/quote)/;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any = {}) {
    super(message);
  }
}

export const assetUrl = (path?: string | null) => (!path ? '' : /^(https?:|data:)/.test(path) ? path : BASE + path);

export function getToken() {
  try { return localStorage.getItem('token'); } catch { return null; }
}

type Opts = { method?: string; body?: unknown; headers?: Record<string, string>; retries?: number };

export async function api<T>(path: string, { method = 'GET', body, headers = {}, retries = method === 'GET' ? 2 : 0 }: Opts = {}): Promise<T> {
  const token = getToken();
  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (token && !PUBLIC.test(path)) h.authorization = `Bearer ${token}`;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/api${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      // flaky mobile network: retry reads with backoff, never retry writes (could double-order)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
        continue;
      }
      throw new ApiError(0, navigator.onLine ? 'Could not reach the shop. Please try again.' : 'You are offline. Check your connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) window.dispatchEvent(new Event('auth:expired'));
      throw new ApiError(res.status, data.error || 'Something went wrong', data);
    }
    return data as T;
  }
}
