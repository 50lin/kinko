import type { Db, Doc } from '../db/types';
import type { Role } from '../constants';

export interface UploadedFile { name: string; mime: string; size: number; data: Uint8Array | string }
export interface RequestIn {
  method: string; path: string; query: Record<string, any>; body: any; headers: Record<string, string | undefined>;
  cookies: Record<string, string>; ip: string; file?: UploadedFile;
}
export interface CookieOpts { httpOnly?: boolean; secure?: boolean; sameSite?: 'strict' | 'lax' | 'none'; path?: string; maxAgeMs?: number }
export interface ResponseOut { status: number; body: any; setCookies: { name: string; value: string; opts: CookieOpts }[]; clearCookies: { name: string; opts: CookieOpts }[]; headers: Record<string, string> }

export interface AiRequest { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; tier?: 'main' | 'light'; maxTokens?: number }
export interface Providers {
  now(): Date;
  hasher: { hash(pw: string): Promise<string>; verify(hash: string, pw: string): Promise<boolean> };
  tokens: { signAccess(p: { sub: string; role: Role; sid: string }): string; verifyAccess(t: string): { sub: string; role: Role; sid: string } | null; accessTtlSec: number };
  sha256(s: string): Promise<string>;
  totp: { generateSecret(): string; keyuri(email: string, secret: string): string; verify(token: string, secret: string): boolean; qr(uri: string): Promise<string | null> };
  ai: { available: boolean; model: string; complete(req: AiRequest): Promise<string | null> };
  realtime: { toUser(userId: string, event: string, data: any): void; toRoom(room: string, event: string, data: any): void };
  mailer: { send(to: string, subject: string, text: string): Promise<void> };
  storage: { save(file: UploadedFile): Promise<{ url: string; key: string; size: number }> };
  payments: { checkout(o: { amountCents: number; currency: string; description: string; metadata: Record<string, string>; successUrl: string; cancelUrl: string }): Promise<{ mode: 'simulated' | 'stripe'; url?: string; id: string }> };
  config: {
    env: 'development' | 'production' | 'test' | 'demo'; demoMode: boolean; require2faForStaff: boolean; minorConsentAge: number; publicUrl: string;
    kAnon: number; dpEpsilon: number; cookieSecure: boolean; refreshTtlDays: number; iceServers: { urls: string | string[]; username?: string; credential?: string }[];
  };
  log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void;
}

export interface AuthUser { id: string; role: Role; email: string; firstName: string; lastName: string; plan: string; isMinor: boolean; age: number | null; sid: string; doc: Doc; twoFactorEnabled: boolean }

export interface Ctx {
  req: RequestIn; params: Record<string, string>; query: Record<string, any>; body: any;
  user: AuthUser | null; apiKey: Doc | null; db: Db; p: Providers;
  setCookie(name: string, value: string, opts?: CookieOpts): void; clearCookie(name: string, opts?: CookieOpts): void; setHeader(k: string, v: string): void;
  status(code: number): void;
}
/** Usuario autenticado garantizado (para rutas con auth). */
export function me(ctx: Ctx): AuthUser {
  if (!ctx.user) throw Object.assign(new Error('unauthorized'), { status: 401 });
  return ctx.user;
}
