import { Capacitor } from '@capacitor/core';

export const IS_NATIVE = Capacitor.isNativePlatform();
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
/** localStorage puede no existir o lanzar (iframes, modo privado): nunca debe romper la app. */
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  remove(k: string) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
if (qs.get('modo') === 'demo') store.set('kinko:mode', 'demo');
if (qs.get('modo') === 'servidor') store.remove('kinko:mode');
/** Modo demo: toda la plataforma corre en el navegador (sin servidor). Se activa en la build de demostración o con ?modo=demo. */
export const mode = { demo: __DEMO__ || store.get('kinko:mode') === 'demo' };

let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (t: string | null) => { accessToken = t; };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}

const tokenStore = {
  async get(): Promise<string | null> {
    if (mode.demo) return store.get('kinko:rt');
    if (IS_NATIVE) { const { Preferences } = await import('@capacitor/preferences'); return (await Preferences.get({ key: 'kinko_rt' })).value; }
    return null;
  },
  async set(v: string) {
    if (mode.demo) store.set('kinko:rt', v);
    else if (IS_NATIVE) { const { Preferences } = await import('@capacitor/preferences'); await Preferences.set({ key: 'kinko_rt', value: v }); }
  },
  async clear() {
    store.remove('kinko:rt');
    if (IS_NATIVE) { const { Preferences } = await import('@capacitor/preferences'); await Preferences.remove({ key: 'kinko_rt' }); }
  },
};
export { tokenStore };

type Raw = { status: number; data: any };
async function httpRequest(method: string, path: string, body?: any, form?: FormData): Promise<Raw> {
  const headers: Record<string, string> = { 'x-kinko-client': IS_NATIVE ? 'native' : 'web' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  try {
    const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload, credentials: 'include' });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch {
    return { status: 0, data: { error: { code: 'network', message: 'No hay conexión con el servidor. ¿Está arrancada la API?' } } };
  }
}
async function localRequest(method: string, path: string, body?: any, file?: any): Promise<Raw> {
  const demo = await import('./demo');
  return demo.request(method, path, body, accessToken, file);
}

let refreshing: Promise<any> | null = null;
let onSession: ((user: any | null) => void) | null = null;
export const setSessionListener = (fn: (user: any | null) => void) => { onSession = fn; };

export async function refreshSession(): Promise<any | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const stored = await tokenStore.get();
      if ((mode.demo || IS_NATIVE) && !stored) return null;
      const r = mode.demo ? await localRequest('POST', '/auth/refresh', { refreshToken: stored }) : await httpRequest('POST', '/auth/refresh', stored ? { refreshToken: stored } : {});
      if (r.status === 200) {
        accessToken = r.data.accessToken;
        if (r.data.refreshToken) await tokenStore.set(r.data.refreshToken);
        onSession?.(r.data.user);
        return r.data;
      }
      accessToken = null;
      if (r.status === 401) await tokenStore.clear();
      return null;
    })().finally(() => setTimeout(() => (refreshing = null), 50));
  }
  return refreshing;
}

export async function api<T = any>(method: string, path: string, body?: any, opts: { form?: FormData; file?: File; retry?: boolean } = {}): Promise<T> {
  const run = async () => {
    if (mode.demo) {
      if (opts.file) {
        const data = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(opts.file!); });
        return localRequest(method, path, body, { name: opts.file.name, mime: opts.file.type, size: opts.file.size, data });
      }
      return localRequest(method, path, body);
    }
    if (opts.file) { const f = new FormData(); f.append('file', opts.file); return httpRequest(method, path, undefined, f); }
    return httpRequest(method, path, body, opts.form);
  };
  let r = await run();
  if (r.status === 401 && r.data?.error?.code === 'token_expired' && opts.retry !== false) {
    if (await refreshSession()) r = await run();
  }
  if (r.status === 0 || r.status >= 400) {
    const e = r.data?.error || {};
    if (r.status === 401 && e.code !== 'invalid_credentials' && e.code !== 'invalid_code') onSession?.(null);
    throw new ApiError(r.status, e.code || 'error', e.message || 'Algo ha fallado', e.details);
  }
  return r.data as T;
}
export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: any) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: any) => api<T>('PUT', p, b ?? {});
export const patch = <T = any>(p: string, b?: any) => api<T>('PATCH', p, b ?? {});
export const del = <T = any>(p: string) => api<T>('DELETE', p);
/** Reduce fotos grandes antes de subirlas (menos datos móviles; en la demo se guardan en el navegador). */
async function shrinkImage(file: File, max = 1280): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 250_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
export const upload = async (file: File, visibility = 'private') => api<{ id: string; url: string; mime: string; name: string }>('POST', `/media?visibility=${visibility}`, undefined, { file: await shrinkImage(file, mode.demo ? 900 : 1600) });
export const assetUrl = (u?: string | null) => (!u ? '' : u.startsWith('/uploads') ? `${API_BASE}${u}` : u);
