import type { Providers, UploadedFile } from '../api/context';
import type { Role } from '../constants';
import { randomToken, randomHex } from '../util/ids';

const enc = new TextEncoder();
export async function sha256Hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Listener = (target: { user?: string; room?: string }, event: string, data: any) => void;

/**
 * Proveedores para ejecutar Kinkō sin servidor (demo en navegador y tests).
 * No sustituyen a los del servidor: allí se usan Argon2id, JWT firmados, AES-256-GCM, Claude y Socket.IO.
 */
export function localProviders(opts: { now?: () => Date; demoMode?: boolean; env?: 'demo' | 'test' } = {}) {
  const tokens = new Map<string, { sub: string; role: Role; sid: string; exp: number }>();
  const listeners = new Set<Listener>();
  const outbox: { to: string; subject: string; text: string; at: string }[] = [];
  const now = opts.now || (() => new Date());
  const providers: Providers = {
    now,
    hasher: {
      async hash(pw) { const salt = randomHex(8); return `local$${salt}$${await sha256Hex(salt + pw)}`; },
      async verify(hash, pw) { const [, salt, h] = hash.split('$'); return !!salt && (await sha256Hex(salt + pw)) === h; },
    },
    tokens: {
      accessTtlSec: 3600,
      signAccess(p) { const t = `lt_${randomToken(24)}`; tokens.set(t, { ...p, exp: Date.now() + 3600_000 }); return t; },
      verifyAccess(t) { const p = tokens.get(t); if (!p || p.exp < Date.now()) return null; return { sub: p.sub, role: p.role, sid: p.sid }; },
    },
    sha256: sha256Hex,
    totp: {
      generateSecret: () => randomHex(10).toUpperCase(),
      keyuri: (email, secret) => `otpauth://totp/Kinko:${encodeURIComponent(email)}?secret=${secret}&issuer=Kinko`,
      verify: (token) => token === '123456',
      qr: async () => null,
    },
    ai: { available: false, model: 'motor local', complete: async () => null },
    realtime: {
      toUser: (user, event, data) => listeners.forEach((l) => l({ user }, event, data)),
      toRoom: (room, event, data) => listeners.forEach((l) => l({ room }, event, data)),
    },
    mailer: { async send(to, subject, text) { outbox.push({ to, subject, text, at: now().toISOString() }); } },
    storage: {
      async save(file: UploadedFile) {
        let url: string;
        if (typeof file.data === 'string') url = file.data;
        else { let s = ''; file.data.forEach((b) => (s += String.fromCharCode(b))); url = `data:${file.mime};base64,${btoa(s)}`; }
        return { url, key: randomHex(16), size: file.size };
      },
    },
    payments: { async checkout() { return { mode: 'simulated', id: `sim_${randomHex(8)}` }; } },
    config: {
      env: opts.env || 'demo', demoMode: opts.demoMode ?? true, require2faForStaff: false, minorConsentAge: 16, publicUrl: typeof location !== 'undefined' ? location.origin + location.pathname : 'http://localhost',
      kAnon: 10, dpEpsilon: 1, cookieSecure: false, refreshTtlDays: 30, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    },
    log: (level, msg, meta) => { if (level !== 'info') console[level === 'error' ? 'error' : 'warn'](`[kinko] ${msg}`, meta || ''); },
  };
  return { providers, subscribe: (l: Listener) => { listeners.add(l); return () => listeners.delete(l); }, outbox };
}
