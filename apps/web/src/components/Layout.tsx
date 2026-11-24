import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, MessageCircle, LineChart, CalendarDays, LayoutGrid, Sun, Moon, Bell, LifeBuoy, LogOut, Settings, ClipboardCheck, NotebookPen, Route, Library, Sparkles, Stethoscope,
  Users, ShoppingBag, Bluetooth, Search, HeartHandshake, Activity, Siren, FileText, Receipt, Building2, BookOpenCheck, Link2, KeyRound, Code2, FlaskConical, Briefcase, ShieldCheck,
  UserCog, BadgeCheck, Flag, ScrollText, Server, Smile, Pill,
} from 'lucide-react';
import { useAuth, applyTheme, type Role } from '@/lib/auth';
import { useApi, invalidate } from '@/lib/query';
import { on } from '@/lib/realtime';
import { mode } from '@/lib/api';
import { Avatar, cx, Modal } from './ui';
import { useCrisis } from './Crisis';
import { patch } from '@/lib/api';

type Item = { to: string; label: string; icon: any; end?: boolean };
const NAV: Record<Role, { main: Item[]; more: Item[] }> = {
  patient: {
    main: [{ to: '/app', label: 'Inicio', icon: Home, end: true }, { to: '/app/kio', label: 'Kio', icon: Sparkles }, { to: '/app/progreso', label: 'Progreso', icon: LineChart }, { to: '/app/citas', label: 'Citas', icon: CalendarDays }],
    more: [
      { to: '/app/checkin', label: 'Check-in', icon: Smile }, { to: '/app/tests', label: 'Tests', icon: ClipboardCheck }, { to: '/app/diario', label: 'Diario', icon: NotebookPen }, { to: '/app/tratamiento', label: 'Mi plan', icon: Pill },
      { to: '/app/rutas', label: 'Rutas', icon: Route }, { to: '/app/biblioteca', label: 'Biblioteca', icon: Library }, { to: '/app/pasiones', label: 'Pasiones', icon: HeartHandshake }, { to: '/comunidad', label: 'Comunidad', icon: Users },
      { to: '/mensajes', label: 'Mensajes', icon: MessageCircle }, { to: '/directorio', label: 'Profesionales', icon: Search }, { to: '/app/tienda', label: 'Tienda', icon: ShoppingBag }, { to: '/app/dispositivos', label: 'Dispositivos', icon: Bluetooth },
      { to: '/app/equipo', label: 'Mi equipo', icon: ShieldCheck }, { to: '/ajustes', label: 'Ajustes', icon: Settings },
    ],
  },
  professional: {
    main: [{ to: '/pro', label: 'Panel', icon: Activity, end: true }, { to: '/pro/pacientes', label: 'Pacientes', icon: Users }, { to: '/pro/agenda', label: 'Agenda', icon: CalendarDays }, { to: '/mensajes', label: 'Mensajes', icon: MessageCircle }],
    more: [{ to: '/pro/alertas', label: 'Alertas', icon: Siren }, { to: '/pro/contenido', label: 'Contenido', icon: FileText }, { to: '/pro/perfil', label: 'Mi perfil', icon: Stethoscope }, { to: '/pro/facturacion', label: 'Facturación', icon: Receipt }, { to: '/comunidad', label: 'Comunidad', icon: Users }, { to: '/directorio', label: 'Directorio', icon: Search }, { to: '/tienda', label: 'Tienda', icon: ShoppingBag }, { to: '/ajustes', label: 'Ajustes', icon: Settings }],
  },
  clinic_admin: {
    main: [{ to: '/clinica', label: 'Panel', icon: Building2, end: true }, { to: '/clinica/equipo', label: 'Equipo', icon: Users }, { to: '/clinica/agenda', label: 'Agenda', icon: CalendarDays }, { to: '/clinica/pacientes', label: 'Pacientes', icon: HeartHandshake }],
    more: [{ to: '/clinica/perfil', label: 'Perfil del centro', icon: Building2 }, { to: '/mensajes', label: 'Mensajes', icon: MessageCircle }, { to: '/tienda', label: 'Tienda', icon: ShoppingBag }, { to: '/directorio', label: 'Directorio', icon: Search }, { to: '/ajustes', label: 'Ajustes', icon: Settings }],
  },
  parent: {
    main: [{ to: '/familia', label: 'Inicio', icon: Home, end: true }, { to: '/familia/guias', label: 'Guías', icon: BookOpenCheck }, { to: '/mensajes', label: 'Mensajes', icon: MessageCircle }, { to: '/comunidad', label: 'Comunidad', icon: Users }],
    more: [{ to: '/familia/vincular', label: 'Vincular hijo/a', icon: Link2 }, { to: '/directorio', label: 'Profesionales', icon: Search }, { to: '/tienda', label: 'Tienda', icon: ShoppingBag }, { to: '/ajustes', label: 'Ajustes', icon: Settings }],
  },
  developer: { main: [{ to: '/dev', label: 'Claves y uso', icon: KeyRound, end: true }, { to: '/dev/docs', label: 'Documentación', icon: Code2 }, { to: '/dev/explorador', label: 'Explorador', icon: FlaskConical }], more: [{ to: '/ajustes', label: 'Ajustes', icon: Settings }] },
  org_admin: { main: [{ to: '/empresa', label: 'Bienestar', icon: Briefcase, end: true }], more: [{ to: '/ajustes', label: 'Ajustes', icon: Settings }] },
  admin: {
    main: [{ to: '/admin', label: 'Resumen', icon: Activity, end: true }, { to: '/admin/usuarios', label: 'Usuarios', icon: UserCog }, { to: '/admin/verificaciones', label: 'Verificar', icon: BadgeCheck }, { to: '/admin/moderacion', label: 'Moderación', icon: Flag }],
    more: [{ to: '/admin/contenido', label: 'Contenido', icon: FileText }, { to: '/tienda', label: 'Tienda', icon: ShoppingBag }, { to: '/admin/auditoria', label: 'Auditoría', icon: ScrollText }, { to: '/admin/sistema', label: 'Sistema', icon: Server }, { to: '/comunidad', label: 'Comunidad', icon: Users }, { to: '/ajustes', label: 'Ajustes', icon: Settings }],
  },
};

