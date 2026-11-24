import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Building2, CalendarDays, Euro, Gauge, Siren, Trash2, UserPlus, Users, UserX, Copy, MapPin, Video, Star } from 'lucide-react';
import { PROVINCES, SPECIALTIES } from '@kinko/core';
import { Avatar, Badge, Button, Card, CardTitle, Chip, Confirm, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Progress, Select, Stat, Textarea, cx } from '@/components/ui';
import { Bars } from '@/components/Charts';
import { useApi, useMut, toast } from '@/lib/query';
import { post, patch, del } from '@/lib/api';
import { fmtDate, fmtTime, money } from '@/lib/format';

function CreateClinic() {
  const [f, setF] = useState({ name: '', city: '', province: 'Bizkaia', address: '', phone: '', description: '' });
  const create = useMut(() => post('/clinic', f), { invalidate: ['/clinic'], success: 'Centro creado. Lo verificaremos en 24-48 h.' });
  return (
    <div className="mx-auto max-w-xl"><PageHeader eyebrow="Bienvenida" title="Da de alta tu centro" subtitle="Equipo, agenda compartida y seguimiento entre sesiones para todos tus profesionales." />
      <Card className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Input label="Nombre del centro" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><Input label="Ciudad" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /><Select label="Provincia" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select><div className="sm:col-span-2"><Input label="Dirección" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div><Input label="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /><div className="sm:col-span-2"><Textarea label="Descripción" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div><div className="sm:col-span-2"><Button block loading={create.isPending} onClick={() => create.mutate(undefined)}>Crear centro</Button></div></Card>
    </div>
  );
}

