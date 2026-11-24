import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, CheckCheck, Download, KeyRound, Laptop, LogOut, Palette, Shield, ShieldCheck, Trash2, User, CreditCard, Camera, Sparkles, Check } from 'lucide-react';
import { PLAN_INFO, PROVINCES } from '@kinko/core';
import { Avatar, Badge, Button, Card, CardTitle, Confirm, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Segmented, Select, Tabs, Textarea, Toggle, cx } from '@/components/ui';
import { useApi, useMut, toast, invalidate } from '@/lib/query';
import { get, post, patch, del, upload, mode } from '@/lib/api';
import { useAuth, applyTheme } from '@/lib/auth';
import { ago, fmtDateTime } from '@/lib/format';

export function Notifications() {
  const { data, isLoading, error } = useApi<any[]>('/me/notifications?limit=100');
  const nav = useNavigate();
  const readAll = useMut(() => post('/me/notifications/read-all'), { invalidate: ['/me/notifications'] });
  const open = async (n: any) => { if (!n.read) { await post(`/me/notifications/${n._id}/read`).catch(() => null); invalidate('/me/notifications'); } if (n.link) nav(n.link); };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notificaciones" actions={<Button variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={() => readAll.mutate(undefined)}>Marcar todo como leído</Button>} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.length ? <Empty icon={<Bell className="h-8 w-8" />} title="Todo al día" /> : (
        <Card className="divide-y divide-ink-100 p-0 dark:divide-white/5">{data.map((n) => (
          <button key={n._id} onClick={() => open(n)} className={cx('flex w-full gap-3 p-4 text-left transition hover:bg-ink-50 dark:hover:bg-white/5', !n.read && 'bg-brand-50/50 dark:bg-brand-500/5')}>
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : n.priority === 'high' || n.priority === 'critical' ? 'bg-rose-500' : 'bg-brand-500')} />
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{n.title}</div>{n.body && <div className="mt-0.5 text-sm muted">{n.body}</div>}<div className="mt-1 text-xs muted">{ago(n.createdAt)}</div></div>
          </button>
        ))}</Card>
      )}
    </div>
  );
}

export function Settings() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'perfil' | 'preferencias' | 'seguridad' | 'privacidad' | 'plan'>((sp.get('tab') as any) || 'perfil');
  const user = useAuth((s) => s.user)!;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Ajustes" subtitle={user.email} />
      <Tabs className="mb-6" value={tab} onChange={setTab} items={[{ id: 'perfil', label: 'Perfil' }, { id: 'preferencias', label: 'Preferencias' }, { id: 'seguridad', label: 'Seguridad' }, { id: 'privacidad', label: 'Privacidad y datos' }, { id: 'plan', label: 'Plan' }]} />
      {tab === 'perfil' && <ProfileTab />}{tab === 'preferencias' && <PrefsTab />}{tab === 'seguridad' && <SecurityTab />}{tab === 'privacidad' && <PrivacyTab />}{tab === 'plan' && <PlanTab />}
    </div>
  );
}

function ProfileTab() {
  const { user, setUser } = useAuth(); const p = user!.profile;
  const [f, setF] = useState<any>({ firstName: p.firstName || '', lastName: p.lastName || '', birthDate: p.birthDate || '', gender: p.gender || 'prefiero_no_decir', province: p.province || '', city: p.city || '', phone: p.phone || '', bio: p.bio || '', avatarHue: p.avatarHue ?? 160 });
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useMut((b: any) => patch('/me/profile', b), { success: 'Perfil guardado', onSuccess: (u: any) => setUser(u) });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-4"><Avatar user={{ ...p, avatarHue: f.avatarHue }} size={72} /><div className="space-y-2"><Button size="sm" variant="outline" icon={<Camera className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Cambiar foto</Button><input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const m = await upload(file, 'public'); save.mutate({ avatarUrl: m.url }); } catch (er: any) { toast(er.message, 'error'); } }} /><input type="range" min={0} max={359} value={f.avatarHue} onChange={(e) => setF({ ...f, avatarHue: Number(e.target.value) })} className="kinko-range block w-40" title="Color" /></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" value={f.firstName} onChange={set('firstName')} /><Input label="Apellidos" value={f.lastName} onChange={set('lastName')} />
        <Input label="Fecha de nacimiento" type="date" value={f.birthDate} onChange={set('birthDate')} />
        <Select label="Género" value={f.gender} onChange={set('gender')}><option value="prefiero_no_decir">Prefiero no decirlo</option><option value="mujer">Mujer</option><option value="hombre">Hombre</option><option value="no_binario">No binario</option></Select>
        <Select label="Provincia" value={f.province} onChange={set('province')}><option value="">—</option>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</Select>
        <Input label="Ciudad" value={f.city} onChange={set('city')} /><Input label="Teléfono" value={f.phone} onChange={set('phone')} />
      </div>
      <Textarea label="Sobre mí" rows={3} value={f.bio} onChange={set('bio')} />
      <Button loading={save.isPending} onClick={() => save.mutate({ ...f, birthDate: f.birthDate || undefined })}>Guardar</Button>
    </Card>
  );
}

