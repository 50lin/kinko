import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, Check, CheckCircle2, Flag, Link2, MapPin, MessageCircle, ShieldCheck, Star, Target, Video, XCircle, Users, Copy, Pill } from 'lucide-react';
import { CARE_SCOPES, CARE_SCOPE_LABEL, GUARDIAN_SCOPES, GUARDIAN_SCOPE_LABEL } from '@kinko/core';
import { Avatar, Badge, Button, Card, CardTitle, Confirm, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Progress, Segmented, Textarea, Toggle, cx } from '@/components/ui';
import { useApi, useMut, toast } from '@/lib/query';
import { post, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, money } from '@/lib/format';

const FREQ: Record<string, string> = { once: 'Una vez', daily: 'Cada día', weekly: 'Cada semana', '3x_week': '3 veces por semana' };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

export function TreatmentPlan() {
  const { data: p, isLoading, error } = useApi<any>('/plan');
  const done = useMut((id: string) => post(`/plan/tasks/${id}/complete`), { invalidate: ['/plan', '/me/dashboard'], success: '¡Bien hecho!' });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!p) return <div><PageHeader eyebrow="Mi plan" title="Plan de tratamiento" /><Empty icon={<Pill className="h-8 w-8" />} title="Aún no tienes un plan" text="Cuando tu profesional cree tu plan de tratamiento, aparecerá aquí con tus objetivos y tareas." action={<Button to="/directorio">Buscar profesional</Button>} /></div>;
  const t0 = today();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mi plan" title={p.title} subtitle={p.focus} />
      <Card className="flex items-center gap-3"><Avatar user={p.professional} size={44} /><div className="flex-1"><div className="text-sm font-semibold">{p.professional?.firstName} {p.professional?.lastName}</div><div className="text-xs muted">Desde {fmtDate(p.startDate)}{p.reviewDate ? ` · revisión ${fmtDate(p.reviewDate)}` : ''}</div></div><Button size="sm" variant="soft" to="/mensajes" icon={<MessageCircle className="h-4 w-4" />}>Escribir</Button></Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardTitle title="Objetivos" icon={<Target className="h-5 w-5 text-brand-500" />} />
          <div className="space-y-4">{p.goals.map((g: any) => <div key={g.id}><div className="flex items-start justify-between gap-3 text-sm"><span className={cx(g.status === 'achieved' && 'line-through muted')}>{g.text}</span>{g.status === 'achieved' ? <Badge tone="brand">Logrado</Badge> : g.status === 'paused' ? <Badge>En pausa</Badge> : <span className="text-xs font-semibold">{g.progress}%</span>}</div><Progress value={g.status === 'achieved' ? 100 : g.progress} className="mt-2" />{g.targetDate && <div className="mt-1 text-xs muted">Meta: {fmtDate(g.targetDate)}</div>}</div>)}</div>
        </Card>
        <Card><CardTitle title="Tareas" subtitle="Marca lo que vayas haciendo. Tu profesional lo verá." />
          <div className="space-y-2">{p.tasks.filter((t: any) => t.status !== 'archived').map((t: any) => {
            const doneToday = (t.completions || []).some((c: any) => c.date === t0); const week = (t.completions || []).filter((c: any) => c.date >= new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)).length;
            return (
              <div key={t.id} className="flex items-start gap-3 rounded-2xl bg-ink-50/70 p-3 dark:bg-white/5">
                <button disabled={doneToday || done.isPending} onClick={() => done.mutate(t.id)} className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition', doneToday ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 hover:border-brand-400 dark:border-white/20')}>{doneToday && <Check className="h-4 w-4" />}</button>
                <div className="flex-1"><div className="text-sm font-medium">{t.title}</div>{t.description && <div className="mt-0.5 text-xs muted">{t.description}</div>}<div className="mt-1 flex gap-2 text-xs muted"><span>{FREQ[t.frequency]}</span><span>· {week} esta semana</span>{t.contentSlug && <Link to={`/app/biblioteca/${t.contentSlug}`} className="link">Abrir recurso</Link>}</div></div>
              </div>
            );
          })}</div>
        </Card>
      </div>
    </div>
  );
}

