import { mean } from '../util/text';

export interface InsightRow { ageBand: string | null; gender: string | null; province: string | null; org?: string | null; dept?: string | null; [metric: string]: any }
export interface Group { key: Record<string, string>; n: number; metrics: Record<string, number | null>; suppressed?: boolean }

/** Ruido de Laplace para privacidad diferencial. `rand` inyectable para tests deterministas. */
export function laplace(scale: number, rand: () => number = Math.random): number {
  const u = rand() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}
export const METRIC_BOUNDS: Record<string, [number, number]> = {
  phq9: [0, 27], gad7: [0, 21], who5: [0, 100], cbi: [0, 100], ucla3: [3, 9], kinko: [0, 100], mood: [1, 10], sleepHours: [0, 12], stress: [1, 10], adherence: [0, 1], moderatePlus: [0, 1],
};

/**
 * Agregación anónima: agrupa, suprime grupos con menos de k personas (k-anonimato) y añade ruido diferencial a las medias.
 * Solo se alimenta con usuarios que han dado consentimiento explícito para investigación.
 */
export function aggregate(rows: InsightRow[], groupBy: string[], metrics: string[], opts: { k?: number; epsilon?: number; rand?: () => number } = {}): { groups: Group[]; suppressedGroups: number; totalN: number; k: number; epsilon: number } {
  const k = opts.k ?? 10, epsilon = opts.epsilon ?? 1;
  const map = new Map<string, InsightRow[]>();
  for (const r of rows) {
    if (groupBy.some((g) => r[g] == null)) continue;
    const key = JSON.stringify(groupBy.map((g) => r[g]));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  const groups: Group[] = []; let suppressedGroups = 0;
  for (const [key, rs] of map) {
    const vals = JSON.parse(key) as string[];
    const keyObj = Object.fromEntries(groupBy.map((g, i) => [g, vals[i]]));
    if (rs.length < k) { suppressedGroups++; continue; }
    const m: Record<string, number | null> = {};
    for (const metric of metrics) {
      const v = rs.map((r) => r[metric]).filter((x): x is number => typeof x === 'number' && !isNaN(x));
      if (v.length < k) { m[metric] = null; continue; }
      const [lo, hi] = METRIC_BOUNDS[metric] || [0, 100];
      const sens = (hi - lo) / v.length;
      const noisy = mean(v) + laplace(sens / epsilon, opts.rand);
      m[metric] = Math.round(Math.max(lo, Math.min(hi, noisy)) * 100) / 100;
    }
    // El tamaño del grupo también se publica redondeado a la decena para no revelar altas/bajas individuales.
    groups.push({ key: keyObj, n: Math.round(rs.length / 10) * 10 || rs.length, metrics: m });
  }
  groups.sort((a, b) => JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)));
  return { groups, suppressedGroups, totalN: rows.length, k, epsilon };
}
