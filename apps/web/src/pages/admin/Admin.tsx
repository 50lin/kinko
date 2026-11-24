import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BadgeCheck, Building2, CalendarDays, CheckCircle2, ClipboardCheck, Database, Flag, KeyRound, Package, ScrollText, Search, Server, ShieldAlert, ShieldCheck, ShoppingBag, Siren, UserPlus, Users, XCircle, Brain, Plus } from 'lucide-react';
import { ROLES, ROLE_LABEL } from '@kinko/core';
import { Avatar, Badge, Button, Card, CardTitle, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Stat, Tabs, cx } from '@/components/ui';
import { useApi, useMut } from '@/lib/query';
import { post, patch } from '@/lib/api';
import { ago, fmtDateTime, num, money } from '@/lib/format';

export function AdminOverview() {
  const { data: d, isLoading, error } = useApi<any>('/admin/overview');
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administración" title="Estado de Kinkō" subtitle={`Entorno ${d.env} · base de datos ${d.dbKind} · IA ${d.aiProvider}`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pacientes" value={num(d.roles.patient)} icon={<Users className="h-5 w-5" />} to="/admin/usuarios" />
        <Stat label="Profesionales" value={num(d.roles.professional)} hint={`${d.pendingPros} por verificar`} icon={<BadgeCheck className="h-5 w-5" />} tone="violet" to="/admin/verificaciones" />
        <Stat label="Alertas abiertas" value={d.openAlerts} hint={`${d.criticalAlerts7d} críticas en 7 días`} icon={<Siren className="h-5 w-5" />} tone="rose" />
        <Stat label="Moderación" value={d.heldPosts + d.pendingProducts} hint={`${d.heldPosts} posts · ${d.pendingProducts} productos`} icon={<Flag className="h-5 w-5" />} tone="amber" to="/admin/moderacion" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Altas 7 días" value={d.newUsers7d} icon={<UserPlus className="h-5 w-5" />} tone="sky" />
        <Stat label="Check-ins 7 días" value={num(d.checkins7d)} icon={<Activity className="h-5 w-5" />} />
        <Stat label="Tests 7 días" value={d.assessments7d} icon={<ClipboardCheck className="h-5 w-5" />} tone="violet" />
        <Stat label="Citas 7 días" value={d.appointments7d} icon={<CalendarDays className="h-5 w-5" />} tone="sky" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardTitle title="Usuarios por rol" /><div className="space-y-2">{Object.entries(d.roles).map(([r, n]: any) => <div key={r} className="flex justify-between text-sm"><span>{ROLE_LABEL[r as keyof typeof ROLE_LABEL]}</span><b>{n}</b></div>)}</div></Card>
        <Card><CardTitle title="Pendientes" /><div className="space-y-2 text-sm"><Row l="Profesionales por verificar" v={d.pendingPros} to="/admin/verificaciones" /><Row l="Centros por verificar" v={d.pendingClinics} to="/admin/verificaciones" /><Row l="Claves live por aprobar (DPO)" v={d.pendingKeys} to="/admin/verificaciones" /><Row l="Pedidos 7 días" v={d.orders7d} /><Row l="Pacientes con consentimiento de investigación" v={d.researchConsent} /></div></Card>
      </div>
    </div>
  );
}
const Row = ({ l, v, to }: { l: string; v: any; to?: string }) => <div className="flex justify-between">{to ? <Link to={to} className="link">{l}</Link> : <span>{l}</span>}<b>{v}</b></div>;

