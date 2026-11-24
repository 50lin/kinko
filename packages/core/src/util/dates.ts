export const TZ = 'Europe/Madrid';
export function dayKey(d: Date | string = new Date(), tz = TZ): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('sv-SE', { timeZone: tz });
}
export function addDays(d: Date | string, n: number): Date { const x = new Date(d); x.setTime(x.getTime() + n * 86400000); return x; }
export function addMinutes(d: Date | string, n: number): Date { const x = new Date(d); x.setTime(x.getTime() + n * 60000); return x; }
export function daysBetween(a: Date | string, b: Date | string): number { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }
export function iso(d: Date | string | number = new Date()): string { return new Date(d).toISOString(); }
export function ageFrom(birthDate?: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}
export function ageBand(age: number | null): string | null {
  if (age == null) return null;
  if (age < 14) return null;
  if (age <= 17) return '14-17';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  if (age <= 64) return '55-64';
  return '65+';
}
/** Hora local (0-23) y día de la semana (0=domingo) en Madrid. */
export function localParts(d: Date, tz = TZ): { hour: number; minute: number; weekday: number; day: string } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday: wd, day: dayKey(d, tz) };
}
/** Convierte fecha local Madrid 'YYYY-MM-DD' + 'HH:MM' a Date UTC. */
export function madridToUtc(day: string, hhmm: string, tz = TZ): Date {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const p = localParts(guess, tz);
  const diff = (p.hour * 60 + p.minute) - (h * 60 + mi);
  let adj = diff;
  if (adj > 720) adj -= 1440;
  if (adj < -720) adj += 1440;
  return new Date(guess.getTime() - adj * 60000);
}
