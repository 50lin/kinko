import { useMemo, useState } from 'react';
import { BarChart3, Briefcase, Code2, Copy, Database, FlaskConical, KeyRound, Lock, Play, Plus, RefreshCw, ShieldCheck, Trash2, Users, AlertTriangle, Flame, Moon } from 'lucide-react';
import { AGE_BANDS, PROVINCES } from '@kinko/core';
import { Badge, Button, Card, CardTitle, Chip, Confirm, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Stat, Tabs, Textarea, cx } from '@/components/ui';
import { Bars, TrendChart } from '@/components/Charts';
import { useApi, useMut, toast } from '@/lib/query';
import { get, post, del, API_BASE, mode } from '@/lib/api';
import { fmtDate, num } from '@/lib/format';

const base = () => (API_BASE || (mode.demo ? 'https://api.kinko.app' : location.origin)) + '/api';
const copy = (t: string) => { navigator.clipboard?.writeText(t); toast('Copiado'); };

export function DevKeys() {
  const keys = useApi<any[]>('/dev/keys');
  const usage = useApi<any>('/dev/usage');
  const [open, setOpen] = useState(false); const [created, setCreated] = useState<any>(null);
  const [f, setF] = useState({ name: 'Mi proyecto', env: 'sandbox', purpose: '' });
  const create = useMut(() => post('/dev/keys', f), { invalidate: ['/dev/keys'], onSuccess: (r: any) => { setCreated(r); setOpen(false); } });
  const revoke = useMut((id: string) => del(`/dev/keys/${id}`), { invalidate: ['/dev/keys'], success: 'Clave revocada' });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Kinkō Insights API" title="Claves y uso" subtitle="Datos de bienestar mental agregados y anónimos por edad, género y provincia. Nunca datos individuales." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Nueva clave</Button>} />
      <div className="grid gap-3 sm:grid-cols-3"><Stat label="Llamadas (30 días)" value={num(usage.data?.total)} icon={<BarChart3 className="h-5 w-5" />} /><Stat label="Claves activas" value={(keys.data || []).filter((k) => !k.revokedAt).length} icon={<KeyRound className="h-5 w-5" />} tone="violet" /><Stat label="Privacidad" value="k ≥ 10 · ε = 1" hint="k-anonimato y privacidad diferencial" icon={<ShieldCheck className="h-5 w-5" />} tone="sky" /></div>
      {created && <Card className="ring-2 ring-amber-300"><div className="flex items-start gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /><div className="min-w-0 flex-1"><div className="font-semibold">{created.warning}</div><code className="mt-2 block break-all rounded-xl bg-ink-900 p-3 text-sm text-emerald-300">{created.key}</code><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => copy(created.key)} icon={<Copy className="h-4 w-4" />}>Copiar</Button><Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Ya la he guardado</Button></div></div></div></Card>}
      <Card className="p-0"><table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5"><th className="p-3">Nombre</th><th>Entorno</th><th>Prefijo</th><th>Estado</th><th>Último uso</th><th className="pr-3" /></tr></thead><tbody>
        {(keys.data || []).map((k) => <tr key={k._id} className={cx('border-b border-ink-100 last:border-0 dark:border-white/5', k.revokedAt && 'opacity-40')}><td className="p-3 font-medium">{k.name}</td><td><Badge tone={k.env === 'live' ? 'violet' : 'ink'}>{k.env}</Badge></td><td><code>{k.prefix}…</code></td><td><Badge tone={k.revokedAt ? 'ink' : k.status === 'approved' ? 'brand' : k.status === 'pending' ? 'amber' : 'rose'}>{k.revokedAt ? 'revocada' : k.status === 'pending' ? 'en revisión DPO' : k.status}</Badge></td><td className="muted">{k.lastUsedAt ? fmtDate(k.lastUsedAt) : '—'}</td><td className="pr-3 text-right">{!k.revokedAt && <Confirm danger title="¿Revocar clave?" onConfirm={() => revoke.mutate(k._id)}>{(o) => <button onClick={o} className="p-1 muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</Confirm>}</td></tr>)}
      </tbody></table>{!keys.data?.length && <p className="p-4 text-sm muted">Sin claves. La demo incluye la clave sandbox <code>kk_test_demo_kinko2026</code>.</p>}</Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardTitle title="Llamadas por día" />{usage.data?.byDay?.length ? <Bars data={usage.data.byDay} x="day" y="count" /> : <p className="text-sm muted">Sin uso todavía. Prueba el Explorador.</p>}</Card>
        <Card><CardTitle title="Por endpoint" />{usage.data?.byEndpoint?.length ? <div className="space-y-2">{usage.data.byEndpoint.map((e: any) => <div key={e.endpoint} className="flex justify-between text-sm"><code>{e.endpoint}</code><b>{e.count}</b></div>)}</div> : <p className="text-sm muted">—</p>}</Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva clave API" footer={<Button loading={create.isPending} onClick={() => create.mutate(undefined)}>Crear</Button>}>
        <div className="space-y-3"><Input label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><Select label="Entorno" value={f.env} onChange={(e) => setF({ ...f, env: e.target.value })}><option value="sandbox">Sandbox (datos sintéticos, gratis)</option><option value="live">Live (datos reales anonimizados, requiere aprobación)</option></Select>{f.env === 'live' && <Textarea label="Propósito del tratamiento" hint="Lo revisa nuestro DPO. Indica institución, finalidad y base jurídica (p. ej. investigación científica, art. 89 RGPD)." rows={4} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />}</div>
      </Modal>
    </div>
  );
}

export function DevDocs() {
  const { data: cat } = useApi<any>('/dev/catalog');
  const eps = [
    ['GET', '/v1/insights/catalog', 'Dimensiones, métricas y garantías de privacidad disponibles.'],
    ['GET', '/v1/insights/overview', 'Población, medias globales (PHQ-9, GAD-7, WHO-5, Kinkō) y por tramo de edad.'],
    ['GET', '/v1/insights/wellbeing?groupBy=ageBand,gender&metrics=phq9,gad7,kinko&province=Bizkaia', 'Agregados por grupo. Los grupos con n < k se suprimen.'],
    ['GET', '/v1/insights/trends?groupBy=ageBand', 'Serie mensual de la puntuación Kinkō (12 meses).'],
    ['GET', '/v1/insights/passions?groupBy=ageBand', 'Pasiones más frecuentes por grupo (porcentajes con ruido).'],
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Documentación" title="Insights API v1" subtitle="REST + JSON. Autenticación con la cabecera x-api-key. Límite: 120 peticiones/minuto en sandbox." />
      <Card><CardTitle title="Primeros pasos" icon={<Code2 className="h-5 w-5 text-brand-500" />} />
        <pre className="overflow-x-auto rounded-2xl bg-ink-900 p-4 text-xs leading-relaxed text-emerald-200">{`curl -H "x-api-key: kk_test_demo_kinko2026" \\
  "${base()}/v1/insights/wellbeing?groupBy=ageBand&metrics=phq9,gad7,who5"`}</pre>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink-900 p-4 text-xs leading-relaxed text-sky-200">{`// JavaScript
const r = await fetch("${base()}/v1/insights/overview", { headers: { "x-api-key": process.env.KINKO_KEY } });
const { population, totals, byAgeBand, privacy } = await r.json();`}</pre>
      </Card>
      <Card className="p-0">{eps.map(([m, p, d]) => <div key={p} className="flex flex-col gap-1 border-b border-ink-100 p-4 last:border-0 sm:flex-row sm:items-center sm:gap-4 dark:border-white/5"><Badge tone="brand">{m}</Badge><code className="flex-1 break-all text-sm">{p}</code><span className="text-sm muted sm:w-80">{d}</span><button onClick={() => copy(`${base()}${p}`)} className="p-1 muted"><Copy className="h-4 w-4" /></button></div>)}</Card>
      {cat && <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardTitle title="Dimensiones" />{Object.entries(cat.dimensions).map(([k, v]: any) => <div key={k} className="flex gap-3 py-1 text-sm"><code className="w-24 shrink-0">{k}</code><span className="muted">{v}</span></div>)}</Card>
        <Card><CardTitle title="Métricas" />{Object.entries(cat.metrics).map(([k, v]: any) => <div key={k} className="flex gap-3 py-1 text-sm"><code className="w-28 shrink-0">{k}</code><span className="muted">{v}</span></div>)}</Card>
      </div>}
      <Card className="bg-brand-50/60 dark:bg-brand-500/5"><CardTitle title="Garantías legales y técnicas" icon={<Lock className="h-5 w-5 text-brand-500" />} />
        <ul className="space-y-2 text-sm">{[cat?.privacy, 'Base: consentimiento explícito de investigación (art. 9.2.a RGPD) revocable en cualquier momento; sin él, el usuario nunca entra en los agregados.', 'Datos anonimizados según el Dictamen 05/2014 del GT29: no singularizables, no vinculables, no inferibles. Fuera del ámbito del RGPD una vez agregados.', 'Acceso live solo tras revisión del DPO, contrato de uso de datos y prohibición de reidentificación.', 'Cada consulta queda auditada. Revocamos claves ante usos no declarados.'].filter(Boolean).map((t: any) => <li key={t} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{t}</li>)}</ul>
      </Card>
      <Card><CardTitle title="Precios" /><div className="grid gap-3 sm:grid-cols-3">{[['Sandbox', 'Gratis', 'Datos sintéticos realistas, 120 req/min'], ['Research', '290 €/mes', 'Universidades y ONG · datos live agregados · 10.000 req/día'], ['Enterprise', 'Desde 1.200 €/mes', 'Aseguradoras, administración, farmacéuticas (solo agregados) · informes a medida']].map(([t, p, d]) => <div key={t} className="rounded-2xl bg-ink-50 p-4 dark:bg-white/5"><div className="font-semibold">{t}</div><div className="font-display text-xl">{p}</div><p className="mt-1 text-xs muted">{d}</p></div>)}</div></Card>
    </div>
  );
}

const METRICS = ['phq9', 'gad7', 'who5', 'kinko', 'mood', 'sleepHours', 'stress', 'adherence', 'moderatePlus'];
const DIM_LABEL: Record<string, string> = { ageBand: 'Edad', gender: 'Género', province: 'Provincia' };
export function DevExplorer() {
  const [ep, setEp] = useState<'overview' | 'wellbeing' | 'trends' | 'passions'>('wellbeing');
  const [groupBy, setGroupBy] = useState<string[]>(['ageBand']);
  const [metrics, setMetrics] = useState<string[]>(['phq9', 'gad7', 'kinko']);
  const [flt, setFlt] = useState({ province: '', ageBand: '', gender: '' });
  const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false); const [view, setView] = useState<'tabla' | 'json'>('tabla');
  const qs = new URLSearchParams({ groupBy: groupBy.join(','), metrics: metrics.join(','), ...Object.fromEntries(Object.entries(flt).filter(([, v]) => v)) }).toString();
  const run = async () => { setBusy(true); try { setRes(await get(`/dev/explore/${ep}?${qs}`)); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const chart = useMemo(() => {
    if (!res) return null;
    if (ep === 'trends') { const keys = new Set<string>(); const data = res.series.map((s: any) => { const row: any = { month: s.month }; s.groups.forEach((g: any) => { const k = Object.values(g.key).join(' · '); keys.add(k); row[k] = g.kinko; }); return row; }); return { kind: 'trend', data, keys: [...keys] }; }
    return null;
  }, [res, ep]);
  const COLORS = ['#339d87', '#8b7bd8', '#e3a23c', '#d9637d', '#4b9fd5', '#6b6fd8', '#93a83c'];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Explorador" title="Prueba la API sin escribir código" subtitle="Consulta el dataset sandbox (sintético, 2.400 personas) con las mismas garantías que el live." />
      <Card className="space-y-4">
        <Tabs value={ep} onChange={setEp} items={[{ id: 'overview', label: 'overview' }, { id: 'wellbeing', label: 'wellbeing' }, { id: 'trends', label: 'trends' }, { id: 'passions', label: 'passions' }]} />
        {ep !== 'overview' && <div><div className="label mb-2">Agrupar por</div><div className="flex flex-wrap gap-1.5">{Object.entries(DIM_LABEL).map(([k, l]) => <Chip key={k} active={groupBy.includes(k)} onClick={() => setGroupBy(groupBy.includes(k) ? groupBy.filter((x) => x !== k) : [...groupBy, k].slice(0, 3))}>{l}</Chip>)}</div></div>}
        {ep === 'wellbeing' && <div><div className="label mb-2">Métricas</div><div className="flex flex-wrap gap-1.5">{METRICS.map((m) => <Chip key={m} active={metrics.includes(m)} onClick={() => setMetrics(metrics.includes(m) ? metrics.filter((x) => x !== m) : [...metrics, m])}>{m}</Chip>)}</div></div>}
        {ep !== 'overview' && <div className="grid gap-2 sm:grid-cols-3"><select className="input" value={flt.province} onChange={(e) => setFlt({ ...flt, province: e.target.value })}><option value="">Todas las provincias</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select><select className="input" value={flt.ageBand} onChange={(e) => setFlt({ ...flt, ageBand: e.target.value })}><option value="">Todas las edades</option>{AGE_BANDS.map((p) => <option key={p}>{p}</option>)}</select><select className="input" value={flt.gender} onChange={(e) => setFlt({ ...flt, gender: e.target.value })}><option value="">Todos los géneros</option><option value="mujer">Mujer</option><option value="hombre">Hombre</option><option value="no_binario">No binario</option></select></div>}
        <div className="flex flex-wrap items-center gap-3"><Button loading={busy} onClick={run} icon={<Play className="h-4 w-4" />}>Ejecutar</Button><code className="min-w-0 flex-1 truncate rounded-xl bg-ink-100 px-3 py-2 text-xs dark:bg-white/5">GET /v1/insights/{ep}{ep !== 'overview' ? `?${qs}` : ''}</code></div>
      </Card>
      {res && <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2"><Badge tone="violet"><Database className="h-3 w-3" />{res.dataset}</Badge>{res.totalN != null && <Badge>n ≈ {res.totalN}</Badge>}{res.suppressedGroups != null && <Badge tone="amber">{res.suppressedGroups} grupos suprimidos (n &lt; {res.k})</Badge>}<div className="ml-auto"><Tabs value={view} onChange={setView} items={[{ id: 'tabla', label: 'Tabla' }, { id: 'json', label: 'JSON' }]} /></div></div>
        {view === 'json' ? <pre className="max-h-[480px] overflow-auto rounded-2xl bg-ink-900 p-4 text-xs text-emerald-200">{JSON.stringify(res, null, 2)}</pre> : <>
          {chart?.kind === 'trend' && <TrendChart data={chart.data} xKey="month" formatX={(m) => new Date(`${m}-01`).toLocaleDateString('es-ES', { month: 'short' })} series={chart.keys.slice(0, 7).map((k, i) => ({ key: k, label: k, color: COLORS[i] }))} yDomain={['auto', 'auto']} height={300} />}
          {ep === 'overview' && <div className="grid gap-4 sm:grid-cols-3"><Stat label="Población" value={num(res.population)} icon={<Users className="h-5 w-5" />} />{Object.entries(res.totals || {}).slice(0, 5).map(([k, v]: any) => <Stat key={k} label={k} value={num(v, 2)} />)}</div>}
          {ep === 'overview' && res.byAgeBand && <div className="mt-4"><Bars data={res.byAgeBand.map((g: any) => ({ b: g.key.ageBand, v: g.metrics.kinko }))} x="b" y="v" formatX={(v) => v} /></div>}
          {ep === 'wellbeing' && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5">{groupBy.map((g) => <th key={g} className="p-2">{DIM_LABEL[g]}</th>)}<th>n</th>{metrics.map((m) => <th key={m} className="p-2 text-right">{m}</th>)}</tr></thead><tbody>{res.groups.map((g: any, i: number) => <tr key={i} className="border-b border-ink-100 last:border-0 dark:border-white/5">{groupBy.map((d) => <td key={d} className="p-2">{g.key[d]}</td>)}<td>{g.n}</td>{metrics.map((m) => <td key={m} className="p-2 text-right font-medium">{g.metrics[m] == null ? '—' : num(g.metrics[m], 2)}</td>)}</tr>)}</tbody></table></div>}
          {ep === 'passions' && <div className="grid gap-4 md:grid-cols-2">{res.groups.map((g: any, i: number) => <div key={i} className="rounded-2xl bg-ink-50 p-4 dark:bg-white/5"><div className="font-semibold">{Object.values(g.key).join(' · ')} <span className="text-xs muted">n≈{g.n}</span></div>{g.top.slice(0, 5).map((t: any) => <div key={t.passion} className="mt-2 flex items-center gap-2 text-sm"><span className="w-28">{t.passion}</span><div className="h-2 flex-1 rounded-full bg-ink-200 dark:bg-white/10"><div className="h-full rounded-full bg-brand-500" style={{ width: `${t.share}%` }} /></div><span className="w-12 text-right text-xs">{t.share}%</span></div>)}</div>)}</div>}
        </>}
      </Card>}
    </div>
  );
}

export function OrgDashboard() {
  const { data: d, isLoading, error, refetch } = useApi<any>('/org/dashboard');
  const regen = useMut(() => post('/org/join-code'), { success: (r: any) => `Nuevo código: ${r.joinCode}`, onSuccess: () => refetch() });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const t = d.totals || {};
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Bienestar de la plantilla" title={d.organization.name} subtitle={d.note} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Participación" value={`${d.organization.enrolled}/${d.organization.employees}`} hint={`${Math.round((d.organization.enrolled / d.organization.employees) * 100)}% de la plantilla`} icon={<Users className="h-5 w-5" />} />
        <Stat label="Kinkō medio" value={num(t.kinko, 0)} icon={<BarChart3 className="h-5 w-5" />} tone="sky" />
        <Stat label="Agotamiento (CBI ≥ 50)" value={t.burnout != null ? `${Math.round(t.burnout * 100)}%` : '—'} icon={<Flame className="h-5 w-5" />} tone="rose" />
        <Stat label="Sueño medio" value={t.sleepHours != null ? `${num(t.sleepHours, 1)} h` : '—'} icon={<Moon className="h-5 w-5" />} tone="violet" />
      </div>
      {d.guidance && <Card className="border-l-4 border-amber-400"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /><p className="text-sm">{d.guidance}</p></div></Card>}
      <Card><CardTitle title="Por departamento" subtitle={`Solo se muestran departamentos con ${d.k} o más participantes. ${d.suppressedDepartments} ocultos por privacidad.`} />
        {!d.departments.length ? <p className="text-sm muted">Aún no hay departamentos con suficientes participantes.</p> : <table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5"><th className="p-2">Departamento</th><th>n</th><th className="text-right">Kinkō</th><th className="text-right">Estrés (1-10)</th><th className="p-2 text-right">Agotamiento</th></tr></thead><tbody>{d.departments.map((g: any) => <tr key={g.key.dept} className="border-b border-ink-100 last:border-0 dark:border-white/5"><td className="p-2 font-medium">{g.key.dept}</td><td>{g.n}</td><td className="text-right">{num(g.metrics.kinko, 0)}</td><td className="text-right">{num(g.metrics.stress, 1)}</td><td className="p-2 text-right"><Badge tone={(g.metrics.burnout ?? 0) > 0.3 ? 'rose' : 'brand'}>{g.metrics.burnout != null ? `${Math.round(g.metrics.burnout * 100)}%` : '—'}</Badge></td></tr>)}</tbody></table>}
      </Card>
      <Card className="flex flex-wrap items-center gap-4"><Briefcase className="h-5 w-5 text-brand-500" /><div className="flex-1"><div className="text-sm">Código para que tus empleados se unan desde su app:</div><div className="font-display text-3xl tracking-[0.25em]">{d.organization.joinCode}</div></div><Button variant="outline" onClick={() => copy(d.organization.joinCode)} icon={<Copy className="h-4 w-4" />}>Copiar</Button><Confirm title="¿Generar un código nuevo?" text="El anterior dejará de funcionar." onConfirm={() => regen.mutate(undefined)}>{(o) => <Button variant="ghost" onClick={o} icon={<RefreshCw className="h-4 w-4" />}>Regenerar</Button>}</Confirm></Card>
    </div>
  );
}
export { FlaskConical, Empty };
