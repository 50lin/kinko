import { z } from 'zod';
import { r, RATE } from '../router';
import type { Ctx } from '../context';
import { badRequest, forbidden, notFound } from '../../util/errors';
import { addDays, dayKey, daysBetween, localParts } from '../../util/dates';
import { randomCode } from '../../util/ids';
import { CARE_SCOPES, EMOTIONS, GUARDIAN_SCOPES } from '../../constants';
import { INSTRUMENT_BY_ID, INSTRUMENTS, publicInstrument, reliableChange } from '../../instruments';
import { dailyDomainSeries, personalInsights } from '../../engine/kinkoScore';
import { recommend } from '../../engine/recommendations';
import { analyzePassions, PASSION_BY_KEY, PASSIONS, PASSION_CATEGORIES } from '../../engine/passions';
import { detectRisk, isUrgent } from '../../engine/safety';
import { sentiment } from '../../engine/sentiment';
import { audit, latestAssessments, notify, paginate, parse, publicUser, raiseAlert, refreshKinko, selfUser, zid } from '../services';

const PATIENT = ['patient'] as const;
const BADGES: Record<string, string> = { 'primer-checkin': 'Primer check-in', 'racha-7': '7 días seguidos', 'racha-30': '30 días seguidos', 'explorador': '3 tests distintos', 'pasiones': 'Mapa de pasiones', 'comunidad': 'Primera publicación', 'ruta-completa': 'Ruta completada', 'diario-5': '5 entradas de diario' };

export async function award(ctx: Ctx, userId: string, points: number, badge?: string) {
  const u = await ctx.db.col('users').findById(userId);
  if (!u) return;
  const badges: string[] = u.gamification?.badges || [];
  const upd: any = { $inc: { 'gamification.points': points } };
  if (badge && !badges.includes(badge)) {
    upd.$push = { 'gamification.badges': badge };
    await notify(ctx, userId, { type: 'badge', title: `Nuevo logro: ${BADGES[badge] || badge}`, body: 'Sigue cuidándote a tu ritmo.', link: '/app/progreso', priority: 'low' });
  }
  await ctx.db.col('users').updateById(userId, upd);
}

const CheckinSchema = z.object({
  mood: z.number().int().min(1).max(10), energy: z.number().int().min(1).max(10).optional(), stress: z.number().int().min(1).max(10).optional(),
  anxiety: z.number().int().min(1).max(10).optional(), sleepHours: z.number().min(0).max(16).optional(), sleepQuality: z.number().int().min(1).max(5).optional(),
  social: z.number().int().min(1).max(5).optional(), activityMinutes: z.number().int().min(0).max(600).optional(), focus: z.number().int().min(1).max(10).optional(),
  emotions: z.array(z.string().max(30)).max(8).default([]).transform((xs) => xs.filter((x) => EMOTIONS.includes(x))),
  behaviors: z.object({ alcohol: z.boolean().optional(), selfCare: z.boolean().optional(), outdoors: z.boolean().optional(), screensLate: z.boolean().optional(), passionTime: z.boolean().optional() }).default({}),
  gratitude: z.string().max(280).optional(), note: z.string().max(2000).optional(), tags: z.array(z.string().max(30)).max(10).default([]),
});

async function saveCheckin(ctx: Ctx) {
  const u = ctx.user!; const { db, p } = ctx;
  const b = parse(CheckinSchema, ctx.body);
  const date = dayKey(p.now());
  const existing = await db.col('checkins').findOne({ userId: u.id, date });
  const doc = existing ? await db.col('checkins').updateById(existing._id, { $set: { ...b } }) : await db.col('checkins').insert({ userId: u.id, date, ...b });
  if (!existing) {
    const g = (await db.col('users').findById(u.id))?.gamification || {};
    const yesterday = dayKey(addDays(p.now(), -1));
    const streak = g.lastCheckinDate === yesterday ? (g.streak || 0) + 1 : g.lastCheckinDate === date ? g.streak || 1 : 1;
    await db.col('users').updateById(u.id, { $set: { 'gamification.streak': streak, 'gamification.lastCheckinDate': date }, $max: { 'gamification.bestStreak': streak } });
    await award(ctx, u.id, 10, streak >= 30 ? 'racha-30' : streak >= 7 ? 'racha-7' : (g.badges || []).includes('primer-checkin') ? undefined : 'primer-checkin');
  }
  const risk = b.note ? detectRisk(b.note) : null;
  if (risk && isUrgent(risk)) await raiseAlert(ctx, u.id, { type: 'crisis', severity: risk.level === 'imminent' ? 'critical' : 'high', message: 'Texto del check-in con señales de riesgo. Contactar con el paciente.', data: { categories: risk.categories } });
  const last3 = await db.col('checkins').find({ userId: u.id, date: { $gte: dayKey(addDays(p.now(), -2)) } });
  if (last3.length >= 3 && last3.every((c) => c.mood <= 3)) await raiseAlert(ctx, u.id, { type: 'deterioration', severity: 'medium', message: 'Tres días seguidos con ánimo muy bajo (3/10 o menos).' });
  const kinko = await refreshKinko(ctx, u.id);
  return { checkin: doc, kinko, crisis: risk && isUrgent(risk) ? risk : null };
}

