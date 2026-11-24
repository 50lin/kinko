import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Brain, CalendarClock, ChevronDown, ClipboardList, FileSignature, History, Lock, MessageCircle, Plus, RefreshCw, Save, Sparkles, Trash2, Target, Eye, Siren, PhoneCall, ShieldCheck } from 'lucide-react';
import { CARE_SCOPE_LABEL, DOMAINS, DOMAIN_COLOR, DOMAIN_LABEL, INSTRUMENT_BY_ID } from '@kinko/core';
import { Avatar, Badge, Button, Card, CardTitle, Confirm, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Segmented, Select, Tabs, Textarea, cx } from '@/components/ui';
import { DomainBars, Ring, TrendChart } from '@/components/Charts';
import { Icon } from '@/components/Icon';
import { useApi, useMut, toast } from '@/lib/query';
import { post, patch, put, del, mode } from '@/lib/api';
import { fmtDate, fmtDateTime, num } from '@/lib/format';
import { TRIAGE, SEV_TONE } from './Pro';

type Tab = 'resumen' | 'linea' | 'tests' | 'diario' | 'cuerpo' | 'pasiones' | 'kio' | 'patrones' | 'historia' | 'plan';
const NEED: Partial<Record<Tab, string>> = { linea: 'checkins', tests: 'assessments', diario: 'journal_shared', cuerpo: 'biometrics', pasiones: 'passions', kio: 'companion_summaries', patrones: 'checkins', plan: 'plan' };

export function PatientDetail() {
  const { id } = useParams(); const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'resumen');
  const { data: p, isLoading, error } = useApi<any>(`/pro/patients/${id}`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const t = TRIAGE[p.triage];
  const allowed = (tb: Tab) => !NEED[tb] || (p.status === 'active' && p.scopes.includes(NEED[tb]!));
  return (
    <div className="space-y-6">
      <PageHeader back="/pro/pacientes" title={<span className="flex items-center gap-3"><Avatar user={p.patient} size={48} />{p.patient.firstName} {p.patient.lastName}</span>} subtitle={[p.patient.age && `${p.patient.age} años`, p.profile.gender, p.profile.province, `en seguimiento desde ${fmtDate(p.since)}`].filter(Boolean).join(' · ')}
        actions={<><Badge tone={t.tone}><span className={cx('h-2 w-2 rounded-full', t.dot)} />{t.label}</Badge>{p.hasGuardian && <Badge tone="violet">Menor con familia vinculada</Badge>}<Button size="sm" variant="soft" to="/mensajes" icon={<MessageCircle className="h-4 w-4" />}>Mensaje</Button></>} />
      {p.status === 'pending' && <Card className="bg-amber-50 text-sm dark:bg-amber-500/10">Invitación pendiente: el paciente aún no ha aceptado ni elegido qué compartir.</Card>}
      <Tabs value={tab} onChange={setTab} items={([['resumen', 'Resumen'], ['linea', 'Línea de vida'], ['tests', 'Tests'], ['diario', 'Diario'], ['cuerpo', 'Biometría'], ['pasiones', 'Pasiones'], ['kio', 'Resúmenes Kio'], ['patrones', 'Patrones'], ['historia', 'Historia clínica'], ['plan', 'Plan']] as [Tab, string][]).map(([k, l]) => ({ id: k, label: allowed(k) ? l : <span className="flex items-center gap-1 opacity-50"><Lock className="h-3 w-3" />{l}</span> }))} />
      {!allowed(tab) ? <Card className="flex items-center gap-3"><Lock className="h-5 w-5 muted" /><p className="text-sm">El paciente no ha autorizado <b>{CARE_SCOPE_LABEL[NEED[tab] as keyof typeof CARE_SCOPE_LABEL]}</b>. Puedes comentarlo en sesión; él/ella decide desde «Mi equipo».</p></Card> : <>
        {tab === 'resumen' && <Summary p={p} id={id!} />}
        {tab === 'linea' && <Timeline id={id!} />}
        {tab === 'tests' && <Tests id={id!} />}
        {tab === 'diario' && <JournalTab id={id!} />}
        {tab === 'cuerpo' && <Bio id={id!} />}
        {tab === 'pasiones' && <PassionsTab id={id!} />}
        {tab === 'kio' && <KioTab id={id!} />}
        {tab === 'patrones' && <Patterns id={id!} />}
        {tab === 'historia' && <Records id={id!} />}
        {tab === 'plan' && <PlanEditor id={id!} />}
      </>}
      <p className="flex items-center gap-1.5 text-xs muted"><ShieldCheck className="h-3.5 w-3.5" />Cada consulta a estos datos queda registrada en el log de auditoría (RGPD art. 32).</p>
    </div>
  );
}

