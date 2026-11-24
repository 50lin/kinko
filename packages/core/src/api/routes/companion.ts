import { z } from 'zod';
import { r, RATE } from '../router';
import type { Ctx } from '../context';
import { notFound, HttpError } from '../../util/errors';
import { addDays, dayKey } from '../../util/dates';
import { COMPANION_MODES, buildSystemPrompt, offlineReply, summarizeConversation, type CompanionMode } from '../../engine/companion';
import { crisisMessage, detectRisk, isUrgent, sanitizeAiOutput } from '../../engine/safety';
import { analyzePassions } from '../../engine/passions';
import { parse, raiseAlert, audit } from '../services';

const MODES = Object.keys(COMPANION_MODES) as [CompanionMode, ...CompanionMode[]];
const FREE_DAILY_LIMIT = 15;

async function context(ctx: Ctx) {
  const u = ctx.user!;
  const [prof, rels] = await Promise.all([ctx.db.col('passionProfiles').findOne({ userId: u.id }), ctx.db.col('careRelations').count({ patientId: u.id, status: 'active' })]);
  return {
    firstName: u.firstName, age: u.age, kinko: u.doc.kinko || null,
    passions: analyzePassions(prof?.interests || []).insights.slice(0, 3).map((x) => x.label), hasProfessional: rels > 0, useContext: u.doc.settings?.aiUseContext !== false,
  };
}

async function sendMessage(ctx: Ctx) {
  const u = ctx.user!; const { db, p } = ctx;
  const b = parse(z.object({ content: z.string().trim().min(1).max(4000) }), ctx.body);
  const thread = await db.col('companionThreads').findOne({ _id: ctx.params.id, userId: u.id });
  if (!thread) throw notFound('Conversación no encontrada');
  if (!['plus', 'family', 'care', 'org'].includes(u.plan)) {
    const today = await db.col('companionMessages').count({ userId: u.id, role: 'user', createdAt: { $gte: `${dayKey(p.now())}T00:00:00` } });
    if (today >= FREE_DAILY_LIMIT) throw new HttpError(402, 'limit', `Has usado los ${FREE_DAILY_LIMIT} mensajes gratuitos de hoy. Con Kinkō Plus, Kio no tiene límite.`);
  }
  const risk = detectRisk(b.content);
  await db.col('companionMessages').insert({ threadId: thread._id, userId: u.id, role: 'user', content: b.content, risk: risk.level });
  let reply: string; let source: 'ai' | 'offline' | 'safety' = 'offline';
  if (isUrgent(risk)) {
    reply = crisisMessage(u.isMinor); source = 'safety';
    await raiseAlert(ctx, u.id, { type: 'companion_risk', severity: risk.level === 'imminent' ? 'critical' : 'high', message: 'Señales de riesgo en la conversación con Kio. El contenido es privado; contacta con el paciente.', data: { categories: risk.categories } });
    await db.col('companionThreads').updateById(thread._id, { $set: { riskLevel: risk.level } });
  } else {
    const history = await db.col('companionMessages').find({ threadId: thread._id }, { sort: { createdAt: 1 } });
    const turn = history.filter((m) => m.role === 'user').length - 1;
    const cctx = await context(ctx);
    let ai: string | null = null;
    if (p.ai.available) {
      try {
        ai = await p.ai.complete({ system: buildSystemPrompt(thread.mode, cctx), messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content })), tier: ['plus', 'care', 'family', 'org'].includes(u.plan) ? 'main' : 'light', maxTokens: 600 });
      } catch (e: any) { p.log('warn', 'AI provider failed, using offline engine', { message: e?.message }); }
    }
    if (ai) { reply = sanitizeAiOutput(ai); source = 'ai'; const outRisk = detectRisk(ai); if (isUrgent(outRisk)) reply += '\n\nSi en algún momento sientes que no puedes más, la Línea 024 te atiende 24 horas.'; }
    else reply = offlineReply(thread.mode, b.content, cctx, Math.max(0, turn));
  }
  const msg = await db.col('companionMessages').insert({ threadId: thread._id, userId: u.id, role: 'assistant', content: reply, source });
  const title = thread.title === 'Nueva conversación' ? b.content.slice(0, 48) + (b.content.length > 48 ? '…' : '') : thread.title;
  await db.col('companionThreads').updateById(thread._id, { $set: { lastMessageAt: p.now().toISOString(), title }, $inc: { messageCount: 2 } });
  return { message: msg, crisis: isUrgent(risk) ? { level: risk.level } : null, source };
}