const AssessmentSchema = z.object({ instrumentId: z.string().max(20), answers: z.record(z.string().max(10), z.number().int().min(0).max(100)), context: z.enum(['self', 'scheduled', 'onboarding']).default('self') });
async function submitAssessment(ctx: Ctx) {
  const u = ctx.user!; const { db, p } = ctx;
  const b = parse(AssessmentSchema, ctx.body);
  const inst = INSTRUMENT_BY_ID[b.instrumentId];
  if (!inst) throw notFound('Cuestionario no encontrado');
  if (inst.minAge && u.age != null && u.age < inst.minAge) throw forbidden('Este cuestionario no está disponible para tu edad');
  let res;
  try { res = inst.score(b.answers); } catch (e: any) { throw badRequest(e.message); }
  const prev = await db.col('assessments').findOne({ userId: u.id, instrumentId: inst.id }, { sort: { completedAt: -1 } });
  const change = reliableChange(inst, prev?.score, res.score);
  const doc = await db.col('assessments').insert({ userId: u.id, instrumentId: inst.id, answers: b.answers, ...res, change, previousScore: prev?.score ?? null, context: b.context, completedAt: p.now().toISOString() });
  const distinct = new Set((await db.col('assessments').find({ userId: u.id })).map((a) => a.instrumentId));
  await award(ctx, u.id, 15, distinct.size >= 3 ? 'explorador' : undefined);
  if (res.flags.includes('crisis') || res.flags.includes('asq_acute')) await raiseAlert(ctx, u.id, { type: 'crisis', severity: 'critical', message: 'ASQ: riesgo agudo indicado por el paciente. Contactar de inmediato.', data: { assessmentId: doc._id } });
  else if (res.flags.includes('asq_positive')) await raiseAlert(ctx, u.id, { type: 'asq_positive', severity: 'high', message: 'Cribado ASQ positivo. Valorar en las próximas 72 horas.', data: { assessmentId: doc._id } });
  if (res.flags.includes('phq9_item9')) await raiseAlert(ctx, u.id, { type: 'phq9_item9', severity: 'high', message: `PHQ-9 ítem 9 = ${b.answers.q9}. Explorar ideación en la próxima sesión o antes.`, data: { assessmentId: doc._id } });
  if (change === 'worse' && ['phq9', 'gad7', 'who5', 'cbi'].includes(inst.id)) await raiseAlert(ctx, u.id, { type: 'deterioration', severity: 'medium', message: `${inst.short}: empeoramiento fiable (${prev?.score} → ${res.score}).`, data: { assessmentId: doc._id } });
  await db.col('scheduledMeasures').updateMany({ patientId: u.id, instrumentId: inst.id, active: true, nextDueAt: { $lte: addDays(p.now(), 2).toISOString() } }, { $set: { lastCompletedAt: p.now().toISOString(), nextDueAt: addDays(p.now(), 14).toISOString() } });
  const kinko = await refreshKinko(ctx, u.id);
  return { assessment: doc, kinko, crisis: res.flags.includes('crisis') || res.flags.includes('asq_acute') || res.flags.includes('phq9_item9') };
}

