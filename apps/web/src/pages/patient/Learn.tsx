import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Check, Clock, Headphones, Lock, Pause, Play, Search, Sparkles, Video, Wind, Footprints, NotebookPen, ClipboardCheck, Sprout } from 'lucide-react';
import { DOMAINS, DOMAIN_LABEL } from '@kinko/core';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Loading, PageHeader, Progress, cx } from '@/components/ui';
import { Cover } from '@/components/Icon';
import { Sphere } from '@/components/Sphere';
import { useApi, useMut } from '@/lib/query';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canSpeak, speakScript, stopSpeaking } from '@/lib/speech';

const TYPE: Record<string, [string, any]> = { article: ['Lectura', BookOpen], audio: ['Audio', Headphones], video: ['Vídeo', Video], exercise: ['Ejercicio', Wind], course: ['Curso', Sparkles], image: ['Infografía', BookOpen] };
const TASK_ICON: Record<string, any> = { article: BookOpen, audio: Headphones, exercise: Wind, habit: Sprout, journal: NotebookPen, test: ClipboardCheck, video: Video };

export function Paths() {
  const { data, isLoading, error } = useApi<any[]>('/paths');
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div>
      <PageHeader eyebrow="Rutas de cuidado" title="Pequeños pasos, cambios reales" subtitle="Programas de 7 a 14 días con tareas de 5-10 minutos, diseñados con psicólogos." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data!.map((p) => {
          const e = p.enrollment; const pct = e ? Math.round(((e.completedDays?.length || 0) / p.dayCount) * 100) : 0;
          return (
            <Card key={p._id} as={Link} to={`/app/rutas/${p.slug}`} className="overflow-hidden p-0 transition hover:-translate-y-1">
              <Cover hue={p.coverHue} icon={p.icon} className="h-32" size="h-12 w-12" />
              <div className="p-5">
                <div className="flex items-center gap-2"><div className="font-semibold">{p.title}</div>{p.premium && <Badge tone="violet"><Lock className="h-3 w-3" />Plus</Badge>}</div>
                <p className="mt-1 text-sm muted">{p.summary}</p>
                <div className="mt-3 flex items-center gap-2 text-xs muted"><Footprints className="h-3.5 w-3.5" />{p.dayCount} días · {DOMAIN_LABEL[p.domain as keyof typeof DOMAIN_LABEL]}</div>
                {e && <div className="mt-3"><Progress value={pct} /><div className="mt-1 text-xs muted">{e.status === 'completed' ? 'Completada' : `Día ${e.currentDay} · ${pct}%`}</div></div>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function PathDetail() {
  const { slug } = useParams(); const nav = useNavigate();
  const { data: p, isLoading, error } = useApi<any>(`/paths/${slug}`);
  const enroll = useMut(() => post(`/paths/${slug}/enroll`), { invalidate: ['/paths'], success: '¡Ruta empezada! Día 1 desbloqueado' });
  const done = useMut((day: number) => post(`/paths/${slug}/days/${day}/complete`), { invalidate: ['/paths', '/me/dashboard'], success: 'Día completado · +20 puntos' });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const e = p.enrollment;
  const go = (t: any) => { if (t.contentSlug) nav(`/app/biblioteca/${t.contentSlug}`); else if (t.type === 'test') nav('/app/tests/sleep'); else if (t.type === 'journal') nav('/app/diario'); else if (t.type === 'exercise') nav('/app/respirar'); };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back="/app/rutas" eyebrow={`${p.days.length} días`} title={p.title} subtitle={p.summary} actions={!e && <Button loading={enroll.isPending} onClick={() => enroll.mutate(undefined)}>Empezar ruta</Button>} />
      {p.locked && <Card className="mb-4 flex items-center gap-3 bg-violet-50 dark:bg-violet-500/10"><Lock className="h-5 w-5 text-violet-600" /><div className="flex-1 text-sm">Los dos primeros días son gratis. Desbloquea la ruta completa con Kinkō Plus o si tu profesional usa Kinkō.</div><Button size="sm" to="/ajustes?tab=plan">Ver Plus</Button></Card>}
      <div className="space-y-3">
        {p.days.map((d: any) => {
          const completed = e?.completedDays?.includes(d.day); const current = e && !completed && d.day === e.currentDay; const lockedDay = d.locked || !e || (d.day > (e?.currentDay || 1) && !completed);
          return (
            <Card key={d.day} className={cx('transition', current && 'ring-2 ring-brand-400', lockedDay && !completed && 'opacity-60')}>
              <div className="flex items-center gap-4">
                <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-lg', completed ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-white/5')}>{completed ? <Check className="h-5 w-5" /> : d.day}</div>
                <div className="flex-1"><div className="font-semibold">{d.title}</div><div className="text-xs muted">Día {d.day}</div></div>
                {d.locked && <Lock className="h-4 w-4 muted" />}
              </div>
              {!d.locked && (current || completed) && <div className="mt-4 space-y-2 pl-0 sm:pl-15">
                {d.tasks.map((t: any, i: number) => { const I = TASK_ICON[t.type] || Sprout; return <button key={i} onClick={() => go(t)} className="flex w-full items-center gap-3 rounded-2xl bg-ink-50 p-3 text-left text-sm transition hover:bg-brand-50 dark:bg-white/5 dark:hover:bg-brand-500/10"><I className="h-4 w-4 text-brand-500" /><span className="flex-1">{t.title}</span><span className="text-xs muted">{t.minutes} min</span></button>; })}
                {current && <Button className="mt-2" loading={done.isPending} onClick={() => done.mutate(d.day)} icon={<Check className="h-4 w-4" />}>Marcar día como hecho</Button>}
              </div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function Library() {
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [domain, setDomain] = useState('');
  const qs = new URLSearchParams(Object.entries({ q, type, domain }).filter(([, v]) => v) as any).toString();
  const { data, isLoading } = useApi<any[]>(`/content${qs ? `?${qs}` : ''}`);
  const items = (data || []).filter((c) => c.audience !== 'professional' && c.audience !== 'parent');
  return (
    <div>
      <PageHeader eyebrow="Biblioteca" title="Aprende a tu ritmo" subtitle="Lecturas, audios guiados, vídeos y ejercicios revisados por profesionales." />
      <div className="mb-4 relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input className="input pl-11" placeholder="Buscar: ansiedad, sueño, autoestima…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mb-2 flex flex-wrap gap-1.5"><Chip active={!type} onClick={() => setType('')}>Todo</Chip>{Object.entries(TYPE).filter(([k]) => k !== 'image' && k !== 'course').map(([k, [l, I]]) => <Chip key={k} active={type === k} onClick={() => setType(k)}><I className="h-3.5 w-3.5" />{l}</Chip>)}</div>
      <div className="mb-6 flex flex-wrap gap-1.5">{DOMAINS.map((d) => <Chip key={d} active={domain === d} onClick={() => setDomain(domain === d ? '' : d)}>{DOMAIN_LABEL[d]}</Chip>)}</div>
      {isLoading ? <Loading /> : !items.length ? <Empty title="Nada por aquí" text="Prueba otra búsqueda." /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((c) => <ContentCard key={c._id} c={c} />)}</div>
      )}
    </div>
  );
}
export function ContentCard({ c, base = '/app/biblioteca' }: { c: any; base?: string }) {
  const [label, I] = TYPE[c.type] || TYPE.article;
  return (
    <Card as={Link} to={`${base}/${c.slug}`} className="overflow-hidden p-0 transition hover:-translate-y-1">
      <Cover hue={c.coverHue || 165} icon={c.icon} className="h-28" />
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs muted"><I className="h-3.5 w-3.5" />{label} · {c.durationMin} min{c.premium && <Badge tone="violet" className="ml-auto"><Lock className="h-3 w-3" />Plus</Badge>}</div>
        <div className="mt-1.5 font-semibold leading-snug">{c.title}</div>
        <p className="mt-1 line-clamp-2 text-sm muted">{c.summary}</p>
      </div>
    </Card>
  );
}

function embed(url: string) {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/.exec(url); if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url); if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}
export function ContentView() {
  const { slug } = useParams();
  const { data: c, isLoading, error } = useApi<any>(`/content/${slug}`);
  const user = useAuth((s) => s.user);
  const [line, setLine] = useState(-1); const [playing, setPlaying] = useState(false);
  useEffect(() => { if (c?._id) post(`/content/${c._id}/view`).catch(() => null); return () => stopSpeaking(); }, [c?._id]);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const script: string[] = c.script?.length ? c.script : c.type === 'video' && c.body ? c.body.replace(/^Transcripción:\s*/, '').split(/(?<=[.!?])\s+/) : [];
  const play = async () => { if (playing) { stopSpeaking(); setPlaying(false); return; } setPlaying(true); await speakScript(script, setLine, c.type === 'video' ? 600 : 2600); setPlaying(false); };
  const src = c.url ? embed(c.url) : null;
  const [label, I] = TYPE[c.type] || TYPE.article;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back eyebrow={<span className="flex items-center gap-1.5"><I className="h-3.5 w-3.5" />{label} · {c.durationMin} min</span>} title={c.title} subtitle={c.summary} />
      {c.url ? (src ? <div className="aspect-video overflow-hidden rounded-3xl bg-black"><iframe src={src} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen title={c.title} /></div>
        : c.type === 'audio' ? <audio src={c.url} controls className="w-full" /> : <video src={c.url} controls className="w-full rounded-3xl bg-black" />) : script.length > 0 && (
        <Card className="relative overflow-hidden bg-gradient-to-br from-night-900 to-night-950 p-0 text-white">
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <Sphere className="h-48 w-48" overall={72} calmOverride={playing ? 0.95 : 0.6} interactive={false} />
            <p className="min-h-[3.5rem] max-w-lg font-display text-xl leading-snug text-white/90">{line >= 0 ? script[line] : c.type === 'video' ? 'Explicación narrada con tu esfera' : 'Ponte cómodo/a. Cuando quieras, empezamos.'}</p>
            {canSpeak() ? <Button variant="secondary" className="!bg-white !text-night-950" onClick={play} icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}>{playing ? 'Pausar' : 'Reproducir guía'}</Button> : <p className="text-sm text-white/60">Tu navegador no tiene voz: sigue el texto a tu ritmo.</p>}
            {line >= 0 && <div className="flex gap-1">{script.map((_, i) => <span key={i} className={cx('h-1 w-6 rounded-full', i <= line ? 'bg-brand-300' : 'bg-white/20')} />)}</div>}
          </div>
        </Card>
      )}
      {c.body && <div className="prose-k mt-6 whitespace-pre-line">{c.body}</div>}
      {c.script?.length > 0 && <Card className="mt-6"><div className="label mb-2">Guion</div><ol className="list-decimal space-y-1.5 pl-5 text-sm">{c.script.map((s: string, i: number) => <li key={i} className={cx(i === line && 'font-semibold text-brand-700 dark:text-brand-300')}>{s}</li>)}</ol></Card>}
      {c.locked && <Card className="mt-6 flex items-center gap-3 bg-violet-50 dark:bg-violet-500/10"><Lock className="h-5 w-5 text-violet-600" /><div className="flex-1 text-sm">Contenido completo con Kinkō Plus.</div>{user && <Button size="sm" to="/ajustes?tab=plan">Ver planes</Button>}</Card>}
      <div className="mt-6 flex flex-wrap items-center gap-2">{c.tags?.map((t: string) => <Badge key={t}>#{t}</Badge>)}{c.author && <span className="ml-auto text-sm muted">Por {c.author.firstName} {c.author.lastName}</span>}</div>
      <div className="mt-2 flex items-center gap-2 text-xs muted"><Clock className="h-3.5 w-3.5" />{c.views || 0} visualizaciones</div>
    </div>
  );
}
