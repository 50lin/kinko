import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, ClipboardCheck, Clock, Lock, ShieldAlert, TrendingDown, TrendingUp, Minus, BookOpen } from 'lucide-react';
import { DOMAIN_LABEL } from '@kinko/core';
import { Badge, Button, Card, CardTitle, ErrorBox, Loading, PageHeader, Progress, cx } from '@/components/ui';
import { TrendChart } from '@/components/Charts';
import { useApi, useMut } from '@/lib/query';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrisis } from '@/components/Crisis';
import { fmtDate, fmtLongDate } from '@/lib/format';

const SEV_TONE: Record<string, any> = { minimal: 'brand', normal: 'brand', negative: 'brand', low: 'amber', mild: 'amber', moderate: 'amber', moderately_severe: 'rose', severe: 'rose', high: 'rose', positive: 'rose', acute: 'rose' };
const HIGHER_BETTER = ['who5', 'rses', 'sleep'];

export function Tests() {
  const { data, isLoading, error } = useApi<any[]>('/instruments');
  const due = useApi<any[]>('/measures/due');
  const plan = useAuth((s) => s.user?.plan);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const main = data!.filter((i) => !['phq2', 'gad2'].includes(i.id));
  return (
    <div>
      <PageHeader eyebrow="Tests" title="Conócete con precisión" subtitle="Cuestionarios validados científicamente y usados por profesionales. Los resultados orientan, no diagnostican." />
      {!!due.data?.filter((m) => m.due).length && <Card className="mb-6 border-l-4 border-violet-400"><div className="text-sm"><b>Pendientes de tu profesional:</b> {due.data!.filter((m) => m.due).map((m) => <Link key={m._id} to={`/app/tests/${m.instrumentId}`} className="ml-2 link">{m.name}</Link>)}</div></Card>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {main.map((i) => {
          const locked = i.tier === 'plus' && !['plus', 'family', 'care', 'org'].includes(plan || '');
          return (
            <Card key={i.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold">{i.short}</div>{i.validated && <Badge tone="brand"><BadgeCheck className="h-3.5 w-3.5" />Validado</Badge>}</div>
              <p className="mt-2 flex-1 text-sm muted">{i.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs muted"><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{i.minutes} min</span>{i.domains.map((d: string) => <Badge key={d}>{DOMAIN_LABEL[d as keyof typeof DOMAIN_LABEL]}</Badge>)}</div>
              {i.last && <div className="mt-3 rounded-2xl bg-ink-50 p-3 text-sm dark:bg-white/5">Último: <b>{i.last.score}</b>/{i.last.max} · {i.last.severityLabel} <span className="muted">· {fmtDate(i.last.completedAt)}</span></div>}
              <Button className="mt-4" variant={i.last ? 'outline' : 'primary'} to={`/app/tests/${i.id}`} icon={locked ? <Lock className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}>{i.last ? 'Repetir' : 'Empezar'}</Button>
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-xs muted">Fuentes: PHQ-9 y GAD-7 (Pfizer, dominio público, versiones validadas en español), WHO-5 (OMS), CBI (Kristensen 2005), Rosenberg (1965), UCLA-3 (Hughes 2004), ASQ (NIMH), AUDIT-C (OMS). Cribado de sueño: escala propia de Kinkō, no validada.</p>
    </div>
  );
}

export function TestRun() {
  const { id } = useParams(); const nav = useNavigate(); const crisis = useCrisis();
  const { data: inst, isLoading, error } = useApi<any>(`/instruments/${id}`);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [i, setI] = useState(-1);
  const visible = useMemo(() => (inst?.items || []).filter((it: any) => !it.showIfAnyYes || it.showIfAnyYes.some((k: string) => answers[k] === 1)), [inst, answers]);
  const submit = useMut((b: any) => post('/assessments', b), { invalidate: ['/instruments', '/me/dashboard', '/assessments', '/stats', '/measures'], onSuccess: (r: any) => { if (r.crisis) crisis.show(); nav(`/app/resultados/${r.assessment._id}`, { replace: true }); } });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (i < 0) return (
    <div className="mx-auto max-w-xl">
      <PageHeader back eyebrow={inst.short} title={inst.name} />
      <Card className="p-6">
        <p className="leading-relaxed">{inst.description}</p>
        <div className="mt-4 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">{inst.timeframe}</div>
        <div className="mt-4 flex gap-4 text-sm muted"><span>{inst.items.length} preguntas</span><span>~{inst.minutes} min</span></div>
        <p className="mt-4 text-xs muted">Fuente: {inst.source}</p>
        <Button size="lg" block className="mt-6" onClick={() => setI(0)}>Empezar</Button>
      </Card>
    </div>
  );
  const it = visible[i];
  const choose = (v: number) => {
    const next = { ...answers, [it.id]: v };
    setAnswers(next);
    const vis = inst.items.filter((x: any) => !x.showIfAnyYes || x.showIfAnyYes.some((k: string) => next[k] === 1));
    if (i < vis.length - 1) setTimeout(() => setI(i + 1), 180);
    else submit.mutate({ instrumentId: inst.id, answers: next, context: 'self' });
  };
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-4"><button onClick={() => setI(i - 1)} className="rounded-full p-2 hover:bg-ink-100 dark:hover:bg-white/5"><ArrowLeft className="h-5 w-5" /></button><Progress value={((i + 1) / visible.length) * 100} className="flex-1" /><span className="text-sm muted">{i + 1}/{visible.length}</span></div>
      <Card className="p-6 animate-fade" key={it.id}>
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-300">{inst.short}</div>
        <h2 className="mt-3 font-display text-2xl leading-snug">{it.text}</h2>
        <div className="mt-6 space-y-2">
          {it.options.map((o: any) => (
            <button key={o.value} disabled={submit.isPending} onClick={() => choose(o.value)} className={cx('flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition', answers[it.id] === o.value ? 'border-brand-500 bg-brand-50 font-semibold dark:bg-brand-500/10' : 'border-ink-200 hover:border-brand-300 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/5')}>
              {o.label}{answers[it.id] === o.value && <ArrowRight className="h-4 w-4 text-brand-500" />}
            </button>
          ))}
        </div>
        {submit.isPending && <p className="mt-4 text-sm muted">Calculando…</p>}
      </Card>
      {inst.id === 'asq' && <p className="mt-4 text-center text-xs muted">Si ahora mismo estás en peligro, llama al 024 o al 112.</p>}
    </div>
  );
}

export function TestResult() {
  const { id } = useParams();
  const { data: a, isLoading, error } = useApi<any>(`/assessments/${id}`);
  const hist = useApi<any[]>(a ? `/assessments?instrumentId=${a.instrumentId}&limit=30` : null);
  const crisis = useCrisis();
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const pct = Math.round((a.score / a.max) * 100);
  const hb = HIGHER_BETTER.includes(a.instrumentId);
  const severe = ['severe', 'moderately_severe', 'positive', 'acute', 'high'].includes(a.severity) && !hb;
  const series = (hist.data || []).slice().reverse().map((x) => ({ date: x.completedAt.slice(0, 10), score: x.score }));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader back="/app/tests" eyebrow={a.instrument.short} title="Tu resultado" subtitle={fmtLongDate(a.completedAt)} />
      <Card className="p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative grid h-40 w-40 shrink-0 place-items-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90"><circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-ink-100 dark:stroke-white/10" /><circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 327} 327`} className={cx(SEV_TONE[a.severity] === 'rose' ? 'stroke-rose-500' : SEV_TONE[a.severity] === 'amber' ? 'stroke-amber-500' : 'stroke-brand-500')} /></svg>
            <div className="text-center"><div className="font-display text-4xl">{a.score}</div><div className="text-xs muted">de {a.max}</div></div>
          </div>
          <div className="flex-1">
            <Badge tone={SEV_TONE[a.severity]}>{a.severityLabel}</Badge>
            <p className="mt-3 text-lg leading-relaxed">{a.interpretation}</p>
            {a.change && <div className={cx('mt-3 flex items-center gap-2 text-sm font-medium', a.change === 'better' ? 'text-brand-600' : a.change === 'worse' ? 'text-rose-600' : 'muted')}>{a.change === 'better' ? <TrendingUp className="h-4 w-4" /> : a.change === 'worse' ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}{a.change === 'better' ? 'Mejora fiable' : a.change === 'worse' ? 'Empeoramiento fiable' : 'Sin cambio significativo'} respecto a la vez anterior ({a.previousScore})</div>}
            {a.subscores && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(a.subscores).map(([k, v]) => <Badge key={k}>{k}: {String(v)}</Badge>)}</div>}
          </div>
        </div>
      </Card>
      {(a.flags?.includes('asq_acute') || a.flags?.includes('phq9_item9') || a.flags?.includes('asq_positive')) && (
        <Card className="border-l-4 border-rose-500 bg-rose-50/60 dark:bg-rose-500/10"><div className="flex gap-3"><ShieldAlert className="h-6 w-6 shrink-0 text-rose-600" /><div><div className="font-semibold">Tu seguridad es lo primero</div><p className="mt-1 text-sm">Has indicado pensamientos de hacerte daño. Hemos avisado a tu profesional si tienes uno en Kinkō. Puedes hablar ahora mismo con la Línea 024, gratuita y 24 horas.</p><Button className="mt-3" variant="danger" onClick={() => crisis.show()}>Ver ayuda inmediata</Button></div></div></Card>
      )}
      {series.length > 1 && <Card><CardTitle title="Tu evolución" /><TrendChart data={series} series={[{ key: 'score', label: a.instrument.short, color: '#339d87', area: true }]} yDomain={[0, a.max]} /></Card>}
      <div className="grid gap-4 sm:grid-cols-2">
        {severe ? <Card><div className="font-semibold">Habla con un profesional</div><p className="mt-1 text-sm muted">Con este resultado, te recomendamos valorarlo con un psicólogo/a. Te mostramos profesionales afines.</p><Button className="mt-3" to="/directorio">Buscar profesional</Button></Card>
          : <Card><div className="font-semibold">Sigue cuidándote</div><p className="mt-1 text-sm muted">Repite este test en 2-4 semanas para ver tu evolución.</p><Button className="mt-3" variant="soft" to="/app/rutas">Ver rutas</Button></Card>}
        <Card><div className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" />Para saber más</div><p className="mt-1 text-sm muted">Fuente: {a.instrument.source}. Este resultado es orientativo y no es un diagnóstico.</p><Button className="mt-3" variant="ghost" to="/app/kio?modo=sesion">Preparar mi sesión con Kio</Button></Card>
      </div>
    </div>
  );
}
