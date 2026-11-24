import { mean } from '../util/text';
import { addDays, dayKey } from '../util/dates';

export interface DayFeature { date: string; mood?: number; sleepHours?: number; stress?: number; energy?: number; social?: number }
const DIMS: { key: keyof DayFeature; min: number; max: number; label: string }[] = [
  { key: 'mood', min: 1, max: 10, label: 'ánimo' }, { key: 'sleepHours', min: 3, max: 10, label: 'sueño' }, { key: 'stress', min: 1, max: 10, label: 'estrés' },
  { key: 'energy', min: 1, max: 10, label: 'energía' }, { key: 'social', min: 1, max: 5, label: 'contacto social' },
];

function windowVector(days: DayFeature[], end: Date, len = 14): { vec: number[]; adherence: number; slope: number } | null {
  const keys = new Set(Array.from({ length: len }, (_, i) => dayKey(addDays(end, -i - 1))));
  const win = days.filter((d) => keys.has(d.date));
  if (win.length < 5) return null;
  const vec = DIMS.map((dim) => {
    const v = win.map((d) => d[dim.key] as number).filter((x) => typeof x === 'number');
    return v.length ? (mean(v) - dim.min) / (dim.max - dim.min) : 0.5;
  });
  const moods = win.filter((d) => d.mood != null).sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.mood as number);
  const half = Math.floor(moods.length / 2);
  const slope = moods.length >= 4 ? (mean(moods.slice(half)) - mean(moods.slice(0, half))) / 9 : 0;
  return { vec: [...vec, win.length / len, slope], adherence: win.length / len, slope };
}

/**
 * Detección de patrones de recaída: compara las dos últimas semanas con las dos semanas que precedieron
 * a episodios anteriores (alertas graves o PHQ-9 ≥ 15). Devuelve coincidencias explicables.
 */
export function relapseSimilarity(days: DayFeature[], episodes: string[], now = new Date(), threshold = 0.86) {
  const current = windowVector(days, now);
  if (!current) return { current: null, matches: [] as any[] };
  const matches = episodes.map((ep) => {
    const before = windowVector(days, new Date(ep));
    if (!before) return null;
    const dist = Math.sqrt(current.vec.reduce((a, v, i) => a + (v - before.vec[i]) ** 2, 0) / current.vec.length);
    const similarity = Math.round((1 - dist) * 100) / 100;
    const notes = DIMS.map((dim, i) => ({ label: dim.label, now: current.vec[i], before: before.vec[i] }))
      .filter((x) => Math.abs(x.now - x.before) < 0.12).map((x) => x.label);
    return { episodeDate: ep, similarity, sharedSignals: notes, currentSlope: Math.round(current.slope * 100) / 100 };
  }).filter((m): m is NonNullable<typeof m> => !!m && m.similarity >= threshold && current.slope <= 0.02)
    .sort((a, b) => b.similarity - a.similarity);
  return { current: { adherence: current.adherence, slope: current.slope }, matches };
}
