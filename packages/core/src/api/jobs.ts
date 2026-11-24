import type { Db } from '../db/types';
import type { Ctx, Providers } from './context';
import { addDays, dayKey, localParts } from '../util/dates';
import { INSTRUMENT_BY_ID } from '../instruments';
import { relapseSimilarity } from '../engine/patterns';
import { notify, raiseAlert } from './services';

export function systemCtx(db: Db, p: Providers): Ctx {
  return { req: { method: 'JOB', path: '/jobs', query: {}, body: {}, headers: {}, cookies: {}, ip: 'system' }, params: {}, query: {}, body: {}, user: null, apiKey: null, db, p, setCookie() {}, clearCookie() {}, setHeader() {}, status() {} };
}

/** Tareas periódicas: recordatorios, cuestionarios programados, inactividad y patrones de recaída. Idempotentes. */
export async function runJobs(db: Db, p: Providers): Promise<Record<string, number>> {
  const ctx = systemCtx(db, p);
  const now = p.now(); const today = dayKey(now); const { hour } = localParts(now);
  const stats = { reminders: 0, measures: 0, inactivity: 0, appointments: 0, patterns: 0 };
  const patients = await db.col('users').find({ role: 'patient', status: 'active' });
  for (const u of patients) {
    if (u.settings?.reminders !== false && hour >= (u.settings?.reminderHour ?? 20) && u.jobs?.reminderDay !== today) {
      const done = await db.col('checkins').findOne({ userId: u._id, date: today });
      if (!done) { await notify(ctx, u._id, { type: 'reminder', title: '¿Cómo ha ido tu día?', body: 'Tu esfera te espera: 60 segundos de check-in.', link: '/app/checkin', priority: 'low' }); stats.reminders++; }
      await db.col('users').updateById(u._id, { $set: { 'jobs.reminderDay': today } });
    }
  }
  for (const m of await db.col('scheduledMeasures').find({ active: true, nextDueAt: { $lte: now.toISOString() } })) {
    if (m.notifiedFor === m.nextDueAt) continue;
    await notify(ctx, m.patientId, { type: 'measure', title: `Toca: ${INSTRUMENT_BY_ID[m.instrumentId]?.short}`, body: 'Tu profesional te ha pedido este cuestionario.', link: `/app/tests/${m.instrumentId}` });
    await db.col('scheduledMeasures').updateById(m._id, { $set: { notifiedFor: m.nextDueAt } });
    stats.measures++;
  }
  const rels = await db.col('careRelations').find({ status: 'active' });
  for (const rel of rels) {
    const last = await db.col('checkins').findOne({ userId: rel.patientId }, { sort: { date: -1 } });
    if (last && last.date < dayKey(addDays(now, -4)) && last.date >= dayKey(addDays(now, -30))) {
      await raiseAlert(ctx, rel.patientId, { type: 'missed_checkins', severity: 'low', message: `Sin check-ins desde el ${last.date}.` }); stats.inactivity++;
    }
    if (hour === 6 || p.config.env === 'test' || p.config.demoMode) {
      const cs = await db.col('checkins').find({ userId: rel.patientId, date: { $gte: dayKey(addDays(now, -400)) } });
      const sev = await db.col('assessments').find({ userId: rel.patientId, instrumentId: 'phq9', score: { $gte: 15 } });
      const episodes = sev.map((a) => a.completedAt.slice(0, 10)).filter((d) => d < dayKey(addDays(now, -30)));
      if (episodes.length) {
        const res = relapseSimilarity(cs as any, episodes, now);
        if (res.matches.length) {
          const m = res.matches[0];
          await raiseAlert(ctx, rel.patientId, { type: 'relapse_pattern', severity: 'medium', message: `Las dos últimas semanas se parecen en un ${Math.round(m.similarity * 100)}% a las semanas previas al episodio del ${m.episodeDate} (${m.sharedSignals.join(', ')}).`, data: m });
          stats.patterns++;
        }
      }
    }
  }
  for (const a of await db.col('appointments').find({ status: 'confirmed', startAt: { $gte: now.toISOString(), $lte: addDays(now, 1).toISOString() } })) {
    const key = new Date(a.startAt).getTime() - now.getTime() <= 3600000 ? 'h1' : 'h24';
    if ((a.reminders || []).includes(key)) continue;
    const when = new Date(a.startAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' });
    for (const uid of [a.patientId, a.professionalId]) await notify(ctx, uid, { type: 'appointment', title: key === 'h1' ? 'Tu sesión empieza en menos de una hora' : 'Recordatorio de sesión mañana', body: when, link: uid === a.patientId ? '/app/citas' : '/pro/agenda' });
    await db.col('appointments').updateById(a._id, { $push: { reminders: key } });
    stats.appointments++;
  }
  return stats;
}
