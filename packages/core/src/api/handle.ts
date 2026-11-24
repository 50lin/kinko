import { ZodError } from 'zod';
import { HttpError, unauthorized, forbidden, tooMany, notFound } from '../util/errors';
import { ageFrom } from '../util/dates';
import type { Db } from '../db/types';
import type { Ctx, Providers, RequestIn, ResponseOut, AuthUser } from './context';
import { compile, matchRoute, RateLimiter, type RouteDef } from './router';
import { allRoutes } from './routes';

const MFA_EXEMPT = /^\/(auth|me\/profile|me\/settings)/;

/** Elimina claves peligrosas ($operadores, puntos) para evitar inyección NoSQL. */
export function sanitize(x: any, depth = 0): any {
  if (depth > 12) return undefined;
  if (Array.isArray(x)) return x.slice(0, 2000).map((v) => sanitize(v, depth + 1));
  if (x && typeof x === 'object' && !(x instanceof Uint8Array)) {
    const out: any = {};
    for (const [k, v] of Object.entries(x)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof x === 'string' && x.length > 100_000) return x.slice(0, 100_000);
  return x;
}

export async function loadAuthUser(db: Db, p: Providers, token: string): Promise<AuthUser | null> {
  const payload = p.tokens.verifyAccess(token);
  if (!payload) return null;
  const [u, s] = await Promise.all([db.col('users').findById(payload.sub), db.col('sessions').findById(payload.sid)]);
  if (!u || !s || s.revokedAt || s.userId !== u._id || new Date(s.expiresAt) < p.now()) return null;
  if (!['active', 'pending_guardian'].includes(u.status)) return null;
  const age = ageFrom(u.profile?.birthDate, p.now());
  return {
    id: u._id, role: u.role, email: u.email, firstName: u.profile?.firstName || '', lastName: u.profile?.lastName || '', plan: u.plan || 'free',
    isMinor: age != null && age < 18, age, sid: payload.sid, doc: u, twoFactorEnabled: !!u.twoFactor?.enabled,
  };
}

export interface KinkoApp { handle(req: RequestIn): Promise<ResponseOut>; routes: RouteDef[]; db: Db; p: Providers }

export function createApp(opts: { db: Db; providers: Providers; routes?: RouteDef[] }): KinkoApp {
  const routes = compile(opts.routes || allRoutes);
  const limiter = new RateLimiter();
  const { db, providers: p } = opts;

  async function handle(req: RequestIn): Promise<ResponseOut> {
    const out: ResponseOut = { status: 200, body: null, setCookies: [], clearCookies: [], headers: {} };
    try {
      const path = req.path.replace(/^\/api/, '') || '/';
      const m = matchRoute(routes, req.method.toUpperCase(), path);
      if (!m) throw notFound('Ruta no encontrada');
      const { route, params } = m;
      const ctx: Ctx = {
        req, params, query: sanitize(req.query || {}), body: sanitize(req.body ?? {}), user: null, apiKey: null, db, p,
        setCookie: (name, value, o = {}) => out.setCookies.push({ name, value, opts: o }),
        clearCookie: (name, o = {}) => out.clearCookies.push({ name, opts: o }),
        setHeader: (k, v) => { out.headers[k] = v; },
        status: (code) => { out.status = code; },
      };
      const authz = req.headers['authorization'] || '';
      const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
      if (route.auth === 'apikey') {
        const key = (req.headers['x-api-key'] || (bearer.startsWith('kk_') ? bearer : '')).trim();
        if (!key) throw unauthorized('Falta la clave API (cabecera X-API-Key)');
        const hash = await p.sha256(key);
        const k = await db.col('apiKeys').findOne({ keyHash: hash, revokedAt: null });
        if (!k) throw unauthorized('Clave API no válida o revocada');
        if (k.env === 'live' && k.status !== 'approved') throw forbidden('Tu clave live está pendiente de aprobación');
        ctx.apiKey = k;
        if (!limiter.check(`apikey:${k._id}`, k.rateLimitPerMin || 120, 60_000)) throw tooMany();
        const day = p.now().toISOString().slice(0, 10);
        await db.col('apiUsage').updateOne({ keyId: k._id, day, endpoint: path }, { $inc: { count: 1 }, $setOnInsert: { ownerId: k.ownerId } }, { upsert: true });
        await db.col('apiKeys').updateById(k._id, { $set: { lastUsedAt: p.now().toISOString() } });
      } else if (route.auth !== 'public') {
        const u = bearer && !bearer.startsWith('kk_') ? await loadAuthUser(db, p, bearer) : null;
        if (!u && route.auth !== 'optional') throw unauthorized(bearer ? 'Tu sesión ha caducado' : 'Necesitas iniciar sesión', bearer ? 'token_expired' : 'unauthorized');
        ctx.user = u;
        if (u && Array.isArray(route.auth) && !route.auth.includes(u.role)) throw forbidden('Tu perfil no tiene acceso a esta sección');
        if (u && p.config.require2faForStaff && ['professional', 'clinic_admin', 'admin', 'developer'].includes(u.role) && !u.twoFactorEnabled && !MFA_EXEMPT.test(path)) {
          throw new HttpError(403, 'mfa_setup_required', 'Por seguridad, activa la verificación en dos pasos antes de acceder a datos clínicos.');
        }
        if (u && u.doc.status === 'pending_guardian' && !/^\/(auth|me)/.test(path)) throw new HttpError(403, 'guardian_required', 'Tu cuenta necesita la autorización de tu madre, padre o tutor.');
      }
      if (route.rate) {
        const who = route.rate.by === 'user' && ctx.user ? ctx.user.id : req.ip;
        // En demo (ferias: muchas personas desde la misma IP) y tests, el límite se relaja; el bloqueo por cuenta sigue activo.
        const mult = p.config.env === 'test' ? 100 : p.config.demoMode ? 20 : 1;
        if (!limiter.check(`${route.rate.bucket}:${who}`, route.rate.limit * mult, route.rate.windowMs)) throw tooMany();
      }
      if (route.upload) (ctx as any).file = req.file;
      const result = await route.handler(ctx);
      out.body = result === undefined ? { ok: true } : result;
      return out;
    } catch (e: any) {
      if (e instanceof HttpError) { out.status = e.status; out.body = { error: { code: e.code, message: e.message, details: e.details } }; }
      else if (e instanceof ZodError) { out.status = 400; out.body = { error: { code: 'validation', message: 'Revisa los datos del formulario', details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } }; }
      else if (e?.status === 401) { out.status = 401; out.body = { error: { code: 'unauthorized', message: 'Necesitas iniciar sesión' } }; }
      else if (e?.code === 11000) { out.status = 409; out.body = { error: { code: 'conflict', message: 'Ese registro ya existe' } }; }
      else {
        p.log('error', 'Unhandled error', { message: e?.message, stack: p.config.env !== 'production' ? e?.stack : undefined, path: req.path });
        out.status = 500; out.body = { error: { code: 'internal', message: p.config.env === 'production' ? 'Error interno' : e?.message || 'Error interno' } };
      }
      return out;
    }
  }
  return { handle, routes, db, p };
}
