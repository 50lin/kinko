import { addDays, dayKey, localParts, madridToUtc } from '../util/dates';

export interface Availability { weekday: number; start: string; end: string }
export interface Slot { day: string; start: string; end: string; label: string }

/** Genera huecos libres en hora de Madrid a partir de la disponibilidad semanal del profesional. */
export function generateSlots(av: Availability[], sessionMinutes: number, busy: Record<string, any>[], now: Date, days = 14, bufferMinutes = 10): Slot[] {
  const out: Slot[] = [];
  const busyR = busy.map((b) => [new Date(b.startAt).getTime(), new Date(b.endAt).getTime()]);
  for (let i = 0; i < days; i++) {
    const date = addDays(now, i);
    const day = dayKey(date);
    const wd = localParts(madridToUtc(day, '12:00')).weekday;
    for (const a of av.filter((x) => x.weekday === wd)) {
      let t = madridToUtc(day, a.start).getTime();
      const end = madridToUtc(day, a.end).getTime();
      while (t + sessionMinutes * 60000 <= end) {
        const s = t, e = t + sessionMinutes * 60000;
        const free = !busyR.some(([bs, be]) => s < be && e > bs);
        if (free && s > now.getTime() + 2 * 3600000) {
          const lp = localParts(new Date(s));
          out.push({ day, start: new Date(s).toISOString(), end: new Date(e).toISOString(), label: `${String(lp.hour).padStart(2, '0')}:${String(lp.minute).padStart(2, '0')}` });
        }
        t = e + bufferMinutes * 60000;
      }
    }
  }
  return out;
}