export function AdminUsers() {
  const [q, setQ] = useState(''); const [role, setRole] = useState('');
  const { data, isLoading } = useApi<any[]>(`/admin/users?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}${role ? `&role=${role}` : ''}`);
  const upd = useMut(({ id, ...b }: any) => patch(`/admin/users/${id}`, b), { invalidate: ['/admin/users'], success: 'Usuario actualizado' });
  return (
    <div>
      <PageHeader eyebrow="Usuarios" title="Gestión de cuentas" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input className="input pl-11" placeholder="Email o nombre" value={q} onChange={(e) => setQ(e.target.value)} /></div><select className="input sm:!w-48" value={role} onChange={(e) => setRole(e.target.value)}><option value="">Todos los roles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
      {isLoading ? <Loading /> : <Card className="overflow-x-auto p-0"><table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5"><th className="p-3">Usuario</th><th>Rol</th><th>Plan</th><th>2FA</th><th>Último acceso</th><th>Estado</th><th className="pr-3" /></tr></thead><tbody>{(data || []).map((u) => (
        <tr key={u.id} className="border-b border-ink-100 last:border-0 dark:border-white/5"><td className="p-3"><div className="flex items-center gap-2"><Avatar user={u} size={28} /><div><div className="font-medium">{u.firstName} {u.lastName}</div><div className="text-xs muted">{u.email}</div></div></div></td><td>{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</td><td><Badge>{u.plan}</Badge></td><td>{u.twoFactor ? <ShieldCheck className="h-4 w-4 text-brand-500" /> : '—'}</td><td className="text-xs muted">{u.lastLoginAt ? ago(u.lastLoginAt) : '—'}</td><td><Badge tone={u.status === 'active' ? 'brand' : u.status === 'suspended' ? 'rose' : 'amber'}>{u.status}</Badge></td><td className="pr-3 text-right">{u.role !== 'admin' && (u.status === 'suspended' ? <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: u.id, status: 'active' })}>Reactivar</Button> : <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: u.id, status: 'suspended' })}>Suspender</Button>)}</td></tr>
      ))}</tbody></table></Card>}
    </div>
  );
}

export function AdminVerifications() {
  const { data, isLoading, error } = useApi<any>('/admin/verifications');
  const pro = useMut(({ id, approved }: any) => post(`/admin/professionals/${id}/verify`, { approved, note: approved ? 'Colegiación comprobada en el registro del colegio.' : 'No consta en el registro del colegio indicado.' }), { invalidate: ['/admin'], success: 'Hecho' });
  const clinic = useMut(({ id, approved }: any) => post(`/admin/clinics/${id}/verify`, { approved }), { invalidate: ['/admin'], success: 'Hecho' });
  const key = useMut(({ id, approved }: any) => post(`/admin/apikeys/${id}/approve`, { approved }), { invalidate: ['/admin'], success: 'Hecho' });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const Act = ({ on }: { on: (ok: boolean) => void }) => <div className="flex gap-1"><Button size="sm" onClick={() => on(true)} icon={<CheckCircle2 className="h-4 w-4" />}>Aprobar</Button><Button size="sm" variant="ghost" onClick={() => on(false)} icon={<XCircle className="h-4 w-4" />}>Rechazar</Button></div>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Verificaciones" title="Confianza antes que crecimiento" subtitle="Comprueba la colegiación en el buscador del Consejo General de la Psicología o del colegio de médicos correspondiente antes de aprobar." />
      <Card><CardTitle title="Profesionales" icon={<BadgeCheck className="h-5 w-5 text-brand-500" />} />{!data.professionals.length ? <p className="text-sm muted">Nada pendiente.</p> : data.professionals.map((p: any) => <div key={p._id} className="flex flex-wrap items-center gap-3 border-b border-ink-100 py-3 last:border-0 dark:border-white/5"><Avatar user={p.user} size={40} /><div className="flex-1"><div className="font-medium">{p.user.firstName} {p.user.lastName} <span className="text-xs muted">{p.user.email}</span></div><div className="text-xs muted">{p.type} · Nº {p.licenseNumber || '—'} · {p.college || 'colegio no indicado'}</div></div><Act on={(approved) => pro.mutate({ id: p.userId, approved })} /></div>)}</Card>
      <Card><CardTitle title="Centros" icon={<Building2 className="h-5 w-5 text-brand-500" />} />{!data.clinics.length ? <p className="text-sm muted">Nada pendiente.</p> : data.clinics.map((c: any) => <div key={c._id} className="flex flex-wrap items-center gap-3 border-b border-ink-100 py-3 last:border-0 dark:border-white/5"><div className="flex-1"><div className="font-medium">{c.name}</div><div className="text-xs muted">{c.city}, {c.province} · registro sanitario a comprobar</div></div><Act on={(approved) => clinic.mutate({ id: c._id, approved })} /></div>)}</Card>
      <Card><CardTitle title="Claves API live (revisión DPO)" icon={<KeyRound className="h-5 w-5 text-brand-500" />} />{!data.apiKeys.length ? <p className="text-sm muted">Nada pendiente.</p> : data.apiKeys.map((k: any) => <div key={k._id} className="flex flex-wrap items-center gap-3 border-b border-ink-100 py-3 last:border-0 dark:border-white/5"><div className="flex-1"><div className="font-medium">{k.name} · {k.owner?.firstName} {k.owner?.lastName}</div><p className="text-xs muted">{k.purpose}</p></div><Act on={(approved) => key.mutate({ id: k._id, approved })} /></div>)}</Card>
    </div>
  );
}