export function ClinicDashboard() {
  const clinic = useApi<any>('/clinic');
  const { data: d, isLoading, error } = useApi<any>(clinic.data ? '/clinic/dashboard' : null);
  if (clinic.isLoading || (clinic.data && isLoading)) return <Loading />;
  if (!clinic.data) return <CreateClinic />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Panel del centro" title={d.clinic.name} actions={d.clinic.verificationStatus === 'verified' ? <Badge tone="brand"><BadgeCheck className="h-3.5 w-3.5" />Verificado</Badge> : <Badge tone="amber">Verificación pendiente</Badge>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Profesionales" value={d.kpis.professionals} icon={<Users className="h-5 w-5" />} to="/clinica/equipo" />
        <Stat label="Pacientes activos" value={d.kpis.activePatients} icon={<Users className="h-5 w-5" />} tone="sky" to="/clinica/pacientes" />
        <Stat label="Facturación del mes" value={money(d.kpis.monthRevenue)} hint={`${d.kpis.monthSessions} sesiones`} icon={<Euro className="h-5 w-5" />} tone="violet" />
        <Stat label="Ocupación media" value={`${d.kpis.occupancy}%`} hint={`${d.kpis.weekAhead} citas próximos 7 días`} icon={<Gauge className="h-5 w-5" />} tone="amber" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Stat label="Alertas abiertas del equipo" value={d.kpis.openAlerts} icon={<Siren className="h-5 w-5" />} tone="rose" /><Stat label="No asistencias este mes" value={`${d.kpis.noShowRate}%`} icon={<UserX className="h-5 w-5" />} tone="amber" /></div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card><CardTitle title="Sesiones completadas" subtitle="Últimos 60 días" /><Bars data={d.sessionsByDay} x="date" y="n" height={240} /></Card>
        <Card><CardTitle title="Equipo" subtitle="Ocupación de la próxima semana" />
          <div className="space-y-3">{d.professionals.map((p: any) => <div key={p.id} className="flex items-center gap-3"><Avatar user={p} size={36} /><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-sm font-medium">{p.firstName} {p.lastName}{p.verified && <BadgeCheck className="h-3.5 w-3.5 text-brand-500" />}</div><Progress value={p.occupancy} className="mt-1.5" tone={p.occupancy > 85 ? 'bg-rose-500' : p.occupancy > 60 ? 'bg-amber-500' : 'bg-brand-500'} /></div><div className="w-24 text-right text-xs muted">{p.occupancy}% · {p.patients} pac.</div></div>)}</div>
        </Card>
      </div>
      <p className="text-xs muted">La administración del centro no accede a datos clínicos de los pacientes: solo a información de gestión (mínimo necesario, RGPD art. 5.1.c).</p>
    </div>
  );
}

export function ClinicTeam() {
  const { data, isLoading, error } = useApi<any[]>('/clinic/members');
  const [open, setOpen] = useState(false); const [res, setRes] = useState<any>(null);
  const [f, setF] = useState({ email: '', firstName: '', lastName: '', role: 'professional', licenseNumber: '' });
  const invite = useMut(() => post('/clinic/members/invite', f), { invalidate: ['/clinic'], onSuccess: setRes });
  const remove = useMut((uid: string) => del(`/clinic/members/${uid}`), { invalidate: ['/clinic'], success: 'Eliminado del equipo' });
  return (
    <div>
      <PageHeader eyebrow="Equipo" title="Profesionales del centro" actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => { setRes(null); setOpen(true); }}>Añadir</Button>} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : <Card className="divide-y divide-ink-100 p-0 dark:divide-white/5">{data!.map((m) => (
        <div key={m.userId} className="flex flex-wrap items-center gap-3 p-4"><Avatar user={m.user} size={44} /><div className="min-w-0 flex-1"><div className="font-medium">{m.user?.firstName} {m.user?.lastName}</div><div className="text-xs muted">{m.email} · {m.role === 'admin' ? 'Administración' : m.role === 'staff' ? 'Recepción' : m.professional?.type}</div></div>{m.professional && <Badge tone={m.professional.verified ? 'brand' : 'amber'}>{m.professional.verified ? 'Verificado' : 'Pendiente'}</Badge>}{m.professional?.rating && <span className="flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{m.professional.rating}</span>}{m.role !== 'admin' && <Confirm danger title="¿Quitar del equipo?" text="Sus pacientes seguirán con él/ella, pero dejará de estar vinculado al centro." onConfirm={() => remove.mutate(m.userId)}>{(o) => <button onClick={o} className="p-2 muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</Confirm>}</div>
      ))}</Card>}
      <Modal open={open} onClose={() => setOpen(false)} title="Añadir al equipo" footer={!res && <Button loading={invite.isPending} onClick={() => invite.mutate(undefined)}>Invitar</Button>}>
        {res ? <div className="text-center"><p>Invitación enviada.</p>{res.tempPassword && <div className="mt-3 rounded-2xl bg-ink-50 p-3 text-sm dark:bg-white/5">Demo · contraseña temporal: <code className="font-semibold">{res.tempPassword}</code> <button onClick={() => { navigator.clipboard?.writeText(res.tempPassword); toast('Copiada'); }}><Copy className="inline h-4 w-4" /></button></div>}</div> : <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nombre" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /><Input label="Apellidos" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          <div className="sm:col-span-2"><Input label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <Select label="Rol" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="professional">Profesional sanitario</option><option value="staff">Recepción / gestión</option></Select>
          {f.role === 'professional' && <Input label="Nº colegiado" value={f.licenseNumber} onChange={(e) => setF({ ...f, licenseNumber: e.target.value })} />}
        </div>}
      </Modal>
    </div>
  );
}

