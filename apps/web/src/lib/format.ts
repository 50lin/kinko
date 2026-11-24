const TZ = 'Europe/Madrid';
export const fmtDate = (d?: string | Date | null, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => (d ? new Date(d).toLocaleDateString('es-ES', { timeZone: TZ, ...o }) : '—');
export const fmtLongDate = (d?: string | Date | null) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDateTime = (d?: string | Date | null) => (d ? `${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(d)}` : '—');
export const money = (n?: number | null) => (n == null ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0 }));
export const num = (n?: number | null, d = 0) => (n == null || isNaN(n) ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export function ago(d?: string | null) {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.floor(s / 60)} min`; if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return fmtDate(d);
}
export const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
export const greeting = () => { const h = Number(new Date().toLocaleString('es-ES', { timeZone: TZ, hour: '2-digit', hour12: false })); return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; };
export const scoreTone = (v?: number | null) => (v == null ? 'text-ink-400' : v >= 65 ? 'text-brand-600 dark:text-brand-300' : v >= 45 ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-300');
export const fullName = (u?: { firstName?: string; lastName?: string } | null) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '');
