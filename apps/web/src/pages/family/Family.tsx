import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, BookOpenCheck, CalendarDays, Heart, Link2, Lock, MessageCircle, ShieldCheck, TrendingDown, TrendingUp, UserPlus, Phone } from 'lucide-react';
import { GUARDIAN_SCOPES, GUARDIAN_SCOPE_LABEL, ALERT_LABEL } from '@kinko/core';
import { Avatar, Badge, Button, Card, CardTitle, Empty, ErrorBox, Input, Loading, PageHeader, Progress, Toggle, cx } from '@/components/ui';
import { Ring, TrendChart } from '@/components/Charts';
import { ContentCard } from '@/pages/patient/Learn';
import { useApi, useMut, toast } from '@/lib/query';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrisis } from '@/components/Crisis';
import { ago, fmtDate, fmtDateTime } from '@/lib/format';

export function FamilyHome() {
  const { data, isLoading, error } = useApi<any[]>('/family/teens');
  const alerts = useApi<any[]>('/family/alerts');
  const user = useAuth((s) => s.user); const crisis = useCrisis();
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const open = (alerts.data || []).filter((a) => a.status !== 'resolved');
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Portal de familias" title={`Hola, ${user?.profile?.firstName}`} subtitle="Acompaña sin invadir: ves la evolución general que tu hijo/a decide compartir. Su diario y sus conversaciones con Kio son privados. Las alertas de crisis te llegan siempre." />
      {open.length > 0 && <Card className="border-l-4 border-rose-500 bg-rose-50/70 dark:bg-rose-500/10"><div className="flex gap-3"><AlertTriangle className="h-6 w-6 shrink-0 text-rose-600" /><div className="flex-1"><div className="font-semibold">Hay {open.length} aviso{open.length > 1 ? 's' : ''} importante{open.length > 1 ? 's' : ''}</div>{open.slice(0, 3).map((a) => <p key={a._id} className="mt-1 text-sm">{ALERT_LABEL[a.type] || a.type} · {ago(a.createdAt)}</p>)}<p className="mt-2 text-sm">Habla con calma con tu hijo/a y, si su profesional está en Kinkō, contacta con él/ella. Si hay peligro inmediato: 112.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="danger" onClick={() => crisis.show('Si crees que tu hijo/a está en peligro, llama al 112. La Fundación ANAR (900 20 20 10) orienta también a familias.')} icon={<Phone className="h-4 w-4" />}>Teléfonos de ayuda</Button><Button size="sm" variant="outline" to="/familia/guias">Cómo hablar con él/ella</Button></div></div></div></Card>}
      {!data!.length ? <Empty icon={<Link2 className="h-8 w-8" />} title="Vincula a tu hijo/a" text="Con el código que aparece en su app (Mi equipo → Familia) o creándole una cuenta." action={<Button to="/familia/vincular">Vincular</Button>} /> : (
        <div className="grid gap-4 md:grid-cols-2">{data!.map((t) => (
          <Card key={t.linkId} as={Link} to={`/familia/hijo/${t.teen.id}`} className="transition hover:-translate-y-0.5">
            <div className="flex items-center gap-4"><Avatar user={t.teen} size={56} /><div className="flex-1"><div className="font-display text-2xl">{t.teen.firstName}</div><div className="text-sm muted">{t.teen.age} años</div></div>{t.kinko ? <Ring value={t.kinko.overall} size={72} stroke={7} label="Kinkō" /> : <Lock className="h-5 w-5 muted" />}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-2xl bg-ink-50 p-2 dark:bg-white/5"><div className="text-xs muted">Tendencia</div><div className={cx('mt-0.5 flex items-center justify-center gap-1 font-semibold', (t.kinko?.trend ?? 0) < 0 ? 'text-rose-600' : 'text-brand-600')}>{t.kinko?.trend != null ? <>{t.kinko.trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{t.kinko.trend}</> : '—'}</div></div>
              <div className="rounded-2xl bg-ink-50 p-2 dark:bg-white/5"><div className="text-xs muted">Check-ins 7 d</div><div className="mt-0.5 font-semibold">{t.checkinsLast7 ?? '—'}</div></div>
              <div className="rounded-2xl bg-ink-50 p-2 dark:bg-white/5"><div className="text-xs muted">Avisos</div><div className={cx('mt-0.5 font-semibold', t.openAlerts && 'text-rose-600')}>{t.openAlerts}</div></div>
            </div>
          </Card>
        ))}</div>
      )}
      <Card className="flex items-start gap-3"><Heart className="h-5 w-5 shrink-0 text-brand-500" /><p className="text-sm">Consejo de la semana: pregunta «¿qué ha sido lo mejor de hoy?» en lugar de «¿qué tal el día?». Las preguntas concretas abren conversaciones. <Link to="/familia/guias" className="link">Más guías</Link></p></Card>
    </div>
  );
}