export function AdminModeration() {
  const { data, isLoading, error } = useApi<any>('/admin/moderation');
  const post_ = useMut(({ id, status }: any) => patch(`/admin/forum/posts/${id}`, { status }), { invalidate: ['/admin', '/forum'], success: 'Hecho' });
  const com = useMut(({ id, status }: any) => patch(`/admin/forum/comments/${id}`, { status }), { invalidate: ['/admin'], success: 'Hecho' });
  const prod = useMut(({ id, status }: any) => patch(`/admin/products/${id}`, { status }), { invalidate: ['/admin', '/shop'], success: 'Hecho' });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Moderación" title="Comunidad y tienda" subtitle="Las publicaciones con señales de riesgo se retienen automáticamente y el autor recibe recursos de ayuda. Revisa y contacta si procede." />
      <Card><CardTitle title="Publicaciones retenidas o reportadas" icon={<ShieldAlert className="h-5 w-5 text-rose-500" />} />{!data.posts.length ? <p className="text-sm muted">Nada pendiente.</p> : data.posts.map((p: any) => <div key={p._id} className="border-b border-ink-100 py-3 last:border-0 dark:border-white/5"><div className="flex items-center gap-2 text-xs muted"><Badge tone={p.status === 'held' ? 'rose' : 'amber'}>{p.status === 'held' ? `Riesgo ${p.moderation?.risk}` : `${p.reports?.length} reportes`}</Badge>{p.author?.firstName} {p.author?.lastName} · {ago(p.createdAt)}</div><div className="mt-1 font-medium">{p.title}</div><p className="mt-1 line-clamp-3 text-sm muted">{p.body}</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => post_.mutate({ id: p._id, status: 'visible' })}>Publicar</Button><Button size="sm" variant="ghost" onClick={() => post_.mutate({ id: p._id, status: 'hidden' })}>Ocultar</Button></div></div>)}</Card>
      <Card><CardTitle title="Comentarios retenidos" />{!data.comments.length ? <p className="text-sm muted">Nada pendiente.</p> : data.comments.map((c: any) => <div key={c._id} className="flex items-center gap-3 border-b border-ink-100 py-3 last:border-0 dark:border-white/5"><p className="flex-1 text-sm">{c.body}</p><Button size="sm" onClick={() => com.mutate({ id: c._id, status: 'visible' })}>Publicar</Button><Button size="sm" variant="ghost" onClick={() => com.mutate({ id: c._id, status: 'hidden' })}>Ocultar</Button></div>)}</Card>
      <Card><CardTitle title="Productos pendientes" icon={<ShoppingBag className="h-5 w-5 text-brand-500" />} />{!data.products.length ? <p className="text-sm muted">Nada pendiente.</p> : data.products.map((p: any) => <div key={p._id} className="flex flex-wrap items-center gap-3 border-b border-ink-100 py-3 last:border-0 dark:border-white/5"><Package className="h-5 w-5 muted" /><div className="flex-1"><div className="font-medium">{p.name} · {money(p.price)}</div><p className="text-xs muted">{p.description}</p></div><Button size="sm" onClick={() => prod.mutate({ id: p._id, status: 'active' })}>Aprobar</Button><Button size="sm" variant="ghost" onClick={() => prod.mutate({ id: p._id, status: 'rejected' })}>Rechazar</Button></div>)}</Card>
    </div>
  );
}