export const companionRoutes = [
  r.get('/companion/modes', 'public', async (ctx) => ({ modes: COMPANION_MODES, aiAvailable: ctx.p.ai.available, model: ctx.p.ai.available ? ctx.p.ai.model : 'motor sin conexión' })),
  r.get('/companion/threads', ['patient'], async (ctx) => ctx.db.col('companionThreads').find({ userId: ctx.user!.id }, { sort: { lastMessageAt: -1 }, limit: 50 })),
  r.post('/companion/threads', ['patient'], async (ctx) => {
    const b = parse(z.object({ mode: z.enum(MODES).default('organizar') }), ctx.body);
    const t = await ctx.db.col('companionThreads').insert({ userId: ctx.user!.id, mode: b.mode, title: 'Nueva conversación', lastMessageAt: ctx.p.now().toISOString(), messageCount: 1, riskLevel: 'none', summary: null, sharedSummary: false });
    await ctx.db.col('companionMessages').insert({ threadId: t._id, userId: ctx.user!.id, role: 'assistant', content: `Hola, ${ctx.user!.firstName}. ${COMPANION_MODES[b.mode].opener}`, source: 'offline' });
    return t;
  }),
  r.get('/companion/threads/:id', ['patient'], async (ctx) => {
    const t = await ctx.db.col('companionThreads').findOne({ _id: ctx.params.id, userId: ctx.user!.id });
    if (!t) throw notFound();
    return { thread: t, messages: await ctx.db.col('companionMessages').find({ threadId: t._id }, { sort: { createdAt: 1 } }) };
  }),
  r.post('/companion/threads/:id/messages', ['patient'], sendMessage, { rate: RATE.ai }),
  r.post('/companion/threads/:id/summary', ['patient'], async (ctx) => {
    const b = parse(z.object({ share: z.boolean().default(false) }), ctx.body);
    const t = await ctx.db.col('companionThreads').findOne({ _id: ctx.params.id, userId: ctx.user!.id });
    if (!t) throw notFound();
    const msgs = await ctx.db.col('companionMessages').find({ threadId: t._id }, { sort: { createdAt: 1 } });
    let summary = summarizeConversation(msgs as any).summary;
    if (ctx.p.ai.available) {
      try {
        const ai = await ctx.p.ai.complete({ tier: 'light', maxTokens: 300, system: 'Resume en español, en 4 viñetas, los temas, emociones y próximos pasos de esta conversación para su psicólogo/a. No cites frases literales ni datos identificativos. No diagnostiques.', messages: [{ role: 'user', content: msgs.map((m) => `${m.role === 'user' ? 'Paciente' : 'Kio'}: ${m.content}`).join('\n').slice(-12000) }] });
        if (ai) summary = ai;
      } catch { /* usa el resumen local */ }
    }
    await ctx.db.col('companionThreads').updateById(t._id, { $set: { summary, sharedSummary: b.share, summarizedAt: ctx.p.now().toISOString() } });
    if (b.share) await audit(ctx, 'companion.summary_shared', 'companionThread', t._id, ctx.user!.id);
    return { summary, shared: b.share };
  }),
  r.del('/companion/threads/:id', ['patient'], async (ctx) => {
    const t = await ctx.db.col('companionThreads').findOne({ _id: ctx.params.id, userId: ctx.user!.id });
    if (!t) throw notFound();
    await ctx.db.col('companionMessages').deleteMany({ threadId: t._id });
    await ctx.db.col('companionThreads').deleteOne({ _id: t._id });
  }),
  r.get('/companion/usage', ['patient'], async (ctx) => ({ today: await ctx.db.col('companionMessages').count({ userId: ctx.user!.id, role: 'user', createdAt: { $gte: `${dayKey(ctx.p.now())}T00:00:00` } }), limit: ['plus', 'family', 'care', 'org'].includes(ctx.user!.plan) ? null : FREE_DAILY_LIMIT, since: addDays(ctx.p.now(), -1).toISOString() })),
];
