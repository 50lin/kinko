import { z } from 'zod';
import { r, RATE } from '../router';
import type { Ctx } from '../context';
import { badRequest, forbidden, notFound, conflict } from '../../util/errors';
import { addDays, addMinutes } from '../../util/dates';
import { escapeRegex, norm } from '../../util/text';
import { generateSlots } from '../../engine/slots';
import { audit, latestAssessments, notify, parse, publicUser, zid } from '../services';
import { award } from './patient';

/** Afinidad paciente-profesional explicable (especialidad, edad, modalidad, idioma, precio). */
async function matchScore(ctx: Ctx, pro: any): Promise<{ score: number; reasons: string[] } | null> {
  if (!ctx.user || ctx.user.role !== 'patient') return null;
  const latest = await latestAssessments(ctx, ctx.user.id);
  const needs: string[] = [];
  if (latest.gad7 && latest.gad7.score >= 8) needs.push('Ansiedad');
  if (latest.phq9 && latest.phq9.score >= 8) needs.push('Depresión');
  if (latest.cbi && latest.cbi.score >= 50) needs.push('Estrés laboral y burnout');
  if (latest.rses && latest.rses.score < 15) needs.push('Autoestima');
  if (latest.sleep && latest.sleep.score < 50) needs.push('Sueño');
  if (ctx.user.isMinor) needs.push('Adolescentes');
  const reasons: string[] = []; let s = 50;
  const hit = needs.filter((n) => pro.specialties?.includes(n));
  if (hit.length) { s += 15 * hit.length; reasons.push(`Especialista en ${hit.join(' y ').toLowerCase()}`); }
  if (pro.modalities?.includes('online')) { s += 5; reasons.push('Atiende online'); }
  if (ctx.user.doc.profile?.province && pro.province === ctx.user.doc.profile.province) { s += 8; reasons.push('Cerca de ti'); }
  if (pro.verified) { s += 7; reasons.push('Colegiación verificada'); }
  if (pro.rating >= 4.7) { s += 5; reasons.push(`Valoración ${pro.rating}`); }
  return { score: Math.min(99, s), reasons };
}

async function proCard(ctx: Ctx, p: any) {
  const u = await ctx.db.col('users').findById(p.userId);
  if (!u || u.status !== 'active') return null;
  const clinic = p.clinicId ? await ctx.db.col('clinics').findById(p.clinicId) : null;
  return { id: u._id, ...publicUser(u), type: p.type, specialties: p.specialties, approaches: p.approaches, languages: p.languages, modalities: p.modalities, price: p.price, sessionMinutes: p.sessionMinutes, city: p.city, province: p.province, bio: p.bio, verified: p.verified, rating: p.rating, reviewsCount: p.reviewsCount, acceptingNew: p.acceptingNew, featured: p.featured || false, clinic: clinic ? { id: clinic._id, name: clinic.name, slug: clinic.slug } : null, match: await matchScore(ctx, p) };
}

const BookSchema = z.object({ professionalId: zid, start: z.string().datetime(), modality: z.enum(['video', 'presencial', 'chat']).default('video'), reason: z.string().max(1000).default(''), firstVisit: z.boolean().default(false) });

