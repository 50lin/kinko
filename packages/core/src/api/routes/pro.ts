import { z } from 'zod';
import { r, RATE } from '../router';
import type { Ctx } from '../context';
import { badRequest, forbidden, notFound } from '../../util/errors';
import { addDays, dayKey, iso } from '../../util/dates';
import { newId, randomToken } from '../../util/ids';
import { CARE_SCOPES, APPROACHES, SPECIALTIES, PRO_TYPES } from '../../constants';
import { INSTRUMENT_BY_ID, publicInstrument } from '../../instruments';
import { dailyDomainSeries, computeKinkoScore } from '../../engine/kinkoScore';
import { relapseSimilarity } from '../../engine/patterns';
import { analyzePassions } from '../../engine/passions';
import { mean, round1 } from '../../util/text';
import { assertCareScope, audit, hueFor, notify, parse, publicUser, raiseAlert, sinceFilter, zid } from '../services';

const PRO = ['professional'] as const;
const level = (k: any, alerts: number) => (alerts > 0 ? 'red' : k?.overall == null ? 'grey' : k.overall < 40 || (k.trend ?? 0) <= -12 ? 'red' : k.overall < 55 || (k.trend ?? 0) <= -6 ? 'amber' : 'green');

async function patientRow(ctx: Ctx, rel: any) {
  const { db } = ctx;
  const u = await db.col('users').findById(rel.patientId);
  if (!u) return null;
  const [openAlerts, lastCheckin, next] = await Promise.all([
    db.col('alerts').count({ patientId: u._id, professionalIds: ctx.user!.id, status: 'open' }),
    db.col('checkins').findOne({ userId: u._id }, { sort: { date: -1 } }),
    db.col('appointments').findOne({ patientId: u._id, professionalId: ctx.user!.id, startAt: { $gte: ctx.p.now().toISOString() }, status: { $in: ['requested', 'confirmed'] } }, { sort: { startAt: 1 } }),
  ]);
  const canSee = rel.status === 'active' && rel.consent?.scopes?.includes('checkins');
  const age = u.profile?.birthDate ? Math.floor((ctx.p.now().getTime() - new Date(u.profile.birthDate).getTime()) / 31557600000) : null;
  return {
    relationId: rel._id, status: rel.status, patient: { ...publicUser(u), age, province: u.profile?.province }, kinko: canSee ? u.kinko || null : null, triage: canSee ? level(u.kinko, openAlerts) : openAlerts ? 'red' : 'grey',
    openAlerts, lastCheckin: canSee ? lastCheckin?.date || null : null, nextAppointment: next?.startAt || null, scopes: rel.consent?.scopes || [], since: rel.startedAt || rel.createdAt,
  };
}

async function timeline(ctx: Ctx) {
  const pid = ctx.params.id; const { db, p } = ctx;
  const { from } = await assertCareScope(ctx, pid, 'checkins');
  const period = String(ctx.query.period || '90');
  const start = period === 'all' ? (from || '2000-01-01') : dayKey(addDays(p.now(), -Number(period)));
  const startEff = from && from > start ? from : start;
  const [checkins, assessments, appts, alerts, records] = await Promise.all([
    db.col('checkins').find({ userId: pid, date: { $gte: startEff.slice(0, 10) } }, { sort: { date: 1 } }),
    db.col('assessments').find({ userId: pid, completedAt: { $gte: startEff } }, { sort: { completedAt: 1 } }),
    db.col('appointments').find({ patientId: pid, professionalId: ctx.user!.id, startAt: { $gte: startEff } }, { sort: { startAt: 1 } }),
    db.col('alerts').find({ patientId: pid, createdAt: { $gte: startEff } }, { sort: { createdAt: 1 } }),
    db.col('clinicalRecords').find({ patientId: pid, professionalId: ctx.user!.id, sessionDate: { $gte: startEff } }),
  ]);
  // Puntos ciegos: días en que el paciente dijo estar bien (ánimo alto) pero estrés/ansiedad o sueño indicaban lo contrario.
  const blindSpots = checkins.filter((c) => c.mood >= 7 && ((c.stress ?? 0) >= 8 || (c.anxiety ?? 0) >= 8 || (c.sleepHours ?? 8) < 5)).map((c) => ({ date: c.date, mood: c.mood, stress: c.stress, anxiety: c.anxiety, sleepHours: c.sleepHours }));
  await audit(ctx, 'patient.timeline', 'patient', pid, pid, { period });
  return {
    series: dailyDomainSeries(checkins as any), raw: checkins.map((c) => ({ date: c.date, mood: c.mood, stress: c.stress, anxiety: c.anxiety, sleepHours: c.sleepHours, energy: c.energy, social: c.social, emotions: c.emotions })),
    assessments: assessments.map((a) => ({ id: a._id, instrumentId: a.instrumentId, score: a.score, max: a.max, severityLabel: a.severityLabel, date: a.completedAt, change: a.change })),
    sessions: appts.map((a) => ({ id: a._id, date: a.startAt, status: a.status })), alerts: alerts.map((a) => ({ id: a._id, type: a.type, severity: a.severity, date: a.createdAt, status: a.status })),
    notes: records.map((r) => ({ id: r._id, date: r.sessionDate, title: r.title })), blindSpots, consentFrom: from,
  };
}

