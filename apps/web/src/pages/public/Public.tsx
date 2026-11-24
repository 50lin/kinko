import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Brain, CalendarCheck, Fingerprint, HeartHandshake, LineChart, Lock, ShieldCheck, Sparkles, Stethoscope, Users, Building2, Baby, BarChart3, Bluetooth, Check, Phone } from 'lucide-react';
import { PLAN_INFO, PROVINCES, ROLE_LABEL } from '@kinko/core';
import { Sphere } from '@/components/Sphere';
import { Logo, PublicShell } from '@/components/Layout';
import { Avatar, Badge, Button, Card, Chip, Input, Select, cx } from '@/components/ui';
import { useApi, toast } from '@/lib/query';
import { HOME, useAuth } from '@/lib/auth';
import { mode, post } from '@/lib/api';

/** Iniciales legibles a partir de la etiqueta de la cuenta de demo («Dra. Elena Urrutia · …» → EU). */
function demoPerson(label: string, email: string) {
  const words = label.split('·')[0].replace(/,.*$/, '').replace(/^(Dra?\.)\s+/, '').trim().split(/\s+/);
  return { firstName: words[0] || '', lastName: words[1] || '', avatarHue: [...email].reduce((a, c) => a + c.charCodeAt(0), 0) % 360 };
}

