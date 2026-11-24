import { z } from 'zod';
import { r, RATE } from '../router';
import type { Ctx } from '../context';
import { badRequest, forbidden, notFound } from '../../util/errors';
import { addDays } from '../../util/dates';
import { escapeRegex, norm, round1 } from '../../util/text';
import { BANNED_PRODUCT_TERMS } from '../../constants';
import { detectRisk, isUrgent, crisisMessage } from '../../engine/safety';
import { analyzePassions } from '../../engine/passions';
import { audit, notify, paginate, parse, publicUser, raiseAlert, refreshKinko } from '../services';
import { award } from './patient';

const MEAS_TYPES = ['heart_rate', 'hrv_rmssd', 'bp_systolic', 'bp_diastolic', 'weight', 'temperature', 'spo2', 'steps', 'sleep_minutes', 'glucose', 'respiratory_rate'] as const;
const UNITS: Record<string, string> = { heart_rate: 'lpm', hrv_rmssd: 'ms', bp_systolic: 'mmHg', bp_diastolic: 'mmHg', weight: 'kg', temperature: '°C', spo2: '%', steps: 'pasos', sleep_minutes: 'min', glucose: 'mg/dL', respiratory_rate: 'rpm' };
const RANGES: Record<string, [number, number]> = { heart_rate: [25, 230], hrv_rmssd: [2, 300], bp_systolic: [60, 260], bp_diastolic: [30, 160], weight: [20, 300], temperature: [33, 43], spo2: [60, 100], steps: [0, 100000], sleep_minutes: [0, 1000], glucose: [30, 600], respiratory_rate: [4, 60] };

async function biometricChecks(ctx: Ctx, items: { type: string; value: number }[]) {
  const sys = items.find((i) => i.type === 'bp_systolic')?.value, dia = items.find((i) => i.type === 'bp_diastolic')?.value;
  if ((sys && sys >= 180) || (dia && dia >= 120)) {
    await notify(ctx, ctx.user!.id, { type: 'health', title: 'Tensión arterial muy alta', body: 'Repite la medición en 5 minutos en reposo. Si sigue igual o tienes dolor de cabeza, pecho o visión borrosa, llama al 112.', priority: 'high', link: '/app/dispositivos' });
    await raiseAlert(ctx, ctx.user!.id, { type: 'biometric', severity: 'medium', message: `Tensión registrada ${sys}/${dia} mmHg.` });
  }
  const spo2 = items.find((i) => i.type === 'spo2')?.value;
  if (spo2 && spo2 < 90) await notify(ctx, ctx.user!.id, { type: 'health', title: 'Saturación de oxígeno baja', body: 'Si te cuesta respirar, llama al 112.', priority: 'high' });
}

function bannedProduct(text: string) { const t = norm(text); return BANNED_PRODUCT_TERMS.find((w) => t.includes(norm(w))); }

const ProductSchema = z.object({
  name: z.string().min(2).max(140), description: z.string().max(3000).default(''), price: z.number().min(0).max(10000), currency: z.literal('EUR').default('EUR'),
  type: z.enum(['affiliate', 'own']), affiliateUrl: z.string().url().max(600).optional(), merchant: z.string().max(80).default(''), stock: z.number().int().min(0).max(100000).default(0),
  category: z.string().max(60), passionTags: z.array(z.string().max(40)).max(10).default([]), domainTags: z.array(z.string().max(20)).max(7).default([]),
  images: z.array(z.string().max(100000)).max(6).default([]), commissionRate: z.number().min(0).max(0.5).default(0.05), badges: z.array(z.string().max(30)).max(5).default([]),
});

