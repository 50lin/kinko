import { z } from 'zod';
import { r } from '../router';
import { badRequest, notFound } from '../../util/errors';
import { PLAN_INFO } from '../../constants';
import { audit, parse } from '../services';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'video/mp4', 'video/webm'];
const MAX: Record<string, number> = { image: 8_000_000, application: 10_000_000, audio: 20_000_000, video: 80_000_000 };

/** Comprueba la firma real del archivo (no basta con la extensión). */
function sniff(data: Uint8Array | string): string | null {
  if (typeof data === 'string') { const m = /^data:([^;]+);base64,/.exec(data); return m ? m[1] : null; }
  const b = data;
  const hex = (n: number) => Array.from(b.slice(0, n), (x) => x.toString(16).padStart(2, '0')).join('');
  if (hex(3) === 'ffd8ff') return 'image/jpeg';
  if (hex(8) === '89504e470d0a1a0a') return 'image/png';
  if (hex(4) === '47494638') return 'image/gif';
  if (hex(4) === '52494646' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (hex(4) === '25504446') return 'application/pdf';
  if (String.fromCharCode(...b.slice(4, 8)) === 'ftyp') return 'video/mp4';
  if (hex(4) === '1a45dfa3') return 'video/webm';
  if (hex(3) === '494433' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return null;
}

export const miscRoutes = [
  r.get('/health', 'public', async (ctx) => ({ ok: true, service: 'kinko-api', version: '1.0.0', db: ctx.db.kind, ai: ctx.p.ai.available, time: ctx.p.now().toISOString() })),
  r.get('/plans', 'public', async () => PLAN_INFO),
  r.get('/config/public', 'public', async (ctx) => ({ demoMode: ctx.p.config.demoMode, aiAvailable: ctx.p.ai.available, iceServers: ctx.p.config.iceServers, minorConsentAge: ctx.p.config.minorConsentAge, crisisLines: ['024', '112', '900202010'] })),
  r.post('/media', 'user', async (ctx) => {
    const f = ctx.req.file;
    if (!f) throw badRequest('No se ha recibido ningún archivo');
    const real = sniff(f.data);
    if (!real || !ALLOWED.includes(real)) throw badRequest('Tipo de archivo no permitido');
    if (f.size > (MAX[real.split('/')[0]] || 5_000_000)) throw badRequest('Archivo demasiado grande');
    const saved = await ctx.p.storage.save({ ...f, mime: real });
    const doc = await ctx.db.col('media').insert({ ownerId: ctx.user!.id, name: f.name.slice(0, 120), mime: real, size: saved.size, url: saved.url, key: saved.key, visibility: String(ctx.query.visibility || 'private') });
    await audit(ctx, 'media.upload', 'media', doc._id, null, { mime: real, size: saved.size });
    return { id: doc._id, url: saved.url, mime: real, name: doc.name, size: saved.size };
  }, { upload: true }),
  r.post('/payments/subscribe', 'user', async (ctx) => {
    const b = parse(z.object({ plan: z.enum(['plus', 'family', 'pro_solo', 'pro_plus', 'free']), period: z.enum(['month', 'year']).default('month') }), ctx.body);
    const prices: Record<string, [number, number]> = { plus: [799, 5999], family: [1199, 9999], pro_solo: [3900, 42000], pro_plus: [6900, 74400], free: [0, 0] };
    const allowed: Record<string, string[]> = { patient: ['plus', 'free'], parent: ['family', 'free'], professional: ['pro_solo', 'pro_plus'] };
    if (!(allowed[ctx.user!.role] || []).includes(b.plan)) throw badRequest('Ese plan no está disponible para tu perfil');
    const amount = prices[b.plan][b.period === 'year' ? 1 : 0];
    const pay = amount ? await ctx.p.payments.checkout({ amountCents: amount, currency: 'eur', description: `Kinkō ${PLAN_INFO[b.plan as keyof typeof PLAN_INFO].name} (${b.period === 'year' ? 'anual' : 'mensual'})`, metadata: { userId: ctx.user!.id, plan: b.plan }, successUrl: `${ctx.p.config.publicUrl}/#/ajustes?suscrito=1`, cancelUrl: `${ctx.p.config.publicUrl}/#/ajustes` }) : { mode: 'simulated' as const, id: 'free' };
    if (pay.mode === 'simulated') await ctx.db.col('users').updateById(ctx.user!.id, { $set: { plan: b.plan, planPeriod: b.period, planSince: ctx.p.now().toISOString() } });
    await audit(ctx, 'billing.subscribe', 'user', ctx.user!.id, null, { plan: b.plan, period: b.period, mode: pay.mode });
    return { payment: pay, plan: pay.mode === 'simulated' ? b.plan : ctx.user!.plan };
  }),
  r.get('/media/:id', 'user', async (ctx) => {
    const m = await ctx.db.col('media').findById(ctx.params.id);
    if (!m || (m.visibility !== 'public' && m.ownerId !== ctx.user!.id)) throw notFound();
    return m;
  }),
];