export function DemoAccounts({ compact }: { compact?: boolean }) {
  const { data } = useApi<any>('/auth/demo-accounts');
  const demoLogin = useAuth((s) => s.demoLogin);
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data?.enabled) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand-500" /> Entra como cualquier perfil {!compact && <span className="font-normal muted">· contraseña de todas: <code className="rounded bg-ink-100 px-1.5 py-0.5 dark:bg-white/10">{data.password}</code></span>}</div>
      <div className={cx('grid gap-2', compact ? 'grid-cols-1 sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
        {data.accounts.map((a: any) => (
          <button key={a.email} disabled={!!busy} onClick={async () => { setBusy(a.email); try { const u = await demoLogin(a.email); nav(HOME[u.role as keyof typeof HOME]); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } }}
            className="group flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-white/5">
            <Avatar user={demoPerson(a.label, a.email)} size={38} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{a.label}</div><div className="text-xs muted">{ROLE_LABEL[a.role as keyof typeof ROLE_LABEL]}</div></div>
            <ArrowRight className={cx('h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500', busy === a.email && 'animate-pulse')} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const user = useAuth((s) => s.user);
  const demo = { animo: 72, calma: 58, sueno: 64, energia: 70, vinculos: 81, proposito: 76, actividad: 55 };
  const features = [
    { icon: Sparkles, t: 'Esfera Kinkō 3D', d: 'Siete dimensiones de tu bienestar en un objeto vivo que cambia contigo y respira a tu ritmo.' },
    { icon: Brain, t: 'Kio, tu organizador de ideas', d: 'Una IA que no diagnostica: ordena el ruido mental, separa hechos de interpretaciones y propone el siguiente paso pequeño.' },
    { icon: LineChart, t: 'Tests validados', d: 'PHQ-9, GAD-7, WHO-5, burnout, autoestima, soledad y cribado de seguridad, con detección de cambios fiables.' },
    { icon: HeartHandshake, t: 'Mapa de pasiones', d: 'Lo que te apasiona es salud. Detectamos lo que necesita espacio o apoyo y te acompañamos a retomarlo.' },
    { icon: Stethoscope, t: 'Puente con tu profesional', d: 'Tu psicóloga ve tu evolución completa entre sesiones, solo con tu consentimiento y solo lo que tú elijas.' },
    { icon: Bluetooth, t: 'Dispositivos de salud', d: 'Bandas de pulso (variabilidad cardiaca), tensiómetros, básculas y oxímetros Bluetooth estándar.' },
  ];
  const segments = [
    { icon: Users, t: 'Personas', d: 'Check-in de 60 segundos, rutas de cuidado, comunidad y ayuda inmediata.' },
    { icon: Stethoscope, t: 'Profesionales', d: 'Triaje con semáforo, línea de vida, historia clínica cifrada, plan de tratamiento y vídeo.' },
    { icon: Building2, t: 'Clínicas', d: 'Equipo, agenda compartida, ocupación, ingresos y alertas del centro.' },
    { icon: Baby, t: 'Familias', d: 'Evolución de tu hijo sin invadir su intimidad y alertas de crisis siempre.' },
    { icon: BarChart3, t: 'Empresas e investigación', d: 'Indicadores agregados y anónimos con k-anonimato y privacidad diferencial.' },
  ];
  return (
    <PublicShell>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/directorio" className="hidden px-3 text-sm font-medium muted hover:text-ink-900 sm:block dark:hover:text-white">Profesionales</Link>
          {user ? <Button to={HOME[user.role]}>Ir a mi Kinkō</Button> : <><Button variant="ghost" to="/login">Entrar</Button><Button to="/registro">Crear cuenta</Button></>}
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-12 pt-6 lg:grid-cols-2 lg:pt-12">
        <div className="animate-fade">
          <Badge tone="brand" className="mb-5"><ShieldCheck className="h-3.5 w-3.5" /> Datos cifrados · servidores en la UE · RGPD</Badge>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">Tu equilibrio mental, <span className="text-brand-600 dark:text-brand-300">medible</span> y acompañado.</h1>
          <p className="mt-5 max-w-xl text-lg muted">Kinkō te acompaña las 167 horas de la semana en que no estás en consulta y le da a tu profesional datos claros, en lugar de un relato reconstruido de memoria.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })} icon={<Sparkles className="h-5 w-5" />}>Probar la demo</Button>
            <Button size="lg" variant="outline" to="/registro">Empezar gratis</Button>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm muted"><span className="flex items-center gap-2"><Lock className="h-4 w-4" /> AES-256</span><span className="flex items-center gap-2"><Fingerprint className="h-4 w-4" /> 2FA</span><span className="flex items-center gap-2"><Phone className="h-4 w-4" /> Ayuda 24 h: 024</span></div>
        </div>
        <div className="relative flex justify-center">
          <Sphere className="h-[340px] w-[340px] sm:h-[460px] sm:w-[460px]" domains={demo} overall={68} />
          <div className="absolute bottom-6 left-2 card hidden p-3 text-xs sm:block animate-float"><div className="font-semibold">Calma 58 → 71</div><div className="muted">tras 7 días de rutina de sueño</div></div>
          <div className="absolute right-2 top-10 card hidden p-3 text-xs sm:block animate-float" style={{ animationDelay: '1.5s' }}><div className="font-semibold">Kio</div><div className="muted">«Elige una sola tarea y ponle hora»</div></div>
        </div>
      </section>
      <section id="demo" className="mx-auto max-w-6xl px-5 pb-16"><Card className="p-6 sm:p-8"><DemoAccounts /></Card></section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-display text-3xl sm:text-4xl">Tecnología con calidez humana</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map((f) => <Card key={f.t} className="transition hover:-translate-y-1"><f.icon className="h-7 w-7 text-brand-500" /><h3 className="mt-4 font-semibold">{f.t}</h3><p className="mt-1.5 text-sm muted">{f.d}</p></Card>)}</div>
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-display text-3xl sm:text-4xl">Una plataforma, cinco puertas</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{segments.map((s) => <div key={s.t} className="rounded-3xl bg-white/60 p-5 ring-1 ring-ink-200/60 dark:bg-white/5 dark:ring-white/5"><s.icon className="h-6 w-6 text-brand-600 dark:text-brand-300" /><div className="mt-3 font-semibold">{s.t}</div><p className="mt-1 text-sm muted">{s.d}</p></div>)}</div>
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-display text-3xl sm:text-4xl">Precios</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {(['free', 'plus', 'family', 'pro_solo', 'pro_plus', 'clinic'] as const).map((k) => (
            <Card key={k} className={cx(k === 'plus' || k === 'pro_plus' ? 'ring-2 ring-brand-400' : '')}>
              <div className="text-sm font-semibold text-brand-600 dark:text-brand-300">{PLAN_INFO[k].name}</div><div className="mt-1 font-display text-2xl">{PLAN_INFO[k].price}</div>
              <ul className="mt-4 space-y-2 text-sm">{PLAN_INFO[k].features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{f}</li>)}</ul>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-sm muted">Si tu profesional usa Kinkō, tienes todas las funciones Plus gratis mientras dure tu tratamiento (Kinkō Care). Precios sin IVA para profesionales.</p>
      </section>
      <footer className="border-t border-ink-200/60 px-5 py-10 text-sm muted dark:border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 sm:flex-row">
          <div><Logo /><p className="mt-3 max-w-sm">Kinkō no sustituye la atención médica ni psicológica. Si estás en peligro, llama al 112. Conducta suicida: 024. Menores: ANAR 900 20 20 10.</p></div>
          <div className="flex gap-8"><div className="space-y-2"><Link to="/legal/privacidad" className="block hover:underline">Privacidad</Link><Link to="/legal/terminos" className="block hover:underline">Términos</Link><Link to="/legal/seguridad" className="block hover:underline">Seguridad</Link></div><div className="space-y-2"><Link to="/directorio" className="block hover:underline">Profesionales</Link><Link to="/registro" className="block hover:underline">Soy profesional</Link><Link to="/login" className="block hover:underline">Entrar</Link></div></div>
        </div>
      </footer>
    </PublicShell>
  );
}

