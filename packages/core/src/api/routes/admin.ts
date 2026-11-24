import { z } from 'zod';
import { r } from '../router';
import { notFound } from '../../util/errors';
import { addDays } from '../../util/dates';
import { escapeRegex } from '../../util/text';
import { randomCode } from '../../util/ids';
import { ROLES } from '../../constants';
import { audit, notify, paginate, parse, publicUser } from '../services';

const ADMIN = ['admin'] as const;
export const adminRoutes = [
  r.get('/admin/overview', [...ADMIN], async (ctx) => {
    const { db, p } = ctx; const week = addDays(p.now(), -7).toISOString();
    const roles: Record<string, number> = {};
    for (const role of ROLES) roles[role] = await db.col('users').count({ role, status: { $ne: 'deleted' } });
    return {
      roles, newUsers7d: await db.col('users').count({ createdAt: { $gte: week } }), checkins7d: await db.col('checkins').count({ createdAt: { $gte: week } }),
      assessments7d: await db.col('assessments').count({ createdAt: { $gte: week } }), appointments7d: await db.col('appointments').count({ createdAt: { $gte: week } }),
      openAlerts: await db.col('alerts').count({ status: 'open' }), criticalAlerts7d: await db.col('alerts').count({ severity: 'critical', createdAt: { $gte: week } }),
      pendingPros: await db.col('professionals').count({ verificationStatus: 'pending' }), pendingClinics: await db.col('clinics').count({ verificationStatus: 'pending' }),
      pendingKeys: await db.col('apiKeys').count({ env: 'live', status: 'pending', revokedAt: null }), heldPosts: await db.col('forumPosts').count({ status: { $in: ['held', 'flagged'] } }),
      pendingProducts: await db.col('products').count({ status: 'pending' }), orders7d: await db.col('orders').count({ createdAt: { $gte: week } }),
      researchConsent: await db.col('users').count({ role: 'patient', 'consents.research': true }), dbKind: db.kind, aiProvider: p.ai.available ? p.ai.model : 'sin conexión (motor local)', env: p.config.env,
    };
  }),
  r.get('/admin/users', [...ADMIN], async (ctx) => {
    const q: any = { status: { $ne: 'deleted' } };
    if (ctx.query.role) q.role = String(ctx.query.role);
    if (ctx.query.q) q.$or = [{ email: { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }, { 'profile.firstName': { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }, { 'profile.lastName': { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }];
    const users = await ctx.db.col('users').find(q, { sort: { createdAt: -1 }, ...paginate(ctx.query) });
    return users.map((u) => ({ ...publicUser(u), email: u.email, status: u.status, plan: u.plan, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, twoFactor: !!u.twoFactor?.enabled }));
  }),
  r.patch('/admin/users/:id', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ status: z.enum(['active', 'suspended']).optional(), role: z.enum(ROLES).optional(), plan: z.string().max(20).optional() }), ctx.body);
    const u = await ctx.db.col('users').updateById(ctx.params.id, { $set: b });
    if (!u) throw notFound();
    if (b.status === 'suspended') await ctx.db.col('sessions').updateMany({ userId: u._id }, { $set: { revokedAt: ctx.p.now().toISOString() } });
    await audit(ctx, 'admin.user_update', 'user', u._id, null, b);
    return { ok: true };
  }),
  r.get('/admin/verifications', [...ADMIN], async (ctx) => {
    const pros = await ctx.db.col('professionals').find({ verificationStatus: 'pending' });
    const clinics = await ctx.db.col('clinics').find({ verificationStatus: 'pending' });
    const keys = await ctx.db.col('apiKeys').find({ env: 'live', status: 'pending', revokedAt: null });
    return {
      professionals: await Promise.all(pros.map(async (p) => ({ ...p, user: { ...publicUser(await ctx.db.col('users').findById(p.userId)), email: (await ctx.db.col('users').findById(p.userId))?.email } }))),
      clinics, apiKeys: await Promise.all(keys.map(async ({ keyHash, ...k }) => ({ ...k, owner: publicUser(await ctx.db.col('users').findById(k.ownerId)) }))),
    };
  }),
  r.post('/admin/professionals/:userId/verify', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ approved: z.boolean(), note: z.string().max(500).default('') }), ctx.body);
    const p = await ctx.db.col('professionals').updateOne({ userId: ctx.params.userId }, { $set: { verificationStatus: b.approved ? 'verified' : 'rejected', verified: b.approved, verificationNote: b.note, verifiedAt: ctx.p.now().toISOString(), verifiedBy: ctx.user!.id } });
    if (!p) throw notFound();
    await notify(ctx, ctx.params.userId, { type: 'verification', title: b.approved ? 'Tu colegiación está verificada' : 'No hemos podido verificar tu colegiación', body: b.note || (b.approved ? 'Ya apareces en el directorio.' : 'Revisa tu número de colegiado.'), link: '/pro/perfil' });
    await audit(ctx, 'admin.verify_professional', 'professional', p._id, null, b);
    return p;
  }),
  r.post('/admin/clinics/:id/verify', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ approved: z.boolean() }), ctx.body);
    const c = await ctx.db.col('clinics').updateById(ctx.params.id, { $set: { verificationStatus: b.approved ? 'verified' : 'rejected', verified: b.approved } });
    if (!c) throw notFound();
    await audit(ctx, 'admin.verify_clinic', 'clinic', c._id, null, b);
    return c;
  }),
  r.post('/admin/apikeys/:id/approve', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ approved: z.boolean() }), ctx.body);
    const k = await ctx.db.col('apiKeys').updateById(ctx.params.id, { $set: { status: b.approved ? 'approved' : 'rejected', reviewedBy: ctx.user!.id, reviewedAt: ctx.p.now().toISOString() } });
    if (!k) throw notFound();
    await notify(ctx, k.ownerId, { type: 'apikey', title: b.approved ? 'Tu clave live está aprobada' : 'Tu clave live ha sido rechazada', link: '/dev' });
    await audit(ctx, 'admin.apikey_review', 'apiKey', k._id, null, b);
    return { ok: true };
  }),
  r.get('/admin/moderation', [...ADMIN], async (ctx) => ({
    posts: await Promise.all((await ctx.db.col('forumPosts').find({ status: { $in: ['held', 'flagged'] } }, { sort: { createdAt: -1 } })).map(async (p) => ({ ...p, author: publicUser(await ctx.db.col('users').findById(p.authorId)) }))),
    comments: await ctx.db.col('forumComments').find({ status: 'held' }, { sort: { createdAt: -1 } }),
    products: await ctx.db.col('products').find({ status: 'pending' }, { sort: { createdAt: -1 } }),
  })),
  r.patch('/admin/forum/posts/:id', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ status: z.enum(['visible', 'hidden']), pinned: z.boolean().optional() }), ctx.body);
    const p = await ctx.db.col('forumPosts').updateById(ctx.params.id, { $set: b });
    if (!p) throw notFound();
    await audit(ctx, 'admin.moderate_post', 'forumPost', p._id, null, b);
    return p;
  }),
  r.patch('/admin/forum/comments/:id', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ status: z.enum(['visible', 'hidden']) }), ctx.body);
    const c = await ctx.db.col('forumComments').updateById(ctx.params.id, { $set: b });
    if (!c) throw notFound();
    if (b.status === 'visible') await ctx.db.col('forumPosts').updateById(c.postId, { $inc: { commentsCount: 1 } });
    return c;
  }),
  r.patch('/admin/products/:id', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ status: z.enum(['active', 'rejected', 'paused']), featured: z.boolean().optional() }), ctx.body);
    const p = await ctx.db.col('products').updateById(ctx.params.id, { $set: b });
    if (!p) throw notFound();
    await audit(ctx, 'admin.moderate_product', 'product', p._id, null, b);
    return p;
  }),
  r.get('/admin/audit', [...ADMIN], async (ctx) => {
    const q: any = {};
    if (ctx.query.actor) q.actorId = String(ctx.query.actor);
    if (ctx.query.patient) q.patientId = String(ctx.query.patient);
    if (ctx.query.action) q.action = { $regex: `^${escapeRegex(String(ctx.query.action))}` };
    const logs = await ctx.db.col('auditLogs').find(q, { sort: { createdAt: -1 }, ...paginate({ limit: 200, ...ctx.query }) });
    const cache = new Map<string, any>();
    const who = async (id: string | null) => { if (!id) return null; if (!cache.has(id)) cache.set(id, publicUser(await ctx.db.col('users').findById(id))); return cache.get(id); };
    return Promise.all(logs.map(async (l) => ({ ...l, actor: await who(l.actorId), patient: await who(l.patientId) })));
  }),
  r.get('/admin/organizations', [...ADMIN], async (ctx) => ctx.db.col('organizations').find({})),
  r.post('/admin/organizations', [...ADMIN], async (ctx) => {
    const b = parse(z.object({ name: z.string().min(2).max(120), employees: z.number().int().min(1).max(100000), adminEmail: z.string().email() }), ctx.body);
    const admin = await ctx.db.col('users').findOne({ email: b.adminEmail.toLowerCase() });
    if (!admin) throw notFound('El administrador debe registrarse primero');
    await ctx.db.col('users').updateById(admin._id, { $set: { role: 'org_admin', plan: 'org' } });
    return ctx.db.col('organizations').insert({ name: b.name, employees: b.employees, adminIds: [admin._id], joinCode: randomCode(6), plan: 'org' });
  }),
  r.get('/admin/system', [...ADMIN], async (ctx) => {
    const cols = ['users', 'checkins', 'assessments', 'journal', 'companionMessages', 'appointments', 'messages', 'clinicalRecords', 'measurements', 'forumPosts', 'products', 'auditLogs'];
    const counts: Record<string, number> = {};
    for (const c of cols) counts[c] = await ctx.db.col(c).count({});
    return { db: ctx.db.kind, counts, ai: ctx.p.ai.available ? ctx.p.ai.model : null, demoMode: ctx.p.config.demoMode, require2fa: ctx.p.config.require2faForStaff, kAnon: ctx.p.config.kAnon, epsilon: ctx.p.config.dpEpsilon, time: ctx.p.now().toISOString() };
  }),
];
