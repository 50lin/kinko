import type { Ctx } from './context';
import type { Role } from '../constants';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AuthSpec = 'public' | 'optional' | 'user' | 'apikey' | Role[];
export interface RateSpec { bucket: string; limit: number; windowMs: number; by?: 'ip' | 'user' }
export interface RouteDef { method: Method; path: string; auth: AuthSpec; rate?: RateSpec; upload?: boolean; handler(ctx: Ctx): Promise<any> | any; re?: RegExp; keys?: string[] }
type H = (ctx: Ctx) => Promise<any> | any;
type Opts = { rate?: RateSpec; upload?: boolean };
const mk = (method: Method) => (path: string, auth: AuthSpec, handler: H, opts: Opts = {}): RouteDef => ({ method, path, auth, handler, ...opts });
export const r = { get: mk('GET'), post: mk('POST'), put: mk('PUT'), patch: mk('PATCH'), del: mk('DELETE') };

export const RATE = {
  auth: { bucket: 'auth', limit: 10, windowMs: 15 * 60_000, by: 'ip' } as RateSpec,
  ai: { bucket: 'ai', limit: 30, windowMs: 60_000, by: 'user' } as RateSpec,
  write: { bucket: 'write', limit: 60, windowMs: 60_000, by: 'user' } as RateSpec,
  apikey: { bucket: 'apikey', limit: 120, windowMs: 60_000, by: 'user' } as RateSpec,
};

export function compile(routes: RouteDef[]): RouteDef[] {
  return routes.map((rt) => {
    const keys: string[] = [];
    const re = new RegExp('^' + rt.path.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    return { ...rt, re, keys };
  });
}
export function matchRoute(routes: RouteDef[], method: string, path: string): { route: RouteDef; params: Record<string, string> } | null {
  for (const rt of routes) {
    if (rt.method !== method) continue;
    const m = rt.re!.exec(path);
    if (m) return { route: rt, params: Object.fromEntries(rt.keys!.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  check(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const arr = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr);
    if (this.hits.size > 50_000) this.hits.clear();
    return true;
  }
}