function Summary({ p, id }: { p: any; id: string }) {
  const can = p.status === 'active' && p.scopes.includes('checkins');
  const pre = useApi<any>(can ? `/pro/patients/${id}/presession` : null);
  const contact = useMut(() => post(`/pro/patients/${id}/crisis-contact`), { success: 'Notificación enviada al paciente' });
  const test = useMut(() => post(`/pro/patients/${id}/alert-test`), { invalidate: ['/pro', '/alerts'], success: 'Alerta de prueba creada' });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-6">
        <Card><div className="flex items-center gap-5"><Ring value={p.kinko?.overall ?? null} size={96} stroke={9} label="Kinkō" /><div className="flex-1"><div className="text-sm muted">Tendencia semanal</div><div className={cx('font-display text-3xl', (p.kinko?.trend ?? 0) < 0 ? 'text-rose-600' : 'text-brand-600')}>{p.kinko?.trend != null ? `${p.kinko.trend > 0 ? '+' : ''}${p.kinko.trend}` : '—'}</div><div className="text-xs muted">{p.lastCheckin ? `Último check-in ${fmtDate(p.lastCheckin)}` : 'Sin check-ins'}</div></div></div>
          {p.kinko && <div className="mt-5"><DomainBars domains={p.kinko.domains} /></div>}</Card>
        <Card><CardTitle title="Últimos tests" />{!Object.keys(p.latest).length ? <p className="text-sm muted">Sin tests compartidos.</p> : <div className="space-y-2">{Object.entries(p.latest).map(([k, v]: any) => <div key={k} className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{INSTRUMENT_BY_ID[k]?.short}</span><span className="flex items-center gap-2"><b>{v.score}</b>/{v.max}<Badge tone={v.flags?.length ? 'rose' : v.change === 'worse' ? 'amber' : 'ink'}>{v.severityLabel}</Badge>{v.change === 'worse' && <span className="text-xs text-rose-600">empeora</span>}{v.change === 'better' && <span className="text-xs text-brand-600">mejora</span>}</span></div>)}</div>}</Card>
        <Card><CardTitle title="Acciones" /><div className="flex flex-wrap gap-2"><Button size="sm" variant="soft" icon={<PhoneCall className="h-4 w-4" />} onClick={() => contact.mutate(undefined)}>Pedir que contacte</Button><Button size="sm" variant="ghost" to="/pro/agenda">Agenda</Button>{mode.demo && <Button size="sm" variant="ghost" icon={<Siren className="h-4 w-4" />} onClick={() => test.mutate(undefined)}>Alerta de prueba</Button>}</div>
          <div className="mt-4 text-xs muted">Comparte: {p.scopes.map((s: string) => CARE_SCOPE_LABEL[s as keyof typeof CARE_SCOPE_LABEL]).join(', ') || 'nada'}{p.relation?.consent?.historyFrom ? ` · desde ${fmtDate(p.relation.consent.historyFrom)}` : ''}</div>
        </Card>
      </div>
      <Card className="bg-gradient-to-br from-violet-50/70 to-transparent dark:from-violet-500/5">
        <CardTitle title="Resumen pre-sesión" icon={<Sparkles className="h-5 w-5 text-violet-500" />} subtitle={pre.data ? `Desde ${fmtDate(pre.data.since)} · generado por ${pre.data.source}` : 'Lo que ha pasado desde la última sesión'} action={can && <Button size="sm" variant="ghost" onClick={() => pre.refetch()} icon={<RefreshCw className="h-4 w-4" />} />} />
        {!can ? <p className="text-sm muted">Requiere permiso de check-ins.</p> : pre.isLoading ? <Loading label="Preparando resumen…" /> : pre.error ? <ErrorBox error={pre.error} /> : <>
          <p className="whitespace-pre-line leading-relaxed">{pre.data.narrative}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Mini label="Check-ins" value={pre.data.facts.checkins} />
            <Mini label="Medias" value={`Ánimo ${num(pre.data.facts.medias.animo, 1)} · Estrés ${num(pre.data.facts.medias.estres, 1)} · Sueño ${num(pre.data.facts.medias.sueno_horas, 1)} h`} />
            <Mini label="Emociones" value={pre.data.facts.emociones_frecuentes.join(', ') || '—'} />
            <Mini label="Tareas completadas" value={pre.data.facts.tareas_completadas} />
          </div>
          {pre.data.facts.resumenes_kio?.length > 0 && <div className="mt-4"><div className="label mb-1">Lo que el paciente quiso compartir de Kio</div>{pre.data.facts.resumenes_kio.map((s: string, i: number) => <p key={i} className="mt-1 whitespace-pre-line rounded-2xl bg-white/70 p-3 text-sm dark:bg-white/5">{s}</p>)}</div>}
          <p className="mt-4 text-xs muted">Generado automáticamente a partir de datos estructurados. No es una valoración clínica.</p>
        </>}
      </Card>
    </div>
  );
}
const Mini = ({ label, value }: { label: string; value: any }) => <div className="rounded-2xl bg-white/70 p-3 dark:bg-white/5"><div className="text-[11px] font-semibold uppercase tracking-wider muted">{label}</div><div className="mt-0.5 text-sm">{value}</div></div>;