function PrefsTab() {
  const { user, setUser } = useAuth(); const s = user!.settings || {};
  const save = useMut((b: any) => patch('/me/settings', b), { onSuccess: (u: any) => { setUser(u); toast('Guardado'); } });
  return (
    <Card className="space-y-4">
      <div><div className="label mb-2 flex items-center gap-2"><Palette className="h-4 w-4" />Tema</div><Segmented value={s.theme || 'system'} onChange={(t) => { applyTheme(t); save.mutate({ theme: t }); }} options={[{ id: 'light', label: 'Claro' }, { id: 'dark', label: 'Oscuro' }, { id: 'system', label: 'Sistema' }]} /></div>
      <Toggle checked={s.reminders !== false} onChange={(v) => save.mutate({ reminders: v })} label="Recordatorio diario de check-in" hint="Una notificación suave, nunca más de una al día." />
      <div className="flex items-center justify-between"><span className="text-sm font-medium">Hora del recordatorio</span><select className="input !h-9 !w-28" value={s.reminderHour ?? 20} onChange={(e) => save.mutate({ reminderHour: Number(e.target.value) })}>{Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}:00</option>)}</select></div>
      <Toggle checked={s.sphereFace !== false} onChange={(v) => save.mutate({ sphereFace: v })} label="Mostrar cara en la esfera" />
      <Toggle checked={!!s.reduceMotion} onChange={(v) => save.mutate({ reduceMotion: v })} label="Reducir animaciones" />
      {user!.role === 'patient' && <Toggle checked={s.aiUseContext !== false} onChange={(v) => save.mutate({ aiUseContext: v })} label="Kio puede usar mi Kinkō y mis pasiones para personalizar" hint="Nunca usa tu diario ni tus notas. Puedes desactivarlo." />}
      <div className="flex items-center justify-between"><span className="text-sm font-medium">Idioma</span><select className="input !h-9 !w-36" value={s.language || 'es'} onChange={(e) => save.mutate({ language: e.target.value })}><option value="es">Castellano</option><option value="eu">Euskara (beta)</option><option value="en">English (beta)</option></select></div>
    </Card>
  );
}

