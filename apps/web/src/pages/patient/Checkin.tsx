import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BedDouble, Brain, Check, Footprints, Heart, Moon, Sun, Users, Zap } from 'lucide-react';
import { EMOTIONS, NEGATIVE_EMOTIONS } from '@kinko/core';
import { Sphere } from '@/components/Sphere';
import { Button, Card, Chip, Progress, Slider, Textarea, Toggle, cx } from '@/components/ui';
import { useApi, useMut } from '@/lib/query';
import { post } from '@/lib/api';
import { useCrisis } from '@/components/Crisis';
import { DomainBars } from '@/components/Charts';

const MOOD_WORDS = ['', 'Muy mal', 'Mal', 'Bastante mal', 'Regular tirando a mal', 'Regular', 'Normal', 'Bien', 'Bastante bien', 'Muy bien', 'Genial'];
const FIVE = ['', 'Nada', 'Poco', 'Algo', 'Bastante', 'Mucho'];
const SLEEPQ = ['', 'Fatal', 'Mal', 'Regular', 'Bien', 'Reparador'];

export function Checkin() {
  const today = useApi<any>('/checkins/today');
  const nav = useNavigate(); const crisis = useCrisis();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<any>({ mood: 6, energy: 6, stress: 4, anxiety: 4, sleepHours: 7, sleepQuality: 3, social: 3, activityMinutes: 20, focus: 6, emotions: [] as string[], behaviors: {}, gratitude: '', note: '' });
  const [result, setResult] = useState<any>(null);
  useEffect(() => { if (today.data) setF((x: any) => ({ ...x, ...today.data, behaviors: today.data.behaviors || {}, emotions: today.data.emotions || [] })); }, [today.data]);
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const save = useMut((b: any) => post('/checkins', b), { invalidate: ['/me/dashboard', '/checkins', '/stats'], onSuccess: (r: any) => { setResult(r); if (r.crisis) crisis.show('Lo que has escrito nos preocupa. No tienes que pasar por esto a solas: hay personas preparadas para ayudarte ahora mismo.'); } });
  const submit = () => {
    const { _id, userId, date, createdAt, updatedAt, ...b } = f;
    save.mutate({ ...b, gratitude: b.gratitude || undefined, note: b.note || undefined });
  };
  const toggleEmo = (e: string) => set('emotions')(f.emotions.includes(e) ? f.emotions.filter((x: string) => x !== e) : f.emotions.length < 8 ? [...f.emotions, e] : f.emotions);
  const steps = [
    { t: '¿Cómo te sientes?', body: <>
      <div className="text-center font-display text-3xl">{MOOD_WORDS[f.mood]}</div>
      <div className="mt-6"><Slider value={f.mood} onChange={set('mood')} labels={['Muy mal', 'Genial']} /></div>
      <div className="mt-8 label">¿Qué emociones hay hoy? <span className="font-normal normal-case muted">(hasta 8)</span></div>
      <div className="mt-3 flex flex-wrap gap-2">{EMOTIONS.map((e) => <Chip key={e} active={f.emotions.includes(e)} onClick={() => toggleEmo(e)} className={cx(f.emotions.includes(e) && NEGATIVE_EMOTIONS.has(e) && '!bg-violet-600 !border-violet-600')}>{e}</Chip>)}</div>
    </> },
    { t: 'Tu cuerpo', body: <div className="space-y-7">
      <Row icon={<Zap />} label="Energía" value={`${f.energy}/10`}><Slider value={f.energy} onChange={set('energy')} labels={['Agotado/a', 'A tope']} /></Row>
      <Row icon={<Brain />} label="Estrés" value={`${f.stress}/10`}><Slider value={f.stress} onChange={set('stress')} labels={['Tranquilo/a', 'Desbordado/a']} /></Row>
      <Row icon={<Heart />} label="Ansiedad o nervios" value={`${f.anxiety}/10`}><Slider value={f.anxiety} onChange={set('anxiety')} labels={['Nada', 'Muchísima']} /></Row>
      <Row icon={<Sun />} label="Concentración y sentido" value={`${f.focus}/10`}><Slider value={f.focus} onChange={set('focus')} labels={['Disperso/a', 'Centrado/a']} /></Row>
    </div> },
    { t: 'Descanso y movimiento', body: <div className="space-y-7">
      <Row icon={<Moon />} label="Horas de sueño" value={`${f.sleepHours} h`}><Slider value={f.sleepHours} onChange={set('sleepHours')} min={0} max={12} step={0.5} labels={['0 h', '12 h']} /></Row>
      <Row icon={<BedDouble />} label="Calidad del sueño" value={SLEEPQ[f.sleepQuality]}><Slider value={f.sleepQuality} onChange={set('sleepQuality')} min={1} max={5} labels={['Fatal', 'Reparador']} /></Row>
      <Row icon={<Footprints />} label="Movimiento" value={`${f.activityMinutes} min`}><Slider value={f.activityMinutes} onChange={set('activityMinutes')} min={0} max={180} step={5} labels={['Nada', '3 h']} /></Row>
      <Row icon={<Users />} label="Conexión con otras personas" value={FIVE[f.social]}><Slider value={f.social} onChange={set('social')} min={1} max={5} labels={['Aislado/a', 'Muy conectado/a']} /></Row>
    </div> },
    { t: 'Tu día', body: <div className="space-y-2">
      <Toggle checked={!!f.behaviors.passionTime} onChange={(v) => set('behaviors')({ ...f.behaviors, passionTime: v })} label="He dedicado tiempo a algo que me apasiona" />
      <Toggle checked={!!f.behaviors.outdoors} onChange={(v) => set('behaviors')({ ...f.behaviors, outdoors: v })} label="He salido al aire libre" />
      <Toggle checked={!!f.behaviors.selfCare} onChange={(v) => set('behaviors')({ ...f.behaviors, selfCare: v })} label="He hecho algo para cuidarme" />
      <Toggle checked={!!f.behaviors.screensLate} onChange={(v) => set('behaviors')({ ...f.behaviors, screensLate: v })} label="Pantallas hasta tarde" />
      <Toggle checked={!!f.behaviors.alcohol} onChange={(v) => set('behaviors')({ ...f.behaviors, alcohol: v })} label="He bebido alcohol" />
      <div className="pt-4"><Textarea label="Algo por lo que dar las gracias hoy (opcional)" rows={2} maxLength={280} value={f.gratitude} onChange={(e) => set('gratitude')(e.target.value)} /></div>
      <Textarea label="¿Quieres añadir algo? (opcional, privado)" rows={3} maxLength={2000} value={f.note} onChange={(e) => set('note')(e.target.value)} placeholder="Lo que te ronde por la cabeza…" />
    </div> },
  ];
  if (result) return (
    <div className="mx-auto max-w-xl text-center animate-fade">
      <Sphere className="mx-auto h-64 w-64" domains={result.kinko?.domains} overall={result.kinko?.overall} face mood={f.mood} />
      <h1 className="mt-4 font-display text-3xl">Gracias por escucharte</h1>
      <p className="mt-2 muted">Tu Kinkō ahora es <b className="text-ink-900 dark:text-white">{result.kinko?.overall ?? '—'}</b>. +10 puntos.</p>
      <Card className="mt-6 text-left"><DomainBars domains={result.kinko?.domains || {}} /></Card>
      <div className="mt-6 flex justify-center gap-2"><Button to="/app">Volver al inicio</Button><Button variant="outline" to="/app/kio?modo=organizar">Hablarlo con Kio</Button></div>
    </div>
  );
  const s = steps[step];
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4"><button onClick={() => (step ? setStep(step - 1) : nav(-1))} className="rounded-full p-2 hover:bg-ink-100 dark:hover:bg-white/5"><ArrowLeft className="h-5 w-5" /></button><Progress value={((step + 1) / steps.length) * 100} className="flex-1" /><span className="text-sm muted">{step + 1}/{steps.length}</span></div>
      <div className="grid items-start gap-6 md:grid-cols-[200px_1fr]">
        <div className="hidden md:block md:sticky md:top-24"><Sphere className="h-48 w-48" mood={f.mood} calmOverride={1 - f.stress / 10} overall={f.mood * 10} face /></div>
        <Card className="p-6 animate-fade" key={step}>
          <h1 className="mb-6 font-display text-3xl">{s.t}</h1>
          {s.body}
          <div className="mt-8 flex justify-end">{step < steps.length - 1 ? <Button size="lg" onClick={() => setStep(step + 1)}>Siguiente<ArrowRight className="h-4 w-4" /></Button> : <Button size="lg" loading={save.isPending} onClick={submit} icon={<Check className="h-5 w-5" />}>Guardar check-in</Button>}</div>
        </Card>
      </div>
    </div>
  );
}
function Row({ icon, label, value, children }: { icon: any; label: string; value: string; children: any }) {
  return <div><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 font-medium [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brand-500">{icon}{label}</div><div className="text-sm font-semibold">{value}</div></div>{children}</div>;
}
