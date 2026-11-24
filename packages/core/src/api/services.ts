import { z } from 'zod';
import type { Ctx } from './context';
import type { Doc } from '../db/types';
import { forbidden, notFound } from '../util/errors';
import { addDays, ageFrom, dayKey } from '../util/dates';
import { computeKinkoScore } from '../engine/kinkoScore';
import type { CareScope, GuardianScope } from '../constants';
import { ALERT_LABEL } from '../constants';

export const zid = z.string().regex(/^[a-zA-Z0-9_-]{6,64}$/, 'Identificador no válido');
export const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => schema.parse(data);

export function initials(first?: string, last?: string) { return `${(first || '?')[0] || ''}${(last || '')[0] || ''}`.toUpperCase(); }

/** Datos públicos mínimos de un usuario (nunca email ni datos de salud). */
export function publicUser(u: Doc | null | undefined) {
  if (!u) return null;
  return { id: u._id, role: u.role, firstName: u.profile?.firstName || '', lastName: u.profile?.lastName || '', avatarUrl: u.profile?.avatarUrl || null, avatarHue: u.profile?.avatarHue ?? 160 };
}
export function selfUser(u: Doc, p: Ctx['p']) {
  const age = ageFrom(u.profile?.birthDate, p.now());
  return {
    id: u._id, email: u.email, role: u.role, status: u.status, plan: u.plan || 'free', profile: u.profile || {}, settings: u.settings || {}, consents: u.consents || {},
    twoFactorEnabled: !!u.twoFactor?.enabled, gamification: u.gamification || { points: 0, streak: 0, badges: [] }, age, isMinor: age != null && age < 18,
    organization: u.organization || null, createdAt: u.createdAt, emailVerified: !!u.emailVerified,
  };
}

export async function audit(ctx: Ctx, action: string, resourceType: string, resourceId?: string | null, patientId?: string | null, meta: Record<string, unknown> = {}) {
  await ctx.db.col('auditLogs').insert({
    actorId: ctx.user?.id || null, actorRole: ctx.user?.role || (ctx.apiKey ? 'apikey' : null), apiKeyId: ctx.apiKey?._id || null,
    action, resourceType, resourceId: resourceId || null, patientId: patientId || null, ip: ctx.req.ip, userAgent: (ctx.req.headers['user-agent'] || '').slice(0, 200), meta,
  });
}

export async function notify(ctx: Ctx, userId: string, n: { type: string; title: string; body?: string; link?: string; priority?: 'low' | 'normal' | 'high' | 'critical' }) {
  const doc = await ctx.db.col('notifications').insert({ userId, read: false, priority: 'normal', ...n });
  ctx.p.realtime.toUser(userId, 'notification:new', doc);
  return doc;
}

/** Relación de cuidado activa entre profesional y paciente. */
export async function activeRelation(ctx: Ctx, professionalId: string, patientId: string) {
  return ctx.db.col('careRelations').findOne({ professionalId, patientId, status: 'active' });
}
/** Comprueba que el profesional tiene consentimiento para ver ese tipo de dato y devuelve la fecha desde la que puede verlo. */
export async function assertCareScope(ctx: Ctx, patientId: string, scope: CareScope): Promise<{ relation: Doc; from: string | null }> {
  const u = ctx.user!;
  if (u.role !== 'professional') throw forbidden();
  const rel = await activeRelation(ctx, u.id, patientId);
  if (!rel) throw forbidden('Este paciente no está en tu equipo de cuidado o no ha aceptado la relación');
  if (!rel.consent?.scopes?.includes(scope)) throw forbidden('El paciente no ha autorizado compartir este tipo de datos contigo');
  return { relation: rel, from: rel.consent?.historyFrom || null };
}
export async function guardianLink(ctx: Ctx, teenId: string, scope?: GuardianScope) {
  const link = await ctx.db.col('guardianLinks').findOne({ parentId: ctx.user!.id, teenId, status: 'active' });
  if (!link) throw notFound('No tienes vinculado a este adolescente');
  if (scope && !link.scopes?.includes(scope)) throw forbidden('Tu hijo/a no ha autorizado compartir esta información');
  return link;
}
export const sinceFilter = (field: string, from: string | null) => (from ? { [field]: { $gte: from } } : {});