async function book(ctx: Ctx) {
  const u = ctx.user!; const { db, p } = ctx;
  const b = parse(BookSchema, ctx.body);
  const pro = await db.col('professionals').findOne({ userId: b.professionalId });
  if (!pro) throw notFound('Profesional no encontrado');
  const start = new Date(b.start); const end = addMinutes(start, pro.sessionMinutes || 50);
  if (start < addMinutes(p.now(), 60)) throw badRequest('Reserva con al menos una hora de antelación');
  const busy = await db.col('appointments').find({ professionalId: b.professionalId, status: { $in: ['requested', 'confirmed'] }, startAt: { $lt: end.toISOString() }, endAt: { $gt: start.toISOString() } });
  if (busy.length) throw conflict('Ese hueco ya no está disponible');
  const rel = await db.col('careRelations').findOne({ patientId: u.id, professionalId: b.professionalId, status: { $in: ['active', 'pending'] } });
  const source = rel ? 'own' : 'directory';
  const appt = await db.col('appointments').insert({
    patientId: u.id, professionalId: b.professionalId, clinicId: pro.clinicId || null, startAt: start.toISOString(), endAt: end.toISOString(), modality: b.modality,
    status: pro.autoConfirm ? 'confirmed' : 'requested', price: pro.price, currency: 'EUR', paid: false, source, commissionRate: source === 'directory' ? 0.1 : 0,
    reason: b.reason, roomId: crypto.randomUUID(), createdBy: u.id, reminders: [],
  });
  if (!rel) await db.col('careRelations').insert({ patientId: u.id, professionalId: b.professionalId, clinicId: pro.clinicId || null, status: 'active', source: 'booking', startedAt: p.now().toISOString(), consent: { scopes: ['checkins', 'assessments', 'plan'], historyFrom: null, grantedAt: p.now().toISOString() } });
  const pay = await p.payments.checkout({ amountCents: Math.round(pro.price * 100), currency: 'eur', description: `Sesión de ${pro.sessionMinutes} min`, metadata: { appointmentId: appt._id }, successUrl: `${p.config.publicUrl}/#/app/citas?pagado=${appt._id}`, cancelUrl: `${p.config.publicUrl}/#/app/citas` });
  if (pay.mode === 'simulated') await db.col('appointments').updateById(appt._id, { $set: { paid: true, paymentRef: pay.id } });
  await notify(ctx, b.professionalId, { type: 'appointment', title: `Nueva ${pro.autoConfirm ? 'cita' : 'solicitud de cita'}: ${u.firstName} ${u.lastName}`, body: new Date(appt.startAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' }), link: '/pro/agenda', priority: 'high' });
  await audit(ctx, 'appointment.create', 'appointment', appt._id, u.id);
  return { appointment: { ...appt, paid: pay.mode === 'simulated' }, payment: pay };
}

async function enrichAppt(ctx: Ctx, a: any) {
  const [patient, professional] = await Promise.all([ctx.db.col('users').findById(a.patientId), ctx.db.col('users').findById(a.professionalId)]);
  return { ...a, patient: publicUser(patient), professional: publicUser(professional) };
}

export const careRoutes = [
  // ---------- Directorio ----------
  r.get('/directory/professionals', 'optional', async (ctx) => {
    const q: any = { verificationStatus: 'verified' };
    if (ctx.query.specialty) q.specialties = String(ctx.query.specialty);
    if (ctx.query.province) q.province = String(ctx.query.province);
    if (ctx.query.modality) q.modalities = String(ctx.query.modality);
    if (ctx.query.type) q.type = String(ctx.query.type);
    if (ctx.query.maxPrice) q.price = { $lte: Number(ctx.query.maxPrice) };
    if (ctx.query.lang) q.languages = String(ctx.query.lang);
    const pros = await ctx.db.col('professionals').find(q, { limit: 200 });
    let cards = (await Promise.all(pros.map((p) => proCard(ctx, p)))).filter(Boolean) as any[];
    if (ctx.query.q) { const t = norm(String(ctx.query.q)); cards = cards.filter((c) => norm(`${c.firstName} ${c.lastName} ${c.specialties.join(' ')} ${c.city} ${c.bio}`).includes(t)); }
    cards.sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0) || Number(b.featured) - Number(a.featured) || (b.rating || 0) - (a.rating || 0));
    return cards;
  }),
  r.get('/directory/professionals/:id', 'optional', async (ctx) => {
    const p = await ctx.db.col('professionals').findOne({ userId: ctx.params.id });
    if (!p || p.verificationStatus !== 'verified') throw notFound('Profesional no encontrado');
    const busy = await ctx.db.col('appointments').find({ professionalId: p.userId, status: { $in: ['requested', 'confirmed'] }, startAt: { $gte: ctx.p.now().toISOString() } });
    const reviews = await ctx.db.col('reviews').find({ professionalId: p.userId, status: 'visible' }, { sort: { createdAt: -1 }, limit: 20 });
    return { ...(await proCard(ctx, p)), availability: p.availability, slots: generateSlots(p.availability || [], p.sessionMinutes || 50, busy, ctx.p.now(), 21), reviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.createdAt, author: r.anonymous ? 'Paciente verificado' : r.authorName })) };
  }),
  r.get('/directory/clinics', 'optional', async (ctx) => {
    const q: any = { verificationStatus: 'verified' };
    if (ctx.query.province) q.province = String(ctx.query.province);
    if (ctx.query.q) q.name = { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' };
    const clinics = await ctx.db.col('clinics').find(q);
    return Promise.all(clinics.map(async (c) => ({ id: c._id, name: c.name, slug: c.slug, city: c.city, province: c.province, description: c.description, specialties: c.specialties, logoHue: c.logoHue, professionals: (c.members || []).filter((m: any) => m.role === 'professional').length, address: c.address })));
  }),
  r.get('/directory/clinics/:slug', 'optional', async (ctx) => {
    const c = await ctx.db.col('clinics').findOne({ $or: [{ slug: ctx.params.slug }, { _id: ctx.params.slug }] });
    if (!c || c.verificationStatus !== 'verified') throw notFound();
    const pros = await ctx.db.col('professionals').find({ clinicId: c._id, verificationStatus: 'verified' });
    return { id: c._id, name: c.name, slug: c.slug, city: c.city, province: c.province, description: c.description, specialties: c.specialties, address: c.address, phone: c.phone, logoHue: c.logoHue, professionals: (await Promise.all(pros.map((p) => proCard(ctx, p)))).filter(Boolean) };
  }),
  r.post('/directory/professionals/:id/reviews', ['patient'], async (ctx) => {
    const b = parse(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(800).default(''), anonymous: z.boolean().default(true) }), ctx.body);
    const done = await ctx.db.col('appointments').findOne({ patientId: ctx.user!.id, professionalId: ctx.params.id, status: 'completed' });
    if (!done) throw forbidden('Solo puedes valorar tras una sesión completada');
    const rev = await ctx.db.col('reviews').updateOne({ patientId: ctx.user!.id, professionalId: ctx.params.id }, { $set: { ...b, authorName: `${ctx.user!.firstName} ${ctx.user!.lastName[0] || ''}.`, status: 'visible' } }, { upsert: true });
    const all = await ctx.db.col('reviews').find({ professionalId: ctx.params.id, status: 'visible' });
    await ctx.db.col('professionals').updateOne({ userId: ctx.params.id }, { $set: { rating: Math.round((all.reduce((a, x) => a + x.rating, 0) / all.length) * 10) / 10, reviewsCount: all.length } });
    return rev;
  }),

  // ---------- Citas ----------
  r.get('/appointments', 'user', async (ctx) => {
    const u = ctx.user!; const now = ctx.p.now().toISOString();
    const q: any = u.role === 'patient' ? { patientId: u.id } : u.role === 'professional' ? { professionalId: u.id } : u.role === 'clinic_admin' ? { clinicId: { $in: (await ctx.db.col('clinics').find({ adminIds: u.id })).map((c) => c._id) } } : null;
    if (!q) throw forbidden();
    if (ctx.query.scope === 'upcoming') { q.endAt = { $gte: now }; q.status = { $in: ['requested', 'confirmed'] }; }
    if (ctx.query.scope === 'past') q.$or = [{ endAt: { $lt: now } }, { status: { $in: ['completed', 'cancelled', 'no_show'] } }];
    if (ctx.query.from) q.startAt = { ...(q.startAt || {}), $gte: String(ctx.query.from) };
    if (ctx.query.to) q.startAt = { ...(q.startAt || {}), $lte: String(ctx.query.to) };
    const list = await ctx.db.col('appointments').find(q, { sort: { startAt: ctx.query.scope === 'past' ? -1 : 1 }, limit: 300 });
    return Promise.all(list.map((a) => enrichAppt(ctx, a)));
  }),
  r.post('/appointments', ['patient'], book, { rate: RATE.write }),
  r.get('/appointments/:id', 'user', async (ctx) => {
    const a = await ctx.db.col('appointments').findById(ctx.params.id);
    if (!a || ![a.patientId, a.professionalId].includes(ctx.user!.id)) throw notFound();
    return enrichAppt(ctx, a);
  }),
  r.patch('/appointments/:id', 'user', async (ctx) => {
    const b = parse(z.object({ status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']), note: z.string().max(500).optional() }), ctx.body);
    const u = ctx.user!;
    const a = await ctx.db.col('appointments').findById(ctx.params.id);
    if (!a) throw notFound();
    const isPro = a.professionalId === u.id, isPat = a.patientId === u.id;
    if (!isPro && !isPat) throw forbidden();
    if (isPat && b.status !== 'cancelled') throw forbidden('Solo puedes cancelar tu cita');
    if (isPat && new Date(a.startAt).getTime() - ctx.p.now().getTime() < 24 * 3600000) throw badRequest('Las cancelaciones con menos de 24 h se gestionan directamente con tu profesional');
    const upd = await ctx.db.col('appointments').updateById(a._id, { $set: { status: b.status, statusNote: b.note || '', [`${b.status}At`]: ctx.p.now().toISOString() } });
    const other = isPro ? a.patientId : a.professionalId;
    const labels: Record<string, string> = { confirmed: 'confirmada', cancelled: 'cancelada', completed: 'completada', no_show: 'marcada como no asistida' };
    await notify(ctx, other, { type: 'appointment', title: `Cita ${labels[b.status]}`, body: new Date(a.startAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }), link: isPro ? '/app/citas' : '/pro/agenda' });
    if (b.status === 'completed') await award(ctx, a.patientId, 10);
    return upd;
  }),
  r.post('/appointments/:id/join', 'user', async (ctx) => {
    const a = await ctx.db.col('appointments').findById(ctx.params.id);
    if (!a || ![a.patientId, a.professionalId].includes(ctx.user!.id)) throw notFound();
    if (a.status !== 'confirmed') throw badRequest('La cita aún no está confirmada');
    const now = ctx.p.now().getTime();
    if (!ctx.p.config.demoMode && (now < new Date(a.startAt).getTime() - 15 * 60000 || now > new Date(a.endAt).getTime() + 30 * 60000)) throw badRequest('La sala abre 15 minutos antes de la cita');
    await audit(ctx, 'video.join', 'appointment', a._id, a.patientId);
    const other = await ctx.db.col('users').findById(ctx.user!.id === a.patientId ? a.professionalId : a.patientId);
    return { roomId: a.roomId, appointmentId: a._id, role: ctx.user!.id === a.professionalId ? 'host' : 'guest', iceServers: ctx.p.config.iceServers, peer: publicUser(other), patientId: a.patientId };
  }),

  // ---------- Mensajería ----------
  r.get('/conversations', 'user', async (ctx) => {
    const u = ctx.user!;
    const convs = await ctx.db.col('conversations').find({ participants: u.id }, { sort: { lastMessageAt: -1 }, limit: 100 });
    return Promise.all(convs.map(async (c) => {
      const others = await ctx.db.col('users').find({ _id: { $in: c.participants.filter((x: string) => x !== u.id) } });
      const last = await ctx.db.col('messages').findOne({ conversationId: c._id }, { sort: { createdAt: -1 } });
      const unread = await ctx.db.col('messages').count({ conversationId: c._id, senderId: { $ne: u.id }, readBy: { $nin: [u.id] } });
      return { ...c, others: others.map(publicUser), last: last ? { body: String(last.body).slice(0, 120), createdAt: last.createdAt, senderId: last.senderId } : null, unread };
    }));
  }),
  r.post('/conversations', 'user', async (ctx) => {
    const b = parse(z.object({ participantId: zid }), ctx.body);
    const u = ctx.user!; const { db } = ctx;
    const other = await db.col('users').findById(b.participantId);
    if (!other || other._id === u.id) throw notFound('Usuario no encontrado');
    const pair = [u.role, other.role].sort().join(':');
    let allowed = other.role === 'admin' || u.role === 'admin';
    if (pair === 'patient:professional') {
      const [pat, pro] = u.role === 'patient' ? [u.id, other._id] : [other._id, u.id];
      allowed = !!(await db.col('careRelations').findOne({ patientId: pat, professionalId: pro, status: 'active' }));
    } else if (pair === 'parent:professional') {
      const [par, pro] = u.role === 'parent' ? [u.id, other._id] : [other._id, u.id];
      const links = await db.col('guardianLinks').find({ parentId: par, status: 'active', scopes: 'parent_chat' });
      for (const l of links) if (await db.col('careRelations').findOne({ patientId: l.teenId, professionalId: pro, status: 'active' })) allowed = true;
    } else if (['professional:professional', 'clinic_admin:professional'].includes(pair)) {
      const shared = await db.col('clinics').findOne({ 'members.userId': { $all: [u.id, other._id] } });
      allowed = !!shared || pair === 'professional:professional';
    } else if (pair === 'parent:patient') {
      const [par, teen] = u.role === 'parent' ? [u.id, other._id] : [other._id, u.id];
      allowed = !!(await db.col('guardianLinks').findOne({ parentId: par, teenId: teen, status: 'active' }));
    }
    if (!allowed) throw forbidden('No puedes iniciar una conversación con esta persona');
    const ex = await db.col('conversations').findOne({ participants: { $all: [u.id, other._id], $size: 2 } });
    if (ex) return ex;
    return db.col('conversations').insert({ participants: [u.id, other._id], type: pair.replace(':', '_'), lastMessageAt: ctx.p.now().toISOString() });
  }),
  r.get('/conversations/:id/messages', 'user', async (ctx) => {
    const c = await ctx.db.col('conversations').findOne({ _id: ctx.params.id, participants: ctx.user!.id });
    if (!c) throw notFound();
    const q: any = { conversationId: c._id };
    if (ctx.query.before) q.createdAt = { $lt: String(ctx.query.before) };
    const msgs = await ctx.db.col('messages').find(q, { sort: { createdAt: -1 }, limit: 60 });
    return msgs.reverse();
  }),
  r.post('/conversations/:id/messages', 'user', async (ctx) => {
    const b = parse(z.object({ body: z.string().trim().min(1).max(5000), attachments: z.array(z.object({ url: z.string().max(400_000), name: z.string().max(120), mime: z.string().max(80) })).max(5).default([]) }), ctx.body);
    const c = await ctx.db.col('conversations').findOne({ _id: ctx.params.id, participants: ctx.user!.id });
    if (!c) throw notFound();
    const msg = await ctx.db.col('messages').insert({ conversationId: c._id, senderId: ctx.user!.id, body: b.body, attachments: b.attachments, readBy: [ctx.user!.id] });
    await ctx.db.col('conversations').updateById(c._id, { $set: { lastMessageAt: ctx.p.now().toISOString() } });
    for (const pid of c.participants) if (pid !== ctx.user!.id) {
      ctx.p.realtime.toUser(pid, 'message:new', { ...msg, conversationId: c._id });
      await ctx.db.col('notifications').insert({ userId: pid, type: 'message', title: `Mensaje de ${ctx.user!.firstName}`, body: b.body.slice(0, 80), link: `/mensajes/${c._id}`, read: false, priority: 'normal' });
    }
    return msg;
  }, { rate: RATE.write }),
  r.post('/conversations/:id/read', 'user', async (ctx) => {
    const c = await ctx.db.col('conversations').findOne({ _id: ctx.params.id, participants: ctx.user!.id });
    if (!c) throw notFound();
    await ctx.db.col('messages').updateMany({ conversationId: c._id, readBy: { $nin: [ctx.user!.id] } }, { $addToSet: { readBy: ctx.user!.id } });
    for (const pid of c.participants) if (pid !== ctx.user!.id) ctx.p.realtime.toUser(pid, 'message:read', { conversationId: c._id, by: ctx.user!.id });
  }),
  r.get('/contacts', 'user', async (ctx) => {
    const u = ctx.user!; const { db } = ctx; const ids = new Set<string>();
    if (u.role === 'patient') (await db.col('careRelations').find({ patientId: u.id, status: 'active' })).forEach((x) => ids.add(x.professionalId));
    if (u.role === 'professional') {
      (await db.col('careRelations').find({ professionalId: u.id, status: 'active' })).forEach((x) => ids.add(x.patientId));
      const clinics = await db.col('clinics').find({ 'members.userId': u.id });
      clinics.forEach((c) => c.members.forEach((m: any) => m.userId !== u.id && ids.add(m.userId)));
      const teens = (await db.col('careRelations').find({ professionalId: u.id, status: 'active' })).map((x) => x.patientId);
      (await db.col('guardianLinks').find({ teenId: { $in: teens }, status: 'active', scopes: 'parent_chat' })).forEach((l) => ids.add(l.parentId));
    }
    if (u.role === 'parent') {
      const links = await db.col('guardianLinks').find({ parentId: u.id, status: 'active' });
      for (const l of links) { ids.add(l.teenId); if (l.scopes.includes('parent_chat')) (await db.col('careRelations').find({ patientId: l.teenId, status: 'active' })).forEach((x) => ids.add(x.professionalId)); }
    }
    if (u.role === 'clinic_admin') (await db.col('clinics').find({ adminIds: u.id })).forEach((c) => c.members.forEach((m: any) => m.userId !== u.id && ids.add(m.userId)));
    return (await db.col('users').find({ _id: { $in: [...ids] } })).map(publicUser);
  }),
  r.get('/support/admins', 'user', async (ctx) => (await ctx.db.col('users').find({ role: 'admin', status: 'active' }, { limit: 1 })).map(publicUser)),
  r.get('/appointments/:id/slots', 'optional', async (ctx) => {
    const p = await ctx.db.col('professionals').findOne({ userId: ctx.params.id });
    if (!p) throw notFound();
    const busy = await ctx.db.col('appointments').find({ professionalId: p.userId, status: { $in: ['requested', 'confirmed'] }, startAt: { $gte: ctx.p.now().toISOString() } });
    return generateSlots(p.availability || [], p.sessionMinutes || 50, busy, ctx.p.now(), 21);
  }),
  r.get('/now', 'public', async (ctx) => ({ now: ctx.p.now().toISOString(), soon: addDays(ctx.p.now(), 1).toISOString() })),
];