const JournalSchema = z.object({
  title: z.string().max(140).default(''), content: z.string().min(1, 'Escribe algo').max(20000), mood: z.number().int().min(1).max(10).optional(),
  emotions: z.array(z.string().max(30)).max(8).default([]), tags: z.array(z.string().max(30)).max(10).default([]), shared: z.boolean().default(false),
  photos: z.array(z.string().max(400_000)).max(6).default([]), // URL o data: URL comprimida (modo demo)
});

const InterestSchema = z.object({
  key: z.string().max(40), importance: z.number().int().min(1).max(5), frequency: z.number().int().min(0).max(4), skill: z.number().int().min(1).max(5).optional(),
  support: z.object({ family: z.number().int().min(1).max(5).optional(), friends: z.number().int().min(1).max(5).optional(), school: z.number().int().min(1).max(5).optional() }).default({}),
  blockers: z.array(z.string().max(30)).max(8).default([]), dream: z.string().max(300).optional(),
});

async function dashboard(ctx: Ctx) {
  const u = ctx.user!; const { db, p } = ctx;
  const now = p.now(); const today = dayKey(now);
  const [kinko, latest, passionProfile, rels, todayCheckin, appts, plan, unreadN, convs, measures] = await Promise.all([
    refreshKinko(ctx, u.id), latestAssessments(ctx, u.id), db.col('passionProfiles').findOne({ userId: u.id }), db.col('careRelations').find({ patientId: u.id, status: 'active' }),
    db.col('checkins').findOne({ userId: u.id, date: today }), db.col('appointments').find({ patientId: u.id, startAt: { $gte: addDays(now, -1 / 24).toISOString() }, status: { $in: ['requested', 'confirmed'] } }, { sort: { startAt: 1 }, limit: 3 }),
    db.col('treatmentPlans').findOne({ patientId: u.id, status: 'active' }), db.col('notifications').count({ userId: u.id, read: false }),
    db.col('conversations').find({ participants: u.id }), db.col('scheduledMeasures').find({ patientId: u.id, active: true, nextDueAt: { $lte: now.toISOString() } }),
  ]);
  const analysis = analyzePassions(passionProfile?.interests || []);
  const openCrisis = await db.col('alerts').count({ patientId: u.id, type: 'crisis', status: 'open', createdAt: { $gte: addDays(now, -2).toISOString() } });
  const recos = recommend({ score: kinko, latest: latest as any, passions: analysis.insights, hasProfessional: rels.length > 0, checkedInToday: !!todayCheckin, age: u.age, hour: localParts(now).hour, openCrisis: openCrisis > 0 });
  let unreadMessages = 0;
  for (const c of convs) unreadMessages += await db.col('messages').count({ conversationId: c._id, senderId: { $ne: u.id }, readBy: { $nin: [u.id] } });
  const pros = await db.col('users').find({ _id: { $in: rels.map((r) => r.professionalId) } });
  const fresh = await db.col('users').findById(u.id);
  const tasksToday = (plan?.tasks || []).filter((t: any) => t.status !== 'archived').map((t: any) => ({ ...t, doneToday: (t.completions || []).some((c: any) => c.date === today) }));
  return {
    user: selfUser(fresh!, p), kinko, recommendations: recos.slice(0, 8), todayCheckin, streak: fresh?.gamification?.streak || 0,
    upcoming: await Promise.all(appts.map(async (a) => ({ ...a, professional: publicUser(await db.col('users').findById(a.professionalId)) }))),
    plan: plan ? { id: plan._id, title: plan.title, tasks: tasksToday } : null, dueMeasures: measures.map((m) => ({ id: m._id, instrumentId: m.instrumentId, name: INSTRUMENT_BY_ID[m.instrumentId]?.short })),
    unread: { notifications: unreadN, messages: unreadMessages }, careTeam: pros.map(publicUser), passions: { summary: analysis.summary, top: analysis.insights.slice(0, 3) },
    latest: Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, { score: v.score, severityLabel: v.severityLabel, completedAt: v.completedAt, change: v.change }])),
  };
}

