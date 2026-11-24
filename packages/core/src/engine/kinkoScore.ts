import { DOMAINS, type Domain } from '../constants';
import { clamp, mean } from '../util/text';
import { daysBetween } from '../util/dates';

export interface CheckinLike { date: string; mood?: number; energy?: number; stress?: number; anxiety?: number; sleepHours?: number; sleepQuality?: number; social?: number; activityMinutes?: number; focus?: number; }
export interface AssessmentLike { instrumentId: string; wellbeing: number; completedAt: string; score: number }
export interface MeasurementLike { type: string; value: number; measuredAt: string }
export interface PassionLike { interests?: { importance: number; frequency: number }[] }
export interface KinkoScore {
  overall: number | null; domains: Record<Domain, number | null>; trend: number | null; confidence: number; dataDays: number; updatedAt: string;
  sources: Partial<Record<Domain, string[]>>;
}

const scale10 = (v?: number) => (v == null ? null : clamp(((v - 1) / 9) * 100));
const scale5 = (v?: number) => (v == null ? null : clamp(((v - 1) / 4) * 100));
const inv = (v: number | null) => (v == null ? null : 100 - v);
function sleepHoursScore(h?: number): number | null {
  if (h == null) return null;
  if (h >= 7 && h <= 9) return 100;
  if (h < 7) return clamp(100 - (7 - h) * 22);
  return clamp(100 - (h - 9) * 18);
}
function avg(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number' && !isNaN(x));
  return v.length ? mean(v) : null;
}
function blend(parts: [number | null, number][]): number | null {
  const ok = parts.filter(([v]) => v != null) as [number, number][];
  if (!ok.length) return null;
  const w = ok.reduce((a, [, w]) => a + w, 0);
  return Math.round(ok.reduce((a, [v, wt]) => a + v * wt, 0) / w);
}

function domainsFromCheckins(cs: CheckinLike[]): Record<Domain, number | null> {
  return {
    animo: avg(cs.map((c) => scale10(c.mood))),
    calma: avg(cs.map((c) => avg([inv(scale10(c.stress)), inv(scale10(c.anxiety))]))),
    sueno: avg(cs.map((c) => avg([sleepHoursScore(c.sleepHours), scale5(c.sleepQuality)]))),
    energia: avg(cs.map((c) => scale10(c.energy))),
    vinculos: avg(cs.map((c) => scale5(c.social))),
    proposito: avg(cs.map((c) => scale10(c.focus))),
    actividad: avg(cs.map((c) => (c.activityMinutes == null ? null : clamp((c.activityMinutes / 45) * 100)))),
  };
}

/** Calcula la puntuación Kinkō (0-100) y sus siete dimensiones a partir de check-ins, tests, biometría y pasiones. */
export function computeKinkoScore(input: { checkins: CheckinLike[]; assessments?: AssessmentLike[]; measurements?: MeasurementLike[]; passions?: PassionLike | null; now?: Date }): KinkoScore {
  const now = input.now || new Date();
  const recent = input.checkins.filter((c) => daysBetween(c.date, now) <= 7 && daysBetween(c.date, now) >= 0);
  const previous = input.checkins.filter((c) => daysBetween(c.date, now) > 7 && daysBetween(c.date, now) <= 14);
  const cd = domainsFromCheckins(recent);
  const latest = (id: string) => (input.assessments || []).filter((a) => a.instrumentId === id && daysBetween(a.completedAt, now) <= 30)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const A = (id: string) => latest(id)?.wellbeing ?? null;
  const ms = (input.measurements || []).filter((m) => daysBetween(m.measuredAt, now) <= 7);
  const hrv = avg(ms.filter((m) => m.type === 'hrv_rmssd').map((m) => m.value));
  const hrvScore = hrv == null ? null : clamp(((hrv - 15) / 65) * 100);
  const steps = avg(ms.filter((m) => m.type === 'steps').map((m) => m.value));
  const stepsScore = steps == null ? null : clamp((steps / 10000) * 100);
  const sleepMin = avg(ms.filter((m) => m.type === 'sleep_minutes').map((m) => m.value));
  const passionScore = (() => {
    const ints = input.passions?.interests || [];
    if (!ints.length) return null;
    const imp = ints.reduce((a, i) => a + i.importance, 0);
    return imp ? clamp((ints.reduce((a, i) => a + i.importance * (i.frequency / 4), 0) / imp) * 100) : null;
  })();
  const domains: Record<Domain, number | null> = {
    animo: blend([[cd.animo, 0.6], [A('phq9'), 0.25], [A('who5'), 0.15]]),
    calma: blend([[cd.calma, 0.55], [A('gad7'), 0.25], [hrvScore, 0.2]]),
    sueno: blend([[cd.sueno, 0.6], [A('sleep'), 0.25], [sleepMin == null ? null : sleepHoursScore(sleepMin / 60), 0.15]]),
    energia: blend([[cd.energia, 0.65], [A('cbi'), 0.35]]),
    vinculos: blend([[cd.vinculos, 0.65], [A('ucla3'), 0.35]]),
    proposito: blend([[cd.proposito, 0.5], [passionScore, 0.3], [A('rses'), 0.2]]),
    actividad: blend([[cd.actividad, 0.6], [stepsScore, 0.4]]),
  };
  const sources: Partial<Record<Domain, string[]>> = {};
  for (const d of DOMAINS) sources[d] = [];
  if (recent.length) DOMAINS.forEach((d) => cd[d] != null && sources[d]!.push('check-ins'));
  if (hrvScore != null) sources.calma!.push('variabilidad cardiaca');
  if (stepsScore != null) sources.actividad!.push('pasos');
  if (passionScore != null) sources.proposito!.push('pasiones');
  const vals = DOMAINS.map((d) => domains[d]).filter((v): v is number => v != null);
  const overall = vals.length ? Math.round(mean(vals)) : null;
  const prevDomains = domainsFromCheckins(previous);
  const pv = DOMAINS.map((d) => prevDomains[d]).filter((v): v is number => v != null);
  const cv = DOMAINS.map((d) => cd[d]).filter((v): v is number => v != null);
  const trend = pv.length && cv.length ? Math.round(mean(cv) - mean(pv)) : null;
  return { overall, domains, trend, confidence: Math.min(1, recent.length / 5), dataDays: recent.length, updatedAt: now.toISOString(), sources };
}

