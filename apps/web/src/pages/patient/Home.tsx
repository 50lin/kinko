import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, ClipboardCheck, Flame, HeartHandshake, MessageCircle, NotebookPen, Sparkles, Wind, TrendingDown, TrendingUp, Video, Info } from 'lucide-react';
import { DOMAINS, DOMAIN_LABEL, DOMAIN_COLOR } from '@kinko/core';
import { Sphere } from '@/components/Sphere';
import { Breathing, PATTERNS, type PatternId } from '@/components/Breathing';
import { Avatar, Badge, Button, Card, CardTitle, ErrorBox, Loading, cx } from '@/components/ui';
import { DomainBars } from '@/components/Charts';
import { Icon } from '@/components/Icon';
import { useCrisis } from '@/components/Crisis';
import { useApi, useMut } from '@/lib/query';
import { post } from '@/lib/api';
import { fmtDateTime, greeting } from '@/lib/format';

const RECO_ICON: Record<string, string> = { crisis: 'Shield', professional: 'Stethoscope', exercise: 'Wind', path: 'Footprints', content: 'BookOpen', test: 'ClipboardList', checkin: 'Sunrise', passion: 'Heart', product: 'Sparkles', community: 'Users', habit: 'Sprout', companion: 'Brain' };

export function useRecoAction() {
  const nav = useNavigate(); const crisis = useCrisis();
  return (a: { kind: string; target?: string }) => {
    const t = a.target;
    const map: Record<string, string> = { directory: '/directorio', breathing: `/app/respirar?patron=${t || 'caja'}`, path: `/app/rutas/${t || ''}`, content: `/app/biblioteca/${t || ''}`, test: `/app/tests/${t || ''}`, checkin: '/app/checkin', passions: '/app/pasiones', shop: '/app/tienda', community: '/comunidad', companion: `/app/kio${t ? `?modo=${t}` : ''}`, plan: '/app/tratamiento' };
    if (a.kind === 'crisis') crisis.show(); else nav(map[a.kind] || '/app');
  };
}

