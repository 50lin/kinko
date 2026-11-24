import { createApp, MemoryDb, seedDemo, localProviders, type KinkoApp } from '@kinko/core';

const KEY = 'kinko:demo-db:v1';
let ready: Promise<{ app: KinkoApp; subscribe: (fn: any) => () => void; db: MemoryDb }> | null = null;

/** Arranca Kinkō completo dentro del navegador: misma lógica que el servidor sobre una base de datos en memoria. */
function init() {
  return (async () => {
    const lp = localProviders({ env: 'demo', demoMode: true });
    let initial: any;
    try { const raw = localStorage.getItem(KEY); if (raw) initial = JSON.parse(raw); } catch { /* sin almacenamiento */ }
    let t: any;
    const db = new MemoryDb({ initial, onChange: (d) => { clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(d.snapshot())); } catch { /* cuota llena */ } }, 700); } });
    if (!initial) { await seedDemo(db, lp.providers); try { localStorage.setItem(KEY, JSON.stringify(db.snapshot())); } catch { /* */ } }
    return { app: createApp({ db, providers: lp.providers }), subscribe: lp.subscribe, db };
  })();
}
export const demoReady = () => (ready ||= init());

export async function request(method: string, path: string, body: any, token: string | null, file?: any) {
  const { app } = await demoReady();
  const u = new URL(path, 'http://local');
  const res = await app.handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, file, headers: { authorization: token ? `Bearer ${token}` : undefined, 'x-kinko-client': 'local', 'user-agent': navigator.userAgent }, cookies: {}, ip: 'local' });
  return { status: res.status, data: res.body };
}
export async function subscribe(fn: (target: { user?: string; room?: string }, event: string, data: any) => void) {
  const { subscribe } = await demoReady();
  return subscribe(fn);
}
export function resetDemo() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('kinko:rt'); } catch { /* */ }
  if (location.hash.startsWith('#/')) location.hash = '#/';
  location.reload();
}