/** Valores diarios por dimensión para gráficas. */
export function dailyDomainSeries(checkins: CheckinLike[]) {
  return [...checkins].sort((a, b) => a.date.localeCompare(b.date)).map((c) => {
    const d = domainsFromCheckins([c]);
    const vals = DOMAINS.map((k) => d[k]).filter((v): v is number => v != null);
    return { date: c.date, overall: vals.length ? Math.round(mean(vals)) : null, ...Object.fromEntries(DOMAINS.map((k) => [k, d[k] == null ? null : Math.round(d[k]!)])) } as { date: string; overall: number | null } & Record<Domain, number | null>;
  });
}

/** Correlaciones sencillas y explicables para el paciente (p. ej., «duermes más los días que haces deporte»). */
export function personalInsights(checkins: CheckinLike[]): string[] {
  const out: string[] = [];
  const cs = checkins.filter((c) => c.mood != null);
  if (cs.length < 7) return out;
  const split = <K extends keyof CheckinLike>(key: K, thr: number) => {
    const hi = cs.filter((c) => (c[key] as number) >= thr), lo = cs.filter((c) => c[key] != null && (c[key] as number) < thr);
    return { hi, lo };
  };
  const act = split('activityMinutes', 30);
  if (act.hi.length >= 3 && act.lo.length >= 3) {
    const d = (avg(act.hi.map((c) => c.mood)) || 0) - (avg(act.lo.map((c) => c.mood)) || 0);
    if (Math.abs(d) >= 0.7) out.push(d > 0 ? `Los días que te mueves 30 minutos o más, tu ánimo es ${d.toFixed(1)} puntos más alto.` : `Curiosamente, los días con más actividad tu ánimo es algo más bajo (${Math.abs(d).toFixed(1)} puntos). Puede valer la pena revisar qué tipo de actividad haces.`);
  }
  const sl = split('sleepHours', 7);
  if (sl.hi.length >= 3 && sl.lo.length >= 3) {
    const d = (avg(sl.hi.map((c) => c.stress)) || 0) - (avg(sl.lo.map((c) => c.stress)) || 0);
    if (d <= -0.7) out.push(`Cuando duermes 7 horas o más, tu estrés baja ${Math.abs(d).toFixed(1)} puntos de media.`);
  }
  const so = split('social', 4);
  if (so.hi.length >= 3 && so.lo.length >= 3) {
    const d = (avg(so.hi.map((c) => c.mood)) || 0) - (avg(so.lo.map((c) => c.mood)) || 0);
    if (d >= 0.7) out.push(`Los días con más contacto con otras personas, tu ánimo sube ${d.toFixed(1)} puntos.`);
  }
  return out;
}