export function TeenDetail() {
  const { id } = useParams();
  const { data: d, isLoading, error } = useApi<any>(`/family/teens/${id}`);
  const nav = useNavigate();
  const startChat = async (uid: string) => { try { const c = await post('/conversations', { participantId: uid }); nav(`/mensajes/${c._id}`); } catch (e: any) { toast(e.message, 'error'); } };
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <PageHeader back="/familia" title={<span className="flex items-center gap-3"><Avatar user={d.teen} size={48} />{d.teen.firstName}</span>} subtitle={`Comparte contigo: ${d.scopes.map((s: string) => GUARDIAN_SCOPE_LABEL[s as keyof typeof GUARDIAN_SCOPE_LABEL]).join(' · ')}`} actions={<Button size="sm" variant="soft" icon={<MessageCircle className="h-4 w-4" />} onClick={() => startChat(d.teen.id)}>Escribirle</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card><CardTitle title="Ánimo semanal" subtitle="Media de sus check-ins (1-10). No verás días concretos ni notas." />{d.weekly ? <TrendChart data={d.weekly} xKey="week" series={[{ key: 'mood', label: 'Ánimo medio', color: '#339d87', area: true }]} yDomain={[1, 10]} height={240} /> : <p className="flex items-center gap-2 text-sm muted"><Lock className="h-4 w-4" />No comparte su evolución.</p>}</Card>
        <div className="space-y-6">
          {d.kinko && <Card className="flex items-center gap-4"><Ring value={d.kinko.overall} size={80} stroke={8} label="Kinkō" /><div><div className="text-sm muted">Esta semana</div><div className={cx('font-display text-2xl', (d.kinko.trend ?? 0) < 0 ? 'text-rose-600' : 'text-brand-600')}>{d.kinko.trend != null ? `${d.kinko.trend > 0 ? '+' : ''}${d.kinko.trend}` : '—'}</div></div></Card>}
          {d.adherence && <Card><CardTitle title="Constancia" /><div className="space-y-3 text-sm"><div><div className="flex justify-between"><span>Últimos 7 días</span><b>{d.adherence.last7}/7</b></div><Progress value={(d.adherence.last7 / 7) * 100} className="mt-1" /></div><div><div className="flex justify-between"><span>Últimos 30 días</span><b>{d.adherence.last30}/30</b></div><Progress value={(d.adherence.last30 / 30) * 100} className="mt-1" /></div></div></Card>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardTitle title="Citas" icon={<CalendarDays className="h-5 w-5 text-brand-500" />} />{d.appointments ? (d.appointments.length ? <div className="space-y-2">{d.appointments.map((a: any, i: number) => <div key={i} className="flex justify-between text-sm"><span>{fmtDateTime(a.date)}</span><Badge tone={a.status === 'completed' ? 'brand' : a.status === 'confirmed' ? 'sky' : 'ink'}>{a.status}</Badge></div>)}</div> : <p className="text-sm muted">Sin citas recientes.</p>) : <p className="text-sm muted">No comparte sus citas.</p>}</Card>
        <Card><CardTitle title="Plan de tratamiento" />{d.plan ? <><div className="text-sm font-medium">{d.plan.title}</div><div className="mt-3 space-y-2">{d.plan.goals.map((g: any, i: number) => <div key={i}><div className="flex justify-between text-xs"><span>{g.text}</span><span>{g.progress}%</span></div><Progress value={g.progress} className="mt-1" /></div>)}</div><p className="mt-3 text-xs muted">{d.plan.completedThisWeek} tareas hechas esta semana</p></> : <p className="text-sm muted">No comparte su plan o no tiene.</p>}</Card>
        <Card><CardTitle title="Su profesional" />{d.careTeam?.length ? d.careTeam.map((p: any) => <div key={p.id} className="flex items-center gap-3"><Avatar user={p} size={36} /><div className="flex-1 text-sm font-medium">{p.firstName} {p.lastName}</div><Button size="sm" variant="soft" onClick={() => startChat(p.id)}>Escribir</Button></div>) : <p className="text-sm muted">Tu hijo/a no ha activado el contacto familia-profesional.</p>}</Card>
      </div>
      {d.alerts?.length > 0 && <Card><CardTitle title="Avisos" icon={<AlertTriangle className="h-5 w-5 text-rose-500" />} /><div className="space-y-2">{d.alerts.map((a: any) => <div key={a._id} className="flex items-center justify-between text-sm"><span>{ALERT_LABEL[a.type] || a.type}</span><span className="text-xs muted">{fmtDateTime(a.createdAt)} · {a.status === 'resolved' ? 'gestionado' : 'abierto'}</span></div>)}</div></Card>}
      <p className="flex items-center gap-1.5 text-xs muted"><ShieldCheck className="h-3.5 w-3.5" />Por ley y por respeto, el contenido íntimo de tu hijo/a (diario, Kio, notas) no se muestra. Así confía en la app y la usa cuando lo necesita.</p>
    </div>
  );
}

export function Guides() {
  const { data, isLoading } = useApi<any[]>('/family/guides');
  return (
    <div>
      <PageHeader eyebrow="Guías para familias" title="Acompañar en la adolescencia" subtitle="Recursos breves de psicólogos especializados en infancia y adolescencia." />
      {isLoading ? <Loading /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(data || []).map((c) => <ContentCard key={c._id} c={c} base="/contenido" />)}</div>}
      <Card className="mt-6 flex items-start gap-3"><BookOpenCheck className="h-5 w-5 shrink-0 text-brand-500" /><p className="text-sm">Señales para pedir ayuda profesional: aislamiento que dura semanas, cambios bruscos de sueño o apetito, abandono de lo que le apasionaba, comentarios sobre no querer vivir. Ante esto último, no esperes: 024 o ANAR 900 20 20 10.</p></Card>
    </div>
  );
}