async function stats(ctx: Ctx) {
  const u = ctx.user!; const { db, p } = ctx;
  const days = Math.min(Number(ctx.query.days) || 90, 730);
  const from = dayKey(addDays(p.now(), -days));
  const [checkins, assessments, measurements, journal, enrolls] = await Promise.all([
    db.col('checkins').find({ userId: u.id, date: { $gte: from } }, { sort: { date: 1 } }),
    db.col('assessments').find({ userId: u.id }, { sort: { completedAt: 1 } }),
    db.col('measurements').find({ userId: u.id, measuredAt: { $gte: addDays(p.now(), -days).toISOString() } }, { sort: { measuredAt: 1 } }),
    db.col('journal').find({ userId: u.id, createdAt: { $gte: addDays(p.now(), -days).toISOString() } }),
    db.col('pathEnrollments').find({ userId: u.id }),
  ]);
  const byInstrument: Record<string, any[]> = {};
  for (const a of assessments) (byInstrument[a.instrumentId] ||= []).push({ date: a.completedAt, score: a.score, severityLabel: a.severityLabel, wellbeing: a.wellbeing });
  const emotionCounts: Record<string, number> = {};
  for (const c of checkins) for (const e of c.emotions || []) emotionCounts[e] = (emotionCounts[e] || 0) + 1;
  const daily: Record<string, Record<string, number[]>> = {};
  for (const m of measurements) { const d = m.measuredAt.slice(0, 10); ((daily[m.type] ||= {})[d] ||= []).push(m.value); }
  const bio = Object.fromEntries(Object.entries(daily).map(([type, byDay]) => [type, Object.entries(byDay).map(([date, vs]) => ({ date, value: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 }))]));
  return {
    series: dailyDomainSeries(checkins as any), raw: checkins.map((c) => ({ date: c.date, mood: c.mood, energy: c.energy, stress: c.stress, anxiety: c.anxiety, sleepHours: c.sleepHours, social: c.social, activityMinutes: c.activityMinutes })),
    assessments: byInstrument, emotions: Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]), biometrics: bio, insights: personalInsights(checkins as any),
    adherence: { days, checkins: checkins.length, rate: Math.round((checkins.length / days) * 100) / 100 }, journalCount: journal.length,
    journalSentiment: journal.map((j) => ({ date: j.createdAt.slice(0, 10), score: j.sentiment?.score ?? 0 })), paths: enrolls.length,
  };
}