export function Logo({ className = '' }: { className?: string }) {
  return <Link to="/" className={cx('flex items-center gap-2.5', className)}><span className="h-8 w-8 rounded-full shadow-[var(--shadow-glow)]" style={{ background: 'radial-gradient(circle at 35% 30%, #e1f9f1, #3fa796 55%, #134a43)' }} /><span className="font-display text-2xl tracking-tight">Kinkō</span></Link>;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const [more, setMore] = useState(false);
  const notif = useApi<any[]>(user ? '/me/notifications?limit=30' : null, { refetchInterval: mode.demo ? 15000 : 60000 });
  const unread = (notif.data || []).filter((n) => !n.read).length;
  const crisis = useCrisis();
  useEffect(() => { const offs = [on('notification:new', () => invalidate('/me/notifications', '/me/dashboard', '/pro/dashboard', '/alerts')), on('message:new', () => invalidate('/conversations')), on('alert:new', () => invalidate('/pro/dashboard', '/alerts'))]; return () => offs.forEach((f) => f()); }, []);
  useEffect(() => { setMore(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  if (!user) return null;
  const cfg = NAV[user.role];
  const dark = document.documentElement.classList.contains('dark');
  const toggleTheme = async () => { const t = dark ? 'light' : 'dark'; applyTheme(t); await patch('/me/settings', { theme: t }).catch(() => null); };
  const showSos = user.role === 'patient' || user.role === 'parent';
  return (
    <div className="min-h-screen bg-aurora">
      {mode.demo && <DemoBanner />}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink-200/60 glass px-4 py-5 lg:flex dark:border-white/5" style={{ top: mode.demo ? 32 : 0 }}>
        <Logo className="px-2" />
        <nav className="mt-8 flex-1 space-y-1 overflow-y-auto scrollbar-none">
          {[...cfg.main, ...cfg.more].map((it) => <SideLink key={it.to} item={it} />)}
        </nav>
        <div className="mt-4 flex items-center gap-3 rounded-2xl p-2">
          <Avatar user={{ ...user.profile }} size={36} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{user.profile?.firstName} {user.profile?.lastName}</div><div className="truncate text-xs muted">{user.email}</div></div>
          <button onClick={async () => { await logout(); nav('/'); }} className="rounded-full p-2 hover:bg-ink-100 dark:hover:bg-white/5" title="Cerrar sesión"><LogOut className="h-4 w-4" /></button>
        </div>
      </aside>
      <div className="lg:pl-64" style={{ paddingTop: mode.demo ? 32 : 0 }}>
        <header className="sticky z-20 flex h-16 items-center justify-between gap-3 border-b border-ink-200/50 glass px-4 sm:px-6 dark:border-white/5" style={{ top: mode.demo ? 32 : 0 }}>
          <Logo className="lg:hidden" />
          <div className="hidden text-sm muted lg:block">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="flex items-center gap-1.5">
            {showSos && <button onClick={() => crisis.show()} className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/25 hover:bg-rose-700"><LifeBuoy className="h-4 w-4" /> Ayuda</button>}
            <button onClick={toggleTheme} className="rounded-full p-2.5 hover:bg-ink-100 dark:hover:bg-white/5" aria-label="Cambiar tema">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
            <Link to="/notificaciones" className="relative rounded-full p-2.5 hover:bg-ink-100 dark:hover:bg-white/5" aria-label="Notificaciones"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread}</span>}</Link>
            <Link to="/ajustes" className="lg:hidden"><Avatar user={{ ...user.profile }} size={34} /></Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12"><Outlet /></main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200/60 glass safe-bottom lg:hidden dark:border-white/5">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
          {cfg.main.map((it) => <BottomLink key={it.to} item={it} />)}
          <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-ink-500"><LayoutGrid className="h-5 w-5" />Más</button>
        </div>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Todo Kinkō">
        <div className="grid grid-cols-3 gap-2">
          {[...cfg.main, ...cfg.more].map((it) => (
            <Link key={it.to} to={it.to} className="flex flex-col items-center gap-2 rounded-2xl p-3 text-center text-xs font-medium hover:bg-ink-100 dark:hover:bg-white/5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"><it.icon className="h-5 w-5" /></span>{it.label}</Link>
          ))}
          <button onClick={async () => { await logout(); nav('/'); }} className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium hover:bg-ink-100 dark:hover:bg-white/5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink-100 dark:bg-white/5"><LogOut className="h-5 w-5" /></span>Salir</button>
        </div>
      </Modal>
    </div>
  );
}
function SideLink({ item }: { item: Item }) {
  return <NavLink to={item.to} end={item.end} className={({ isActive }) => cx('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-brand-600 text-white shadow-[var(--shadow-glow)] dark:bg-brand-500 dark:text-night-950' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/5')}><item.icon className="h-[18px] w-[18px]" />{item.label}</NavLink>;
}
function BottomLink({ item }: { item: Item }) {
  return <NavLink to={item.to} end={item.end} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-ink-500')}><item.icon className="h-5 w-5" />{item.label}</NavLink>;
}
export function DemoBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-8 items-center justify-center gap-3 bg-ink-900 px-3 text-[11px] text-white/80 dark:bg-black">
      <span className="truncate">Modo demostración · todo funciona en tu navegador con datos ficticios</span>
      <button className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-white hover:bg-white/20" onClick={async () => (await import('@/lib/demo')).resetDemo()}>Reiniciar</button>
    </div>
  );
}
export function PublicShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-aurora">{mode.demo && <DemoBanner />}<div style={{ paddingTop: mode.demo ? 32 : 0 }}>{children}</div></div>;
}