export function Appointments() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const { data, isLoading, error } = useApi<any[]>(`/appointments?scope=${scope}`);
  const [review, setReview] = useState<any>(null);
  const cancel = useMut((id: string) => patch(`/appointments/${id}`, { status: 'cancelled' }), { invalidate: ['/appointments', '/me/dashboard'], success: 'Cita cancelada' });
  return (
    <div>
      <PageHeader eyebrow="Citas" title="Tus sesiones" actions={<><Segmented value={scope} onChange={setScope} options={[{ id: 'upcoming', label: 'Próximas' }, { id: 'past', label: 'Anteriores' }]} /><Button to="/directorio" icon={<CalendarDays className="h-4 w-4" />}>Reservar</Button></>} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.length ? <Empty icon={<CalendarDays className="h-8 w-8" />} title={scope === 'upcoming' ? 'No tienes citas próximas' : 'Sin historial'} action={<Button to="/directorio">Encontrar profesional</Button>} /> : (
        <div className="space-y-3">{data.map((a) => (
          <Card key={a._id} className="flex flex-wrap items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-center text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"><div><div className="text-[10px] font-semibold uppercase">{new Date(a.startAt).toLocaleDateString('es-ES', { month: 'short', timeZone: 'Europe/Madrid' })}</div><div className="font-display text-xl leading-none">{new Date(a.startAt).toLocaleDateString('es-ES', { day: 'numeric', timeZone: 'Europe/Madrid' })}</div></div></div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Avatar user={a.professional} size={24} /><span className="font-semibold">{a.professional?.firstName} {a.professional?.lastName}</span></div><div className="mt-1 flex flex-wrap gap-x-3 text-sm muted"><span>{fmtDateTime(a.startAt)}</span><span className="flex items-center gap-1">{a.modality === 'video' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{a.modality === 'video' ? 'Videollamada' : 'Presencial'}</span><span>{money(a.price)}{a.paid ? ' · pagada' : ''}</span></div></div>
            <Badge tone={({ confirmed: 'brand', requested: 'amber', completed: 'sky', cancelled: 'ink', no_show: 'rose' } as any)[a.status]}>{({ confirmed: 'Confirmada', requested: 'Pendiente de confirmar', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistida' } as any)[a.status]}</Badge>
            <div className="flex gap-2">
              {a.status === 'confirmed' && a.modality === 'video' && scope === 'upcoming' && <Button size="sm" to={`/video/${a._id}`} icon={<Video className="h-4 w-4" />}>Entrar a la sala</Button>}
              {['confirmed', 'requested'].includes(a.status) && scope === 'upcoming' && <Confirm title="¿Cancelar la cita?" text="Gratis hasta 24 h antes." danger onConfirm={() => cancel.mutate(a._id)}>{(open) => <Button size="sm" variant="ghost" onClick={open}>Cancelar</Button>}</Confirm>}
              {a.status === 'completed' && <Button size="sm" variant="soft" onClick={() => setReview(a)} icon={<Star className="h-4 w-4" />}>Valorar</Button>}
            </div>
          </Card>
        ))}</div>
      )}
      {review && <ReviewModal a={review} onClose={() => setReview(null)} />}
    </div>
  );
}
function ReviewModal({ a, onClose }: { a: any; onClose: () => void }) {
  const [f, setF] = useState({ rating: 5, comment: '', anonymous: true });
  const send = useMut(() => post(`/directory/professionals/${a.professionalId}/reviews`, f), { success: 'Gracias por tu valoración', onSuccess: onClose });
  return <Modal open onClose={onClose} title={`Valora a ${a.professional?.firstName}`} footer={<Button loading={send.isPending} onClick={() => send.mutate(undefined)}>Enviar</Button>}>
    <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setF({ ...f, rating: n })}><Star className={cx('h-8 w-8', n <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-ink-200')} /></button>)}</div>
    <Textarea className="mt-4" label="Comentario (opcional)" rows={3} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
    <div className="mt-2"><Toggle checked={f.anonymous} onChange={(v) => setF({ ...f, anonymous: v })} label="Publicar de forma anónima" /></div>
  </Modal>;
}

export function CareTeam() {
  const { data, isLoading, error } = useApi<any>('/me/care-team');
  const user = useAuth((s) => s.user); const reload = useAuth((s) => s.reload);
  const [accept, setAccept] = useState<any>(null);
  const [code, setCode] = useState<any>(null);
  const [org, setOrg] = useState({ code: '', department: '' });
  const update = useMut(({ id, ...b }: any) => patch(`/me/care-team/${id}`, b), { invalidate: ['/me/care-team'], success: 'Permisos actualizados' });
  const updG = useMut(({ id, ...b }: any) => patch(`/me/guardians/${id}`, b), { invalidate: ['/me/care-team'], success: 'Actualizado' });
  const genCode = useMut(() => post('/me/guardian-code', { scopes: ['progress', 'adherence', 'appointments'] }), { invalidate: ['/me/care-team'], onSuccess: setCode });
  const joinOrg = useMut(() => post('/me/organization', org), { success: (r: any) => `Te has unido a ${r.organization}`, onSuccess: () => reload() });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mi equipo" title="Quién te acompaña y qué ve" subtitle="Tú decides qué datos comparte cada profesional y desde qué fecha. Cada acceso queda registrado." />
      {!data.professionals.length ? <Empty icon={<Users className="h-8 w-8" />} title="Aún no tienes profesional en Kinkō" action={<Button to="/directorio">Buscar profesional</Button>} /> : data.professionals.map((r: any) => (
        <Card key={r._id}>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar user={r.professional} size={52} />
            <div className="flex-1"><div className="font-semibold">{r.professional?.firstName} {r.professional?.lastName}</div><div className="text-sm muted">{r.profile?.type}{r.profile?.licenseNumber ? ` · Nº col. ${r.profile.licenseNumber}` : ''}</div></div>
            {r.status === 'pending' ? <Button onClick={() => setAccept({ ...r, scopes: r.requestedScopes || ['checkins', 'assessments', 'plan'], historyFrom: null })}>Revisar invitación</Button> : <Badge tone="brand"><ShieldCheck className="h-3.5 w-3.5" />Activo desde {fmtDate(r.startedAt)}</Badge>}
          </div>
          {r.status === 'active' && <>
            <div className="mt-5 label">Puede ver</div>
            <div className="mt-2 grid gap-x-6 sm:grid-cols-2">{CARE_SCOPES.map((s) => { const on = r.consent?.scopes?.includes(s); return <Toggle key={s} checked={!!on} label={CARE_SCOPE_LABEL[s]} onChange={(v) => update.mutate({ id: r._id, scopes: v ? [...(r.consent?.scopes || []), s] : r.consent.scopes.filter((x: string) => x !== s) })} />; })}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span className="muted">Historial visible desde:</span><input type="date" className="input !h-9 !w-auto" value={r.consent?.historyFrom?.slice(0, 10) || ''} onChange={(e) => update.mutate({ id: r._id, historyFrom: e.target.value ? new Date(e.target.value).toISOString() : null })} /><span className="text-xs muted">{r.consent?.historyFrom ? '' : '(todo el historial)'}</span></div>
            <div className="mt-4 flex gap-2"><Button size="sm" variant="soft" to="/mensajes" icon={<MessageCircle className="h-4 w-4" />}>Mensaje</Button><Confirm danger title="¿Finalizar la relación?" text="Dejará de ver tus datos nuevos. Su historia clínica se conserva bloqueada el plazo legal." onConfirm={() => update.mutate({ id: r._id, end: true })}>{(open) => <Button size="sm" variant="ghost" onClick={open} icon={<XCircle className="h-4 w-4" />}>Finalizar</Button>}</Confirm></div>
          </>}
        </Card>
      ))}
      <Card>
        <CardTitle title="Familia" subtitle={user?.isMinor ? 'Por tu edad, tu familia tiene acceso a tu progreso general. Tu diario y Kio nunca se comparten.' : 'Opcional: comparte tu progreso con alguien de confianza.'} icon={<Link2 className="h-5 w-5 text-brand-500" />} />
        {data.guardians.filter((g: any) => g.status === 'active').map((g: any) => (
          <div key={g._id} className="mb-4 rounded-2xl bg-ink-50 p-4 dark:bg-white/5">
            <div className="flex items-center gap-3"><Avatar user={g.parent} size={36} /><div className="flex-1 font-medium">{g.parent?.firstName} {g.parent?.lastName}</div>{!user?.isMinor && <Button size="sm" variant="ghost" onClick={() => updG.mutate({ id: g._id, revoke: true })}>Quitar</Button>}</div>
            <div className="mt-3 grid gap-x-6 sm:grid-cols-2">{GUARDIAN_SCOPES.map((s) => <Toggle key={s} checked={g.scopes.includes(s)} label={GUARDIAN_SCOPE_LABEL[s]} onChange={(v) => updG.mutate({ id: g._id, scopes: v ? [...g.scopes, s] : g.scopes.filter((x: string) => x !== s) })} />)}</div>
          </div>
        ))}
        {code || data.guardians.find((g: any) => g.status === 'pending') ? <div className="rounded-2xl bg-brand-50 p-4 text-center dark:bg-brand-500/10"><div className="text-sm">Código para tu familiar (en su cuenta Familia → Vincular):</div><div className="mt-2 font-display text-3xl tracking-[0.25em]">{code?.code || data.guardians.find((g: any) => g.status === 'pending')?.code}</div><Button size="sm" variant="ghost" className="mt-2" icon={<Copy className="h-4 w-4" />} onClick={() => { navigator.clipboard?.writeText(code?.code || data.guardians.find((g: any) => g.status === 'pending')?.code); toast('Copiado'); }}>Copiar</Button></div>
          : <Button variant="outline" loading={genCode.isPending} onClick={() => genCode.mutate(undefined)}>Generar código de vinculación</Button>}
      </Card>
      <Card>
        <CardTitle title="Empresa" subtitle="Si tu empresa ofrece Kinkō, únete con su código. Tu empresa solo verá datos agregados y anónimos de grupos de 10 o más personas." icon={<Building2 className="h-5 w-5 text-brand-500" />} />
        {user?.organization ? <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-brand-500" />Perteneces a <b>{user.organization.name}</b>{user.organization.department && ` · ${user.organization.department}`}</div> : (
          <div className="flex flex-wrap gap-2"><Input placeholder="Código (p. ej. FERRE1)" value={org.code} onChange={(e) => setOrg({ ...org, code: e.target.value.toUpperCase() })} className="!w-40" /><Input placeholder="Departamento (opcional)" value={org.department} onChange={(e) => setOrg({ ...org, department: e.target.value })} className="!w-56" /><Button disabled={!org.code} loading={joinOrg.isPending} onClick={() => joinOrg.mutate(undefined)}>Unirme</Button></div>
        )}
      </Card>
      {accept && (
        <Modal open onClose={() => setAccept(null)} title={`${accept.professional?.firstName} quiere acompañarte`} footer={<Button loading={update.isPending} onClick={async () => { try { await post(`/me/care-team/${accept._id}/accept`, { scopes: accept.scopes, historyFrom: accept.historyFrom }); toast('Invitación aceptada'); setAccept(null); location.reload(); } catch (e: any) { toast(e.message, 'error'); } }}>Aceptar y compartir</Button>}>
          <p className="text-sm muted">Elige qué puede ver. Puedes cambiarlo cuando quieras.</p>
          <div className="mt-4">{CARE_SCOPES.map((s) => <Toggle key={s} checked={accept.scopes.includes(s)} label={CARE_SCOPE_LABEL[s]} onChange={(v) => setAccept({ ...accept, scopes: v ? [...accept.scopes, s] : accept.scopes.filter((x: string) => x !== s) })} />)}</div>
          <div className="mt-4"><Input type="date" label="Compartir historial desde (vacío = todo)" value={accept.historyFrom?.slice(0, 10) || ''} onChange={(e) => setAccept({ ...accept, historyFrom: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
          <p className="mt-4 flex items-center gap-1.5 text-xs muted"><Flag className="h-3.5 w-3.5" />Tus conversaciones con Kio nunca se comparten completas: solo resúmenes que tú decidas.</p>
        </Modal>
      )}
    </div>
  );
}