export const patientRoutes = [
  r.get('/me/dashboard', [...PATIENT], dashboard),
  r.patch('/me/profile', 'user', async (ctx) => {
    const b = parse(z.object({ firstName: z.string().trim().min(1).max(60).optional(), lastName: z.string().trim().max(80).optional(), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), gender: z.enum(['mujer', 'hombre', 'no_binario', 'prefiero_no_decir']).optional(), province: z.string().max(60).optional(), city: z.string().max(80).optional(), phone: z.string().max(30).optional(), bio: z.string().max(600).optional(), avatarUrl: z.string().max(400_000).optional(), avatarHue: z.number().int().min(0).max(359).optional() }), ctx.body);
    const set = Object.fromEntries(Object.entries(b).map(([k, v]) => [`profile.${k}`, v]));
    return selfUser((await ctx.db.col('users').updateById(ctx.user!.id, { $set: set }))!, ctx.p);
  }),
  r.patch('/me/settings', 'user', async (ctx) => {
    const b = parse(z.object({ reminders: z.boolean().optional(), reminderHour: z.number().int().min(6).max(23).optional(), theme: z.enum(['light', 'dark', 'system']).optional(), sphereFace: z.boolean().optional(), aiUseContext: z.boolean().optional(), language: z.enum(['es', 'eu', 'en']).optional(), reduceMotion: z.boolean().optional() }), ctx.body);
    const set = Object.fromEntries(Object.entries(b).map(([k, v]) => [`settings.${k}`, v]));
    return selfUser((await ctx.db.col('users').updateById(ctx.user!.id, { $set: set }))!, ctx.p);
  }),
  r.patch('/me/consents', 'user', async (ctx) => {
    const b = parse(z.object({ research: z.boolean().optional(), marketing: z.boolean().optional() }), ctx.body);
    const set = Object.fromEntries(Object.entries(b).map(([k, v]) => [`consents.${k}`, v]));
    await audit(ctx, 'consent.update', 'user', ctx.user!.id, ctx.user!.id, b);
    return selfUser((await ctx.db.col('users').updateById(ctx.user!.id, { $set: { ...set, 'consents.updatedAt': ctx.p.now().toISOString() } }))!, ctx.p);
  }),
  r.get('/me/export', 'user', async (ctx) => {
    const id = ctx.user!.id; const { db } = ctx;
    const cols = ['checkins', 'assessments', 'journal', 'companionThreads', 'appointments', 'measurements', 'passionProfiles', 'pathEnrollments', 'notifications', 'orders', 'careRelations', 'guardianLinks'];
    const data: Record<string, any> = { user: selfUser(ctx.user!.doc, ctx.p), exportedAt: ctx.p.now().toISOString(), note: 'Exportación de tus datos personales (art. 20 RGPD).' };
    for (const c of cols) data[c] = await db.col(c).find({ $or: [{ userId: id }, { patientId: id }, { teenId: id }, { parentId: id }] });
    data.companionMessages = await db.col('companionMessages').find({ userId: id });
    await audit(ctx, 'gdpr.export', 'user', id, id);
    return data;
  }),
  r.post('/me/delete', 'user', async (ctx) => {
    const b = parse(z.object({ password: z.string(), confirm: z.literal('ELIMINAR') }), ctx.body);
    const u = await ctx.db.col('users').findById(ctx.user!.id);
    if (!u || !(await ctx.p.hasher.verify(u.passwordHash, b.password))) throw badRequest('Contraseña incorrecta');
    const id = u._id; const { db } = ctx;
    for (const c of ['checkins', 'journal', 'companionMessages', 'companionThreads', 'measurements', 'passionProfiles', 'pathEnrollments', 'notifications', 'devices']) await db.col(c).deleteMany({ userId: id });
    await db.col('forumPosts').updateMany({ authorId: id }, { $set: { anonymous: true, authorId: null } });
    // La historia clínica se conserva el plazo legal (Ley 41/2002) bloqueada y separada de la cuenta.
    await db.col('clinicalRecords').updateMany({ patientId: id }, { $set: { retentionHold: true } });
    await db.col('users').updateById(id, { $set: { status: 'deleted', email: `deleted-${id}@kinko.invalid`, passwordHash: '', profile: { firstName: 'Usuario', lastName: 'eliminado' }, deletedAt: ctx.p.now().toISOString() } });
    await db.col('sessions').updateMany({ userId: id }, { $set: { revokedAt: ctx.p.now().toISOString() } });
    await audit(ctx, 'gdpr.delete', 'user', id, id);
    return { ok: true };
  }),
  r.get('/me/notifications', 'user', async (ctx) => ctx.db.col('notifications').find({ userId: ctx.user!.id }, { sort: { createdAt: -1 }, ...paginate(ctx.query) })),
  r.post('/me/notifications/read-all', 'user', async (ctx) => { await ctx.db.col('notifications').updateMany({ userId: ctx.user!.id, read: false }, { $set: { read: true } }); }),
  r.post('/me/notifications/:id/read', 'user', async (ctx) => { await ctx.db.col('notifications').updateMany({ _id: ctx.params.id, userId: ctx.user!.id }, { $set: { read: true } }); }),

  // ---------- Equipo de cuidado y consentimientos ----------
  r.get('/me/care-team', 'user', async (ctx) => {
    const id = ctx.user!.id; const { db } = ctx;
    const rels = await db.col('careRelations').find({ patientId: id, status: { $in: ['pending', 'active'] } });
    const links = await db.col('guardianLinks').find({ teenId: id, status: { $in: ['pending', 'active'] } });
    return {
      professionals: await Promise.all(rels.map(async (rel) => ({ ...rel, professional: publicUser(await db.col('users').findById(rel.professionalId)), profile: await db.col('professionals').findOne({ userId: rel.professionalId }) }))),
      guardians: await Promise.all(links.map(async (l) => ({ ...l, parent: l.parentId ? publicUser(await db.col('users').findById(l.parentId)) : null }))),
    };
  }),
  r.post('/me/care-team/:id/accept', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ scopes: z.array(z.enum(CARE_SCOPES)).default(['checkins', 'assessments', 'journal_shared', 'plan']), historyFrom: z.string().nullable().default(null) }), ctx.body);
    const rel = await ctx.db.col('careRelations').updateOne({ _id: ctx.params.id, patientId: ctx.user!.id, status: 'pending' }, { $set: { status: 'active', startedAt: ctx.p.now().toISOString(), consent: { scopes: b.scopes, historyFrom: b.historyFrom, grantedAt: ctx.p.now().toISOString() } } });
    if (!rel) throw notFound();
    await audit(ctx, 'consent.grant', 'careRelation', rel._id, ctx.user!.id, b);
    await notify(ctx, rel.professionalId, { type: 'care', title: `${ctx.user!.firstName} ha aceptado tu invitación`, link: `/pro/pacientes/${ctx.user!.id}` });
    return rel;
  }),
  r.patch('/me/care-team/:id', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ scopes: z.array(z.enum(CARE_SCOPES)).optional(), historyFrom: z.string().nullable().optional(), end: z.boolean().optional() }), ctx.body);
    const set: any = {};
    if (b.scopes) set['consent.scopes'] = b.scopes;
    if (b.historyFrom !== undefined) set['consent.historyFrom'] = b.historyFrom;
    if (b.end) { set.status = 'ended'; set.endedAt = ctx.p.now().toISOString(); }
    const rel = await ctx.db.col('careRelations').updateOne({ _id: ctx.params.id, patientId: ctx.user!.id }, { $set: { ...set, 'consent.updatedAt': ctx.p.now().toISOString() } });
    if (!rel) throw notFound();
    await audit(ctx, b.end ? 'consent.revoke' : 'consent.update', 'careRelation', rel._id, ctx.user!.id, b);
    return rel;
  }),
  r.post('/me/guardian-code', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ scopes: z.array(z.enum(GUARDIAN_SCOPES)).default(['progress', 'adherence', 'appointments']) }), ctx.body);
    const code = randomCode(8);
    const pending = await ctx.db.col('guardianLinks').findOne({ teenId: ctx.user!.id, status: 'pending' });
    if (pending) await ctx.db.col('guardianLinks').updateById(pending._id, { $set: { code, scopes: b.scopes } });
    else await ctx.db.col('guardianLinks').insert({ teenId: ctx.user!.id, parentId: null, code, status: 'pending', scopes: b.scopes, createdBy: 'teen' });
    return { code, scopes: b.scopes };
  }),
  r.patch('/me/guardians/:id', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ scopes: z.array(z.enum(GUARDIAN_SCOPES)).optional(), revoke: z.boolean().optional() }), ctx.body);
    if (b.revoke && ctx.user!.isMinor && ctx.user!.age != null && ctx.user!.age < ctx.p.config.minorConsentAge) throw forbidden('Por tu edad, la vinculación familiar es necesaria. Puedes ajustar qué comparten.');
    const link = await ctx.db.col('guardianLinks').updateOne({ _id: ctx.params.id, teenId: ctx.user!.id }, { $set: b.revoke ? { status: 'revoked' } : { scopes: b.scopes } });
    if (!link) throw notFound();
    await audit(ctx, 'guardian.update', 'guardianLink', link._id, ctx.user!.id, b);
    return link;
  }),
  r.post('/me/organization', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ code: z.string().max(20), department: z.string().max(60).optional() }), ctx.body);
    const org = await ctx.db.col('organizations').findOne({ joinCode: b.code.toUpperCase() });
    if (!org) throw notFound('Código de empresa no válido');
    await ctx.db.col('users').updateById(ctx.user!.id, { $set: { organization: { id: org._id, name: org.name, department: b.department || null, joinedAt: ctx.p.now().toISOString() }, plan: ctx.user!.plan === 'free' ? 'org' : ctx.user!.plan } });
    return { organization: org.name };
  }),

  // ---------- Check-ins ----------
  r.get('/checkins', [...PATIENT], async (ctx) => ctx.db.col('checkins').find({ userId: ctx.user!.id, date: { $gte: dayKey(addDays(ctx.p.now(), -(Number(ctx.query.days) || 30))) } }, { sort: { date: -1 } })),
  r.get('/checkins/today', [...PATIENT], async (ctx) => ctx.db.col('checkins').findOne({ userId: ctx.user!.id, date: dayKey(ctx.p.now()) })),
  r.post('/checkins', [...PATIENT], saveCheckin, { rate: RATE.write }),

  // ---------- Tests ----------
  r.get('/instruments', 'optional', async (ctx) => {
    const latest = ctx.user ? await latestAssessments(ctx, ctx.user.id) : {};
    const age = ctx.user?.age ?? null;
    return INSTRUMENTS.filter((i) => !i.minAge || age == null || age >= i.minAge).map((i) => ({ ...publicInstrument(i), last: latest[i.id] ? { score: latest[i.id].score, max: latest[i.id].max, severityLabel: latest[i.id].severityLabel, completedAt: latest[i.id].completedAt, change: latest[i.id].change } : null }));
  }),
  r.get('/instruments/:id', 'optional', async (ctx) => { const i = INSTRUMENT_BY_ID[ctx.params.id]; if (!i) throw notFound(); return publicInstrument(i); }),
  r.post('/assessments', [...PATIENT], submitAssessment, { rate: RATE.write }),
  r.get('/assessments', [...PATIENT], async (ctx) => ctx.db.col('assessments').find({ userId: ctx.user!.id, ...(ctx.query.instrumentId ? { instrumentId: String(ctx.query.instrumentId) } : {}) }, { sort: { completedAt: -1 }, ...paginate(ctx.query) })),
  r.get('/assessments/:id', [...PATIENT], async (ctx) => { const a = await ctx.db.col('assessments').findOne({ _id: ctx.params.id, userId: ctx.user!.id }); if (!a) throw notFound(); return { ...a, instrument: publicInstrument(INSTRUMENT_BY_ID[a.instrumentId]) }; }),

  // ---------- Diario ----------
  r.get('/journal', [...PATIENT], async (ctx) => ctx.db.col('journal').find({ userId: ctx.user!.id }, { sort: { createdAt: -1 }, ...paginate(ctx.query) })),
  r.post('/journal', [...PATIENT], async (ctx) => {
    const b = parse(JournalSchema, ctx.body);
    const s = sentiment(`${b.title} ${b.content}`);
    const risk = detectRisk(b.content);
    const doc = await ctx.db.col('journal').insert({ userId: ctx.user!.id, ...b, sentiment: { score: s.score, label: s.label } });
    const n = await ctx.db.col('journal').count({ userId: ctx.user!.id });
    await award(ctx, ctx.user!.id, 5, n >= 5 ? 'diario-5' : undefined);
    if (isUrgent(risk)) await raiseAlert(ctx, ctx.user!.id, { type: 'crisis', severity: risk.level === 'imminent' ? 'critical' : 'high', message: 'Entrada de diario con señales de riesgo (el contenido es privado salvo que el paciente lo comparta).', data: { categories: risk.categories } });
    return { entry: doc, crisis: isUrgent(risk) ? risk : null };
  }, { rate: RATE.write }),
  r.patch('/journal/:id', [...PATIENT], async (ctx) => {
    const b = parse(JournalSchema.partial(), ctx.body);
    const set: any = { ...b };
    if (b.content) { const s = sentiment(`${b.title || ''} ${b.content}`); set.sentiment = { score: s.score, label: s.label }; }
    const d = await ctx.db.col('journal').updateOne({ _id: ctx.params.id, userId: ctx.user!.id }, { $set: set });
    if (!d) throw notFound(); return d;
  }),
  r.del('/journal/:id', [...PATIENT], async (ctx) => { if (!(await ctx.db.col('journal').deleteOne({ _id: ctx.params.id, userId: ctx.user!.id }))) throw notFound(); }),

  // ---------- Progreso ----------
  r.get('/stats/overview', [...PATIENT], stats),
  r.get('/timeline', [...PATIENT], async (ctx) => {
    const id = ctx.user!.id; const { db } = ctx;
    const [a, j, ap, en, al] = await Promise.all([
      db.col('assessments').find({ userId: id }, { sort: { completedAt: -1 }, limit: 50 }), db.col('journal').find({ userId: id }, { sort: { createdAt: -1 }, limit: 50 }),
      db.col('appointments').find({ patientId: id, status: 'completed' }, { sort: { startAt: -1 }, limit: 50 }), db.col('pathEnrollments').find({ userId: id }), db.col('alerts').find({ patientId: id, type: 'crisis' }),
    ]);
    const ev = [
      ...a.map((x) => ({ date: x.completedAt, kind: 'test', title: `${INSTRUMENT_BY_ID[x.instrumentId]?.short}: ${x.score} (${x.severityLabel})`, id: x._id })),
      ...j.map((x) => ({ date: x.createdAt, kind: 'journal', title: x.title || 'Entrada de diario', id: x._id })),
      ...ap.map((x) => ({ date: x.startAt, kind: 'session', title: 'Sesión con tu profesional', id: x._id })),
      ...en.map((x) => ({ date: x.startedAt || x.createdAt, kind: 'path', title: `Empezaste la ruta «${x.title}»`, id: x._id })),
      ...al.map((x) => ({ date: x.createdAt, kind: 'support', title: 'Momento difícil: activaste ayuda', id: x._id })),
    ];
    return ev.sort((x, y) => y.date.localeCompare(x.date));
  }),

  // ---------- Pasiones ----------
  r.get('/passions/catalog', 'public', async () => ({ categories: PASSION_CATEGORIES, passions: PASSIONS })),
  r.get('/passions/me', [...PATIENT], async (ctx) => {
    const prof = await ctx.db.col('passionProfiles').findOne({ userId: ctx.user!.id });
    return { profile: prof, analysis: analyzePassions(prof?.interests || []) };
  }),
  r.put('/passions/me', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ interests: z.array(InterestSchema).max(12), dreams: z.string().max(600).optional() }), ctx.body);
    for (const i of b.interests) if (!PASSION_BY_KEY[i.key]) throw badRequest(`Pasión desconocida: ${i.key}`);
    const prof = await ctx.db.col('passionProfiles').updateOne({ userId: ctx.user!.id }, { $set: { interests: b.interests, dreams: b.dreams || '' } }, { upsert: true });
    await award(ctx, ctx.user!.id, 20, 'pasiones');
    const analysis = analyzePassions(b.interests);
    await refreshKinko(ctx, ctx.user!.id);
    return { profile: prof, analysis };
  }),

  // ---------- Plan de tratamiento (vista paciente) ----------
  r.get('/plan', [...PATIENT], async (ctx) => {
    const plan = await ctx.db.col('treatmentPlans').findOne({ patientId: ctx.user!.id, status: 'active' });
    if (!plan) return null;
    return { ...plan, professional: publicUser(await ctx.db.col('users').findById(plan.professionalId)) };
  }),
  r.post('/plan/tasks/:taskId/complete', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ note: z.string().max(500).optional(), undo: z.boolean().optional() }), ctx.body);
    const plan = await ctx.db.col('treatmentPlans').findOne({ patientId: ctx.user!.id, status: 'active' });
    if (!plan) throw notFound('No tienes un plan activo');
    const date = dayKey(ctx.p.now());
    const tasks = (plan.tasks || []).map((t: any) => {
      if (t.id !== ctx.params.taskId) return t;
      const completions = (t.completions || []).filter((c: any) => c.date !== date);
      if (!b.undo) completions.push({ date, note: b.note || '', at: ctx.p.now().toISOString() });
      return { ...t, completions };
    });
    if (!tasks.some((t: any) => t.id === ctx.params.taskId)) throw notFound('Tarea no encontrada');
    const updated = await ctx.db.col('treatmentPlans').updateById(plan._id, { $set: { tasks } });
    if (!b.undo) await award(ctx, ctx.user!.id, 5);
    return updated;
  }),
  r.get('/measures/due', [...PATIENT], async (ctx) => (await ctx.db.col('scheduledMeasures').find({ patientId: ctx.user!.id, active: true })).map((m) => ({ ...m, due: new Date(m.nextDueAt) <= ctx.p.now(), name: INSTRUMENT_BY_ID[m.instrumentId]?.short, daysLeft: daysBetween(ctx.p.now(), m.nextDueAt) }))),
  r.get('/badges', 'user', async () => BADGES),
  r.post('/me/sos', [...PATIENT], async (ctx) => {
    const b = parse(z.object({ notify: z.boolean().default(true) }), ctx.body);
    if (b.notify) await raiseAlert(ctx, ctx.user!.id, { type: 'crisis', severity: 'high', message: 'El paciente ha pulsado el botón de ayuda (SOS) y ha pedido que le contactéis.' });
    await audit(ctx, 'patient.sos', 'user', ctx.user!.id, ctx.user!.id, b);
    return { ok: true, notified: b.notify };
  }),
  r.get('/users/:id/public', 'user', async (ctx) => { parse(zid, ctx.params.id); return publicUser(await ctx.db.col('users').findById(ctx.params.id)); }),
];