export function AdminContent() {
  const { data, isLoading } = useApi<any[]>('/content');
  const upd = useMut(({ id, ...b }: any) => patch(`/content/${id}`, b), { invalidate: ['/content'], success: 'Actualizado' });
  return (
    <div>
      <PageHeader eyebrow="Contenido" title="Biblioteca" subtitle="Revisión clínica de recursos publicados." />
      {isLoading ? <Loading /> : <Card className="p-0"><table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5"><th className="p-3">Título</th><th>Tipo</th><th>Para</th><th>Vistas</th><th className="pr-3 text-right">Acciones</th></tr></thead><tbody>{(data || []).map((c) => <tr key={c._id} className="border-b border-ink-100 last:border-0 dark:border-white/5"><td className="p-3"><Link to={`/contenido/${c.slug}`} className="font-medium hover:underline">{c.title}</Link>{c.premium && <Badge tone="violet" className="ml-2">Plus</Badge>}</td><td>{c.type}</td><td>{c.audience}</td><td>{c.views}</td><td className="pr-3 text-right"><Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: c._id, status: 'hidden' })}>Ocultar</Button></td></tr>)}</tbody></table></Card>}
    </div>
  );
}

export function AdminAudit() {
  const [action, setAction] = useState('');
  const { data, isLoading } = useApi<any[]>(`/admin/audit?limit=200${action ? `&action=${action}` : ''}`);
  return (
    <div>
      <PageHeader eyebrow="Auditoría" title="Registro de accesos" subtitle="Quién accedió a qué dato clínico y cuándo (RGPD art. 30 y 32; ENS). Inmutable desde la aplicación." />
      <div className="mb-4 flex flex-wrap gap-1.5">{[['', 'Todo'], ['patient.', 'Accesos a pacientes'], ['records.', 'Historia clínica'], ['consent.', 'Consentimientos'], ['auth.', 'Autenticación'], ['gdpr.', 'RGPD'], ['insights.', 'API de datos'], ['admin.', 'Administración']].map(([k, l]) => <button key={k} onClick={() => setAction(k)} className={cx('rounded-full px-3 py-1.5 text-xs font-medium', action === k ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-ink-100 dark:bg-white/5')}>{l}</button>)}</div>
      {isLoading ? <Loading /> : <Card className="overflow-x-auto p-0"><table className="w-full text-xs"><thead><tr className="border-b border-ink-100 text-left muted dark:border-white/5"><th className="p-3">Fecha</th><th>Acción</th><th>Actor</th><th>Paciente</th><th>Recurso</th><th className="pr-3">IP</th></tr></thead><tbody>{(data || []).map((l) => <tr key={l._id} className="border-b border-ink-100 last:border-0 dark:border-white/5"><td className="whitespace-nowrap p-3">{fmtDateTime(l.createdAt)}</td><td><code>{l.action}</code></td><td>{l.actor ? `${l.actor.firstName} ${l.actor.lastName}` : 'sistema'}</td><td>{l.patient ? `${l.patient.firstName} ${l.patient.lastName}` : '—'}</td><td className="muted">{l.resource}</td><td className="pr-3 muted">{l.ip || '—'}</td></tr>)}</tbody></table>{!data?.length && <p className="p-4 text-sm muted">Sin registros.</p>}</Card>}
    </div>
  );
}

export function AdminSystem() {
  const { data: s, isLoading } = useApi<any>('/admin/system');
  const orgs = useApi<any[]>('/admin/organizations');
  const [open, setOpen] = useState(false); const [f, setF] = useState({ name: '', employees: 50, adminEmail: '' });
  const create = useMut(() => post('/admin/organizations', { ...f, employees: Number(f.employees) }), { invalidate: ['/admin/organizations'], success: 'Organización creada', onSuccess: () => setOpen(false) });
  if (isLoading) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sistema" title="Configuración y salud" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Base de datos" value={s.db} icon={<Database className="h-5 w-5" />} /><Stat label="IA" value={s.ai || 'motor local'} icon={<Brain className="h-5 w-5" />} tone="violet" /><Stat label="2FA staff" value={s.require2fa ? 'Obligatorio' : 'Opcional'} icon={<ShieldCheck className="h-5 w-5" />} tone="sky" /><Stat label="Privacidad datos" value={`k=${s.kAnon} · ε=${s.epsilon}`} icon={<Server className="h-5 w-5" />} tone="amber" /></div>
      <Card><CardTitle title="Colecciones" subtitle={`Modo demo: ${s.demoMode ? 'sí' : 'no'} · ${fmtDateTime(s.time)}`} /><div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">{Object.entries(s.counts).map(([k, v]: any) => <div key={k} className="flex justify-between rounded-xl bg-ink-50 px-3 py-2 text-sm dark:bg-white/5"><code>{k}</code><b>{num(v)}</b></div>)}</div></Card>
      <Card><CardTitle title="Empresas cliente" action={<Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Nueva</Button>} />{(orgs.data || []).map((o) => <div key={o._id} className="flex justify-between border-b border-ink-100 py-2 text-sm last:border-0 dark:border-white/5"><span className="font-medium">{o.name}</span><span className="muted">{o.employees} empleados · código {o.joinCode}</span></div>)}</Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva empresa" footer={<Button loading={create.isPending} onClick={() => create.mutate(undefined)}>Crear</Button>}><div className="space-y-3"><Input label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><Input label="Empleados" type="number" value={f.employees} onChange={(e) => setF({ ...f, employees: Number(e.target.value) })} /><Input label="Email del responsable (ya registrado)" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></div></Modal>
    </div>
  );
}
export { Tabs, Select, Empty, Users };
