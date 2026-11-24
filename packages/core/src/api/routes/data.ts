import { z } from 'zod';
import { r, RATE } from '../router';
import type { Ctx } from '../context';
import { badRequest, notFound } from '../../util/errors';
import { addDays, ageBand, ageFrom, dayKey } from '../../util/dates';
import { randomCode, randomToken } from '../../util/ids';
import { mean, round1 } from '../../util/text';
import { rng } from '../../util/rng';
import { AGE_BANDS, PROVINCES } from '../../constants';
import { aggregate, laplace, type InsightRow } from '../../engine/insights';
import { PASSIONS } from '../../engine/passions';
import { audit, parse } from '../services';

const DIMENSIONS = ['ageBand', 'gender', 'province'] as const;
const METRICS = ['phq9', 'gad7', 'who5', 'kinko', 'mood', 'sleepHours', 'stress', 'adherence', 'moderatePlus'] as const;
export const INSIGHTS_CATALOG = {
  dimensions: { ageBand: `Tramo de edad (${AGE_BANDS.join(', ')})`, gender: 'Género declarado', province: 'Provincia (nunca municipio)' },
  metrics: { phq9: 'PHQ-9 medio (0-27, síntomas depresivos)', gad7: 'GAD-7 medio (0-21, ansiedad)', who5: 'WHO-5 medio (0-100, bienestar)', kinko: 'Puntuación Kinkō media (0-100)', mood: 'Ánimo medio en check-ins (1-10)', sleepHours: 'Horas de sueño medias', stress: 'Estrés medio (1-10)', adherence: 'Proporción de días con check-in (0-1)', moderatePlus: 'Proporción con PHQ-9 o GAD-7 ≥ 10' },
  privacy: 'Solo usuarios con consentimiento explícito de investigación. Grupos con menos de k personas se suprimen; las medias llevan ruido de Laplace (privacidad diferencial); los tamaños se redondean a la decena; nunca se exponen identificadores, fechas exactas ni municipios.',
};

/** Dataset sintético reproducible para el sandbox (no contiene personas reales). */
let SYNTH: InsightRow[] | null = null;
function synthetic(): InsightRow[] {
  if (SYNTH) return SYNTH;
  const g = rng(20270101);
  const provs = ['Bizkaia', 'Gipuzkoa', 'Álava', 'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Navarra', 'Cantabria', 'Asturias'];
  SYNTH = Array.from({ length: 2400 }, () => {
    const band = g.pick(AGE_BANDS);
    const youth = band === '14-17' || band === '18-24' ? 1.5 : band === '25-34' ? 1 : 0;
    const gender = g.chance(0.52) ? 'mujer' : g.chance(0.94) ? 'hombre' : 'no_binario';
    const fem = gender === 'mujer' ? 1.2 : 0;
    const phq9 = Math.max(0, Math.min(27, Math.round(g.normal(6 + youth + fem, 4.5))));
    const gad7 = Math.max(0, Math.min(21, Math.round(g.normal(5 + youth + fem, 4))));
    const who5 = Math.max(0, Math.min(100, Math.round(g.normal(62 - phq9 * 1.4, 12))));
    const months = Array.from({ length: 12 }, (_, i) => Math.max(0, Math.min(100, Math.round(g.normal(64 - phq9 * 1.1 + Math.sin(i / 2) * 3, 8)))));
    return {
      ageBand: band, gender, province: g.pick(provs), phq9, gad7, who5, kinko: months[11], months, mood: Math.max(1, Math.min(10, round1(g.normal(7 - phq9 / 6, 1.2)))),
      sleepHours: Math.max(3, Math.min(10, round1(g.normal(7.1 - youth * 0.3, 0.9)))), stress: Math.max(1, Math.min(10, round1(g.normal(4.5 + gad7 / 5, 1.3)))),
      adherence: Math.max(0, Math.min(1, round1(g.normal(0.55, 0.2)))), moderatePlus: phq9 >= 10 || gad7 >= 10 ? 1 : 0, passions: g.pickN(PASSIONS.map((p) => p.key), g.int(1, 3)),
    };
  });
  return SYNTH;
}

