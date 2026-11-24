import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, BadgeCheck, CalendarDays, Check, CheckCircle2, Clock, Euro, FileText, MapPin, Plus, Search, Siren, Stethoscope, TrendingDown, TrendingUp, UserPlus, Users, Video, X, Trash2, Copy } from 'lucide-react';
import { ALERT_LABEL, CARE_SCOPES, CARE_SCOPE_LABEL, DOMAINS, DOMAIN_LABEL, PROVINCES } from '@kinko/core';
import { Avatar, Badge, Button, Card, CardTitle, Chip, Confirm, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Segmented, Select, Stat, Tabs, Textarea, Toggle, cx } from '@/components/ui';
import { Bars, Ring, TrendChart } from '@/components/Charts';
import { ContentCard } from '@/pages/patient/Learn';
import { useApi, useMut, toast } from '@/lib/query';
import { post, patch, put, del, upload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ago, fmtDate, fmtDateTime, fmtTime, money } from '@/lib/format';

export const TRIAGE: Record<string, { label: string; dot: string; tone: any }> = { red: { label: 'Atención', dot: 'bg-rose-500', tone: 'rose' }, amber: { label: 'Vigilar', dot: 'bg-amber-400', tone: 'amber' }, green: { label: 'Estable', dot: 'bg-brand-500', tone: 'brand' }, grey: { label: 'Sin datos', dot: 'bg-ink-300', tone: 'ink' } };
export const SEV_TONE: Record<string, any> = { critical: 'rose', high: 'rose', medium: 'amber', low: 'ink' };
const APPT: Record<string, [string, any]> = { requested: ['Pendiente', 'amber'], confirmed: ['Confirmada', 'brand'], completed: ['Completada', 'sky'], cancelled: ['Cancelada', 'ink'], no_show: ['No asistió', 'rose'] };