async function presession(ctx: Ctx) {
  const pid = ctx.params.id; const { db, p } = ctx;
  const { relation, from } = await assertCareScope(ctx, pid, 'checkins');
  const last = await db.col('appointments').findOne({ patientId: pid, professionalId: ctx.user!.id, status: 'completed' }, { sort: { startAt: -1 } });
  const since = [last?.startAt, from, addDays(p.now(), -21).toISOString()].filter(Boolean).sort().reverse()[0] as string;
  const scopes: string[] = relation.consent?.scopes || [];
  const [checkins, assessments, alerts, plan, journal, threads, patient] = await Promise.all([
    db.col('checkins').find({ userId: pid, date: { $gte: since.slice(0, 10) } }),
    scopes.includes('assessments') ? db.col('assessments').find({ userId: pid, completedAt: { $gte: since } }) : [],
    db.col('alerts').find({ patientId: pid, createdAt: { $gte: since } }),
    scopes.includes('plan') ? db.col('treatmentPlans').findOne({ patientId: pid, status: 'active' }) : null,
    scopes.includes('journal_shared') ? db.col('journal').find({ userId: pid, shared: true, createdAt: { $gte: since } }) : [],
    scopes.includes('companion_summaries') ? db.col('companionThreads').find({ userId: pid, sharedSummary: true, summarizedAt: { $gte: since } }) : [],
    db.col('users').findById(pid),
  ]);
  const avg = (k: string) => { const v = checkins.map((c) => c[k]).filter((x) => typeof x === 'number'); return v.length ? round1(mean(v)) : null; };
  const emo: Record<string, number> = {}; checkins.forEach((c) => (c.emotions || []).forEach((e: string) => (emo[e] = (emo[e] || 0) + 1)));
  const days = Math.max(1, Math.round((p.now().getTime() - new Date(since).getTime()) / 86400000));
  const adherence = Math.round((checkins.length / days) * 100);
  const tasks = (plan?.tasks || []) as any[];
  const done = tasks.reduce((a, t) => a + (t.completions || []).filter((c: any) => c.date >= since.slice(0, 10)).length, 0);
  const facts = {
    desde: since.slice(0, 10), checkins: `${checkins.length} check-ins en ${days} días (${adherence}%)`,
    medias: { animo: avg('mood'), estres: avg('stress'), ansiedad: avg('anxiety'), sueno_horas: avg('sleepHours'), energia: avg('energy') },
    emociones_frecuentes: Object.entries(emo).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e, n]) => `${e} (${n})`),
    tests: assessments.map((a) => `${INSTRUMENT_BY_ID[a.instrumentId]?.short}: ${a.score} ${a.severityLabel}${a.change === 'worse' ? ' (empeora)' : a.change === 'better' ? ' (mejora)' : ''}`),
    alertas: alerts.map((a) => `${a.type} (${a.severity}) ${a.createdAt.slice(0, 10)}`), tareas_completadas: done, diario_compartido: journal.map((j) => j.title || j.createdAt.slice(0, 10)),
    resumenes_kio: threads.map((t) => t.summary).filter(Boolean),
  };
  let narrative = [
    `Desde ${facts.desde}: ${facts.checkins}.`,
    facts.medias.animo != null ? `Ánimo medio ${facts.medias.animo}/10, estrés ${facts.medias.estres ?? '—'}/10, sueño ${facts.medias.sueno_horas ?? '—'} h.` : 'Sin check-ins en el periodo.',
    facts.tests.length ? `Tests: ${facts.tests.join('; ')}.` : '',
    facts.alertas.length ? `Alertas: ${facts.alertas.join('; ')}.` : 'Sin alertas.',
    facts.emociones_frecuentes.length ? `Emociones más registradas: ${facts.emociones_frecuentes.join(', ')}.` : '',
    `Tareas del plan completadas: ${done}.`,
  ].filter(Boolean).join(' ');
  let source = 'plantilla';
  if (p.ai.available) {
    try {
      const ai = await p.ai.complete({ tier: 'light', maxTokens: 450, system: 'Eres un asistente para psicólogos clínicos. Con los datos estructurados, redacta en español un resumen pre-sesión de 5 viñetas: evolución, señales de alerta, adherencia, temas a explorar y una pregunta sugerida. No diagnostiques ni recomiendes fármacos. Sé factual y prudente.', messages: [{ role: 'user', content: JSON.stringify({ paciente: patient?.profile?.firstName, ...facts }) }] });
      if (ai) { narrative = ai; source = 'IA'; }
    } catch { /* plantilla */ }
  }
  await audit(ctx, 'patient.presession', 'patient', pid, pid);
  return { facts, narrative, source, since };
}