/** Filas anónimas a partir de usuarios reales que consienten investigación (sin identificadores). */
async function liveRows(ctx: Ctx, filter: Record<string, any> = {}): Promise<InsightRow[]> {
  const { db, p } = ctx; const now = p.now();
  const users = await db.col('users').find({ role: 'patient', status: 'active', ...filter });
  const from30 = dayKey(addDays(now, -30)); const from90 = addDays(now, -90).toISOString();
  const rows: InsightRow[] = [];
  for (const u of users) {
    const [as, cs, pas] = await Promise.all([db.col('assessments').find({ userId: u._id, completedAt: { $gte: from90 } }, { sort: { completedAt: -1 } }), db.col('checkins').find({ userId: u._id, date: { $gte: from30 } }), db.col('passionProfiles').findOne({ userId: u._id })]);
    const last = (id: string) => as.find((a) => a.instrumentId === id)?.score;
    const avg = (k: string) => { const v = cs.map((c) => c[k]).filter((x) => typeof x === 'number'); return v.length ? mean(v) : undefined; };
    const phq9 = last('phq9'), gad7 = last('gad7');
    rows.push({
      ageBand: ageBand(ageFrom(u.profile?.birthDate, now)), gender: u.profile?.gender || null, province: u.profile?.province || null, org: u.organization?.id || null, dept: u.organization?.department || null,
      phq9, gad7, who5: last('who5'), cbi: last('cbi'), kinko: u.kinko?.overall ?? undefined, mood: avg('mood'), sleepHours: avg('sleepHours'), stress: avg('stress'), adherence: cs.length / 30,
      moderatePlus: phq9 != null || gad7 != null ? ((phq9 ?? 0) >= 10 || (gad7 ?? 0) >= 10 ? 1 : 0) : undefined, burnout: last('cbi') != null ? (last('cbi')! >= 50 ? 1 : 0) : undefined,
      passions: (pas?.interests || []).filter((i: any) => i.importance >= 4).map((i: any) => i.key),
    });
  }
  return rows;
}

const QuerySchema = z.object({
  groupBy: z.string().default('ageBand').transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.enum(DIMENSIONS)).min(1).max(3)),
  metrics: z.string().default('phq9,gad7,who5,kinko').transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.enum(METRICS)).min(1).max(9)),
  province: z.string().optional(), ageBand: z.string().optional(), gender: z.string().optional(),
});

async function rowsFor(ctx: Ctx, sandbox: boolean) {
  return sandbox ? synthetic() : liveRows(ctx, { 'consents.research': true });
}
function filterRows(rows: InsightRow[], q: { province?: string; ageBand?: string; gender?: string }) {
  return rows.filter((x) => (!q.province || x.province === q.province) && (!q.ageBand || x.ageBand === q.ageBand) && (!q.gender || x.gender === q.gender));
}