export function RecoCard({ r, compact }: { r: any; compact?: boolean }) {
  const act = useRecoAction();
  return (
    <div className={cx('group flex gap-4 rounded-3xl p-4 transition', r.type === 'crisis' ? 'bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/20' : 'bg-white/60 ring-1 ring-ink-200/60 hover:ring-brand-300 dark:bg-white/[.03] dark:ring-white/5')}>
      <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', r.type === 'crisis' ? 'bg-rose-600 text-white' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300')}><Icon name={RECO_ICON[r.type]} /></div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{r.title}</div>
        {!compact && <p className="mt-0.5 text-sm muted">{r.body}</p>}
        <div className="mt-1.5 flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400"><Info className="h-3.5 w-3.5 shrink-0" /><span>Por qué: {r.reason}</span></div>
        <Button size="sm" variant={r.type === 'crisis' ? 'danger' : 'soft'} className="mt-3" onClick={() => act(r.action)}>{r.action.label}<ArrowRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export function PatientHome() {
  const { data: d, isLoading, error } = useApi<any>('/me/dashboard');
  const nav = useNavigate();
  const complete = useMut((id: string) => post(`/plan/tasks/${id}/complete`), { invalidate: ['/me/dashboard', '/plan'], success: '¡Hecho! Sumas puntos' });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const k = d.kinko; const u = d.user;
  const trend = k?.trend;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="relative overflow-hidden p-6">
          <div className="relative z-10">
            <div className="text-sm muted">{greeting()},</div>
            <h1 className="font-display text-4xl">{u.profile.firstName}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {d.streak > 0 && <Badge tone="amber"><Flame className="h-3.5 w-3.5" />{d.streak} días seguidos</Badge>}
              <Badge tone="violet"><Sparkles className="h-3.5 w-3.5" />{u.gamification?.points || 0} puntos</Badge>
              {u.organization && <Badge>{u.organization.name}</Badge>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
            <Sphere className="h-64 w-64 shrink-0 sm:h-72 sm:w-72" domains={k?.domains} overall={k?.overall} face onTap={() => nav('/app/respirar')} />
            <div className="w-full text-center sm:text-left">
              <div className="label">Tu Kinkō</div>
              <div className="font-display text-6xl">{k?.overall ?? '—'}</div>
              {trend != null && <div className={cx('mt-1 flex items-center justify-center gap-1 text-sm font-medium sm:justify-start', trend >= 0 ? 'text-brand-600 dark:text-brand-300' : 'text-rose-600 dark:text-rose-300')}>{trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{trend > 0 ? '+' : ''}{trend} esta semana</div>}
              <p className="mt-2 text-xs muted">Basado en {k?.dataDays || 0} días de datos · confianza {Math.round((k?.confidence || 0) * 100)}%. Toca la esfera para respirar.</p>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          {!d.todayCheckin ? (
            <Card className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white dark:from-brand-600 dark:to-night-900">
              <div className="text-sm text-white/80">60 segundos</div>
              <div className="mt-1 font-display text-2xl">¿Cómo estás hoy?</div>
              <p className="mt-2 text-sm text-white/80">Tu check-in mantiene tu esfera viva y ayuda a ver patrones que de otro modo pasan desapercibidos.</p>
              <Button variant="secondary" className="mt-4 !bg-white !text-brand-800" to="/app/checkin">Hacer check-in</Button>
            </Card>
          ) : (
            <Card className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10"><Check className="h-6 w-6" /></div><div className="flex-1"><div className="font-semibold">Check-in de hoy hecho</div><div className="text-sm muted">Ánimo {d.todayCheckin.mood}/10{d.todayCheckin.emotions?.length ? ` · ${d.todayCheckin.emotions.slice(0, 3).join(', ')}` : ''}</div></div><Button size="sm" variant="ghost" to="/app/checkin">Editar</Button></Card>
          )}
          <Card><CardTitle title="Tus siete dimensiones" action={<Link to="/app/progreso" className="text-sm link">Ver evolución</Link>} /><DomainBars domains={k?.domains || {}} /></Card>
          <div className="grid grid-cols-4 gap-2">
            {[['Kio', '/app/kio', Sparkles], ['Respirar', '/app/respirar', Wind], ['Diario', '/app/diario', NotebookPen], ['Tests', '/app/tests', ClipboardCheck]].map(([l, to, Ic]: any) => (
              <Link key={l} to={to} className="flex flex-col items-center gap-2 rounded-3xl bg-white/60 p-3 text-xs font-semibold ring-1 ring-ink-200/60 transition hover:-translate-y-0.5 dark:bg-white/[.03] dark:ring-white/5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"><Ic className="h-5 w-5" /></span>{l}</Link>
            ))}
          </div>
        </div>
      </div>

      {d.dueMeasures?.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-l-4 border-violet-400"><ClipboardCheck className="h-5 w-5 text-violet-500" /><div className="flex-1 text-sm"><b>Tu profesional te ha pedido:</b> {d.dueMeasures.map((m: any) => m.name).join(', ')}</div>{d.dueMeasures.map((m: any) => <Button key={m.id} size="sm" variant="soft" to={`/app/tests/${m.instrumentId}`}>{m.name}</Button>)}</Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle title="Para ti hoy" subtitle="Cada sugerencia explica por qué aparece. Nada de esto sustituye a tu profesional." />
          <div className="space-y-3">{d.recommendations.map((r: any) => <RecoCard key={r.id} r={r} />)}</div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle title="Próximas citas" action={<Link to="/app/citas" className="text-sm link">Todas</Link>} />
            {!d.upcoming.length ? <div className="text-sm muted">No tienes citas. <Link to="/directorio" className="link">Encuentra profesional</Link></div> : (
              <div className="space-y-3">{d.upcoming.map((a: any) => (
                <div key={a._id} className="flex items-center gap-3"><Avatar user={a.professional} size={40} /><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{a.professional?.firstName} {a.professional?.lastName}</div><div className="text-xs muted">{fmtDateTime(a.startAt)} · {a.modality === 'video' ? 'Vídeo' : a.modality}</div></div>{a.status === 'confirmed' && a.modality === 'video' ? <Button size="sm" variant="soft" to={`/video/${a._id}`} icon={<Video className="h-4 w-4" />}>Entrar</Button> : <Badge tone={a.status === 'confirmed' ? 'brand' : 'amber'}>{a.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}</Badge>}</div>
              ))}</div>
            )}
          </Card>
          {d.plan && (
            <Card>
              <CardTitle title="Mi plan de hoy" subtitle={d.plan.title} action={<Link to="/app/tratamiento" className="text-sm link">Ver plan</Link>} />
              <div className="space-y-2">{d.plan.tasks.slice(0, 5).map((t: any) => (
                <button key={t.id} disabled={t.doneToday || complete.isPending} onClick={() => complete.mutate(t.id)} className={cx('flex w-full items-center gap-3 rounded-2xl p-2.5 text-left text-sm transition', t.doneToday ? 'opacity-60' : 'hover:bg-ink-50 dark:hover:bg-white/5')}>
                  <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', t.doneToday ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 dark:border-white/20')}>{t.doneToday && <Check className="h-3.5 w-3.5" />}</span>
                  <span className={cx('flex-1', t.doneToday && 'line-through')}>{t.title}</span>
                </button>
              ))}</div>
            </Card>
          )}
          <Card>
            <CardTitle title="Tus pasiones" action={<Link to="/app/pasiones" className="text-sm link">Mapa</Link>} />
            {d.passions.top.length ? <>
              <p className="text-sm muted">{d.passions.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">{d.passions.top.map((p: any) => <Badge key={p.key} tone={p.atRisk || p.unsupported ? 'amber' : 'brand'}><Icon name={p.icon} className="h-3.5 w-3.5" />{p.label}</Badge>)}</div>
            </> : <div className="text-sm muted">Cuéntanos qué te apasiona: es una de las mejores palancas de bienestar. <Link to="/app/pasiones" className="link">Hacer mi mapa</Link></div>}
          </Card>
          {d.careTeam.length > 0 && (
            <Card><CardTitle title="Mi equipo" action={<Link to="/app/equipo" className="text-sm link">Permisos</Link>} />
              <div className="flex flex-wrap gap-3">{d.careTeam.map((p: any) => <Link key={p.id} to="/mensajes" className="flex items-center gap-2 rounded-full bg-ink-50 py-1 pl-1 pr-3 text-sm dark:bg-white/5"><Avatar user={p} size={28} />{p.firstName}<MessageCircle className="h-3.5 w-3.5 muted" /></Link>)}</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export function Breathe() {
  const [sp] = useSearchParams(); const nav = useNavigate();
  const { data } = useApi<any>('/me/dashboard');
  const p = (sp.get('patron') as PatternId) || 'caja';
  return <Breathing initial={p in PATTERNS ? p : 'caja'} domains={data?.kinko?.domains} overall={data?.kinko?.overall} onClose={() => nav(-1)} />;
}
export { DOMAINS, DOMAIN_LABEL, DOMAIN_COLOR, HeartHandshake, CalendarDays };