function SecurityTab() {
  const { user, reload, logout } = useAuth(); const nav = useNavigate();
  const sessions = useApi<any[]>('/auth/sessions');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [setup, setSetup] = useState<any>(null); const [code, setCode] = useState('');
  const [disable, setDisable] = useState(false); const [dis, setDis] = useState({ code: '', password: '' });
  const change = useMut(() => post('/auth/password/change', pw), { success: 'Contraseña cambiada. Se han cerrado las demás sesiones.', onSuccess: () => setPw({ current: '', next: '' }) });
  const revoke = useMut((id: string) => del(`/auth/sessions/${id}`), { invalidate: ['/auth/sessions'], success: 'Sesión cerrada' });
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle title="Verificación en dos pasos" icon={<ShieldCheck className="h-5 w-5 text-brand-500" />} subtitle="Protege tu cuenta con un código de tu móvil (Google Authenticator, Authy, 1Password…)." action={user!.twoFactorEnabled ? <Badge tone="brand">Activada</Badge> : <Badge tone="amber">Desactivada</Badge>} />
        {user!.twoFactorEnabled ? <Button variant="outline" onClick={() => setDisable(true)}>Desactivar</Button> : !setup ? <Button onClick={async () => { try { setSetup(await post('/auth/2fa/setup')); } catch (e: any) { toast(e.message, 'error'); } }}>Activar 2FA</Button> : (
          <div className="flex flex-col gap-4 sm:flex-row">
            {setup.qr && <img src={setup.qr} alt="QR" className="h-44 w-44 rounded-2xl bg-white p-2" />}
            <div className="flex-1 space-y-3"><p className="text-sm">Escanea el código con tu app o introduce esta clave: <code className="break-all rounded bg-ink-100 px-1.5 dark:bg-white/10">{setup.secret}</code></p>{mode.demo && <p className="text-xs muted">En la demo, el código válido es 123456.</p>}<Input label="Código de 6 dígitos" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><Button onClick={async () => { try { await post('/auth/2fa/enable', { code }); await reload(); setSetup(null); toast('2FA activada'); } catch (e: any) { toast(e.message, 'error'); } }}>Confirmar</Button></div>
          </div>
        )}
      </Card>
      <Card><CardTitle title="Cambiar contraseña" icon={<KeyRound className="h-5 w-5 text-brand-500" />} />
        <div className="grid gap-3 sm:grid-cols-2"><Input type="password" label="Actual" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /><Input type="password" label="Nueva" hint="Mínimo 10 caracteres, letras y números" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
        <Button className="mt-4" disabled={!pw.current || pw.next.length < 10} loading={change.isPending} onClick={() => change.mutate(undefined)}>Cambiar</Button>
      </Card>
      <Card><CardTitle title="Sesiones abiertas" icon={<Laptop className="h-5 w-5 text-brand-500" />} />
        {sessions.isLoading ? <Loading /> : <div className="space-y-2">{(sessions.data || []).map((s) => <div key={s.id} className="flex items-center gap-3 text-sm"><Laptop className="h-4 w-4 muted" /><div className="min-w-0 flex-1"><div className="truncate">{s.userAgent || 'Dispositivo'}</div><div className="text-xs muted">{s.ip} · {ago(s.lastUsedAt || s.createdAt)}</div></div>{s.current ? <Badge tone="brand">Esta</Badge> : <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>Cerrar</Button>}</div>)}</div>}
        <Button className="mt-4" variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await logout(); nav('/'); }}>Cerrar sesión aquí</Button>
      </Card>
      <Modal open={disable} onClose={() => setDisable(false)} title="Desactivar 2FA" footer={<Button variant="danger" onClick={async () => { try { await post('/auth/2fa/disable', dis); await reload(); setDisable(false); toast('2FA desactivada'); } catch (e: any) { toast(e.message, 'error'); } }}>Desactivar</Button>}>
        <div className="space-y-3"><Input type="password" label="Contraseña" value={dis.password} onChange={(e) => setDis({ ...dis, password: e.target.value })} /><Input label="Código 2FA" value={dis.code} onChange={(e) => setDis({ ...dis, code: e.target.value })} /></div>
      </Modal>
    </div>
  );
}