function Timeline({ id }: { id: string }) {
  const [period, setPeriod] = useState<'30' | '90' | '180' | 'all'>('90');
  const [sel, setSel] = useState<string[]>(['animo', 'calma', 'sueno']);
  const { data: d, isLoading, error } = useApi<any>(`/pro/patients/${id}/timeline?period=${period}`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const refs = [...d.sessions.filter((s: any) => s.status === 'completed').map((s: any) => ({ x: s.date.slice(0, 10), label: 'Sesión', color: '#4b9fd5' })), ...d.alerts.filter((a: any) => ['high', 'critical'].includes(a.severity)).map((a: any) => ({ x: a.date.slice(0, 10), label: '⚠', color: '#d9637d' }))];
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle title="Línea de vida" subtitle="Dimensiones diarias (0-100) con sesiones (azul) y alertas graves (rojo)" action={<Segmented value={period} onChange={setPeriod} options={[{ id: '30', label: '30 d' }, { id: '90', label: '90 d' }, { id: '180', label: '6 m' }, { id: 'all', label: 'Todo' }]} />} />
        <div className="mb-3 flex flex-wrap gap-1.5">{DOMAINS.map((k) => <button key={k} onClick={() => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k])} className={cx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs', sel.includes(k) ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-ink-100 dark:bg-white/5')}><span className="h-2 w-2 rounded-full" style={{ background: DOMAIN_COLOR[k] }} />{DOMAIN_LABEL[k]}</button>)}</div>
        <TrendChart data={d.series} height={320} refs={refs} series={[{ key: 'overall', label: 'Kinkō', color: '#1f2a28', dashed: true }, ...sel.map((k) => ({ key: k, label: DOMAIN_LABEL[k as keyof typeof DOMAIN_LABEL], color: DOMAIN_COLOR[k as keyof typeof DOMAIN_COLOR] }))]} />
        {d.consentFrom && <p className="mt-2 text-xs muted">El paciente comparte datos desde {fmtDate(d.consentFrom)}.</p>}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardTitle title="Puntos ciegos" icon={<Eye className="h-5 w-5 text-amber-500" />} subtitle="Días en que dijo estar bien, pero el estrés, la ansiedad o el sueño indicaban otra cosa." />
          {!d.blindSpots.length ? <p className="text-sm muted">No se detectan.</p> : <div className="space-y-1.5">{d.blindSpots.slice(-10).reverse().map((b: any) => <div key={b.date} className="flex justify-between text-sm"><span>{fmtDate(b.date)}</span><span className="muted">ánimo {b.mood} · estrés {b.stress ?? '—'} · ansiedad {b.anxiety ?? '—'} · sueño {b.sleepHours ?? '—'} h</span></div>)}</div>}
        </Card>
        <Card><CardTitle title="Hitos" />
          <div className="max-h-72 space-y-2 overflow-y-auto">{[...d.assessments.map((a: any) => ({ date: a.date, t: `${INSTRUMENT_BY_ID[a.instrumentId]?.short}: ${a.score} (${a.severityLabel})`, tone: a.change === 'worse' ? 'rose' : 'ink' })), ...d.alerts.map((a: any) => ({ date: a.date, t: `Alerta ${a.type} (${a.severity})`, tone: SEV_TONE[a.severity] })), ...d.notes.map((n: any) => ({ date: n.date, t: `Nota: ${n.title}`, tone: 'violet' }))].sort((a, b) => b.date.localeCompare(a.date)).map((e, i) => <div key={i} className="flex items-center gap-3 text-sm"><span className="w-20 shrink-0 text-xs muted">{fmtDate(e.date)}</span><Badge tone={e.tone}>{e.t}</Badge></div>)}</div>
        </Card>
      </div>
    </div>
  );
}

