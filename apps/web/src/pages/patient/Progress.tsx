import { useMemo, useState } from 'react';
import { Award, Lightbulb, CalendarCheck, NotebookPen, ClipboardCheck, Route, LifeBuoy, Video, HeartPulse } from 'lucide-react';
import { DOMAINS, DOMAIN_LABEL, DOMAIN_COLOR, INSTRUMENT_BY_ID, type Domain } from '@kinko/core';
import { Badge, Card, CardTitle, Chip, ErrorBox, Loading, PageHeader, Segmented, Stat, Tabs, cx } from '@/components/ui';
import { TrendChart, DomainRadar, Bars } from '@/components/Charts';
import { useApi } from '@/lib/query';
import { useAuth } from '@/lib/auth';
import { fmtDate, num } from '@/lib/format';

const BIO: Record<string, { label: string; unit: string; color: string; domain?: [number, number] }> = {
  hrv_rmssd: { label: 'Variabilidad cardiaca (RMSSD)', unit: 'ms', color: '#8b7bd8' }, heart_rate: { label: 'Pulso en reposo', unit: 'lpm', color: '#d9637d' },
  bp_systolic: { label: 'Tensión sistólica', unit: 'mmHg', color: '#e3a23c' }, weight: { label: 'Peso', unit: 'kg', color: '#4b9fd5' }, steps: { label: 'Pasos', unit: 'pasos', color: '#339d87' }, spo2: { label: 'Saturación O₂', unit: '%', color: '#4b9fd5' }, sleep_minutes: { label: 'Sueño medido', unit: 'min', color: '#6b6fd8' },
};
const KIND_ICON: Record<string, any> = { test: ClipboardCheck, journal: NotebookPen, session: Video, path: Route, support: LifeBuoy };