export function Login() {
  const { login, verify2fa, mfaToken } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '', code: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = (u: any) => nav(HOME[u.role as keyof typeof HOME]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { if (mfaToken) go(await verify2fa(f.code)); else { const u = await login(f.email, f.password); if (u) go(u); } } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <PublicShell>
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-2">
        <div>
          <Logo />
          <h1 className="mt-10 font-display text-4xl">Hola de nuevo</h1>
          <p className="mt-2 muted">Entra en tu espacio Kinkō.</p>
          <form onSubmit={submit} className="mt-8 max-w-md space-y-4">
            {!mfaToken ? <>
              <Input label="Email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <Input label="Contraseña" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </> : <Input label="Código de verificación (2FA)" inputMode="numeric" maxLength={6} autoFocus value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} hint={mode.demo ? 'En la demo el código es 123456' : 'Ábrelo en tu app de autenticación'} />}
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <Button type="submit" size="lg" block loading={busy}>{mfaToken ? 'Verificar' : 'Entrar'}</Button>
            <div className="flex justify-between text-sm"><Link to="/recuperar" className="link">¿Olvidaste la contraseña?</Link><Link to="/registro" className="link">Crear cuenta</Link></div>
          </form>
        </div>
        <Card className="p-6"><DemoAccounts compact /></Card>
      </div>
    </PublicShell>
  );
}

export function Register() {
  const register = useAuth((s) => s.register);
  const nav = useNavigate(); const [sp] = useSearchParams();
  const [role, setRole] = useState<string>(sp.get('perfil') || 'patient');
  const [f, setF] = useState<any>({ email: '', password: '', firstName: '', lastName: '', birthDate: '', gender: '', province: 'Bizkaia', terms: false, privacy: false, research: false, licenseNumber: '', college: '', clinicName: '', city: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [code, setCode] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const ROLES = [['patient', 'Quiero cuidarme', Users], ['parent', 'Soy madre/padre', Baby], ['professional', 'Soy profesional', Stethoscope], ['clinic_admin', 'Tengo una clínica', Building2], ['developer', 'Investigo datos', BarChart3]] as const;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await register({ email: f.email, password: f.password, role, firstName: f.firstName, lastName: f.lastName, birthDate: f.birthDate || undefined, gender: f.gender || undefined, province: f.province, consents: { terms: f.terms, privacy: f.privacy, research: f.research, marketing: false },
        professional: role === 'professional' ? { type: 'Psicólogo/a general sanitario/a', licenseNumber: f.licenseNumber, college: f.college } : undefined, clinic: role === 'clinic_admin' ? { name: f.clinicName, city: f.city, province: f.province } : undefined });
      if (r.guardianCode) setCode(r.guardianCode); else nav(HOME[r.user.role as keyof typeof HOME]);
    } catch (e: any) { setErr(e.details?.map?.((d: any) => d.message).join(' · ') || e.message); } finally { setBusy(false); }
  };
  if (code) return (
    <PublicShell><div className="mx-auto max-w-lg px-5 py-20 text-center"><Sphere className="mx-auto h-56 w-56" overall={70} face /><h1 className="mt-6 font-display text-3xl">Casi listo</h1><p className="mt-3 muted">Por tu edad necesitamos la autorización de tu madre, padre o tutor. Pídele que cree una cuenta de Familia en Kinkō e introduzca este código:</p><div className="mt-6 font-display text-5xl tracking-[0.3em] text-brand-600">{code}</div><p className="mt-6 text-sm muted">Tu diario y tus conversaciones con Kio serán siempre privados. Tú decides qué más ve tu familia.</p></div></PublicShell>
  );
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Logo />
        <h1 className="mt-8 font-display text-4xl">Crea tu cuenta</h1>
        <div className="mt-6 flex flex-wrap gap-2">{ROLES.map(([id, label, Ic]) => <Chip key={id} active={role === id} onClick={() => setRole(id)}><Ic className="h-4 w-4" />{label}</Chip>)}</div>
        <form onSubmit={submit} className="mt-8 grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" required value={f.firstName} onChange={set('firstName')} />
          <Input label="Apellidos" value={f.lastName} onChange={set('lastName')} />
          <Input label="Email" type="email" required value={f.email} onChange={set('email')} />
          <Input label="Contraseña" type="password" required minLength={10} value={f.password} onChange={set('password')} hint="Mínimo 10 caracteres, con letras y números" />
          {role === 'patient' && <Input label="Fecha de nacimiento" type="date" required value={f.birthDate} onChange={set('birthDate')} />}
          {role === 'patient' && <Select label="Género" value={f.gender} onChange={set('gender')}><option value="">Prefiero no decirlo</option><option value="mujer">Mujer</option><option value="hombre">Hombre</option><option value="no_binario">No binario</option></Select>}
          <Select label="Provincia" value={f.province} onChange={set('province')}>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select>
          {role === 'professional' && <><Input label="Nº de colegiado/a" required value={f.licenseNumber} onChange={set('licenseNumber')} /><Input label="Colegio profesional" required value={f.college} onChange={set('college')} placeholder="COP Bizkaia" /></>}
          {role === 'clinic_admin' && <><Input label="Nombre del centro" required value={f.clinicName} onChange={set('clinicName')} /><Input label="Ciudad" required value={f.city} onChange={set('city')} /></>}
          <div className="space-y-3 sm:col-span-2">
            <label className="flex gap-3 text-sm"><input type="checkbox" checked={f.terms} onChange={set('terms')} className="mt-1 accent-brand-600" /> Acepto las <Link to="/legal/terminos" className="link">condiciones de uso</Link>. Kinkō no sustituye a la atención sanitaria.</label>
            <label className="flex gap-3 text-sm"><input type="checkbox" checked={f.privacy} onChange={set('privacy')} className="mt-1 accent-brand-600" /> Consiento el tratamiento de mis datos de salud según la <Link to="/legal/privacidad" className="link">política de privacidad</Link> (art. 9.2.a RGPD).</label>
            <label className="flex gap-3 text-sm"><input type="checkbox" checked={f.research} onChange={set('research')} className="mt-1 accent-brand-600" /> <span>Opcional: permito usar mis datos de forma <b>anónima y agregada</b> para investigación en salud mental. Puedo retirarlo cuando quiera.</span></label>
          </div>
          {err && <p className="text-sm text-rose-600 sm:col-span-2">{err}</p>}
          <div className="sm:col-span-2"><Button type="submit" size="lg" block loading={busy}>Crear cuenta</Button><p className="mt-3 text-center text-sm muted">¿Ya tienes cuenta? <Link to="/login" className="link">Entra</Link></p></div>
        </form>
      </div>
    </PublicShell>
  );
}