function PrivacyTab() {
  const { user, setUser, logout } = useAuth(); const nav = useNavigate();
  const [del_, setDel] = useState(false); const [d, setD] = useState({ password: '', confirm: '' });
  const consents = useMut((b: any) => patch('/me/consents', b), { success: 'Preferencias de privacidad guardadas', onSuccess: (u: any) => setUser(u) });
  const [exported, setExported] = useState<string | null>(null);
  const exportData = async () => {
    try {
      const json = JSON.stringify(await get('/me/export'), null, 2);
      const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
      if (embedded) { setExported(json); return; } // en vistas incrustadas las descargas están bloqueadas: mostramos y copiamos
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `kinko-mis-datos-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); toast('Descarga preparada');
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <div className="space-y-6">
      <Card><CardTitle title="Consentimientos" icon={<Shield className="h-5 w-5 text-brand-500" />} />
        <Toggle checked={!!user!.consents?.research} onChange={(v) => consents.mutate({ research: v })} label="Investigación anónima" hint="Tus datos se usan solo agregados (grupos de 10+), con ruido estadístico y sin identificadores, para investigación en salud mental. Puedes retirarlo cuando quieras." />
        <Toggle checked={!!user!.consents?.marketing} onChange={(v) => consents.mutate({ marketing: v })} label="Novedades de Kinkō por email" />
        <p className="mt-3 text-xs muted">Consentimiento de salud (art. 9.2.a RGPD) otorgado el {user!.consents?.acceptedAt ? fmtDateTime(user!.consents.acceptedAt) : 'registro'}. <Link to="/legal/privacidad" className="link">Política de privacidad</Link></p>
      </Card>
      <Card><CardTitle title="Tus datos" subtitle="Derecho de acceso y portabilidad (arts. 15 y 20 RGPD)." icon={<Download className="h-5 w-5 text-brand-500" />} /><Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportData}>Descargar todos mis datos (JSON)</Button></Card>
      <Card className="border border-rose-200 dark:border-rose-500/20"><CardTitle title="Eliminar mi cuenta" subtitle="Borramos tus check-ins, diario, conversaciones con Kio, mediciones y pasiones. La historia clínica que haya escrito tu profesional se conserva bloqueada el plazo legal (Ley 41/2002)." icon={<Trash2 className="h-5 w-5 text-rose-500" />} /><Button variant="danger" onClick={() => setDel(true)}>Eliminar cuenta</Button></Card>
      <Modal open={!!exported} wide onClose={() => setExported(null)} title="Tus datos (JSON)" footer={<Button onClick={async () => { try { await navigator.clipboard.writeText(exported || ''); toast('Copiado'); } catch { toast('No se pudo copiar', 'error'); } }}>Copiar todo</Button>}>
        <p className="mb-3 text-sm muted">{((exported?.length || 0) / 1024).toFixed(0)} KB · en la app instalada se descarga como archivo.</p>
        <pre className="max-h-96 overflow-auto rounded-2xl bg-ink-900 p-4 text-xs text-emerald-200">{exported?.slice(0, 20000)}{(exported?.length || 0) > 20000 ? '\n…' : ''}</pre>
      </Modal>
      <Modal open={del_} onClose={() => setDel(false)} title="Eliminar cuenta definitivamente" footer={<Button variant="danger" disabled={d.confirm !== 'ELIMINAR'} onClick={async () => { try { await post('/me/delete', d); toast('Cuenta eliminada'); await logout(); nav('/'); } catch (e: any) { toast(e.message, 'error'); } }}>Eliminar para siempre</Button>}>
        <div className="space-y-3"><Input type="password" label="Tu contraseña" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} /><Input label="Escribe ELIMINAR" value={d.confirm} onChange={(e) => setD({ ...d, confirm: e.target.value })} /></div>
      </Modal>
    </div>
  );
}

function PlanTab() {
  const { user, reload } = useAuth();
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const options: Record<string, string[]> = { patient: ['free', 'plus'], parent: ['free', 'family'], professional: ['pro_solo', 'pro_plus'] };
  const opts = options[user!.role] || [];
  const sub = useMut((plan: string) => post('/payments/subscribe', { plan, period }), { onSuccess: async (r: any) => { if (r.payment?.url) location.href = r.payment.url; else { await reload(); toast(r.plan === 'free' ? 'Plan cambiado' : '¡Bienvenido/a a tu nuevo plan! (pago simulado)'); } } });
  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3"><CreditCard className="h-5 w-5 text-brand-500" /><div className="flex-1 text-sm">Plan actual: <b>{PLAN_INFO[user!.plan as keyof typeof PLAN_INFO]?.name || user!.plan}</b>{user!.plan === 'care' && ' · incluido por tu profesional'}{user!.plan === 'org' && ' · incluido por tu empresa'}</div></Card>
      {opts.length > 0 ? <>
        <Segmented value={period} onChange={setPeriod} options={[{ id: 'month', label: 'Mensual' }, { id: 'year', label: 'Anual (-37%)' }]} />
        <div className="grid gap-4 sm:grid-cols-2">{opts.map((k) => { const pi = PLAN_INFO[k as keyof typeof PLAN_INFO]; const cur = user!.plan === k; return (
          <Card key={k} className={cx(cur && 'ring-2 ring-brand-400')}><div className="font-semibold text-brand-600 dark:text-brand-300">{pi.name}</div><div className="mt-1 font-display text-2xl">{pi.price}</div><ul className="mt-3 space-y-1.5 text-sm">{pi.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{f}</li>)}</ul><Button className="mt-4" block disabled={cur} variant={cur ? 'outline' : 'primary'} loading={sub.isPending && sub.variables === k} onClick={() => sub.mutate(k)} icon={!cur && k !== 'free' ? <Sparkles className="h-4 w-4" /> : undefined}>{cur ? 'Tu plan' : k === 'free' ? 'Cambiar a gratis' : 'Suscribirme'}</Button></Card>
        ); })}</div>
        <p className="text-xs muted">Pago seguro con Stripe. IVA incluido para particulares. Cancela cuando quieras.</p>
      </> : <p className="text-sm muted">Tu plan lo gestiona tu organización o clínica.</p>}
    </div>
  );
}
export { User };