export function Progress() {
  const [days, setDays] = useState<'30' | '90' | '180' | '365'>('90');
  const [sel, setSel] = useState<Domain[]>(['animo', 'calma', 'sueno']);
  const [tab, setTab] = useState<'kinko' | 'tests' | 'emociones' | 'cuerpo' | 'linea'>('kinko');
  const { data: s, isLoading, error } = useApi<any>(`/stats/overview?days=${days}`);
  const dash = useApi<any>('/me/dashboard');
  const tl = useApi<any[]>(tab === 'linea' ? '/timeline' : null);
  const badges = useApi<Record<string, string>>('/badges');
  const user = useAuth((x) => x.user);
  const weekly = useMemo(() => {
    if (!s) return [];
    const w: Record<string, any[]> = {};
    s.series.forEach((d: any) => { const dt = new Date(`${d.date}T12:00`); const k = new Date(dt.getTime() - ((dt.getDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); (w[k] ||= []).push(d); });
    return Object.entries(w).map(([date, xs]) => ({ date, ...Object.fromEntries(['overall', ...DOMAINS].map((k) => { const v = xs.map((x) => x[k]).filter((x) => x != null); return [k, v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null]; })) }));
  }, [s]);
  const twoWeeksAgo = useMemo(() => { if (!s?.series?.length) return undefined; const cut = s.series.filter((d: any) => d.date <= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)).slice(-7); if (!cut.length) return undefined; return Object.fromEntries(DOMAINS.map((k) => { const v = cut.map((x: any) => x[k]).filter((x: any) => x != null); return [k, v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : null]; })); }, [s]);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const chartData = Number(days) > 90 ? weekly : s.series;
  const g = user?.gamification || {};
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Progreso" title="Tu evolución" subtitle="Tus datos te pertenecen: descárgalos cuando quieras en Ajustes." actions={<Segmented value={days} onChange={setDays} options={[{ id: '30', label: '30 d' }, { id: '90', label: '3 m' }, { id: '180', label: '6 m' }, { id: '365', label: '1 año' }]} />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kinkō actual" value={dash.data?.kinko?.overall ?? '—'} hint={dash.data?.kinko?.trend != null ? `${dash.data.kinko.trend > 0 ? '+' : ''}${dash.data.kinko.trend} vs semana anterior` : undefined} icon={<HeartPulse className="h-5 w-5" />} />
        <Stat label="Check-ins" value={s.adherence.checkins} hint={`${Math.round(s.adherence.rate * 100)}% de los días`} icon={<CalendarCheck className="h-5 w-5" />} tone="sky" />
        <Stat label="Racha" value={`${g.streak || 0} días`} hint={`Mejor: ${g.bestStreak || g.streak || 0}`} icon={<Award className="h-5 w-5" />} tone="amber" />
        <Stat label="Diario" value={s.journalCount} hint="entradas en el periodo" icon={<NotebookPen className="h-5 w-5" />} tone="violet" />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'kinko', label: 'Dimensiones' }, { id: 'tests', label: 'Tests' }, { id: 'emociones', label: 'Emociones' }, { id: 'cuerpo', label: 'Cuerpo' }, { id: 'linea', label: 'Línea de vida' }]} />
      {tab === 'kinko' && <>
        <Card>
          <CardTitle title="Tus dimensiones en el tiempo" subtitle={Number(days) > 90 ? 'Medias semanales' : 'Valores diarios (0-100)'} />
          <div className="mb-3 flex flex-wrap gap-1.5">{DOMAINS.map((d) => <Chip key={d} active={sel.includes(d)} onClick={() => setSel(sel.includes(d) ? sel.filter((x) => x !== d) : [...sel, d])}><span className="h-2 w-2 rounded-full" style={{ background: DOMAIN_COLOR[d] }} />{DOMAIN_LABEL[d]}</Chip>)}</div>
          <TrendChart data={chartData} height={280} series={[{ key: 'overall', label: 'Kinkō', color: '#1f2a28', dashed: true }, ...sel.map((d) => ({ key: d, label: DOMAIN_LABEL[d], color: DOMAIN_COLOR[d] }))]} />
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardTitle title="Ahora vs hace dos semanas" /><DomainRadar domains={dash.data?.kinko?.domains || {}} compare={twoWeeksAgo} /></Card>
          <Card><CardTitle title="Lo que dicen tus datos" icon={<Lightbulb className="h-5 w-5 text-amber-500" />} subtitle="Asociaciones en tus propios registros. No implican causa." />
            {!s.insights.length ? <p className="text-sm muted">Con unas semanas más de check-ins verás aquí patrones personales.</p> : <ul className="space-y-3">{s.insights.map((t: string) => <li key={t} className="flex gap-3 rounded-2xl bg-amber-50/70 p-3 text-sm dark:bg-amber-500/10"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{t}</li>)}</ul>}
          </Card>
        </div>
      </>}
      {tab === 'tests' && <div className="grid gap-6 lg:grid-cols-2">
        {Object.entries(s.assessments).map(([id, xs]: any) => { const inst = INSTRUMENT_BY_ID[id]; if (!inst) return null; const last = xs[xs.length - 1]; const max = inst.id === 'who5' || inst.id === 'cbi' || inst.id === 'sleep' ? 100 : inst.id === 'phq9' ? 27 : inst.id === 'gad7' ? 21 : inst.id === 'rses' ? 30 : inst.id === 'ucla3' ? 9 : inst.id === 'auditc' ? 12 : 5; return (
          <Card key={id}><CardTitle title={inst.short} subtitle={`Último: ${last.score} · ${last.severityLabel} · ${fmtDate(last.date)}`} action={<Badge>{xs.length} veces</Badge>} />
            {xs.length > 1 ? <TrendChart data={xs.map((x: any) => ({ date: x.date.slice(0, 10), score: x.score }))} series={[{ key: 'score', label: inst.short, color: '#339d87', area: true }]} yDomain={[0, max]} height={180} /> : <p className="text-sm muted">Repite el test para ver tu evolución.</p>}
          </Card>); })}
        {!Object.keys(s.assessments).length && <Card><p className="text-sm muted">Aún no has hecho ningún test.</p></Card>}
      </div>}
      {tab === 'emociones' && <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardTitle title="Emociones más registradas" />{s.emotions.length ? <Bars data={s.emotions.slice(0, 10).map(([e, n]: any) => ({ e, n }))} x="e" y="n" height={260} formatX={(v) => v} /> : <p className="text-sm muted">Sin datos.</p>}</Card>
        <Card><CardTitle title="Tono de tu diario" subtitle="Análisis léxico automático, privado" />{s.journalSentiment.length ? <TrendChart data={s.journalSentiment} series={[{ key: 'score', label: 'Tono', color: '#8b7bd8', area: true }]} yDomain={[-1, 1]} height={260} refs={[{ y: 0 }]} /> : <p className="text-sm muted">Escribe en tu diario para verlo.</p>}</Card>
      </div>}
      {tab === 'cuerpo' && (Object.keys(s.biometrics).length ? <div className="grid gap-6 lg:grid-cols-2">{Object.entries(s.biometrics).filter(([k]) => BIO[k]).map(([k, xs]: any) => (
        <Card key={k}><CardTitle title={BIO[k].label} subtitle={`Último: ${num(xs[xs.length - 1]?.value, 1)} ${BIO[k].unit}`} /><TrendChart data={xs} series={[{ key: 'value', label: BIO[k].label, color: BIO[k].color }]} yDomain={['auto', 'auto']} height={180} /></Card>
      ))}</div> : <Card><p className="text-sm muted">Conecta un dispositivo o añade mediciones manuales en «Dispositivos».</p></Card>)}
      {tab === 'linea' && <Card>{tl.isLoading ? <Loading /> : !tl.data?.length ? <p className="text-sm muted">Tu línea de vida se irá llenando con tests, sesiones, rutas y diario.</p> : (
        <ol className="relative ml-3 border-l border-ink-200 dark:border-white/10">{tl.data.slice(0, 80).map((e: any) => { const I = KIND_ICON[e.kind] || ClipboardCheck; return <li key={`${e.kind}-${e.id}`} className="mb-5 ml-6"><span className={cx('absolute -left-3.5 grid h-7 w-7 place-items-center rounded-full ring-4 ring-[var(--color-ink-50)] dark:ring-night-950', e.kind === 'support' ? 'bg-rose-100 text-rose-600' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/20')}><I className="h-3.5 w-3.5" /></span><div className="text-sm font-medium">{e.title}</div><div className="text-xs muted">{fmtDate(e.date, { day: 'numeric', month: 'long', year: 'numeric' })}</div></li>; })}</ol>
      )}</Card>}
      <Card><CardTitle title="Logros" subtitle={`${g.points || 0} puntos`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(badges.data || {}).map(([k, label]) => { const has = (g.badges || []).includes(k); return <div key={k} className={cx('flex items-center gap-3 rounded-2xl p-3', has ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-ink-50 opacity-50 dark:bg-white/5')}><span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', has ? 'bg-amber-400 text-white' : 'bg-ink-200 text-ink-500 dark:bg-white/10')}><Award className="h-4 w-4" /></span><span className="text-xs font-medium">{label}</span></div>; })}</div>
      </Card>
    </div>
  );
}
