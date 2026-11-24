export function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
export function slugify(s: string): string { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
export function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
export function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
export const round1 = (x: number) => Math.round(x * 10) / 10;
export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