export function Recover() {
  const [sp] = useSearchParams(); const token = sp.get('token');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [done, setDone] = useState(false);
  const nav = useNavigate();
  return (
    <PublicShell>
      <div className="mx-auto max-w-md px-5 py-16"><Logo /><h1 className="mt-8 font-display text-3xl">{token ? 'Nueva contraseña' : 'Recuperar acceso'}</h1>
        {done ? <p className="mt-6 muted">{token ? 'Contraseña actualizada.' : 'Si el email existe, te hemos enviado un enlace (en desarrollo lo verás en .data/outbox.log).'}</p> :
          <form className="mt-6 space-y-4" onSubmit={async (e) => { e.preventDefault(); try { if (token) { await post('/auth/password/reset', { token, password: pw }); setTimeout(() => nav('/login'), 1200); } else await post('/auth/password/forgot', { email }); setDone(true); } catch (er: any) { toast(er.message, 'error'); } }}>
            {token ? <Input label="Nueva contraseña" type="password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} /> : <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
            <Button type="submit" block>{token ? 'Guardar' : 'Enviar enlace'}</Button>
          </form>}
      </div>
    </PublicShell>
  );
}

const LEGAL: Record<string, { t: string; body: string[] }> = {
  privacidad: { t: 'Política de privacidad (resumen)', body: ['Responsable: Kinkō Health S.L. (en constitución). Delegado de protección de datos: dpo@kinko.app.', 'Tratamos datos de salud con tu consentimiento explícito (art. 9.2.a RGPD) para prestarte el servicio, y datos de tu profesional para la relación asistencial.', 'Tus profesionales solo ven lo que autorizas, por tipo de dato y desde la fecha que elijas. Puedes revocar el acceso en cualquier momento desde «Mi equipo».', 'Tu diario y tus conversaciones con Kio son privados. Nunca se muestran a tu familia. A tu profesional solo llegan resúmenes si tú los compartes.', 'Solo usamos datos para investigación si lo consientes, siempre anonimizados y agregados (grupos de 10 o más personas, ruido diferencial).', 'Puedes descargar todos tus datos y eliminar tu cuenta en Ajustes. La historia clínica se conserva el plazo legal (Ley 41/2002) bloqueada.', 'Servidores en la Unión Europea. Cifrado en tránsito (TLS) y en reposo (AES-256-GCM para notas clínicas, diario y mensajes).'] },
  terminos: { t: 'Condiciones de uso (resumen)', body: ['Kinkō es una herramienta de bienestar y de apoyo a profesionales sanitarios. No realiza diagnósticos ni sustituye la atención médica o psicológica.', 'Kio es una inteligencia artificial: puede equivocarse. No da diagnósticos ni pautas de medicación.', 'Ante una emergencia llama al 112. Para conducta suicida, 024. Para menores, Fundación ANAR 900 20 20 10.', 'Los profesionales del directorio están colegiados y verificados por Kinkō; son responsables de su práctica clínica.', 'La tienda solo incluye productos de hábitos y aficiones; nunca medicamentos ni suplementos.'] },
  seguridad: { t: 'Seguridad', body: ['Contraseñas con Argon2id. Sesiones de 15 minutos con renovación rotatoria y detección de robo de tokens.', 'Verificación en dos pasos (TOTP), obligatoria para profesionales en producción.', 'Cada acceso de un profesional a datos de un paciente queda registrado en un log de auditoría.', 'Protección frente a inyección, límites de peticiones, validación estricta de archivos y cabeceras de seguridad (CSP, HSTS).', 'Pruebas de penetración antes de cada lanzamiento mayor. Notifica vulnerabilidades a security@kinko.app.'] },
};
export function Legal({ doc }: { doc: string }) {
  const d = LEGAL[doc] || LEGAL.privacidad;
  return <PublicShell><div className="mx-auto max-w-2xl px-5 py-12"><Logo /><h1 className="mt-8 font-display text-4xl">{d.t}</h1><div className="prose-k mt-6">{d.body.map((p) => <p key={p}>{p}</p>)}</div><Button variant="ghost" className="mt-6" to="/">Volver</Button></div></PublicShell>;
}