export function ClinicAgenda() {
  const { data, isLoading, error } = useApi<any[]>('/appointments?scope=upcoming');
  const [pro, setPro] = useState('');
  const pros = useMemo(() => Array.from(new Map((data || []).map((a) => [a.professionalId, a.professional])).entries()), [data]);
  const byDay = useMemo(() => { const m: Record<string, any[]> = {}; (data || []).filter((a) => !pro || a.professionalId === pro).forEach((a) => (m[new Date(a.startAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })] ||= []).push(a)); return Object.entries(m); }, [data, pro]);
  return (
    <div>
      <PageHeader eyebrow="Agenda del centro" title="Próximas citas" />
      <div className="mb-4 flex flex-wrap gap-1.5"><Chip active={!pro} onClick={() => setPro('')}>Todo el equipo</Chip>{pros.map(([id, p]: any) => <Chip key={id} active={pro === id} onClick={() => setPro(id)}><Avatar user={p} size={18} />{p?.firstName}</Chip>)}</div>
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !byDay.length ? <Empty icon={<CalendarDays className="h-8 w-8" />} title="Sin citas" /> : <div className="space-y-6">{byDay.map(([day, xs]) => (
        <div key={day}><div className="mb-2 text-sm font-semibold capitalize">{new Date(`${day}T12:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <Card className="divide-y divide-ink-100 p-0 dark:divide-white/5">{xs.map((a) => <div key={a._id} className="flex items-center gap-3 p-3 text-sm"><span className="w-12 font-display text-lg">{fmtTime(a.startAt)}</span><Avatar user={a.professional} size={28} /><span className="w-32 truncate muted">{a.professional?.firstName} {a.professional?.lastName}</span><span className="flex-1 truncate font-medium">{a.patient?.firstName} {a.patient?.lastName?.[0]}.</span>{a.modality === 'video' ? <Video className="h-4 w-4 muted" /> : <MapPin className="h-4 w-4 muted" />}<Badge tone={a.status === 'confirmed' ? 'brand' : 'amber'}>{a.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}</Badge></div>)}</Card>
        </div>
      ))}</div>}
    </div>
  );
}

export function ClinicPatients() {
  const { data, isLoading, error } = useApi<any[]>('/clinic/patients');
  return (
    <div>
      <PageHeader eyebrow="Pacientes" title="Pacientes del centro" subtitle="Vista administrativa: sin datos clínicos. Cada profesional gestiona la información sanitaria de sus pacientes." />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : <Card className="p-0"><table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5"><th className="p-3">Paciente</th><th>Profesional</th><th>Desde</th><th>Próxima cita</th><th className="pr-3">Estado</th></tr></thead><tbody>{data!.map((r) => <tr key={r.relationId} className="border-b border-ink-100 last:border-0 dark:border-white/5"><td className="p-3"><div className="flex items-center gap-2"><Avatar user={r.patient} size={28} />{r.patient?.firstName} {r.patient?.lastName}</div></td><td>{r.professional?.firstName} {r.professional?.lastName}</td><td>{fmtDate(r.since)}</td><td>{r.nextAppointment ? fmtDate(r.nextAppointment) : '—'}</td><td className="pr-3"><Badge tone={r.status === 'active' ? 'brand' : 'amber'}>{r.status === 'active' ? 'Activo' : 'Invitado'}</Badge></td></tr>)}</tbody></table></Card>}
    </div>
  );
}

export function ClinicProfile() {
  const { data, isLoading } = useApi<any>('/clinic');
  if (isLoading) return <Loading />;
  if (!data) return <CreateClinic />;
  return <ClinicForm c={data} />;
}
function ClinicForm({ c }: { c: any }) {
  const [f, setF] = useState({ name: c.name, city: c.city, province: c.province, address: c.address || '', phone: c.phone || '', email: c.email || '', description: c.description || '', website: c.website || '', specialties: c.specialties || [] });
  const save = useMut(() => patch('/clinic', { ...f, email: f.email || undefined }), { invalidate: ['/clinic'], success: 'Perfil del centro guardado' });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Perfil del centro" title={c.name} actions={<><Button variant="ghost" to={`/centros/${c.slug}`}>Ver ficha pública</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Guardar</Button></>} />
      <Card className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><Input label="Web" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
        <Input label="Ciudad" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /><Select label="Provincia" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select>
        <Input label="Dirección" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /><Input label="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input label="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div className="sm:col-span-2"><Textarea label="Descripción" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="sm:col-span-2"><div className="label mb-2">Especialidades</div><div className="flex flex-wrap gap-1.5">{SPECIALTIES.map((s) => <Chip key={s} active={f.specialties.includes(s)} onClick={() => setF({ ...f, specialties: f.specialties.includes(s) ? f.specialties.filter((x: string) => x !== s) : [...f.specialties, s] })}>{s}</Chip>)}</div></div>
      </Card>
      <Card className="flex items-center gap-3"><Building2 className="h-5 w-5 text-brand-500" /><p className="flex-1 text-sm">Plan Clínica: 59 € por profesional al mes, con panel de centro, agenda compartida e informes. <Link to="/ajustes?tab=plan" className="link">Gestionar</Link></p></Card>
    </div>
  );
}
export { cx };