const RecordSchema = z.object({
  type: z.enum(['note', 'diagnosis', 'history', 'document', 'report']).default('note'), title: z.string().min(2).max(160),
  soap: z.object({ s: z.string().max(10000).default(''), o: z.string().max(10000).default(''), a: z.string().max(10000).default(''), p: z.string().max(10000).default('') }).optional(),
  content: z.string().max(30000).optional(), diagnosisCode: z.string().max(20).optional(), diagnosisLabel: z.string().max(200).optional(),
  sessionDate: z.string().optional(), appointmentId: z.string().optional(), confidentiality: z.enum(['normal', 'restricted']).default('normal'), attachments: z.array(z.object({ url: z.string(), name: z.string(), mime: z.string() })).max(10).default([]),
});
const PlanSchema = z.object({
  title: z.string().min(2).max(140), focus: z.string().max(400).default(''), reviewDate: z.string().optional(),
  goals: z.array(z.object({ id: z.string().optional(), text: z.string().min(2).max(300), targetDate: z.string().optional(), status: z.enum(['active', 'achieved', 'paused']).default('active'), progress: z.number().min(0).max(100).default(0) })).max(12),
  tasks: z.array(z.object({ id: z.string().optional(), title: z.string().min(2).max(160), description: z.string().max(800).default(''), type: z.enum(['exercise', 'reading', 'video', 'audio', 'measure', 'habit', 'journal', 'passion']).default('habit'), frequency: z.enum(['once', 'daily', 'weekly', '3x_week']).default('daily'), contentSlug: z.string().max(120).optional(), status: z.enum(['active', 'archived']).default('active') })).max(30),
});
const ProfileSchema = z.object({
  type: z.enum(PRO_TYPES as [string, ...string[]]).optional(), bio: z.string().max(2000).optional(), specialties: z.array(z.enum(SPECIALTIES as [string, ...string[]])).max(10).optional(),
  approaches: z.array(z.enum(APPROACHES as [string, ...string[]])).max(6).optional(), languages: z.array(z.string().max(30)).max(6).optional(), modalities: z.array(z.enum(['online', 'presencial'])).optional(),
  price: z.number().min(0).max(500).optional(), sessionMinutes: z.number().int().min(20).max(120).optional(), city: z.string().max(80).optional(), province: z.string().max(60).optional(),
  acceptingNew: z.boolean().optional(), autoConfirm: z.boolean().optional(), licenseNumber: z.string().max(40).optional(), college: z.string().max(120).optional(),
  availability: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).max(30).optional(),
});