/** Crea una alerta clínica y avisa al equipo de cuidado (y a la familia si es un menor en riesgo). */
export async function raiseAlert(ctx: Ctx, patientId: string, a: { type: string; severity: 'low' | 'medium' | 'high' | 'critical'; message: string; data?: any }) {
  const { db } = ctx;
  const since = addDays(ctx.p.now(), -1).toISOString();
  const dup = await db.col('alerts').findOne({ patientId, type: a.type, status: { $ne: 'resolved' }, createdAt: { $gte: since } });
  if (dup) return dup;
  const rels = await db.col('careRelations').find({ patientId, status: 'active' });
  const professionalIds = rels.map((r) => r.professionalId);
  const patient = await db.col('users').findById(patientId);
  const age = ageFrom(patient?.profile?.birthDate, ctx.p.now());
  const guardians = (age != null && age < 18 && ['high', 'critical'].includes(a.severity)) ? (await db.col('guardianLinks').find({ teenId: patientId, status: 'active' })).map((g) => g.parentId) : [];
  const alert = await db.col('alerts').insert({ patientId, professionalIds, guardianIds: guardians, status: 'open', ...a });
  const name = `${patient?.profile?.firstName || ''} ${patient?.profile?.lastName || ''}`.trim();
  for (const pid of professionalIds) {
    await notify(ctx, pid, { type: 'alert', title: `${ALERT_LABEL[a.type] || 'Alerta'}: ${name}`, body: a.message, link: `/pro/pacientes/${patientId}`, priority: a.severity === 'critical' ? 'critical' : 'high' });
    ctx.p.realtime.toUser(pid, 'alert:new', alert);
  }
  for (const gid of guardians) await notify(ctx, gid, { type: 'alert', title: `Aviso importante sobre ${patient?.profile?.firstName}`, body: 'Hemos detectado que podría estar pasando un momento muy difícil. Habla con él/ella con calma y, si hay peligro, llama al 112. Su profesional también ha sido avisado.', link: `/familia/${patientId}`, priority: 'critical' });
  return alert;
}

/** Recalcula y guarda la puntuación Kinkō del usuario (se cachea en el documento de usuario para listados). */
export async function refreshKinko(ctx: Ctx, userId: string) {
  const now = ctx.p.now();
  const from = dayKey(addDays(now, -15));
  const [checkins, assessments, measurements, passions] = await Promise.all([
    ctx.db.col('checkins').find({ userId, date: { $gte: from } }),
    ctx.db.col('assessments').find({ userId, completedAt: { $gte: addDays(now, -31).toISOString() } }),
    ctx.db.col('measurements').find({ userId, measuredAt: { $gte: addDays(now, -8).toISOString() } }),
    ctx.db.col('passionProfiles').findOne({ userId }),
  ]);
  const score = computeKinkoScore({ checkins: checkins as any, assessments: assessments as any, measurements: measurements as any, passions: passions as any, now });
  await ctx.db.col('users').updateById(userId, { $set: { kinko: score } });
  return score;
}

export async function latestAssessments(ctx: Ctx, userId: string, from?: string | null) {
  const list = await ctx.db.col('assessments').find({ userId, ...(from ? { completedAt: { $gte: from } } : {}) }, { sort: { completedAt: -1 } });
  const out: Record<string, Doc> = {};
  for (const a of list) if (!out[a.instrumentId]) out[a.instrumentId] = a;
  return out;
}

export function paginate(q: Record<string, any>) {
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const skip = Math.max(Number(q.skip) || 0, 0);
  return { limit, skip };
}
export function hueFor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