export function LinkTeen() {
  const [code, setCode] = useState(''); const nav = useNavigate();
  const [f, setF] = useState<any>({ firstName: '', lastName: '', birthDate: '', email: '', password: '', scopes: ['progress', 'adherence', 'appointments'] });
  const link = useMut(() => post('/family/link', { code }), { invalidate: ['/family'], success: (r: any) => `Vinculado con ${r.teen?.firstName}`, onSuccess: () => nav('/familia') });
  const create = useMut(() => post('/family/teens', f), { invalidate: ['/family'], success: 'Cuenta creada y vinculada', onSuccess: () => nav('/familia') });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader back="/familia" eyebrow="Familia" title="Vincular a tu hijo/a" />
      <Card><CardTitle title="Ya tiene Kinkō" subtitle="Pídele el código de 8 caracteres de su app (Mi equipo → Familia)." icon={<Link2 className="h-5 w-5 text-brand-500" />} />
        <div className="flex gap-2"><Input value={code} maxLength={12} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" className="font-display tracking-[0.3em]" /><Button loading={link.isPending} disabled={code.length < 6} onClick={() => link.mutate(undefined)}>Vincular</Button></div>
      </Card>
      <Card><CardTitle title="Crear su cuenta" subtitle="Para menores de 16 años, la cuenta requiere el consentimiento de madre, padre o tutor (LOPDGDD art. 7)." icon={<UserPlus className="h-5 w-5 text-brand-500" />} />
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Nombre" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /><Input label="Apellidos" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /><Input label="Fecha de nacimiento" type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /><Input label="Su email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><div className="sm:col-span-2"><Input label="Contraseña inicial" type="password" hint="Mínimo 10 caracteres. Pídele que la cambie." value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div></div>
        <div className="mt-4 label">Qué verás (podrá ajustarlo con vosotros)</div>
        <div className="grid gap-x-6 sm:grid-cols-2">{GUARDIAN_SCOPES.map((s) => <Toggle key={s} checked={f.scopes.includes(s)} label={GUARDIAN_SCOPE_LABEL[s]} onChange={(v) => setF({ ...f, scopes: v ? [...f.scopes, s] : f.scopes.filter((x: string) => x !== s) })} />)}</div>
        <Button className="mt-4" loading={create.isPending} onClick={() => create.mutate(undefined)}>Crear y vincular</Button>
      </Card>
    </div>
  );
}
export { fmtDate };