export const communityRoutes = [
  // ---------- Dispositivos y biometría ----------
  r.get('/devices', ['patient'], async (ctx) => ctx.db.col('devices').find({ userId: ctx.user!.id }, { sort: { createdAt: -1 } })),
  r.post('/devices', ['patient'], async (ctx) => {
    const b = parse(z.object({ type: z.enum(['heart_rate', 'blood_pressure', 'scale', 'thermometer', 'pulse_oximeter', 'glucose', 'health_kit', 'health_connect', 'simulator', 'manual']), name: z.string().max(80), bleId: z.string().max(120).optional() }), ctx.body);
    const ex = b.bleId ? await ctx.db.col('devices').findOne({ userId: ctx.user!.id, bleId: b.bleId }) : null;
    return ex || ctx.db.col('devices').insert({ userId: ctx.user!.id, ...b, lastSyncAt: null });
  }),
  r.del('/devices/:id', ['patient'], async (ctx) => { await ctx.db.col('devices').deleteOne({ _id: ctx.params.id, userId: ctx.user!.id }); }),
  r.post('/measurements', ['patient'], async (ctx) => {
    const b = parse(z.object({ deviceId: z.string().max(40).optional(), items: z.array(z.object({ type: z.enum(MEAS_TYPES), value: z.number(), measuredAt: z.string().datetime().optional(), source: z.string().max(30).default('manual') })).min(1).max(500) }), ctx.body);
    const now = ctx.p.now().toISOString();
    const items = b.items.filter((i) => i.value >= RANGES[i.type][0] && i.value <= RANGES[i.type][1]);
    if (!items.length) throw badRequest('Valores fuera de rango');
    await ctx.db.col('measurements').insertMany(items.map((i) => ({ userId: ctx.user!.id, deviceId: b.deviceId || null, type: i.type, value: i.value, unit: UNITS[i.type], measuredAt: i.measuredAt || now, source: i.source })));
    if (b.deviceId) await ctx.db.col('devices').updateOne({ _id: b.deviceId, userId: ctx.user!.id }, { $set: { lastSyncAt: now } });
    await biometricChecks(ctx, items);
    await refreshKinko(ctx, ctx.user!.id);
    return { saved: items.length, discarded: b.items.length - items.length };
  }, { rate: RATE.write }),
  r.get('/measurements', ['patient'], async (ctx) => {
    const q: any = { userId: ctx.user!.id, measuredAt: { $gte: addDays(ctx.p.now(), -(Number(ctx.query.days) || 30)).toISOString() } };
    if (ctx.query.type) q.type = String(ctx.query.type);
    return ctx.db.col('measurements').find(q, { sort: { measuredAt: -1 }, limit: 2000 });
  }),

  // ---------- Comunidad ----------
  r.get('/forum/categories', 'optional', async (ctx) => {
    const cats = await ctx.db.col('forumCategories').find({}, { sort: { order: 1 } });
    return Promise.all(cats.map(async (c) => ({ ...c, posts: await ctx.db.col('forumPosts').count({ categoryId: c._id, status: 'visible' }) })));
  }),
  r.get('/forum/posts', 'optional', async (ctx) => {
    const q: any = { status: 'visible' };
    if (ctx.query.category) { const c = await ctx.db.col('forumCategories').findOne({ $or: [{ slug: String(ctx.query.category) }, { _id: String(ctx.query.category) }] }); if (c) q.categoryId = c._id; }
    if (ctx.query.q) q.$or = [{ title: { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }, { body: { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }];
    if (ctx.query.audience === 'parent') q.audience = 'parent';
    const posts = await ctx.db.col('forumPosts').find(q, { sort: { pinned: -1, lastActivityAt: -1 }, ...paginate(ctx.query) });
    return Promise.all(posts.map(async (p) => ({ ...p, body: String(p.body).slice(0, 280), author: p.anonymous ? null : publicUser(await ctx.db.col('users').findById(p.authorId)), category: await ctx.db.col('forumCategories').findById(p.categoryId), myReaction: ctx.user ? (p.reactions || []).find((x: any) => x.userId === ctx.user!.id)?.type : null, reactions: undefined, reactionCounts: (p.reactions || []).reduce((a: any, x: any) => ({ ...a, [x.type]: (a[x.type] || 0) + 1 }), {}) })));
  }),
  r.get('/forum/posts/:id', 'optional', async (ctx) => {
    const p = await ctx.db.col('forumPosts').findOne({ _id: ctx.params.id, status: 'visible' });
    if (!p) throw notFound();
    const comments = await ctx.db.col('forumComments').find({ postId: p._id, status: 'visible' }, { sort: { createdAt: 1 } });
    const authorInfo = async (id: string, anon: boolean) => { if (anon || !id) return null; const u = await ctx.db.col('users').findById(id); const pr = u?.role === 'professional' ? await ctx.db.col('professionals').findOne({ userId: id }) : null; return { ...publicUser(u), verifiedPro: !!pr?.verified }; };
    return { ...p, reactions: undefined, reactionCounts: (p.reactions || []).reduce((a: any, x: any) => ({ ...a, [x.type]: (a[x.type] || 0) + 1 }), {}), myReaction: ctx.user ? (p.reactions || []).find((x: any) => x.userId === ctx.user!.id)?.type : null, author: await authorInfo(p.authorId, p.anonymous), category: await ctx.db.col('forumCategories').findById(p.categoryId), comments: await Promise.all(comments.map(async (c) => ({ ...c, author: await authorInfo(c.authorId, c.anonymous) }))) };
  }),
  r.post('/forum/posts', 'user', async (ctx) => {
    const b = parse(z.object({ categoryId: z.string().max(40), title: z.string().trim().min(4).max(140), body: z.string().trim().min(10).max(8000), anonymous: z.boolean().default(true), tags: z.array(z.string().max(30)).max(5).default([]) }), ctx.body);
    const cat = await ctx.db.col('forumCategories').findById(b.categoryId);
    if (!cat) throw notFound('Categoría no encontrada');
    if (cat.audience === 'parent' && ctx.user!.role !== 'parent') throw forbidden('Este espacio es solo para familias');
    const risk = detectRisk(`${b.title} ${b.body}`);
    const urgent = isUrgent(risk);
    const post = await ctx.db.col('forumPosts').insert({ ...b, authorId: ctx.user!.id, status: urgent ? 'held' : 'visible', audience: cat.audience || 'all', reactions: [], commentsCount: 0, lastActivityAt: ctx.p.now().toISOString(), moderation: { risk: risk.level, categories: risk.categories } });
    if (urgent) {
      if (ctx.user!.role === 'patient') await raiseAlert(ctx, ctx.user!.id, { type: 'crisis', severity: risk.level === 'imminent' ? 'critical' : 'high', message: 'Publicación en la comunidad con señales de riesgo (retenida para moderación).' });
      for (const a of await ctx.db.col('users').find({ role: 'admin' })) await notify(ctx, a._id, { type: 'moderation', title: 'Publicación retenida por riesgo', link: '/admin/moderacion', priority: 'high' });
      return { post, held: true, message: crisisMessage(ctx.user!.isMinor) };
    }
    await award(ctx, ctx.user!.id, 5, 'comunidad');
    return { post, held: false };
  }, { rate: RATE.write }),
  r.post('/forum/posts/:id/comments', 'user', async (ctx) => {
    const b = parse(z.object({ body: z.string().trim().min(2).max(4000), anonymous: z.boolean().default(true) }), ctx.body);
    const p = await ctx.db.col('forumPosts').findOne({ _id: ctx.params.id, status: 'visible' });
    if (!p) throw notFound();
    const risk = detectRisk(b.body);
    const c = await ctx.db.col('forumComments').insert({ postId: p._id, authorId: ctx.user!.id, ...b, status: isUrgent(risk) ? 'held' : 'visible', moderation: { risk: risk.level } });
    if (!isUrgent(risk)) {
      await ctx.db.col('forumPosts').updateById(p._id, { $inc: { commentsCount: 1 }, $set: { lastActivityAt: ctx.p.now().toISOString() } });
      if (p.authorId && p.authorId !== ctx.user!.id) await notify(ctx, p.authorId, { type: 'forum', title: 'Alguien ha respondido a tu publicación', body: p.title, link: `/comunidad/${p._id}`, priority: 'low' });
    } else if (ctx.user!.role === 'patient') await raiseAlert(ctx, ctx.user!.id, { type: 'crisis', severity: 'high', message: 'Comentario en la comunidad con señales de riesgo.' });
    return { comment: c, held: isUrgent(risk), message: isUrgent(risk) ? crisisMessage(ctx.user!.isMinor) : null };
  }, { rate: RATE.write }),
  r.post('/forum/posts/:id/react', 'user', async (ctx) => {
    const b = parse(z.object({ type: z.enum(['apoyo', 'meidentifico', 'gracias', 'fuerza']).nullable() }), ctx.body);
    const p = await ctx.db.col('forumPosts').findById(ctx.params.id);
    if (!p) throw notFound();
    await ctx.db.col('forumPosts').updateById(p._id, { $pull: { reactions: { userId: ctx.user!.id } } });
    if (b.type) await ctx.db.col('forumPosts').updateById(p._id, { $push: { reactions: { userId: ctx.user!.id, type: b.type } } });
  }),
  r.post('/forum/posts/:id/report', 'user', async (ctx) => {
    const b = parse(z.object({ reason: z.string().max(300) }), ctx.body);
    const p = await ctx.db.col('forumPosts').updateById(ctx.params.id, { $push: { reports: { userId: ctx.user!.id, reason: b.reason, at: ctx.p.now().toISOString() } } });
    if (!p) throw notFound();
    if ((p.reports || []).length >= 3) await ctx.db.col('forumPosts').updateById(p._id, { $set: { status: 'flagged' } });
  }),

  // ---------- Tienda ----------
  r.get('/shop/products', 'optional', async (ctx) => {
    const q: any = { status: 'active' };
    if (ctx.query.category) q.category = String(ctx.query.category);
    if (ctx.query.passion) q.passionTags = String(ctx.query.passion);
    if (ctx.query.type) q.type = String(ctx.query.type);
    if (ctx.query.q) q.$or = [{ name: { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }, { description: { $regex: escapeRegex(String(ctx.query.q)), $options: 'i' } }];
    return ctx.db.col('products').find(q, { sort: { featured: -1, createdAt: -1 }, limit: 200 });
  }),
  r.get('/shop/recommended', ['patient'], async (ctx) => {
    const prof = await ctx.db.col('passionProfiles').findOne({ userId: ctx.user!.id });
    const ins = analyzePassions(prof?.interests || []).insights;
    const k = ctx.user!.doc.kinko?.domains || {};
    const lowDomains = Object.entries(k).filter(([, v]) => typeof v === 'number' && (v as number) < 50).map(([d]) => d);
    const tags = ins.flatMap((i) => i.tags);
    const prods = await ctx.db.col('products').find({ status: 'active', $or: [{ passionTags: { $in: tags } }, { domainTags: { $in: lowDomains } }] }, { limit: 60 });
    return prods.map((p) => {
      const pas = ins.find((i) => i.tags.some((t) => p.passionTags?.includes(t)));
      const dom = lowDomains.find((d) => p.domainTags?.includes(d));
      return { ...p, why: pas ? `Para tu pasión: ${pas.label}${pas.atRisk || pas.unsupported ? ' (para retomarla)' : ''}` : dom ? `Para cuidar tu ${({ sueno: 'sueño', calma: 'calma', animo: 'ánimo', energia: 'energía', vinculos: 'conexión', actividad: 'actividad', proposito: 'propósito' } as any)[dom]}` : '' };
    }).sort((a, b) => (b.why.includes('retomarla') ? 1 : 0) - (a.why.includes('retomarla') ? 1 : 0));
  }),
  r.get('/shop/products/:id', 'optional', async (ctx) => { const p = await ctx.db.col('products').findById(ctx.params.id); if (!p || (p.status !== 'active' && p.ownerId !== ctx.user?.id && ctx.user?.role !== 'admin')) throw notFound(); return p; }),
  r.post('/shop/products', ['admin', 'clinic_admin', 'professional'], async (ctx) => {
    const b = parse(ProductSchema, ctx.body);
    const bad = bannedProduct(`${b.name} ${b.description} ${b.category}`);
    if (bad) throw badRequest(`Kinkō no publica productos relacionados con «${bad}». La tienda es solo para hábitos, aficiones y bienestar no farmacológico.`);
    if (b.type === 'affiliate' && !b.affiliateUrl) throw badRequest('Falta el enlace de afiliado');
    return ctx.db.col('products').insert({ ...b, ownerId: ctx.user!.id, status: ctx.user!.role === 'admin' ? 'active' : 'pending', clicks: 0, sales: 0 });
  }),
  r.patch('/shop/products/:id', ['admin', 'clinic_admin', 'professional'], async (ctx) => {
    const p = await ctx.db.col('products').findById(ctx.params.id);
    if (!p) throw notFound();
    if (p.ownerId !== ctx.user!.id && ctx.user!.role !== 'admin') throw forbidden();
    const b = parse(ProductSchema.partial().extend({ status: z.enum(['active', 'pending', 'rejected', 'paused']).optional() }), ctx.body);
    if (b.status && ctx.user!.role !== 'admin' && b.status === 'active') delete b.status;
    const bad = bannedProduct(`${b.name || ''} ${b.description || ''}`);
    if (bad) throw badRequest(`Producto no permitido («${bad}»)`);
    return ctx.db.col('products').updateById(p._id, { $set: b });
  }),
  r.post('/shop/products/:id/click', 'optional', async (ctx) => {
    const p = await ctx.db.col('products').findById(ctx.params.id);
    if (!p || p.type !== 'affiliate') throw notFound();
    await ctx.db.col('affiliateClicks').insert({ productId: p._id, userId: ctx.user?.id || null, merchant: p.merchant });
    await ctx.db.col('products').updateById(p._id, { $inc: { clicks: 1 } });
    return { url: p.affiliateUrl };
  }),
  r.post('/shop/orders', 'user', async (ctx) => {
    const b = parse(z.object({ items: z.array(z.object({ productId: z.string().max(40), qty: z.number().int().min(1).max(20) })).min(1).max(30), shipping: z.object({ name: z.string().max(120), address: z.string().max(240), city: z.string().max(80), postalCode: z.string().regex(/^\d{5}$/, 'Código postal no válido'), phone: z.string().max(30) }) }), ctx.body);
    const lines: any[] = [];
    for (const it of b.items) {
      const p = await ctx.db.col('products').findById(it.productId);
      if (!p || p.status !== 'active' || p.type !== 'own') throw badRequest('Producto no disponible para compra directa');
      if (p.stock < it.qty) throw badRequest(`No hay stock suficiente de ${p.name}`);
      lines.push({ productId: p._id, name: p.name, price: p.price, qty: it.qty });
    }
    const subtotal = round1(lines.reduce((a, l) => a + l.price * l.qty, 0));
    const shippingCost = subtotal >= 40 ? 0 : 3.95;
    const total = round1(subtotal + shippingCost);
    const order = await ctx.db.col('orders').insert({ userId: ctx.user!.id, items: lines, subtotal, shippingCost, total, currency: 'EUR', status: 'pending_payment', shipping: b.shipping });
    const pay = await ctx.p.payments.checkout({ amountCents: Math.round(total * 100), currency: 'eur', description: `Pedido Kinkō ${order._id.slice(-6)}`, metadata: { orderId: order._id }, successUrl: `${ctx.p.config.publicUrl}/#/app/tienda/pedidos`, cancelUrl: `${ctx.p.config.publicUrl}/#/app/tienda` });
    if (pay.mode === 'simulated') {
      for (const l of lines) await ctx.db.col('products').updateById(l.productId, { $inc: { stock: -l.qty, sales: l.qty } });
      await ctx.db.col('orders').updateById(order._id, { $set: { status: 'paid', paymentRef: pay.id, paidAt: ctx.p.now().toISOString() } });
    }
    await audit(ctx, 'shop.order', 'order', order._id);
    return { order: { ...order, status: pay.mode === 'simulated' ? 'paid' : order.status }, payment: pay };
  }),
  r.get('/shop/orders', 'user', async (ctx) => ctx.db.col('orders').find({ userId: ctx.user!.id }, { sort: { createdAt: -1 } })),
  r.get('/shop/mine', ['admin', 'clinic_admin', 'professional'], async (ctx) => ctx.db.col('products').find(ctx.user!.role === 'admin' ? {} : { ownerId: ctx.user!.id }, { sort: { createdAt: -1 } })),
];