export function AlertRow({ a, compact }: { a: any; compact?: boolean }) {
  const [note, setNote] = useState(''); const [open, setOpen] = useState(false);
  const upd = useMut((status: string) => patch(`/alerts/${a._id}`, { status, note }), { invalidate: ['/alerts', '/pro/dashboard'], success: 'Alerta actualizada', onSuccess: () => setOpen(false) });
  const contact = useMut(() => post(`/pro/patients/${a.patientId}/crisis-contact`), { success: 'Hemos avisado al paciente de que quieres saber cómo está' });
  return (
    <div className={cx('rounded-2xl p-3', a.severity === 'critical' ? 'bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/20' : 'bg-ink-50 dark:bg-white/5')}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={cx('mt-0.5 h-5 w-5 shrink-0', a.severity === 'critical' || a.severity === 'high' ? 'text-rose-600' : 'text-amber-500')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><Link to={`/pro/pacientes/${a.patientId}`} className="font-semibold hover:underline">{a.patient?.firstName} {a.patient?.lastName}</Link><Badge tone={SEV_TONE[a.severity]}>{ALERT_LABEL[a.type] || a.type}</Badge>{a.status !== 'open' && <Badge>{a.status === 'acknowledged' ? 'Vista' : 'Resuelta'}</Badge>}<span className="text-xs muted">{ago(a.createdAt)}</span></div>
          <p className="mt-1 text-sm">{a.message}</p>
          {!compact && a.notes?.filter((n: any) => n.text).map((n: any, i: number) => <p key={i} className="mt-1 text-xs muted">— {n.text}</p>)}
        </div>
        {a.status !== 'resolved' && <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Gestionar</Button>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Gestionar alerta" footer={<>{a.status === 'open' && <Button variant="outline" loading={upd.isPending} onClick={() => upd.mutate('acknowledged')}>Marcar como vista</Button>}<Button loading={upd.isPending} onClick={() => upd.mutate('resolved')}>Resolver</Button></>}>
        <p className="text-sm">{a.message}</p>
        <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="soft" onClick={() => contact.mutate(undefined)}>Pedir al paciente que contacte</Button><Button size="sm" variant="ghost" to="/mensajes">Escribirle</Button></div>
        <Textarea className="mt-4" label="Nota (protocolo seguido, contacto realizado…)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="mt-3 text-xs muted">Protocolo sugerido ante riesgo: contactar en &lt;24 h, valorar seguridad, plan de seguridad y, si hay riesgo inminente, 112.</p>
      </Modal>
    </div>
  );
}

export function PatientRowCard({ r }: { r: any }) {
  const t = TRIAGE[r.triage];
  return (
    <Link to={`/pro/pacientes/${r.patient.id}`} className="flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-ink-50 dark:hover:bg-white/5">
      <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', t.dot)} title={t.label} />
      <Avatar user={r.patient} size={40} />
      <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.patient.firstName} {r.patient.lastName}{r.status === 'pending' && <Badge tone="amber" className="ml-2">Invitación pendiente</Badge>}</div><div className="text-xs muted">{r.patient.age ? `${r.patient.age} años · ` : ''}{r.lastCheckin ? `último check-in ${fmtDate(r.lastCheckin)}` : 'sin check-ins'}{r.nextAppointment ? ` · cita ${fmtDate(r.nextAppointment)}` : ''}</div></div>
      {r.openAlerts > 0 && <Badge tone="rose"><Siren className="h-3 w-3" />{r.openAlerts}</Badge>}
      {r.kinko && <div className="flex items-center gap-1 text-sm">{r.kinko.trend != null && (r.kinko.trend >= 0 ? <TrendingUp className="h-4 w-4 text-brand-500" /> : <TrendingDown className="h-4 w-4 text-rose-500" />)}<Ring value={r.kinko.overall} size={40} stroke={4} /></div>}
    </Link>
  );
}

export function ProDashboard() {
  const { data: d, isLoading, error } = useApi<any>('/pro/dashboard');
  const user = useAuth((s) => s.user);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Panel clínico" title={`Hola, ${user?.profile?.firstName}`} subtitle="Tus pacientes ordenados por necesidad de atención. Los datos solo se muestran con consentimiento." actions={<Button to="/pro/pacientes?invitar=1" icon={<UserPlus className="h-4 w-4" />}>Invitar paciente</Button>} />
      {d.verification !== 'verified' && <Card className="flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10"><BadgeCheck className="h-5 w-5 text-amber-600" /><div className="flex-1 text-sm">Tu colegiación está <b>{d.verification === 'pending' ? 'pendiente de verificación' : 'sin verificar'}</b>. Hasta entonces no aparecerás en el directorio.</div><Button size="sm" variant="outline" to="/pro/perfil">Revisar perfil</Button></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Pacientes activos" value={d.kpis.activePatients} icon={<Users className="h-5 w-5" />} to="/pro/pacientes" />
        <Stat label="Requieren atención" value={d.kpis.red} icon={<Siren className="h-5 w-5" />} tone="rose" to="/pro/alertas" />
        <Stat label="Adherencia (48 h)" value={`${d.kpis.adherence}%`} icon={<Activity className="h-5 w-5" />} tone="sky" />
        <Stat label="Sesiones 7 días" value={d.kpis.sessionsLast7} icon={<CalendarDays className="h-5 w-5" />} tone="violet" to="/pro/agenda" />
        <Stat label="Invitaciones" value={d.kpis.pending} hint="pendientes" icon={<UserPlus className="h-5 w-5" />} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card><CardTitle title="Triaje" subtitle="Rojo: alertas abiertas o Kinkō < 40 o caída fuerte. Ámbar: < 55 o tendencia negativa." action={<Link to="/pro/pacientes" className="text-sm link">Todos</Link>} />
          <div className="space-y-0.5">{d.triage.slice(0, 12).map((r: any) => <PatientRowCard key={r.relationId} r={r} />)}</div>
          {!d.triage.length && <Empty title="Aún no tienes pacientes" text="Invita a tus pacientes para acompañarles entre sesiones." action={<Button to="/pro/pacientes?invitar=1">Invitar</Button>} />}
        </Card>
        <div className="space-y-6">
          <Card><CardTitle title="Hoy" action={<Link to="/pro/agenda" className="text-sm link">Agenda</Link>} />
            {!d.today.length ? <p className="text-sm muted">Sin sesiones hoy.</p> : <div className="space-y-2">{d.today.map((a: any) => (
              <div key={a._id} className="flex items-center gap-3 rounded-2xl bg-ink-50 p-2.5 dark:bg-white/5"><div className="w-12 text-center font-display text-lg">{fmtTime(a.startAt)}</div><Avatar user={a.patient} size={34} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{a.patient?.firstName} {a.patient?.lastName}</div><div className="text-xs muted">{a.modality === 'video' ? 'Vídeo' : 'Presencial'} · {APPT[a.status]?.[0]}</div></div>{a.status === 'confirmed' && a.modality === 'video' && <Button size="sm" to={`/video/${a._id}`} icon={<Video className="h-4 w-4" />}>Entrar</Button>}<Button size="sm" variant="ghost" to={`/pro/pacientes/${a.patientId}?tab=resumen`}>Pre-sesión</Button></div>
            ))}</div>}
          </Card>
          <Card><CardTitle title="Alertas" action={<Link to="/pro/alertas" className="text-sm link">Todas</Link>} />
            {!d.alerts.length ? <p className="flex items-center gap-2 text-sm muted"><CheckCircle2 className="h-4 w-4 text-brand-500" />Sin alertas abiertas.</p> : <div className="space-y-2">{d.alerts.slice(0, 5).map((a: any) => <AlertRow key={a._id} a={a} compact />)}</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ProPatients() {
  const { data, isLoading, error } = useApi<any[]>('/pro/patients');
  const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'red' | 'amber' | 'green' | 'pending'>('all');
  const [sp] = useSearchParams();
  const [inv, setInv] = useState(() => sp.get('invitar') === '1');
  const list = (data || []).filter((r) => (f === 'all' || (f === 'pending' ? r.status === 'pending' : r.triage === f)) && `${r.patient.firstName} ${r.patient.lastName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader eyebrow="Pacientes" title="Tu consulta" actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInv(true)}>Invitar paciente</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input className="input pl-11" placeholder="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} /></div><Segmented value={f} onChange={setF} options={[{ id: 'all', label: 'Todos' }, { id: 'red', label: 'Atención' }, { id: 'amber', label: 'Vigilar' }, { id: 'green', label: 'Estables' }, { id: 'pending', label: 'Pendientes' }]} /></div>
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : <Card className="p-2">{list.length ? list.map((r) => <PatientRowCard key={r.relationId} r={r} />) : <Empty title="Sin resultados" />}</Card>}
      {inv && <InviteModal onClose={() => setInv(false)} />}
    </div>
  );
}
function InviteModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<any>({ email: '', firstName: '', lastName: '', birthDate: '', scopes: ['checkins', 'assessments', 'journal_shared', 'plan'] });
  const [res, setRes] = useState<any>(null);
  const inv = useMut(() => post('/pro/patients/invite', { ...f, birthDate: f.birthDate || undefined }), { invalidate: ['/pro'], onSuccess: setRes });
  return (
    <Modal open onClose={onClose} title="Invitar paciente" footer={!res && <Button loading={inv.isPending} onClick={() => inv.mutate(undefined)}>Enviar invitación</Button>}>
      {res ? <div className="text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-brand-500" /><p className="mt-3">Invitación enviada. El paciente debe aceptar y elegir qué compartir.</p>{res.tempPassword && <div className="mt-4 rounded-2xl bg-ink-50 p-3 text-sm dark:bg-white/5">Demo · contraseña temporal: <code className="font-semibold">{res.tempPassword}</code><button className="ml-2" onClick={() => { navigator.clipboard?.writeText(res.tempPassword); toast('Copiada'); }}><Copy className="inline h-4 w-4" /></button></div>}<Button className="mt-4" onClick={onClose}>Cerrar</Button></div> : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Nombre" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /><Input label="Apellidos" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
          <Input label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input label="Fecha de nacimiento (opcional)" type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
          <div><div className="label mb-1">Datos que solicitas (el paciente decide)</div>{CARE_SCOPES.map((s) => <Toggle key={s} checked={f.scopes.includes(s)} label={CARE_SCOPE_LABEL[s]} onChange={(v) => setF({ ...f, scopes: v ? [...f.scopes, s] : f.scopes.filter((x: string) => x !== s) })} />)}</div>
        </div>
      )}
    </Modal>
  );
}

export function ProAgenda() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const { data, isLoading, error } = useApi<any[]>(`/appointments?scope=${scope}`);
  const upd = useMut(({ id, status }: any) => patch(`/appointments/${id}`, { status }), { invalidate: ['/appointments', '/pro/dashboard'], success: 'Cita actualizada' });
  const byDay = useMemo(() => { const m: Record<string, any[]> = {}; (data || []).forEach((a) => (m[new Date(a.startAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })] ||= []).push(a)); return Object.entries(m); }, [data]);
  return (
    <div>
      <PageHeader eyebrow="Agenda" title="Tus sesiones" subtitle="Horario de Madrid. Configura tu disponibilidad en Mi perfil." actions={<Segmented value={scope} onChange={setScope} options={[{ id: 'upcoming', label: 'Próximas' }, { id: 'past', label: 'Pasadas' }]} />} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !byDay.length ? <Empty icon={<CalendarDays className="h-8 w-8" />} title="Sin citas" /> : (
        <div className="space-y-6">{byDay.map(([day, xs]) => (
          <div key={day}><div className="mb-2 text-sm font-semibold capitalize">{new Date(`${day}T12:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <Card className="divide-y divide-ink-100 p-0 dark:divide-white/5">{xs.map((a) => (
              <div key={a._id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="w-14 font-display text-lg">{fmtTime(a.startAt)}</div><Avatar user={a.patient} size={36} />
                <div className="min-w-0 flex-1"><Link to={`/pro/pacientes/${a.patientId}`} className="font-medium hover:underline">{a.patient?.firstName} {a.patient?.lastName}</Link><div className="flex items-center gap-2 text-xs muted">{a.modality === 'video' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{a.modality} · {money(a.price)}{a.source === 'directory' && ' · vía directorio'}{a.reason && ` · «${a.reason.slice(0, 40)}»`}</div></div>
                <Badge tone={APPT[a.status]?.[1]}>{APPT[a.status]?.[0]}</Badge>
                <div className="flex gap-1">
                  {a.status === 'requested' && <Button size="sm" onClick={() => upd.mutate({ id: a._id, status: 'confirmed' })} icon={<Check className="h-4 w-4" />}>Confirmar</Button>}
                  {a.status === 'confirmed' && scope === 'upcoming' && a.modality === 'video' && <Button size="sm" variant="soft" to={`/video/${a._id}`} icon={<Video className="h-4 w-4" />}>Sala</Button>}
                  {a.status === 'confirmed' && <><Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: a._id, status: 'completed' })}>Completada</Button><Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: a._id, status: 'no_show' })}>No vino</Button></>}
                  {['requested', 'confirmed'].includes(a.status) && <Confirm title="¿Cancelar cita?" danger onConfirm={() => upd.mutate({ id: a._id, status: 'cancelled' })}>{(o) => <Button size="sm" variant="ghost" onClick={o} icon={<X className="h-4 w-4" />} />}</Confirm>}
                </div>
              </div>
            ))}</Card>
          </div>
        ))}</div>
      )}
    </div>
  );
}