function Tests({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any[]>(`/pro/patients/${id}/assessments`);
  const measures = useApi<any[]>(`/pro/patients/${id}/measures`);
  const [open, setOpen] = useState<string | null>(null);
  const [m, setM] = useState({ instrumentId: 'phq9', frequency: 'biweekly' });
  const add = useMut(() => post(`/pro/patients/${id}/measures`, m), { invalidate: [`/pro/patients/${id}/measures`], success: 'Medición programada: el paciente recibirá un aviso' });
  const rm = useMut((mid: string) => del(`/pro/measures/${mid}`), { invalidate: [`/pro/patients/${id}/measures`] });
  const series = useMemo(() => { const by: Record<string, any[]> = {}; (data || []).forEach((a) => (by[a.instrumentId] ||= []).push({ date: a.completedAt.slice(0, 10), score: a.score })); Object.values(by).forEach((x) => x.reverse()); return by; }, [data]);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <Card><CardTitle title="Medición programada (ROM)" subtitle="Seguimiento rutinario de resultados: el paciente recibe el cuestionario en su app." icon={<CalendarClock className="h-5 w-5 text-brand-500" />} />
        <div className="flex flex-wrap items-end gap-2"><Select label="Cuestionario" value={m.instrumentId} onChange={(e) => setM({ ...m, instrumentId: e.target.value })}>{Object.values(INSTRUMENT_BY_ID).map((i) => <option key={i.id} value={i.id}>{i.short}</option>)}</Select><Select label="Frecuencia" value={m.frequency} onChange={(e) => setM({ ...m, frequency: e.target.value })}><option value="once">Una vez</option><option value="weekly">Semanal</option><option value="biweekly">Cada 2 semanas</option><option value="monthly">Mensual</option></Select><Button loading={add.isPending} onClick={() => add.mutate(undefined)} icon={<Plus className="h-4 w-4" />}>Programar</Button></div>
        <div className="mt-4 flex flex-wrap gap-2">{(measures.data || []).map((x) => <Badge key={x._id} tone="violet">{INSTRUMENT_BY_ID[x.instrumentId]?.short} · {x.frequency} · próximo {fmtDate(x.nextDueAt)}<button onClick={() => rm.mutate(x._id)} className="ml-1"><Trash2 className="h-3 w-3" /></button></Badge>)}</div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">{Object.entries(series).filter(([, xs]) => xs.length > 1).map(([k, xs]) => { const inst = INSTRUMENT_BY_ID[k]; return <Card key={k}><CardTitle title={inst?.short} subtitle={`RCI ±${inst?.rci ?? '—'} puntos`} /><TrendChart data={xs} series={[{ key: 'score', label: inst?.short || k, color: '#8b7bd8', area: true }]} yDomain={['auto', 'auto']} height={180} /></Card>; })}</div>
      <Card className="p-0">{(data || []).map((a) => (
        <div key={a._id} className="border-b border-ink-100 last:border-0 dark:border-white/5">
          <button onClick={() => setOpen(open === a._id ? null : a._id)} className="flex w-full items-center gap-3 p-4 text-left"><span className="w-24 text-xs muted">{fmtDate(a.completedAt)}</span><span className="flex-1 font-medium">{a.instrument.short}</span><b>{a.score}</b><Badge tone={a.flags?.length ? 'rose' : 'ink'}>{a.severityLabel}</Badge>{a.change && <Badge tone={a.change === 'worse' ? 'rose' : a.change === 'better' ? 'brand' : 'ink'}>{a.change === 'worse' ? 'Empeora' : a.change === 'better' ? 'Mejora' : 'Estable'}</Badge>}<ChevronDown className={cx('h-4 w-4 transition', open === a._id && 'rotate-180')} /></button>
          {open === a._id && <div className="space-y-1.5 px-4 pb-4 text-sm">{a.instrument.items?.map((it: any) => { const v = a.answers[it.id]; if (v === undefined) return null; const opt = it.options.find((o: any) => o.value === v); return <div key={it.id} className={cx('flex justify-between gap-4 rounded-xl px-3 py-1.5', ((it.id === 'q9' && a.instrumentId === 'phq9' && v > 0) || (a.instrumentId === 'asq' && v === 1)) && 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200')}><span>{it.text}</span><span className="shrink-0 font-medium">{opt?.label ?? v}</span></div>; })}<p className="pt-2 text-xs muted">{a.interpretation}</p></div>}
        </div>
      ))}{!data?.length && <p className="p-4 text-sm muted">Sin tests.</p>}</Card>
    </div>
  );
}

function JournalTab({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any[]>(`/pro/patients/${id}/journal`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.length) return <Empty title="Sin entradas compartidas" text="El paciente decide qué entradas del diario comparte contigo." />;
  return <div className="grid gap-4 md:grid-cols-2">{data.map((j) => <Card key={j._id}><div className="flex items-center justify-between"><div className="font-semibold">{j.title || 'Sin título'}</div><span className="text-xs muted">{fmtDateTime(j.createdAt)}</span></div><p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{j.content}</p><div className="mt-3 flex flex-wrap gap-1.5">{j.mood && <Badge>Ánimo {j.mood}/10</Badge>}{j.sentiment && <Badge tone={j.sentiment.label === 'negativo' ? 'rose' : 'brand'}>Tono {j.sentiment.label}</Badge>}{j.emotions?.map((e: string) => <Badge key={e}>{e}</Badge>)}</div></Card>)}</div>;
}

const BIO: Record<string, [string, string, string]> = { hrv_rmssd: ['HRV (RMSSD)', 'ms', '#8b7bd8'], heart_rate: ['Pulso', 'lpm', '#d9637d'], bp_systolic: ['Tensión sistólica', 'mmHg', '#e3a23c'], bp_diastolic: ['Tensión diastólica', 'mmHg', '#e3a23c'], weight: ['Peso', 'kg', '#4b9fd5'], steps: ['Pasos', '', '#339d87'], spo2: ['SpO₂', '%', '#4b9fd5'], sleep_minutes: ['Sueño', 'min', '#6b6fd8'], temperature: ['Temperatura', '°C', '#d9637d'] };
function Bio({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any>(`/pro/patients/${id}/biometrics`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const keys = Object.keys(data || {});
  if (!keys.length) return <Empty title="Sin biometría" text="El paciente no ha conectado dispositivos." />;
  return <div className="grid gap-6 lg:grid-cols-2">{keys.map((k) => <Card key={k}><CardTitle title={BIO[k]?.[0] || k} subtitle={`Último: ${num(data[k].at(-1)?.value, 1)} ${BIO[k]?.[1] || ''}`} /><TrendChart data={data[k]} series={[{ key: 'value', label: BIO[k]?.[0] || k, color: BIO[k]?.[2] || '#339d87' }]} yDomain={['auto', 'auto']} height={180} /></Card>)}</div>;
}

function PassionsTab({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any>(`/pro/patients/${id}/passions`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data.analysis.insights.length) return <Empty title="Sin mapa de pasiones" />;
  return (
    <div className="space-y-4"><Card><p>{data.analysis.summary}</p>{data.profile?.dreams && <p className="mt-2 text-sm muted">Sueño: «{data.profile.dreams}»</p>}</Card>
      <div className="grid gap-4 md:grid-cols-2">{data.analysis.insights.map((x: any) => { const raw = data.profile.interests.find((i: any) => i.key === x.key); return (
        <Card key={x.key} className={cx((x.atRisk || x.unsupported) && 'ring-2 ring-amber-300')}><div className="flex items-center gap-3"><Icon name={x.icon} className="h-6 w-6 text-brand-500" /><div className="flex-1 font-semibold">{x.label}</div><Badge>{x.strength}</Badge></div>
          <div className="mt-2 flex flex-wrap gap-1.5">{x.atRisk && <Badge tone="amber">Abandonada</Badge>}{x.unsupported && <Badge tone="rose">Sin apoyo{raw?.support?.family ? ` · familia ${raw.support.family}/5` : ''}</Badge>}</div>
          <p className="mt-2 text-sm muted">{x.message}</p>
          {raw?.blockers?.length > 0 && <p className="mt-2 text-xs">Frenos: {raw.blockers.join(', ')}</p>}
        </Card>); })}</div>
      <p className="text-xs muted">Sugerencia clínica: las pasiones importantes con poco apoyo familiar son un factor de riesgo y una palanca terapéutica (activación conductual, trabajo con la familia).</p>
    </div>
  );
}

function KioTab({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any[]>(`/pro/patients/${id}/companion-summaries`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.length) return <Empty icon={<Brain className="h-8 w-8" />} title="Sin resúmenes compartidos" text="El paciente puede compartir resúmenes (nunca la conversación completa) de sus charlas con Kio." />;
  return <div className="space-y-3">{data.map((t) => <Card key={t.id}><div className="flex items-center gap-2 text-xs muted"><Badge tone="violet">{t.mode}</Badge>{fmtDateTime(t.date)}{t.riskLevel && t.riskLevel !== 'none' && <Badge tone="rose">riesgo {t.riskLevel}</Badge>}</div><p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{t.summary}</p></Card>)}</div>;
}

function Patterns({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any>(`/pro/patients/${id}/patterns`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-4">
      <Card><CardTitle title="Detección de patrones de recaída" icon={<History className="h-5 w-5 text-brand-500" />} subtitle="Compara las últimas 3 semanas con las semanas previas a episodios pasados (PHQ-9 ≥ 15 o alertas graves)." />
        <div className="text-sm">Episodios previos: {data.episodes.length ? data.episodes.map((e: string) => fmtDate(e, { day: 'numeric', month: 'short', year: 'numeric' })).join(', ') : 'ninguno registrado'}</div>
        {data.current && <div className="mt-2 text-sm muted">Situación actual: adherencia {Math.round((data.current.adherence || 0) * 100)}% · pendiente del ánimo {num(data.current.slope, 2)}/día</div>}
      </Card>
      {!data.matches?.length ? <Card><p className="text-sm muted">No hay similitud relevante con episodios anteriores.</p></Card> : data.matches.map((m: any) => (
        <Card key={m.episodeDate} className={cx(m.similarity >= 0.86 && 'ring-2 ring-rose-300')}>
          <div className="flex items-center gap-4"><Ring value={Math.round(m.similarity * 100)} size={72} stroke={7} color={m.similarity >= 0.86 ? '#d9637d' : '#e3a23c'} label="similitud" /><div className="flex-1"><div className="font-semibold">Parecido a las semanas previas al episodio del {fmtDate(m.episodeDate, { day: 'numeric', month: 'long', year: 'numeric' })}</div><ul className="mt-2 space-y-1 text-sm">{m.sharedSignals.map((s: string) => <li key={s} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{s}</li>)}</ul></div></div>
        </Card>
      ))}
      <p className="text-xs muted">Herramienta de apoyo a la decisión clínica. No predice: señala semejanzas para que las valores.</p>
    </div>
  );
}

function Records({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any[]>(`/pro/patients/${id}/records`);
  const [edit, setEdit] = useState<any>(null); const [view, setView] = useState<any>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3"><p className="max-w-xl text-sm muted">Historia clínica cifrada (AES-256). Las notas no se sobrescriben: cada corrección guarda versión y motivo (Ley 41/2002).</p><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ type: 'note', title: `Sesión ${new Date().toLocaleDateString('es-ES')}`, soap: { s: '', o: '', a: '', p: '' } })}>Nueva nota</Button></div>
      {!data?.length ? <Empty icon={<FileSignature className="h-8 w-8" />} title="Sin registros" /> : <div className="space-y-2">{data.map((r) => (
        <Card key={r._id} className="flex items-center gap-3 !p-4"><ClipboardList className="h-5 w-5 text-brand-500" /><button onClick={() => setView(r)} className="min-w-0 flex-1 text-left"><div className="font-medium">{r.title}{r.diagnosisCode && <Badge tone="violet" className="ml-2">{r.diagnosisCode}</Badge>}{r.confidentiality === 'restricted' && <Badge tone="rose" className="ml-2"><Lock className="h-3 w-3" />Restringida</Badge>}</div><div className="text-xs muted">{fmtDateTime(r.sessionDate)} · {r.author?.firstName} {r.author?.lastName}{r.version > 1 ? ` · v${r.version}` : ''}</div></button>{r.mine && <Button size="sm" variant="ghost" onClick={() => setEdit({ ...r, reason: '' })}>Corregir</Button>}</Card>
      ))}</div>}
      {edit && <RecordEditor id={id} rec={edit} onClose={() => setEdit(null)} />}
      {view && <Modal open wide onClose={() => setView(null)} title={view.title}>
        <div className="text-xs muted">{fmtDateTime(view.sessionDate)} · {view.type}{view.diagnosisLabel && ` · ${view.diagnosisCode} ${view.diagnosisLabel}`}</div>
        {view.soap && <div className="mt-4 space-y-3">{(['s', 'o', 'a', 'p'] as const).map((k) => view.soap[k] && <div key={k}><div className="label">{({ s: 'Subjetivo', o: 'Objetivo', a: 'Análisis', p: 'Plan' })[k]}</div><p className="mt-1 whitespace-pre-line text-sm">{view.soap[k]}</p></div>)}</div>}
        {view.content && <p className="mt-4 whitespace-pre-line text-sm">{view.content}</p>}
        {view.versions?.length > 0 && <div className="mt-6 rounded-2xl bg-ink-50 p-3 text-xs dark:bg-white/5"><div className="font-semibold">Historial de versiones</div>{view.versions.map((v: any, i: number) => <div key={i} className="mt-1">v{v.version} · {fmtDateTime(v.at)}</div>)}<div className="mt-1">Último motivo: {view.amendReason}</div></div>}
      </Modal>}
    </div>
  );
}
function RecordEditor({ id, rec, onClose }: { id: string; rec: any; onClose: () => void }) {
  const [f, setF] = useState<any>({ type: rec.type, title: rec.title, soap: rec.soap || { s: '', o: '', a: '', p: '' }, content: rec.content || '', diagnosisCode: rec.diagnosisCode || '', diagnosisLabel: rec.diagnosisLabel || '', confidentiality: rec.confidentiality || 'normal', reason: rec.reason ?? '' });
  const save = useMut(() => (rec._id ? patch(`/pro/records/${rec._id}`, f) : post(`/pro/patients/${id}/records`, (({ reason, ...x }) => x)(f))), { invalidate: [`/pro/patients/${id}/records`], success: 'Guardado y firmado', onSuccess: onClose });
  return (
    <Modal open wide onClose={onClose} title={rec._id ? 'Corregir registro' : 'Nueva nota clínica'} footer={<Button loading={save.isPending} icon={<Save className="h-4 w-4" />} onClick={() => save.mutate(undefined)}>Guardar y firmar</Button>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Tipo" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="note">Nota de sesión (SOAP)</option><option value="history">Anamnesis</option><option value="diagnosis">Diagnóstico</option><option value="report">Informe</option></Select>
        <div className="sm:col-span-2"><Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      </div>
      {f.type === 'note' ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['s', 'o', 'a', 'p'] as const).map((k) => <Textarea key={k} label={({ s: 'S · Subjetivo', o: 'O · Objetivo', a: 'A · Análisis', p: 'P · Plan' })[k]} rows={4} value={f.soap[k]} onChange={(e) => setF({ ...f, soap: { ...f.soap, [k]: e.target.value } })} />)}</div> : <Textarea className="mt-3" label="Contenido" rows={8} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />}
      {f.type === 'diagnosis' && <div className="mt-3 grid gap-3 sm:grid-cols-3"><Input label="Código CIE-10 / DSM-5" value={f.diagnosisCode} onChange={(e) => setF({ ...f, diagnosisCode: e.target.value })} placeholder="F41.1" /><div className="sm:col-span-2"><Input label="Descripción" value={f.diagnosisLabel} onChange={(e) => setF({ ...f, diagnosisLabel: e.target.value })} /></div></div>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Confidencialidad" value={f.confidentiality} onChange={(e) => setF({ ...f, confidentiality: e.target.value })}><option value="normal">Visible para el equipo de la clínica</option><option value="restricted">Solo yo</option></Select>{rec._id && <Input label="Motivo de la corrección (obligatorio)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />}</div>
    </Modal>
  );
}

const TASK_TYPES: Record<string, string> = { exercise: 'Ejercicio', reading: 'Lectura', video: 'Vídeo', audio: 'Audio', measure: 'Medición', habit: 'Hábito', journal: 'Diario', passion: 'Pasión' };
function PlanEditor({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any>(`/pro/patients/${id}/plan`);
  const content = useApi<any[]>('/content');
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (!isLoading) setF(data ? { title: data.title, focus: data.focus || '', reviewDate: data.reviewDate?.slice(0, 10) || '', goals: data.goals, tasks: data.tasks } : { title: 'Plan de tratamiento', focus: '', reviewDate: '', goals: [], tasks: [] }); }, [isLoading, data]);
  const save = useMut(() => put(`/pro/patients/${id}/plan`, { ...f, reviewDate: f.reviewDate || undefined, goals: f.goals.map(({ id: gid, text, targetDate, status, progress }: any) => ({ id: gid, text, targetDate: targetDate || undefined, status, progress: Number(progress) })), tasks: f.tasks.map(({ completions, ...t }: any) => ({ ...t, contentSlug: t.contentSlug || undefined })) }), { invalidate: [`/pro/patients/${id}/plan`], success: 'Plan guardado y notificado al paciente' });
  if (isLoading || !f) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const setG = (i: number, k: string, v: any) => setF({ ...f, goals: f.goals.map((g: any, j: number) => (j === i ? { ...g, [k]: v } : g)) });
  const setT = (i: number, k: string, v: any) => setF({ ...f, tasks: f.tasks.map((t: any, j: number) => (j === i ? { ...t, [k]: v } : t)) });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <Card className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-2"><Input label="Título del plan" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div><Input label="Revisión" type="date" value={f.reviewDate} onChange={(e) => setF({ ...f, reviewDate: e.target.value })} /><div className="sm:col-span-3"><Textarea label="Foco terapéutico (lo verá el paciente)" rows={2} value={f.focus} onChange={(e) => setF({ ...f, focus: e.target.value })} /></div></Card>
      <Card><CardTitle title="Objetivos" icon={<Target className="h-5 w-5 text-brand-500" />} action={<Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setF({ ...f, goals: [...f.goals, { text: '', status: 'active', progress: 0 }] })}>Objetivo</Button>} />
        <div className="space-y-3">{f.goals.map((g: any, i: number) => <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_140px_120px_90px_40px]"><Input value={g.text} onChange={(e) => setG(i, 'text', e.target.value)} placeholder="Objetivo SMART" /><Input type="date" value={g.targetDate?.slice(0, 10) || ''} onChange={(e) => setG(i, 'targetDate', e.target.value)} /><select className="input" value={g.status} onChange={(e) => setG(i, 'status', e.target.value)}><option value="active">Activo</option><option value="achieved">Logrado</option><option value="paused">Pausa</option></select><Input type="number" min={0} max={100} value={g.progress} onChange={(e) => setG(i, 'progress', e.target.value)} /><button onClick={() => setF({ ...f, goals: f.goals.filter((_: any, j: number) => j !== i) })} className="p-2 muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>
      </Card>
      <Card><CardTitle title="Tareas entre sesiones" action={<Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setF({ ...f, tasks: [...f.tasks, { title: '', description: '', type: 'habit', frequency: 'daily', status: 'active' }] })}>Tarea</Button>} />
        <div className="space-y-4">{f.tasks.map((t: any, i: number) => { const week = (t.completions || []).filter((c: any) => c.date >= new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)).length; return (
          <div key={i} className={cx('rounded-2xl bg-ink-50 p-3 dark:bg-white/5', t.status === 'archived' && 'opacity-50')}>
            <div className="grid gap-2 sm:grid-cols-[1fr_130px_150px_40px]"><Input value={t.title} onChange={(e) => setT(i, 'title', e.target.value)} placeholder="Tarea" /><select className="input" value={t.type} onChange={(e) => setT(i, 'type', e.target.value)}>{Object.entries(TASK_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><select className="input" value={t.frequency} onChange={(e) => setT(i, 'frequency', e.target.value)}><option value="daily">Cada día</option><option value="3x_week">3 por semana</option><option value="weekly">Semanal</option><option value="once">Una vez</option></select><button onClick={() => setT(i, 'status', t.status === 'archived' ? 'active' : 'archived')} className="p-2 muted hover:text-rose-600" title="Archivar"><Trash2 className="h-4 w-4" /></button></div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_260px]"><Input value={t.description} onChange={(e) => setT(i, 'description', e.target.value)} placeholder="Instrucciones (opcional)" /><select className="input" value={t.contentSlug || ''} onChange={(e) => setT(i, 'contentSlug', e.target.value)}><option value="">Sin recurso</option>{(content.data || []).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}</select></div>
            {t.id && <div className="mt-2 text-xs muted">Hecha {week} veces esta semana{(t.completions || []).some((c: any) => c.date === today) ? ' · hoy ✓' : ''}</div>}
          </div>
        ); })}</div>
      </Card>
      <div className="flex justify-end"><Button size="lg" loading={save.isPending} icon={<Save className="h-4 w-4" />} onClick={() => save.mutate(undefined)}>Guardar plan</Button></div>
    </div>
  );
}
