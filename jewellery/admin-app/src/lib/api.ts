// Client for the shared backend's /api/admin routes (staff token, never the customer token).
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any = {}) {
    super(message);
  }
}

export const getToken = () => { try { return localStorage.getItem('staffToken'); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem('staffToken', t) : localStorage.removeItem('staffToken'); } catch { /* private mode */ } };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set('authorization', `Bearer ${t}`);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, navigator.onLine ? 'Could not reach the server. Try again.' : 'You are offline.');
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && t) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(res.status, (data as any)?.error || 'Something went wrong', data);
  }
  return data as T;
}

export const api = <T,>(path: string, method = 'GET', body?: unknown) =>
  request<T>(path, body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const upload = (kind: string, file: Blob) =>
  request<{ url: string }>(`/admin/uploads?kind=${kind}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });

// CSV downloads need the auth header, so fetch then save the blob.
export async function download(path: string, filename: string) {
  const text = await request<string>(path);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}