export function ProAlerts() {
  const [st, setSt] = useState<'open' | 'acknowledged' | 'resolved'>('open');
  const { data, isLoading, error } = useApi<any[]>(`/alerts?status=${st}`);
  return (
    <div>
      <PageHeader eyebrow="Alertas" title="Señales que requieren tu atención" subtitle="Generadas por tests (PHQ-9 ítem 9, ASQ), texto con señales de riesgo, botón SOS, deterioro fiable o patrones de recaída." actions={<Segmented value={st} onChange={setSt} options={[{ id: 'open', label: 'Abiertas' }, { id: 'acknowledged', label: 'Vistas' }, { id: 'resolved', label: 'Resueltas' }]} />} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.length ? <Empty icon={<CheckCircle2 className="h-8 w-8" />} title="Nada pendiente" /> : <div className="space-y-2">{data.map((a) => <AlertRow key={a._id} a={a} />)}</div>}
    </div>
  );
}

export function ProContent() {
  const { data, isLoading } = useApi<any[]>('/content?mine=1');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ title: '', type: 'article', summary: '', body: '', url: '', durationMin: 5, tags: '', domains: [], audience: 'patient', premium: false, script: '' });
  const [up, setUp] = useState(false);
  const create = useMut(() => post('/content', { ...f, durationMin: Number(f.durationMin), tags: f.tags.split(',').map((x: string) => x.trim()).filter(Boolean), script: f.script ? f.script.split('\n').map((x: string) => x.trim()).filter(Boolean) : undefined }), { invalidate: ['/content'], success: 'Publicado', onSuccess: () => setOpen(false) });
  const remove = useMut((id: string) => del(`/content/${id}`), { invalidate: ['/content'], success: 'Eliminado' });
  return (
    <div>
      <PageHeader eyebrow="Contenido" title="Tus recursos" subtitle="Crea lecturas, ejercicios guiados (con voz), audios o vídeos y asígnalos en los planes de tus pacientes." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Crear</Button>} />
      {isLoading ? <Loading /> : !data?.length ? <Empty icon={<FileText className="h-8 w-8" />} title="Aún no has creado contenido" /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map((c) => <div key={c._id} className="relative"><ContentCard c={c} base="/contenido" /><Confirm danger title="¿Eliminar recurso?" onConfirm={() => remove.mutate(c._id)}>{(o) => <button onClick={o} className="absolute right-3 top-3 rounded-full bg-white/80 p-1.5 text-rose-600"><Trash2 className="h-4 w-4" /></button>}</Confirm></div>)}</div>}
      <Modal open={open} wide onClose={() => setOpen(false)} title="Nuevo recurso" footer={<Button loading={create.isPending} onClick={() => create.mutate(undefined)}>Publicar</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <Select label="Tipo" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="article">Lectura</option><option value="exercise">Ejercicio guiado</option><option value="audio">Audio</option><option value="video">Vídeo</option></Select>
          <Select label="Para" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="patient">Pacientes</option><option value="parent">Familias</option><option value="all">Todos</option><option value="professional">Profesionales</option></Select>
          <div className="sm:col-span-2"><Input label="Resumen" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
          {(f.type === 'video' || f.type === 'audio') && <div className="sm:col-span-2 flex items-end gap-2"><div className="flex-1"><Input label="Enlace (YouTube, Vimeo o archivo)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div><label className="cursor-pointer"><span className="inline-flex h-11 items-center rounded-2xl bg-ink-100 px-4 text-sm font-medium dark:bg-white/10">{up ? 'Subiendo…' : 'Subir archivo'}</span><input type="file" hidden accept="video/*,audio/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUp(true); try { const m = await upload(file, 'public'); setF((x: any) => ({ ...x, url: m.url })); } catch (er: any) { toast(er.message, 'error'); } finally { setUp(false); } }} /></label></div>}
          <div className="sm:col-span-2"><Textarea label="Texto / transcripción" rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
          {f.type !== 'article' && <div className="sm:col-span-2"><Textarea label="Guion por pasos (una línea por paso; se leerá en voz alta)" rows={4} value={f.script} onChange={(e) => setF({ ...f, script: e.target.value })} /></div>}
          <Input label="Minutos" type="number" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} />
          <Input label="Etiquetas (comas)" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
          <div className="sm:col-span-2 flex flex-wrap gap-1.5">{DOMAINS.map((d) => <Chip key={d} active={f.domains.includes(d)} onClick={() => setF({ ...f, domains: f.domains.includes(d) ? f.domains.filter((x: string) => x !== d) : [...f.domains, d] })}>{DOMAIN_LABEL[d]}</Chip>)}</div>
        </div>
      </Modal>
    </div>
  );
}

const WD = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function ProProfileEdit() {
  const { data, isLoading, error } = useApi<any>('/pro/profile');
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return <ProfileForm initial={data.profile || {}} options={data.options} />;
}
function ProfileForm({ initial, options }: { initial: any; options: any }) {
  const [f, setF] = useState<any>({ type: initial.type || options.types[0], bio: initial.bio || '', specialties: initial.specialties || [], approaches: initial.approaches || [], languages: (initial.languages || ['Español']).join(', '), modalities: initial.modalities || ['online'], price: initial.price ?? 60, sessionMinutes: initial.sessionMinutes ?? 50, city: initial.city || '', province: initial.province || 'Bizkaia', acceptingNew: initial.acceptingNew ?? true, autoConfirm: !!initial.autoConfirm, licenseNumber: initial.licenseNumber || '', college: initial.college || '', availability: initial.availability || [] });
  const save = useMut(() => put('/pro/profile', { ...f, price: Number(f.price), sessionMinutes: Number(f.sessionMinutes), languages: f.languages.split(',').map((x: string) => x.trim()).filter(Boolean) }), { invalidate: ['/pro'], success: 'Perfil guardado' });
  const tog = (k: string, v: string, max = 10) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v].slice(0, max) });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mi perfil" title="Ficha profesional" subtitle="Así te verán en el directorio." actions={<><Badge tone={initial.verificationStatus === 'verified' ? 'brand' : 'amber'}><BadgeCheck className="h-3.5 w-3.5" />{initial.verificationStatus === 'verified' ? 'Verificado' : 'Pendiente de verificación'}</Badge><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Guardar</Button></>} />
      <Card className="grid gap-4 sm:grid-cols-2">
        <Select label="Profesión" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{options.types.map((t: string) => <option key={t}>{t}</option>)}</Select>
        <Input label="Nº de colegiado/a" value={f.licenseNumber} onChange={(e) => setF({ ...f, licenseNumber: e.target.value })} hint="Si lo cambias, se vuelve a verificar." />
        <Input label="Colegio" value={f.college} onChange={(e) => setF({ ...f, college: e.target.value })} />
        <Input label="Idiomas" value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} />
        <Input label="Ciudad" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <Select label="Provincia" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select>
        <Input label="Precio por sesión (€)" type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <Input label="Duración (min)" type="number" value={f.sessionMinutes} onChange={(e) => setF({ ...f, sessionMinutes: e.target.value })} />
        <div className="sm:col-span-2"><Textarea label="Presentación" rows={4} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></div>
        <div className="sm:col-span-2"><div className="label mb-2">Especialidades</div><div className="flex flex-wrap gap-1.5">{options.specialties.map((s: string) => <Chip key={s} active={f.specialties.includes(s)} onClick={() => tog('specialties', s)}>{s}</Chip>)}</div></div>
        <div className="sm:col-span-2"><div className="label mb-2">Enfoques</div><div className="flex flex-wrap gap-1.5">{options.approaches.map((s: string) => <Chip key={s} active={f.approaches.includes(s)} onClick={() => tog('approaches', s, 6)}>{s}</Chip>)}</div></div>
        <div className="flex gap-2 sm:col-span-2">{['online', 'presencial'].map((m) => <Chip key={m} active={f.modalities.includes(m)} onClick={() => tog('modalities', m)}>{m}</Chip>)}</div>
        <Toggle checked={f.acceptingNew} onChange={(v) => setF({ ...f, acceptingNew: v })} label="Acepto pacientes nuevos" />
        <Toggle checked={f.autoConfirm} onChange={(v) => setF({ ...f, autoConfirm: v })} label="Confirmar reservas automáticamente" />
      </Card>
      <Card><CardTitle title="Disponibilidad semanal" subtitle="Hora de Madrid. Los huecos se generan solos con 10 min de margen entre sesiones." action={<Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setF({ ...f, availability: [...f.availability, { weekday: 1, start: '09:00', end: '14:00' }] })}>Añadir franja</Button>} />
        <div className="space-y-2">{f.availability.map((a: any, i: number) => (
          <div key={i} className="flex flex-wrap items-center gap-2"><select className="input !h-10 !w-36" value={a.weekday} onChange={(e) => setF({ ...f, availability: f.availability.map((x: any, j: number) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)) })}>{WD.map((w, k) => <option key={k} value={k}>{w}</option>)}</select><input type="time" className="input !h-10 !w-32" value={a.start} onChange={(e) => setF({ ...f, availability: f.availability.map((x: any, j: number) => (j === i ? { ...x, start: e.target.value } : x)) })} /><span className="muted">a</span><input type="time" className="input !h-10 !w-32" value={a.end} onChange={(e) => setF({ ...f, availability: f.availability.map((x: any, j: number) => (j === i ? { ...x, end: e.target.value } : x)) })} /><button onClick={() => setF({ ...f, availability: f.availability.filter((_: any, j: number) => j !== i) })} className="p-2 muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
        ))}{!f.availability.length && <p className="text-sm muted">Sin franjas: no aparecerán huecos en el directorio.</p>}</div>
      </Card>
    </div>
  );
}

export function ProBilling() {
  const { data, isLoading, error } = useApi<any>('/pro/billing');
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const net = data.totals.revenue - data.totals.commission;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Facturación" title="Tus ingresos" subtitle="Sesiones completadas registradas en Kinkō. La comisión del 10% solo aplica a pacientes que llegan por el directorio." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sesiones" value={data.totals.sessions} icon={<Stethoscope className="h-5 w-5" />} />
        <Stat label="Facturado" value={money(data.totals.revenue)} icon={<Euro className="h-5 w-5" />} tone="sky" />
        <Stat label="Comisión directorio" value={money(data.totals.commission)} icon={<Users className="h-5 w-5" />} tone="amber" />
        <Stat label="Tu plan" value={`${money(data.planPrice)}/mes`} hint={data.plan === 'pro_plus' ? 'Pro Plus' : 'Pro'} icon={<BadgeCheck className="h-5 w-5" />} tone="violet" />
      </div>
      <Card><CardTitle title="Ingresos por mes" subtitle={`Neto tras comisiones: ${money(net)}`} /><Bars data={data.months} x="month" y="revenue" formatX={(m) => new Date(`${m}-01`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })} height={260} /></Card>
      <Card className="p-0"><table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5"><th className="p-3">Mes</th><th>Sesiones</th><th>Facturado</th><th>Comisión</th><th className="pr-3 text-right">Neto</th></tr></thead><tbody>{data.months.slice().reverse().map((m: any) => <tr key={m.month} className="border-b border-ink-100 last:border-0 dark:border-white/5"><td className="p-3 capitalize">{new Date(`${m.month}-01`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</td><td>{m.sessions}</td><td>{money(m.revenue)}</td><td>{money(m.commission)}</td><td className="pr-3 text-right font-medium">{money(m.revenue - m.commission)}</td></tr>)}</tbody></table></Card>
      <p className="text-xs muted">Kinkō no emite tus facturas a pacientes: exporta estos datos para tu gestoría. Integración con facturación electrónica (Verifactu) en la hoja de ruta.</p>
    </div>
  );
}
export { Clock, TrendChart, Tabs };