async function wellbeing(ctx: Ctx, sandbox: boolean) {
  const q = parse(QuerySchema, ctx.query);
  const rows = filterRows(await rowsFor(ctx, sandbox), q);
  const res = aggregate(rows, q.groupBy, q.metrics, { k: ctx.p.config.kAnon, epsilon: ctx.p.config.dpEpsilon });
  return { dataset: sandbox ? 'sandbox (sintético)' : 'live', query: q, ...res, totalN: Math.round(res.totalN / 10) * 10 };
}
async function trends(ctx: Ctx, sandbox: boolean) {
  const q = parse(QuerySchema.extend({ metric: z.literal('kinko').default('kinko') }), ctx.query);
  const rows = filterRows(await rowsFor(ctx, sandbox), q);
  const now = ctx.p.now();
  const labels = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const series = labels.map((month, i) => {
    const flat = rows.filter((x) => Array.isArray(x.months)).map((x) => ({ ...x, value: x.months[i] }));
    const res = aggregate(flat, q.groupBy, ['value'], { k: ctx.p.config.kAnon, epsilon: ctx.p.config.dpEpsilon });
    return { month, groups: res.groups.map((g) => ({ key: g.key, n: g.n, kinko: g.metrics.value })) };
  });
  return { dataset: sandbox ? 'sandbox (sintético)' : 'live', metric: 'kinko', series, note: sandbox ? undefined : 'En live, la serie mensual se construye con las puntuaciones archivadas a final de mes.' };
}
async function passionsAgg(ctx: Ctx, sandbox: boolean) {
  const q = parse(QuerySchema, ctx.query);
  const rows = filterRows(await rowsFor(ctx, sandbox), q);
  const k = ctx.p.config.kAnon;
  const groups = new Map<string, InsightRow[]>();
  for (const x of rows) { const key = q.groupBy.map((g) => x[g]).join('|'); if (q.groupBy.some((g) => x[g] == null)) continue; if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(x); }
  const out: any[] = [];
  for (const [key, rs] of groups) {
    if (rs.length < k) continue;
    const counts: Record<string, number> = {};
    rs.forEach((x) => (x.passions || []).forEach((p: string) => (counts[p] = (counts[p] || 0) + 1)));
    const top = Object.entries(counts).filter(([, n]) => n >= k).map(([p, n]) => ({ passion: PASSIONS.find((x) => x.key === p)?.label || p, share: round1(Math.max(0, Math.min(1, n / rs.length + laplace(1 / (rs.length * ctx.p.config.dpEpsilon)))) * 100) })).sort((a, b) => b.share - a.share).slice(0, 8);
    out.push({ key: Object.fromEntries(q.groupBy.map((g, i) => [g, key.split('|')[i]])), n: Math.round(rs.length / 10) * 10, top });
  }
  return { dataset: sandbox ? 'sandbox (sintético)' : 'live', groups: out };
}
async function overview(ctx: Ctx, sandbox: boolean) {
  const rows = await rowsFor(ctx, sandbox);
  const res = aggregate(rows.map((x) => ({ ...x, all: 'total' })), ['all'], ['phq9', 'gad7', 'who5', 'kinko', 'moderatePlus', 'adherence'], { k: ctx.p.config.kAnon, epsilon: ctx.p.config.dpEpsilon });
  const bands = aggregate(rows, ['ageBand'], ['kinko'], { k: ctx.p.config.kAnon, epsilon: ctx.p.config.dpEpsilon });
  return { dataset: sandbox ? 'sandbox (sintético)' : 'live', population: Math.round(rows.length / 10) * 10, totals: res.groups[0]?.metrics || null, byAgeBand: bands.groups, privacy: { k: ctx.p.config.kAnon, epsilon: ctx.p.config.dpEpsilon }, generatedAt: ctx.p.now().toISOString() };
}
const isSandbox = (ctx: Ctx) => ctx.apiKey?.env !== 'live';
async function logApi(ctx: Ctx, what: string) { await audit(ctx, `insights.${what}`, 'insights', null, null, { query: ctx.query }); }

