import { z } from 'zod';
import { r } from '../router';
import { forbidden, notFound } from '../../util/errors';
import { dayKey } from '../../util/dates';
import { escapeRegex, slugify } from '../../util/text';
import { randomCode } from '../../util/ids';
import { parse, publicUser } from '../services';
import { award } from './patient';

const ContentSchema = z.object({
  title: z.string().min(3).max(140), type: z.enum(['video', 'audio', 'article', 'exercise', 'course', 'image']), summary: z.string().max(400).default(''),
  body: z.string().max(30000).default(''), url: z.string().max(500).default(''), cover: z.string().max(500).default(''), durationMin: z.number().int().min(0).max(600).default(5),
  tags: z.array(z.string().max(30)).max(12).default([]), domains: z.array(z.string()).max(7).default([]), audience: z.enum(['patient', 'parent', 'professional', 'all']).default('patient'),
  premium: z.boolean().default(false), script: z.array(z.string().max(500)).max(60).optional(),
});

export const contentRoutes = [
  r.get('/content', 'optional', async (ctx) => {
    const q: any = { status: 'published' };
    if (ctx.query.type) q.type = String(ctx.query.type);
    if (ctx.query.audience) q.audience = { $in: [String(ctx.query.audience), 'all'] };
    if (ctx.query.tag) q.tags = String(ctx.query.tag);
    if (ctx.query.domain) q.domains = String(ctx.query.domain);
    if (ctx.query.q) q.$or = [{ title: { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }, { tags: { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }];
    if (ctx.query.mine && ctx.user) { delete q.status; q.authorId = ctx.user.id; }
    const items = await ctx.db.col('contents').find(q, { sort: { featured: -1, createdAt: -1 }, limit: 120 });
    return items.map(({ body, script, ...rest }) => ({ ...rest, hasBody: !!body }));
  }),
  r.get('/content/:idOrSlug', 'optional', async (ctx) => {
    const c = await ctx.db.col('contents').findOne({ $or: [{ _id: ctx.params.idOrSlug }, { slug: ctx.params.idOrSlug }] });
    if (!c || (c.status !== 'published' && c.authorId !== ctx.user?.id && ctx.user?.role !== 'admin')) throw notFound();
    const locked = c.premium && !['plus', 'family', 'care', 'org', 'pro_solo', 'pro_plus', 'clinic'].includes(ctx.user?.plan || 'free');
    return { ...c, body: locked ? c.body.slice(0, 400) : c.body, locked, author: publicUser(await ctx.db.col('users').findById(c.authorId)) };
  }),
  r.post('/content', ['professional', 'clinic_admin', 'admin'], async (ctx) => {
    const b = parse(ContentSchema, ctx.body);
    return ctx.db.col('contents').insert({ ...b, slug: `${slugify(b.title)}-${randomCode(4).toLowerCase()}`, authorId: ctx.user!.id, status: ctx.user!.role === 'admin' ? 'published' : 'published', views: 0 });
  }),
  r.patch('/content/:id', ['professional', 'clinic_admin', 'admin'], async (ctx) => {
    const b = parse(ContentSchema.partial().extend({ status: z.enum(['published', 'draft', 'hidden']).optional() }), ctx.body);
    const c = await ctx.db.col('contents').findById(ctx.params.id);
    if (!c) throw notFound();
    if (c.authorId !== ctx.user!.id && ctx.user!.role !== 'admin') throw forbidden();
    return ctx.db.col('contents').updateById(c._id, { $set: b });
  }),
  r.del('/content/:id', ['professional', 'clinic_admin', 'admin'], async (ctx) => {
    const c = await ctx.db.col('contents').findById(ctx.params.id);
    if (!c) throw notFound();
    if (c.authorId !== ctx.user!.id && ctx.user!.role !== 'admin') throw forbidden();
    await ctx.db.col('contents').deleteOne({ _id: c._id });
  }),
  r.post('/content/:id/view', 'optional', async (ctx) => { await ctx.db.col('contents').updateOne({ $or: [{ _id: ctx.params.id }, { slug: ctx.params.id }] }, { $inc: { views: 1 } }); }),

  // ---------- Rutas de cuidado ----------
  r.get('/paths', 'optional', async (ctx) => {
    const paths = await ctx.db.col('carePaths').find({ status: 'published' }, { sort: { order: 1 } });
    const enrolls = ctx.user ? await ctx.db.col('pathEnrollments').find({ userId: ctx.user.id }) : [];
    return paths.map((p) => ({ ...p, days: undefined, dayCount: p.days.length, enrollment: enrolls.find((e) => e.pathId === p._id) || null }));
  }),
  r.get('/paths/:slug', 'optional', async (ctx) => {
    const p = await ctx.db.col('carePaths').findOne({ $or: [{ slug: ctx.params.slug }, { _id: ctx.params.slug }] });
    if (!p) throw notFound();
    const enrollment = ctx.user ? await ctx.db.col('pathEnrollments').findOne({ userId: ctx.user.id, pathId: p._id }) : null;
    const locked = p.premium && !['plus', 'family', 'care', 'org'].includes(ctx.user?.plan || 'free');
    return { ...p, days: p.days.map((d: any, i: number) => (locked && i > 1 ? { ...d, tasks: [], locked: true } : d)), enrollment, locked };
  }),
  r.post('/paths/:slug/enroll', ['patient'], async (ctx) => {
    const p = await ctx.db.col('carePaths').findOne({ slug: ctx.params.slug });
    if (!p) throw notFound();
    const ex = await ctx.db.col('pathEnrollments').findOne({ userId: ctx.user!.id, pathId: p._id });
    if (ex) return ex;
    return ctx.db.col('pathEnrollments').insert({ userId: ctx.user!.id, pathId: p._id, slug: p.slug, title: p.title, currentDay: 1, completedDays: [], startedAt: ctx.p.now().toISOString(), status: 'active' });
  }),
  r.post('/paths/:slug/days/:day/complete', ['patient'], async (ctx) => {
    const e = await ctx.db.col('pathEnrollments').findOne({ userId: ctx.user!.id, slug: ctx.params.slug });
    if (!e) throw notFound('Primero empieza la ruta');
    const p = await ctx.db.col('carePaths').findById(e.pathId);
    const day = Number(ctx.params.day);
    const completedDays = Array.from(new Set([...(e.completedDays || []), day])).sort((a, b) => a - b);
    const done = completedDays.length >= (p?.days.length || 7);
    const upd = await ctx.db.col('pathEnrollments').updateById(e._id, { $set: { completedDays, currentDay: Math.min(day + 1, p?.days.length || 7), status: done ? 'completed' : 'active', lastActivity: dayKey(ctx.p.now()) } });
    await award(ctx, ctx.user!.id, 20, done ? 'ruta-completa' : undefined);
    return upd;
  }),
];
