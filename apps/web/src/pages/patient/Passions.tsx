import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Heart, ShoppingBag, Users, Sparkles, Target, X, Check } from 'lucide-react';
import { Badge, Button, Card, CardTitle, ErrorBox, Loading, Modal, PageHeader, Progress, Slider, Textarea, cx } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useApi, useMut } from '@/lib/query';
import { put } from '@/lib/api';

const FREQ = ['Nunca', 'Alguna vez al mes', 'Cada semana', 'Varias veces por semana', 'A diario'];
const BLOCKERS: Record<string, string> = { tiempo: 'Falta de tiempo', dinero: 'Dinero', apoyo: 'Falta de apoyo', miedo: 'Miedo a no ser bueno/a', motivacion: 'Motivación', lugar: 'No tengo dónde', lesion: 'Lesión o salud', estudios: 'Estudios o trabajo' };
const SUP = ['', 'Nada', 'Poco', 'Algo', 'Bastante', 'Muchísimo'];

export function Passions() {
  const cat = useApi<any>('/passions/catalog');
  const me = useApi<any>('/passions/me');
  const [interests, setInterests] = useState<any[]>([]);
  const [dreams, setDreams] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [mode, setMode] = useState<'map' | 'pick'>('map');
  useEffect(() => { if (me.data) { setInterests(me.data.profile?.interests || []); setDreams(me.data.profile?.dreams || ''); if (!me.data.profile?.interests?.length) setMode('pick'); } }, [me.data]);
  const save = useMut((b: any) => put('/passions/me', b), { invalidate: ['/passions', '/me/dashboard', '/shop/recommended'], success: 'Mapa de pasiones guardado', onSuccess: () => setMode('map') });
  const byCat = useMemo(() => { const m: Record<string, any[]> = {}; (cat.data?.passions || []).forEach((p: any) => (m[p.category] ||= []).push(p)); return m; }, [cat.data]);
  if (cat.isLoading || me.isLoading) return <Loading />;
  if (cat.error) return <ErrorBox error={cat.error} />;
  const has = (k: string) => interests.some((i) => i.key === k);
  const toggle = (p: any) => has(p.key) ? setInterests(interests.filter((i) => i.key !== p.key)) : interests.length < 12 && setEdit({ key: p.key, importance: 4, frequency: 2, skill: 3, support: { family: 3, friends: 3 }, blockers: [], dream: '', _new: true });
  const analysis = me.data?.analysis;
  const pdef = (k: string) => cat.data.passions.find((p: any) => p.key === k);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Diagnóstico de pasiones" title="Lo que te apasiona también es salud" subtitle="Las aficiones protegen el ánimo, la autoestima y los vínculos. Detectamos las que necesitan espacio o apoyo, para que no se apaguen." actions={mode === 'map' ? <Button variant="outline" onClick={() => setMode('pick')}>Editar mi mapa</Button> : interests.length > 0 && <Button loading={save.isPending} onClick={() => save.mutate({ interests: interests.map(({ _new, ...i }) => i), dreams })}>Guardar y analizar</Button>} />
      {mode === 'pick' ? <>
        <Card><p className="text-sm">Elige hasta 12 cosas que te muevan (aunque ahora no las practiques). Para cada una te haremos 4 preguntas rápidas. <b>{interests.length}/12</b></p></Card>
        {Object.entries(byCat).map(([c, ps]) => (
          <div key={c}><h3 className="mb-3 font-semibold">{cat.data.categories[c]}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{ps.map((p) => (
              <button key={p.key} onClick={() => (has(p.key) ? setEdit(interests.find((i) => i.key === p.key)) : toggle(p))} className={cx('relative flex flex-col items-center gap-2 rounded-3xl p-4 text-center text-sm font-medium ring-1 transition hover:-translate-y-0.5', has(p.key) ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-night-950' : 'bg-white/70 ring-ink-200/70 dark:bg-white/[.03] dark:ring-white/5')}>
                <Icon name={p.icon} className="h-7 w-7" />{p.label}
                {has(p.key) && <span onClick={(e) => { e.stopPropagation(); toggle(p); }} className="absolute right-2 top-2 rounded-full bg-white/20 p-0.5"><X className="h-3.5 w-3.5" /></span>}
              </button>
            ))}</div>
          </div>
        ))}
        <Card><Textarea label="¿Hay algún sueño que te gustaría cumplir? (opcional)" rows={2} value={dreams} onChange={(e) => setDreams(e.target.value)} placeholder="Correr una media maratón, tocar en un grupo, exponer mis fotos…" /></Card>
        <div className="flex justify-end"><Button size="lg" disabled={!interests.length} loading={save.isPending} onClick={() => save.mutate({ interests: interests.map(({ _new, ...i }) => i), dreams })}>Guardar y analizar</Button></div>
      </> : analysis?.insights?.length ? <>
        <Card className="bg-gradient-to-br from-brand-50 to-white dark:from-brand-500/10 dark:to-transparent"><div className="flex gap-3"><Sparkles className="h-6 w-6 shrink-0 text-brand-500" /><p className="text-lg leading-relaxed">{analysis.summary}</p></div></Card>
        <div className="grid gap-4 lg:grid-cols-2">
          {analysis.insights.map((x: any) => (
            <Card key={x.key} className={cx((x.atRisk || x.unsupported) && 'ring-2 ring-amber-300 dark:ring-amber-500/40')}>
              <div className="flex items-start gap-4">
                <div className={cx('grid h-14 w-14 shrink-0 place-items-center rounded-2xl', x.atRisk || x.unsupported ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300')}><Icon name={x.icon} className="h-7 w-7" /></div>
                <div className="flex-1">
                  <div className="font-semibold">{x.headline}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{x.atRisk && <Badge tone="amber"><AlertCircle className="h-3 w-3" />Poco practicada</Badge>}{x.unsupported && <Badge tone="rose"><Heart className="h-3 w-3" />Poco apoyo</Badge>}</div>
                </div>
                <div className="text-right"><div className="font-display text-2xl">{x.strength}</div><div className="text-[10px] uppercase tracking-wider muted">fuerza</div></div>
              </div>
              <p className="mt-3 text-sm muted">{x.message}</p>
              <div className="mt-4 label">Retos de esta semana</div>
              <ul className="mt-2 space-y-1.5">{x.challenges.map((c: string) => <li key={c} className="flex gap-2 text-sm"><Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{c}</li>)}</ul>
              <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="soft" to={`/comunidad?categoria=${x.community}`} icon={<Users className="h-4 w-4" />}>Comunidad</Button><Button size="sm" variant="ghost" to={`/app/tienda?pasion=${x.tags[0]}`} icon={<ShoppingBag className="h-4 w-4" />}>Material</Button><Button size="sm" variant="ghost" onClick={() => setEdit(interests.find((i) => i.key === x.key))}>Ajustar</Button></div>
            </Card>
          ))}
        </div>
        {me.data?.profile?.dreams && <Card><CardTitle title="Tu sueño" /><p className="font-display text-xl">«{me.data.profile.dreams}»</p><Button className="mt-3" size="sm" variant="soft" to="/app/kio?modo=resolver">Convertirlo en pasos con Kio</Button></Card>}
        <p className="text-xs muted">Si tienes un profesional y le das permiso de «pasiones», podrá usar este mapa en tu tratamiento. Para menores, una pasión importante con poco apoyo familiar se muestra a su psicólogo/a (nunca a la familia) como factor a trabajar.</p>
      </> : <Card><p className="muted">Aún no has hecho tu mapa.</p><Button className="mt-3" onClick={() => setMode('pick')}>Empezar</Button></Card>}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={<span className="flex items-center gap-2"><Icon name={pdef(edit.key)?.icon} />{pdef(edit.key)?.label}</span>} footer={<Button icon={<Check className="h-4 w-4" />} onClick={() => { setInterests(has(edit.key) ? interests.map((i) => (i.key === edit.key ? edit : i)) : [...interests, edit]); setEdit(null); if (mode === 'map') setMode('pick'); }}>Listo</Button>}>
          <div className="space-y-6">
            <div><div className="mb-2 flex justify-between text-sm font-medium"><span>¿Cuánto te importa?</span><span>{edit.importance}/5</span></div><Slider value={edit.importance} min={1} max={5} onChange={(v) => setEdit({ ...edit, importance: v })} labels={['Un poco', 'Es parte de mí']} /></div>
            <div><div className="mb-2 flex justify-between text-sm font-medium"><span>¿Con qué frecuencia lo practicas ahora?</span><span>{FREQ[edit.frequency]}</span></div><Slider value={edit.frequency} min={0} max={4} onChange={(v) => setEdit({ ...edit, frequency: v })} labels={['Nunca', 'A diario']} /></div>
            <div><div className="mb-2 flex justify-between text-sm font-medium"><span>¿Te apoya tu familia?</span><span>{SUP[edit.support?.family || 3]}</span></div><Slider value={edit.support?.family || 3} min={1} max={5} onChange={(v) => setEdit({ ...edit, support: { ...edit.support, family: v } })} /></div>
            <div><div className="mb-2 flex justify-between text-sm font-medium"><span>¿Y tus amigos?</span><span>{SUP[edit.support?.friends || 3]}</span></div><Slider value={edit.support?.friends || 3} min={1} max={5} onChange={(v) => setEdit({ ...edit, support: { ...edit.support, friends: v } })} /></div>
            <div><div className="mb-2 text-sm font-medium">¿Qué te frena?</div><div className="flex flex-wrap gap-1.5">{Object.entries(BLOCKERS).map(([k, l]) => <button key={k} onClick={() => setEdit({ ...edit, blockers: edit.blockers?.includes(k) ? edit.blockers.filter((b: string) => b !== k) : [...(edit.blockers || []), k] })} className={cx('rounded-full border px-3 py-1.5 text-xs font-medium', edit.blockers?.includes(k) ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200' : 'border-ink-200 dark:border-white/10')}>{l}</button>)}</div></div>
          </div>
        </Modal>
      )}
      {mode === 'pick' && interests.length > 0 && <Card><div className="label mb-2">Tu selección</div><div className="space-y-2">{interests.map((i) => <div key={i.key} className="flex items-center gap-3 text-sm"><Icon name={pdef(i.key)?.icon} className="h-4 w-4" /><span className="w-28">{pdef(i.key)?.label}</span><Progress value={(i.importance / 5) * 100} className="flex-1" /><span className="w-40 text-right text-xs muted">{FREQ[i.frequency]}</span></div>)}</div></Card>}
    </div>
  );
}