export const proRoutes = [
  r.get('/pro/dashboard', [...PRO], async (ctx) => {
    const { db, p } = ctx; const id = ctx.user!.id; const now = p.now();
    const rels = await db.col('careRelations').find({ professionalId: id, status: { $in: ['active', 'pending'] } });
    const rows = (await Promise.all(rels.map((r) => patientRow(ctx, r)))).filter(Boolean) as any[];
    const order: Record<string, number> = { red: 0, amber: 1, grey: 2, green: 3 };
    rows.sort((a, b) => order[a.triage] - order[b.triage] || (a.kinko?.overall ?? 100) - (b.kinko?.overall ?? 100));
    const dayStart = `${dayKey(now)}T00:00:00.000Z`;
    const [today, alerts, week, pro] = await Promise.all([
      db.col('appointments').find({ professionalId: id, startAt: { $gte: addDays(dayStart, -0.1).toISOString(), $lt: addDays(dayStart, 1).toISOString() }, status: { $in: ['requested', 'confirmed', 'completed'] } }, { sort: { startAt: 1 } }),
      db.col('alerts').find({ professionalIds: id, status: { $in: ['open', 'acknowledged'] } }, { sort: { createdAt: -1 }, limit: 20 }),
      db.col('appointments').count({ professionalId: id, startAt: { $gte: addDays(now, -7).toISOString(), $lte: now.toISOString() }, status: 'completed' }),
      db.col('professionals').findOne({ userId: id }),
    ]);
    const active = rows.filter((r) => r.status === 'active');
    const adh = active.filter((r) => r.lastCheckin && r.lastCheckin >= dayKey(addDays(now, -2))).length;
    return {
      triage: rows, today: await Promise.all(today.map(async (a) => ({ ...a, patient: publicUser(await db.col('users').findById(a.patientId)) }))),
      alerts: await Promise.all(alerts.map(async (a) => ({ ...a, patient: publicUser(await db.col('users').findById(a.patientId)) }))),
      kpis: { activePatients: active.length, pending: rows.length - active.length, red: rows.filter((r) => r.triage === 'red').length, sessionsLast7: week, adherence: active.length ? Math.round((adh / active.length) * 100) : 0 },
      verification: pro?.verificationStatus, plan: ctx.user!.plan,
    };
  }),
  r.get('/pro/patients', [...PRO], async (ctx) => {
    const rels = await ctx.db.col('careRelations').find({ professionalId: ctx.user!.id, status: { $in: ['active', 'pending'] } });
    return (await Promise.all(rels.map((r) => patientRow(ctx, r)))).filter(Boolean);
  }),
  r.post('/pro/patients/invite', [...PRO], async (ctx) => {
    const b = parse(z.object({ email: z.string().trim().toLowerCase().email(), firstName: z.string().min(1).max(60), lastName: z.string().max(80).default(''), birthDate: z.string().optional(), scopes: z.array(z.enum(CARE_SCOPES)).default(['checkins', 'assessments', 'journal_shared', 'plan']) }), ctx.body);
    const { db, p } = ctx;
    let u = await db.col('users').findOne({ email: b.email });
    let tempPassword: string | null = null;
    if (!u) {
      tempPassword = `Kk-${randomToken(9)}`;
      u = await db.col('users').insert({ email: b.email, passwordHash: await p.hasher.hash(tempPassword), role: 'patient', status: 'active', plan: 'care', profile: { firstName: b.firstName, lastName: b.lastName, birthDate: b.birthDate || null, avatarHue: hueFor(b.email) }, consents: { terms: false, privacy: false, research: false }, settings: { reminders: true, reminderHour: 20, aiUseContext: true }, gamification: { points: 0, streak: 0, badges: [] }, twoFactor: { enabled: false }, mustChangePassword: true, invitedBy: ctx.user!.id });
    } else if (u.role !== 'patient') throw badRequest('Ese email pertenece a una cuenta que no es de paciente');
    const ex = await db.col('careRelations').findOne({ patientId: u._id, professionalId: ctx.user!.id, status: { $in: ['pending', 'active'] } });
    if (ex) throw badRequest('Ya existe una relación con este paciente');
    const pro = await db.col('professionals').findOne({ userId: ctx.user!.id });
    const rel = await db.col('careRelations').insert({ patientId: u._id, professionalId: ctx.user!.id, clinicId: pro?.clinicId || null, status: 'pending', source: 'invite', requestedScopes: b.scopes, consent: { scopes: [], historyFrom: null } });
    if (u.plan === 'free') await db.col('users').updateById(u._id, { $set: { plan: 'care' } });
    await notify(ctx, u._id, { type: 'care', title: `${ctx.user!.firstName} ${ctx.user!.lastName} quiere acompañarte en Kinkō`, body: 'Revisa qué datos quieres compartir y acepta la invitación.', link: '/app/equipo', priority: 'high' });
    await p.mailer.send(b.email, 'Tu profesional te invita a Kinkō', `${ctx.user!.firstName} te ha invitado a Kinkō. ${tempPassword ? `Entra con tu email y la contraseña temporal ${tempPassword} (te pediremos cambiarla).` : 'Entra con tu cuenta.'} ${p.config.publicUrl}`);
    await audit(ctx, 'care.invite', 'careRelation', rel._id, u._id);
    return { relation: rel, tempPassword: p.config.demoMode ? tempPassword : null };
  }),
  r.get('/pro/patients/:id', [...PRO], async (ctx) => {
    const pid = ctx.params.id; parse(zid, pid);
    const rel = await ctx.db.col('careRelations').findOne({ patientId: pid, professionalId: ctx.user!.id, status: { $in: ['active', 'pending'] } });
    if (!rel) throw notFound('Paciente no encontrado en tu equipo');
    const row = await patientRow(ctx, rel);
    const u = await ctx.db.col('users').findById(pid);
    const scopes: string[] = rel.consent?.scopes || [];
    const latest: Record<string, any> = {};
    if (rel.status === 'active' && scopes.includes('assessments')) {
      const list = await ctx.db.col('assessments').find({ userId: pid, ...sinceFilter('completedAt', rel.consent?.historyFrom) }, { sort: { completedAt: -1 } });
      for (const a of list) if (!latest[a.instrumentId]) latest[a.instrumentId] = { score: a.score, max: a.max, severityLabel: a.severityLabel, date: a.completedAt, change: a.change, flags: a.flags };
    }
    const guardians = (await ctx.db.col('guardianLinks').find({ teenId: pid, status: 'active' })).length;
    await audit(ctx, 'patient.view', 'patient', pid, pid);
    return { ...row, relation: rel, profile: { gender: u?.profile?.gender, province: u?.profile?.province, city: u?.profile?.city, phone: scopes.length ? u?.profile?.phone : null, email: u?.email }, latest, hasGuardian: guardians > 0, plan: u?.plan };
  }),
  r.get('/pro/patients/:id/timeline', [...PRO], timeline),
  r.get('/pro/patients/:id/presession', [...PRO], presession, { rate: RATE.ai }),
  r.get('/pro/patients/:id/assessments', [...PRO], async (ctx) => {
    const { from } = await assertCareScope(ctx, ctx.params.id, 'assessments');
    await audit(ctx, 'patient.assessments', 'patient', ctx.params.id, ctx.params.id);
    return (await ctx.db.col('assessments').find({ userId: ctx.params.id, ...sinceFilter('completedAt', from) }, { sort: { completedAt: -1 } })).map((a) => ({ ...a, instrument: { short: INSTRUMENT_BY_ID[a.instrumentId]?.short, items: INSTRUMENT_BY_ID[a.instrumentId]?.items } }));
  }),
  r.get('/pro/patients/:id/journal', [...PRO], async (ctx) => {
    const { from } = await assertCareScope(ctx, ctx.params.id, 'journal_shared');
    await audit(ctx, 'patient.journal', 'patient', ctx.params.id, ctx.params.id);
    return ctx.db.col('journal').find({ userId: ctx.params.id, shared: true, ...sinceFilter('createdAt', from) }, { sort: { createdAt: -1 } });
  }),
  r.get('/pro/patients/:id/biometrics', [...PRO], async (ctx) => {
    const { from } = await assertCareScope(ctx, ctx.params.id, 'biometrics');
    const ms = await ctx.db.col('measurements').find({ userId: ctx.params.id, measuredAt: { $gte: from && from > addDays(ctx.p.now(), -90).toISOString() ? from : addDays(ctx.p.now(), -90).toISOString() } }, { sort: { measuredAt: 1 } });
    const by: Record<string, Record<string, number[]>> = {};
    ms.forEach((m) => ((by[m.type] ||= {})[m.measuredAt.slice(0, 10)] ||= []).push(m.value));
    await audit(ctx, 'patient.biometrics', 'patient', ctx.params.id, ctx.params.id);
    return Object.fromEntries(Object.entries(by).map(([t, d]) => [t, Object.entries(d).map(([date, v]) => ({ date, value: round1(mean(v)) }))]));
  }),
  r.get('/pro/patients/:id/passions', [...PRO], async (ctx) => {
    await assertCareScope(ctx, ctx.params.id, 'passions');
    const prof = await ctx.db.col('passionProfiles').findOne({ userId: ctx.params.id });
    return { profile: prof, analysis: analyzePassions(prof?.interests || []) };
  }),
  r.get('/pro/patients/:id/companion-summaries', [...PRO], async (ctx) => {
    const { from } = await assertCareScope(ctx, ctx.params.id, 'companion_summaries');
    return (await ctx.db.col('companionThreads').find({ userId: ctx.params.id, sharedSummary: true, ...sinceFilter('summarizedAt', from) }, { sort: { summarizedAt: -1 } })).map((t) => ({ id: t._id, mode: t.mode, summary: t.summary, date: t.summarizedAt, riskLevel: t.riskLevel }));
  }),
  r.get('/pro/patients/:id/patterns', [...PRO], async (ctx) => {
    const pid = ctx.params.id;
    const { from } = await assertCareScope(ctx, pid, 'checkins');
    const checkins = await ctx.db.col('checkins').find({ userId: pid, ...sinceFilter('date', from ? from.slice(0, 10) : null) });
    const sev = await ctx.db.col('assessments').find({ userId: pid, instrumentId: 'phq9', score: { $gte: 15 } });
    const crit = await ctx.db.col('alerts').find({ patientId: pid, severity: { $in: ['high', 'critical'] } });
    const episodes = Array.from(new Set([...sev.map((a) => a.completedAt.slice(0, 10)), ...crit.map((a) => a.createdAt.slice(0, 10))])).filter((d) => d < dayKey(addDays(ctx.p.now(), -30))).sort();
    const res = relapseSimilarity(checkins as any, episodes, ctx.p.now());
    await audit(ctx, 'patient.patterns', 'patient', pid, pid);
    return { ...res, episodes };
  }),
  r.get('/pro/patients/:id/records', [...PRO], async (ctx) => {
    const pid = ctx.params.id;
    const rel = await ctx.db.col('careRelations').findOne({ patientId: pid, professionalId: ctx.user!.id, status: { $in: ['active', 'ended'] } });
    if (!rel) throw forbidden();
    const recs = await ctx.db.col('clinicalRecords').find({ patientId: pid, $or: [{ professionalId: ctx.user!.id }, { confidentiality: 'normal', clinicId: rel.clinicId || '__none__' }] }, { sort: { sessionDate: -1 } });
    await audit(ctx, 'records.list', 'patient', pid, pid);
    return Promise.all(recs.map(async (x) => ({ ...x, author: publicUser(await ctx.db.col('users').findById(x.professionalId)), mine: x.professionalId === ctx.user!.id })));
  }),
  r.post('/pro/patients/:id/records', [...PRO], async (ctx) => {
    const pid = ctx.params.id;
    const rel = await ctx.db.col('careRelations').findOne({ patientId: pid, professionalId: ctx.user!.id, status: 'active' });
    if (!rel) throw forbidden();
    const b = parse(RecordSchema, ctx.body);
    const rec = await ctx.db.col('clinicalRecords').insert({ ...b, patientId: pid, professionalId: ctx.user!.id, clinicId: rel.clinicId || null, sessionDate: b.sessionDate || ctx.p.now().toISOString(), version: 1, versions: [], signedAt: ctx.p.now().toISOString() });
    await audit(ctx, 'records.create', 'clinicalRecord', rec._id, pid, { type: b.type });
    return rec;
  }),
  r.patch('/pro/records/:id', [...PRO], async (ctx) => {
    const rec = await ctx.db.col('clinicalRecords').findOne({ _id: ctx.params.id, professionalId: ctx.user!.id });
    if (!rec) throw notFound();
    const b = parse(RecordSchema.partial().extend({ reason: z.string().min(3, 'Indica el motivo de la modificación').max(300) }), ctx.body);
    const { reason, ...changes } = b;
    // Las notas clínicas no se sobrescriben: cada modificación guarda la versión anterior (trazabilidad).
    const prev = { title: rec.title, soap: rec.soap, content: rec.content, diagnosisCode: rec.diagnosisCode, diagnosisLabel: rec.diagnosisLabel, version: rec.version, at: rec.updatedAt };
    const upd = await ctx.db.col('clinicalRecords').updateById(rec._id, { $set: { ...changes, version: (rec.version || 1) + 1, amendedAt: ctx.p.now().toISOString(), amendReason: reason }, $push: { versions: prev } });
    await audit(ctx, 'records.amend', 'clinicalRecord', rec._id, rec.patientId, { reason });
    return upd;
  }),
  r.get('/pro/patients/:id/plan', [...PRO], async (ctx) => {
    await assertCareScope(ctx, ctx.params.id, 'plan');
    return ctx.db.col('treatmentPlans').findOne({ patientId: ctx.params.id, professionalId: ctx.user!.id, status: 'active' });
  }),
  r.put('/pro/patients/:id/plan', [...PRO], async (ctx) => {
    const pid = ctx.params.id;
    await assertCareScope(ctx, pid, 'plan');
    const b = parse(PlanSchema, ctx.body);
    const ex = await ctx.db.col('treatmentPlans').findOne({ patientId: pid, professionalId: ctx.user!.id, status: 'active' });
    const tasks = b.tasks.map((t) => { const old = ex?.tasks?.find((x: any) => x.id === t.id); return { ...t, id: t.id || newId(), completions: old?.completions || [] }; });
    const goals = b.goals.map((g) => ({ ...g, id: g.id || newId() }));
    const plan = ex ? await ctx.db.col('treatmentPlans').updateById(ex._id, { $set: { ...b, goals, tasks } }) : await ctx.db.col('treatmentPlans').insert({ ...b, goals, tasks, patientId: pid, professionalId: ctx.user!.id, status: 'active', startDate: iso(ctx.p.now()) });
    await notify(ctx, pid, { type: 'plan', title: 'Tu plan de tratamiento se ha actualizado', link: '/app/tratamiento' });
    await audit(ctx, 'plan.update', 'treatmentPlan', plan!._id, pid);
    return plan;
  }),
  r.get('/pro/patients/:id/measures', [...PRO], async (ctx) => ctx.db.col('scheduledMeasures').find({ patientId: ctx.params.id, professionalId: ctx.user!.id, active: true })),
  r.post('/pro/patients/:id/measures', [...PRO], async (ctx) => {
    await assertCareScope(ctx, ctx.params.id, 'assessments');
    const b = parse(z.object({ instrumentId: z.enum(Object.keys(INSTRUMENT_BY_ID) as [string, ...string[]]), frequency: z.enum(['once', 'weekly', 'biweekly', 'monthly']) }), ctx.body);
    const m = await ctx.db.col('scheduledMeasures').insert({ patientId: ctx.params.id, professionalId: ctx.user!.id, ...b, active: true, nextDueAt: ctx.p.now().toISOString() });
    await notify(ctx, ctx.params.id, { type: 'measure', title: `Tu profesional te propone: ${INSTRUMENT_BY_ID[b.instrumentId].short}`, link: `/app/tests/${b.instrumentId}` });
    return m;
  }),
  r.del('/pro/measures/:id', [...PRO], async (ctx) => { await ctx.db.col('scheduledMeasures').updateMany({ _id: ctx.params.id, professionalId: ctx.user!.id }, { $set: { active: false } }); }),
  r.get('/pro/instruments', [...PRO], async () => Object.values(INSTRUMENT_BY_ID).map(publicInstrument)),

  // ---------- Alertas ----------
  r.get('/alerts', 'user', async (ctx) => {
    const u = ctx.user!;
    const q: any = u.role === 'professional' ? { professionalIds: u.id } : u.role === 'parent' ? { guardianIds: u.id } : u.role === 'patient' ? { patientId: u.id, type: 'crisis' } : null;
    if (!q) throw forbidden();
    if (ctx.query.status) q.status = String(ctx.query.status);
    const list = await ctx.db.col('alerts').find(q, { sort: { createdAt: -1 }, limit: 200 });
    return Promise.all(list.map(async (a) => ({ ...a, patient: publicUser(await ctx.db.col('users').findById(a.patientId)) })));
  }),
  r.patch('/alerts/:id', ['professional'], async (ctx) => {
    const b = parse(z.object({ status: z.enum(['acknowledged', 'resolved']), note: z.string().max(1000).default('') }), ctx.body);
    const a = await ctx.db.col('alerts').updateOne({ _id: ctx.params.id, professionalIds: ctx.user!.id }, { $set: { status: b.status, [`${b.status}By`]: ctx.user!.id, [`${b.status}At`]: ctx.p.now().toISOString() }, $push: { notes: { by: ctx.user!.id, text: b.note, at: ctx.p.now().toISOString() } } });
    if (!a) throw notFound();
    await audit(ctx, `alert.${b.status}`, 'alert', a._id, a.patientId);
    return a;
  }),

  // ---------- Perfil profesional y facturación ----------
  r.get('/pro/profile', [...PRO], async (ctx) => ({ profile: await ctx.db.col('professionals').findOne({ userId: ctx.user!.id }), options: { specialties: SPECIALTIES, approaches: APPROACHES, types: PRO_TYPES } })),
  r.put('/pro/profile', [...PRO], async (ctx) => {
    const b = parse(ProfileSchema, ctx.body);
    const cur = await ctx.db.col('professionals').findOne({ userId: ctx.user!.id });
    const reverify = (b.licenseNumber && b.licenseNumber !== cur?.licenseNumber) ? { verificationStatus: 'pending', verified: false } : {};
    return ctx.db.col('professionals').updateOne({ userId: ctx.user!.id }, { $set: { ...b, ...reverify } }, { upsert: true });
  }),
  r.get('/pro/billing', [...PRO], async (ctx) => {
    const appts = await ctx.db.col('appointments').find({ professionalId: ctx.user!.id, status: 'completed' });
    const by: Record<string, { sessions: number; revenue: number; commission: number }> = {};
    for (const a of appts) { const m = a.startAt.slice(0, 7); by[m] ||= { sessions: 0, revenue: 0, commission: 0 }; by[m].sessions++; by[m].revenue += a.price || 0; by[m].commission += (a.price || 0) * (a.commissionRate || 0); }
    const months = Object.entries(by).sort().map(([month, v]) => ({ month, ...v, commission: round1(v.commission) }));
    return { months, plan: ctx.user!.plan, planPrice: ctx.user!.plan === 'pro_plus' ? 69 : 39, totals: months.reduce((a, m) => ({ sessions: a.sessions + m.sessions, revenue: a.revenue + m.revenue, commission: round1(a.commission + m.commission) }), { sessions: 0, revenue: 0, commission: 0 }) };
  }),
  r.post('/pro/patients/:id/crisis-contact', [...PRO], async (ctx) => {
    await assertCareScope(ctx, ctx.params.id, 'checkins');
    await notify(ctx, ctx.params.id, { type: 'care', title: 'Tu profesional quiere saber cómo estás', body: 'Escríbele cuando puedas. Si estás en peligro, llama al 112.', link: '/mensajes', priority: 'high' });
    await audit(ctx, 'care.check_in_request', 'patient', ctx.params.id, ctx.params.id);
  }),
  r.post('/pro/patients/:id/recompute', [...PRO], async (ctx) => {
    await assertCareScope(ctx, ctx.params.id, 'checkins');
    const cs = await ctx.db.col('checkins').find({ userId: ctx.params.id, date: { $gte: dayKey(addDays(ctx.p.now(), -15)) } });
    return computeKinkoScore({ checkins: cs as any, now: ctx.p.now() });
  }),
  r.post('/pro/patients/:id/alert-test', [...PRO], async (ctx) => {
    if (!ctx.p.config.demoMode) throw forbidden();
    return raiseAlert(ctx, ctx.params.id, { type: 'biometric', severity: 'low', message: 'Alerta de prueba generada desde el panel (modo demo).' });
  }),
];
