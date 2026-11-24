import { z } from 'zod';
import { r } from '../router';
import type { Ctx } from '../context';
import { badRequest, forbidden, notFound } from '../../util/errors';
import { addDays, dayKey } from '../../util/dates';
import { randomToken } from '../../util/ids';
import { round1 } from '../../util/text';
import { GUARDIAN_SCOPES } from '../../constants';
import { audit, guardianLink, hueFor, notify, parse, publicUser, refreshKinko } from '../services';

const CLINIC = ['clinic_admin'] as const;
async function myClinic(ctx: Ctx) {
  const c = await ctx.db.col('clinics').findOne({ adminIds: ctx.user!.id });
  if (!c) throw notFound('Todavía no has creado tu clínica');
  return c;
}

export const clinicRoutes = [
  r.get('/clinic', [...CLINIC], async (ctx) => {
    const c = await ctx.db.col('clinics').findOne({ adminIds: ctx.user!.id });
    return c;
  }),
  r.post('/clinic', [...CLINIC], async (ctx) => {
    if (await ctx.db.col('clinics').findOne({ adminIds: ctx.user!.id })) throw badRequest('Ya tienes una clínica');
    const b = parse(z.object({ name: z.string().min(2).max(120), city: z.string().max(80), province: z.string().max(60), address: z.string().max(200).default(''), phone: z.string().max(30).default(''), description: z.string().max(2000).default('') }), ctx.body);
    return ctx.db.col('clinics').insert({ ...b, slug: b.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-'), adminIds: [ctx.user!.id], members: [{ userId: ctx.user!.id, role: 'admin' }], verificationStatus: 'pending', specialties: [], logoHue: hueFor(b.name) });
  }),
  r.patch('/clinic', [...CLINIC], async (ctx) => {
    const c = await myClinic(ctx);
    const b = parse(z.object({ name: z.string().min(2).max(120).optional(), city: z.string().max(80).optional(), province: z.string().max(60).optional(), address: z.string().max(200).optional(), phone: z.string().max(30).optional(), email: z.string().email().optional(), description: z.string().max(2000).optional(), specialties: z.array(z.string().max(60)).max(15).optional(), website: z.string().max(200).optional() }), ctx.body);
    return ctx.db.col('clinics').updateById(c._id, { $set: b });
  }),
  r.get('/clinic/dashboard', [...CLINIC], async (ctx) => {
    const c = await myClinic(ctx); const { db, p } = ctx; const now = p.now();
    const proIds = c.members.filter((m: any) => m.role === 'professional').map((m: any) => m.userId);
    const [appts, rels, alerts] = await Promise.all([
      db.col('appointments').find({ clinicId: c._id, startAt: { $gte: addDays(now, -60).toISOString(), $lte: addDays(now, 30).toISOString() } }),
      db.col('careRelations').find({ professionalId: { $in: proIds }, status: 'active' }),
      db.col('alerts').count({ professionalIds: { $in: proIds }, status: 'open' }),
    ]);
    const month = now.toISOString().slice(0, 7);
    const monthAppts = appts.filter((a) => a.startAt.startsWith(month));
    const completed = monthAppts.filter((a) => a.status === 'completed');
    const weekAhead = appts.filter((a) => a.startAt >= now.toISOString() && a.startAt <= addDays(now, 7).toISOString() && ['confirmed', 'requested'].includes(a.status));
    const pros = await Promise.all(proIds.map(async (id: string) => {
      const u = await db.col('users').findById(id); const pr = await db.col('professionals').findOne({ userId: id });
      const slotsPerWeek = (pr?.availability || []).reduce((a: number, x: any) => { const [h1, m1] = x.start.split(':').map(Number); const [h2, m2] = x.end.split(':').map(Number); return a + Math.floor(((h2 * 60 + m2) - (h1 * 60 + m1)) / ((pr?.sessionMinutes || 50) + 10)); }, 0);
      const booked = weekAhead.filter((a) => a.professionalId === id).length;
      return { ...publicUser(u), patients: rels.filter((r) => r.professionalId === id).length, weekBooked: booked, occupancy: slotsPerWeek ? Math.round((booked / slotsPerWeek) * 100) : 0, rating: pr?.rating, verified: pr?.verified };
    }));
    const byDay: Record<string, number> = {};
    appts.filter((a) => a.status === 'completed').forEach((a) => { const d = a.startAt.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    return {
      clinic: { id: c._id, name: c.name, verificationStatus: c.verificationStatus },
      kpis: { professionals: proIds.length, activePatients: rels.length, monthSessions: completed.length, monthRevenue: round1(completed.reduce((a, x) => a + (x.price || 0), 0)), weekAhead: weekAhead.length, openAlerts: alerts, noShowRate: monthAppts.length ? Math.round((monthAppts.filter((a) => a.status === 'no_show').length / monthAppts.length) * 100) : 0, occupancy: pros.length ? Math.round(pros.reduce((a, x) => a + x.occupancy, 0) / pros.length) : 0 },
      professionals: pros, sessionsByDay: Object.entries(byDay).sort().map(([date, n]) => ({ date, n })),
    };
  }),
  r.get('/clinic/members', [...CLINIC], async (ctx) => {
    const c = await myClinic(ctx);
    return Promise.all(c.members.map(async (m: any) => ({ ...m, user: publicUser(await ctx.db.col('users').findById(m.userId)), email: (await ctx.db.col('users').findById(m.userId))?.email, professional: await ctx.db.col('professionals').findOne({ userId: m.userId }) })));
  }),
  r.post('/clinic/members/invite', [...CLINIC], async (ctx) => {
    const c = await myClinic(ctx); const { db, p } = ctx;
    const b = parse(z.object({ email: z.string().trim().toLowerCase().email(), firstName: z.string().min(1).max(60), lastName: z.string().max(80).default(''), role: z.enum(['professional', 'staff']).default('professional'), licenseNumber: z.string().max(40).default('') }), ctx.body);
    let u = await db.col('users').findOne({ email: b.email });
    let tempPassword: string | null = null;
    if (!u) {
      tempPassword = `Kk-${randomToken(9)}`;
      u = await db.col('users').insert({ email: b.email, passwordHash: await p.hasher.hash(tempPassword), role: b.role === 'professional' ? 'professional' : 'clinic_admin', status: 'active', plan: 'clinic', profile: { firstName: b.firstName, lastName: b.lastName, avatarHue: hueFor(b.email) }, consents: {}, settings: {}, gamification: { points: 0, streak: 0, badges: [] }, twoFactor: { enabled: false }, mustChangePassword: true });
      if (b.role === 'professional') await db.col('professionals').insert({ userId: u._id, type: 'Psicólogo/a general sanitario/a', licenseNumber: b.licenseNumber, college: '', verificationStatus: 'pending', verified: false, specialties: [], approaches: [], languages: ['Español'], modalities: ['online', 'presencial'], price: 60, sessionMinutes: 50, bio: '', city: c.city, province: c.province, availability: [], acceptingNew: true, clinicId: c._id });
    }
    if (c.members.some((m: any) => m.userId === u!._id)) throw badRequest('Ya forma parte del equipo');
    await db.col('clinics').updateById(c._id, { $push: { members: { userId: u._id, role: b.role, joinedAt: p.now().toISOString() } } });
    await db.col('professionals').updateOne({ userId: u._id }, { $set: { clinicId: c._id } });
    await notify(ctx, u._id, { type: 'clinic', title: `Te han añadido al equipo de ${c.name}`, link: '/pro' });
    await p.mailer.send(b.email, `Únete a ${c.name} en Kinkō`, tempPassword ? `Entra con tu email y la contraseña temporal ${tempPassword}` : 'Ya formas parte del equipo.');
    await audit(ctx, 'clinic.member_add', 'clinic', c._id, null, { userId: u._id });
    return { userId: u._id, tempPassword: p.config.demoMode ? tempPassword : null };
  }),
  r.del('/clinic/members/:userId', [...CLINIC], async (ctx) => {
    const c = await myClinic(ctx);
    if (ctx.params.userId === ctx.user!.id) throw badRequest('No puedes eliminarte a ti mismo');
    await ctx.db.col('clinics').updateById(c._id, { $pull: { members: { userId: ctx.params.userId } } });
    await ctx.db.col('professionals').updateOne({ userId: ctx.params.userId, clinicId: c._id }, { $set: { clinicId: null } });
    await audit(ctx, 'clinic.member_remove', 'clinic', c._id, null, { userId: ctx.params.userId });
  }),
  r.get('/clinic/patients', [...CLINIC], async (ctx) => {
    const c = await myClinic(ctx);
    const proIds = c.members.filter((m: any) => m.role === 'professional').map((m: any) => m.userId);
    const rels = await ctx.db.col('careRelations').find({ professionalId: { $in: proIds }, status: { $in: ['active', 'pending'] } });
    // Vista administrativa: sin datos clínicos (mínimo necesario).
    return Promise.all(rels.map(async (rel) => {
      const next = await ctx.db.col('appointments').findOne({ patientId: rel.patientId, professionalId: rel.professionalId, startAt: { $gte: ctx.p.now().toISOString() }, status: { $in: ['requested', 'confirmed'] } }, { sort: { startAt: 1 } });
      return { relationId: rel._id, status: rel.status, since: rel.startedAt || rel.createdAt, patient: publicUser(await ctx.db.col('users').findById(rel.patientId)), professional: publicUser(await ctx.db.col('users').findById(rel.professionalId)), nextAppointment: next?.startAt || null };
    }));
  }),

  // ---------- Portal familias ----------
  r.get('/family/teens', ['parent'], async (ctx) => {
    const links = await ctx.db.col('guardianLinks').find({ parentId: ctx.user!.id, status: 'active' });
    return Promise.all(links.map(async (l) => {
      const t = await ctx.db.col('users').findById(l.teenId);
      const k = l.scopes.includes('progress') ? await refreshKinko(ctx, l.teenId) : null;
      const adherence = l.scopes.includes('adherence') ? await ctx.db.col('checkins').count({ userId: l.teenId, date: { $gte: dayKey(addDays(ctx.p.now(), -7)) } }) : null;
      const alerts = await ctx.db.col('alerts').count({ patientId: l.teenId, guardianIds: ctx.user!.id, status: { $ne: 'resolved' } });
      const age = t?.profile?.birthDate ? Math.floor((ctx.p.now().getTime() - new Date(t.profile.birthDate).getTime()) / 31557600000) : null;
      return { linkId: l._id, teen: { ...publicUser(t), age, status: t?.status }, scopes: l.scopes, kinko: k ? { overall: k.overall, trend: k.trend } : null, checkinsLast7: adherence, openAlerts: alerts };
    }));
  }),
  r.get('/family/teens/:id', ['parent'], async (ctx) => {
    const l = await guardianLink(ctx, ctx.params.id); const { db, p } = ctx; const tid = ctx.params.id;
    const t = await db.col('users').findById(tid);
    const out: any = { teen: publicUser(t), scopes: l.scopes };
    if (l.scopes.includes('progress')) {
      const cs = await db.col('checkins').find({ userId: tid, date: { $gte: dayKey(addDays(p.now(), -84)) } });
      const weeks: Record<string, number[]> = {};
      cs.forEach((c) => { const d = new Date(c.date); const wk = dayKey(addDays(d, -((d.getDay() + 6) % 7))); (weeks[wk] ||= []).push(c.mood); });
      out.weekly = Object.entries(weeks).sort().map(([week, v]) => ({ week, mood: round1(v.reduce((a, b) => a + b, 0) / v.length), days: v.length }));
      out.kinko = await refreshKinko(ctx, tid);
      out.kinko = { overall: out.kinko.overall, trend: out.kinko.trend };
    }
    if (l.scopes.includes('adherence')) out.adherence = { last7: await db.col('checkins').count({ userId: tid, date: { $gte: dayKey(addDays(p.now(), -7)) } }), last30: await db.col('checkins').count({ userId: tid, date: { $gte: dayKey(addDays(p.now(), -30)) } }) };
    if (l.scopes.includes('appointments')) out.appointments = await Promise.all((await db.col('appointments').find({ patientId: tid, startAt: { $gte: addDays(p.now(), -30).toISOString() } }, { sort: { startAt: -1 }, limit: 10 })).map(async (a) => ({ date: a.startAt, status: a.status, modality: a.modality, professional: publicUser(await db.col('users').findById(a.professionalId)) })));
    if (l.scopes.includes('plan')) { const plan = await db.col('treatmentPlans').findOne({ patientId: tid, status: 'active' }); out.plan = plan ? { title: plan.title, goals: plan.goals.map((g: any) => ({ text: g.text, status: g.status, progress: g.progress })), completedThisWeek: plan.tasks.reduce((a: number, x: any) => a + (x.completions || []).filter((c: any) => c.date >= dayKey(addDays(p.now(), -7))).length, 0) } : null; }
    out.alerts = await db.col('alerts').find({ patientId: tid, guardianIds: ctx.user!.id }, { sort: { createdAt: -1 }, limit: 10 });
    out.careTeam = l.scopes.includes('parent_chat') ? (await Promise.all((await db.col('careRelations').find({ patientId: tid, status: 'active' })).map(async (r) => publicUser(await db.col('users').findById(r.professionalId))))) : [];
    await audit(ctx, 'family.view', 'patient', tid, tid);
    return out;
  }),
  r.post('/family/link', ['parent'], async (ctx) => {
    const b = parse(z.object({ code: z.string().trim().toUpperCase().max(12) }), ctx.body);
    const l = await ctx.db.col('guardianLinks').findOne({ code: b.code, status: 'pending' });
    if (!l) throw notFound('Código no válido o ya usado');
    await ctx.db.col('guardianLinks').updateById(l._id, { $set: { parentId: ctx.user!.id, status: 'active', linkedAt: ctx.p.now().toISOString(), guardianConsentAt: ctx.p.now().toISOString(), code: null } });
    const teen = await ctx.db.col('users').findById(l.teenId);
    if (teen?.status === 'pending_guardian') await ctx.db.col('users').updateById(teen._id, { $set: { status: 'active', 'consents.guardianConsentBy': ctx.user!.id } });
    await notify(ctx, l.teenId, { type: 'family', title: `${ctx.user!.firstName} se ha vinculado como tu familia`, body: 'Tú decides qué puede ver. Tu diario y tus conversaciones con Kio son siempre privados.', link: '/app/equipo' });
    await audit(ctx, 'family.link', 'guardianLink', l._id, l.teenId);
    return { teen: publicUser(teen), scopes: l.scopes };
  }),
  r.post('/family/teens', ['parent'], async (ctx) => {
    const b = parse(z.object({ firstName: z.string().min(1).max(60), lastName: z.string().max(80).default(''), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), email: z.string().trim().toLowerCase().email(), password: z.string().min(10).max(200), scopes: z.array(z.enum(GUARDIAN_SCOPES)).default(['progress', 'adherence', 'appointments', 'plan']) }), ctx.body);
    if (await ctx.db.col('users').findOne({ email: b.email })) throw badRequest('Ese email ya está en uso');
    const teen = await ctx.db.col('users').insert({ email: b.email, passwordHash: await ctx.p.hasher.hash(b.password), role: 'patient', status: 'active', plan: 'family', profile: { firstName: b.firstName, lastName: b.lastName, birthDate: b.birthDate, avatarHue: hueFor(b.email) }, consents: { terms: true, privacy: true, research: false, guardianConsentBy: ctx.user!.id, acceptedAt: ctx.p.now().toISOString() }, settings: { reminders: true, reminderHour: 20, sphereFace: true, aiUseContext: true }, gamification: { points: 0, streak: 0, badges: [] }, twoFactor: { enabled: false } });
    await ctx.db.col('guardianLinks').insert({ teenId: teen._id, parentId: ctx.user!.id, status: 'active', scopes: b.scopes, createdBy: 'parent', linkedAt: ctx.p.now().toISOString() });
    await ctx.db.col('users').updateById(ctx.user!.id, { $set: { plan: 'family' } });
    return publicUser(teen);
  }),
  r.get('/family/guides', ['parent'], async (ctx) => (await ctx.db.col('contents').find({ audience: { $in: ['parent', 'all'] }, status: 'published' }, { sort: { createdAt: -1 } })).map(({ body, ...x }) => x)),
  r.get('/family/alerts', ['parent'], async (ctx) => ctx.db.col('alerts').find({ guardianIds: ctx.user!.id }, { sort: { createdAt: -1 } })),
];