export const dataRoutes = [
  // ---------- API pública de Insights (clave API) ----------
  r.get('/v1/insights/catalog', 'apikey', async () => INSIGHTS_CATALOG),
  r.get('/v1/insights/overview', 'apikey', async (ctx) => { await logApi(ctx, 'overview'); return overview(ctx, isSandbox(ctx)); }),
  r.get('/v1/insights/wellbeing', 'apikey', async (ctx) => { await logApi(ctx, 'wellbeing'); return wellbeing(ctx, isSandbox(ctx)); }),
  r.get('/v1/insights/trends', 'apikey', async (ctx) => { await logApi(ctx, 'trends'); return trends(ctx, isSandbox(ctx)); }),
  r.get('/v1/insights/passions', 'apikey', async (ctx) => { await logApi(ctx, 'passions'); return passionsAgg(ctx, isSandbox(ctx)); }),

  // ---------- Portal de desarrolladores ----------
  r.get('/dev/keys', ['developer', 'admin'], async (ctx) => (await ctx.db.col('apiKeys').find({ ownerId: ctx.user!.id }, { sort: { createdAt: -1 } })).map(({ keyHash, ...k }) => k)),
  r.post('/dev/keys', ['developer', 'admin'], async (ctx) => {
    const b = parse(z.object({ name: z.string().min(2).max(60), env: z.enum(['sandbox', 'live']).default('sandbox'), purpose: z.string().max(600).default('') }), ctx.body);
    if (b.env === 'live' && b.purpose.length < 30) throw badRequest('Describe el propósito del uso de datos (mínimo 30 caracteres): lo revisa nuestro DPO.');
    const key = `kk_${b.env === 'live' ? 'live' : 'test'}_${randomToken(24)}`;
    const doc = await ctx.db.col('apiKeys').insert({ ownerId: ctx.user!.id, name: b.name, env: b.env, purpose: b.purpose, prefix: key.slice(0, 14), keyHash: await ctx.p.sha256(key), status: b.env === 'sandbox' ? 'approved' : 'pending', rateLimitPerMin: b.env === 'live' ? 120 : 60, revokedAt: null, lastUsedAt: null, scopes: ['insights:read'] });
    await audit(ctx, 'apikey.create', 'apiKey', doc._id, null, { env: b.env });
    const { keyHash, ...safe } = doc;
    return { ...safe, key, warning: 'Guarda esta clave ahora: no volverás a verla.' };
  }),
  r.del('/dev/keys/:id', ['developer', 'admin'], async (ctx) => {
    const n = await ctx.db.col('apiKeys').updateMany({ _id: ctx.params.id, ownerId: ctx.user!.id }, { $set: { revokedAt: ctx.p.now().toISOString() } });
    if (!n) throw notFound();
    await audit(ctx, 'apikey.revoke', 'apiKey', ctx.params.id);
  }),
  r.get('/dev/usage', ['developer', 'admin'], async (ctx) => {
    const usage = await ctx.db.col('apiUsage').find({ ownerId: ctx.user!.id, day: { $gte: dayKey(addDays(ctx.p.now(), -30)) } });
    const byDay: Record<string, number> = {}; const byEndpoint: Record<string, number> = {};
    usage.forEach((u) => { byDay[u.day] = (byDay[u.day] || 0) + u.count; byEndpoint[u.endpoint] = (byEndpoint[u.endpoint] || 0) + u.count; });
    return { byDay: Object.entries(byDay).sort().map(([day, count]) => ({ day, count })), byEndpoint: Object.entries(byEndpoint).map(([endpoint, count]) => ({ endpoint, count })), total: usage.reduce((a, u) => a + u.count, 0) };
  }),
  r.get('/dev/catalog', ['developer', 'admin'], async () => INSIGHTS_CATALOG),
  r.get('/dev/explore/:endpoint', ['developer', 'admin'], async (ctx) => {
    const sandbox = ctx.query.dataset !== 'live' || ctx.user!.role !== 'admin';
    const fns: Record<string, (c: Ctx, s: boolean) => Promise<any>> = { overview, wellbeing, trends, passions: passionsAgg };
    const fn = fns[ctx.params.endpoint];
    if (!fn) throw notFound('Endpoint desconocido');
    return fn(ctx, sandbox);
  }, { rate: RATE.apikey }),

  // ---------- Empresas (bienestar laboral agregado) ----------
  r.get('/org/dashboard', ['org_admin'], async (ctx) => {
    const org = await ctx.db.col('organizations').findOne({ adminIds: ctx.user!.id });
    if (!org) throw notFound('No administras ninguna organización');
    const rows = await liveRows(ctx, { 'organization.id': org._id });
    const k = ctx.p.config.kAnon;
    const total = aggregate(rows.map((x) => ({ ...x, all: 'total' })), ['all'], ['kinko', 'stress', 'sleepHours', 'adherence', 'burnout', 'moderatePlus'], { k, epsilon: ctx.p.config.dpEpsilon });
    const depts = aggregate(rows, ['dept'], ['kinko', 'stress', 'burnout'], { k, epsilon: ctx.p.config.dpEpsilon });
    return {
      organization: { id: org._id, name: org.name, joinCode: org.joinCode, employees: org.employees, enrolled: Math.round(rows.length / 5) * 5 },
      totals: total.groups[0]?.metrics || null, departments: depts.groups, suppressedDepartments: depts.suppressedGroups, k,
      guidance: total.groups[0]?.metrics?.burnout != null && (total.groups[0].metrics.burnout as number) > 0.3 ? 'Más del 30% de la plantilla participante muestra agotamiento moderado o alto. Revisa cargas, pausas y vacaciones pendientes; considera talleres grupales.' : 'Indicadores dentro de rangos habituales. Mantén pausas y comunicación abierta.',
      note: 'Nunca verás datos individuales: los grupos con menos de 10 personas se ocultan.',
    };
  }),
  r.post('/org/join-code', ['org_admin'], async (ctx) => {
    const org = await ctx.db.col('organizations').findOne({ adminIds: ctx.user!.id });
    if (!org) throw notFound();
    const code = randomCode(6);
    await ctx.db.col('organizations').updateById(org._id, { $set: { joinCode: code } });
    return { joinCode: code };
  }),
];
