import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, createMemoryRouter, Navigate, Outlet, useLocation, useRouteError } from 'react-router-dom';
import { AppShell, PublicShell, Logo } from '@/components/Layout';
import { CrisisSheet } from '@/components/Crisis';
import { Loading, Button } from '@/components/ui';
import { HOME, useAuth, type Role } from '@/lib/auth';
import { Landing, Login, Register, Recover, Legal } from '@/pages/public/Public';

const L = <T extends Record<string, any>>(loader: () => Promise<T>, name: keyof T) => lazy(async () => ({ default: (await loader())[name] as any }));
const S = (C: any, props: any = {}) => <Suspense fallback={<Loading />}><C {...props} /></Suspense>;

// Público / compartido
const dir = () => import('@/pages/public/Directory');
const Directory = L(dir, 'Directory'); const ProProfile = L(dir, 'ProfessionalProfile'); const ClinicPage = L(dir, 'ClinicPage');
const shared = () => import('@/pages/shared/Shared');
const Notifications = L(shared, 'Notifications'); const Settings = L(shared, 'Settings');
const msg = () => import('@/pages/shared/Messages');
const Messages = L(msg, 'Messages');
const com = () => import('@/pages/shared/Community');
const Community = L(com, 'Community'); const Post = L(com, 'Post');
const vid = () => import('@/pages/shared/VideoCall');
const VideoCall = L(vid, 'VideoCall');
const shop = () => import('@/pages/shared/Shop');
const Shop = L(shop, 'Shop'); const Orders = L(shop, 'Orders'); const ProductPage = L(shop, 'ProductPage');
// Paciente
const ph = () => import('@/pages/patient/Home');
const PatientHome = L(ph, 'PatientHome'); const Breathe = L(ph, 'Breathe');
const pc = () => import('@/pages/patient/Checkin');
const Checkin = L(pc, 'Checkin');
const pt = () => import('@/pages/patient/Tests');
const Tests = L(pt, 'Tests'); const TestRun = L(pt, 'TestRun'); const TestResult = L(pt, 'TestResult');
const pj = () => import('@/pages/patient/Journal');
const Journal = L(pj, 'Journal');
const pk = () => import('@/pages/patient/Kio');
const Kio = L(pk, 'Kio');
const pp = () => import('@/pages/patient/Progress');
const Progress = L(pp, 'Progress');
const pl = () => import('@/pages/patient/Learn');
const Paths = L(pl, 'Paths'); const PathDetail = L(pl, 'PathDetail'); const Library = L(pl, 'Library'); const ContentView = L(pl, 'ContentView');
const pa = () => import('@/pages/patient/Passions');
const Passions = L(pa, 'Passions');
const pcare = () => import('@/pages/patient/Care');
const TreatmentPlan = L(pcare, 'TreatmentPlan'); const Appointments = L(pcare, 'Appointments'); const CareTeam = L(pcare, 'CareTeam');
const pd = () => import('@/pages/patient/Devices');
const Devices = L(pd, 'Devices');
// Profesional
const pro = () => import('@/pages/pro/Pro');
const ProDashboard = L(pro, 'ProDashboard'); const ProPatients = L(pro, 'ProPatients'); const ProAgenda = L(pro, 'ProAgenda'); const ProAlerts = L(pro, 'ProAlerts');
const ProContent = L(pro, 'ProContent'); const ProProfileEdit = L(pro, 'ProProfileEdit'); const ProBilling = L(pro, 'ProBilling');
const ppd = () => import('@/pages/pro/PatientDetail');
const PatientDetail = L(ppd, 'PatientDetail');
// Clínica, familia, datos, admin
const cl = () => import('@/pages/clinic/Clinic');
const ClinicDashboard = L(cl, 'ClinicDashboard'); const ClinicTeam = L(cl, 'ClinicTeam'); const ClinicAgenda = L(cl, 'ClinicAgenda'); const ClinicPatients = L(cl, 'ClinicPatients'); const ClinicProfile = L(cl, 'ClinicProfile');
const fa = () => import('@/pages/family/Family');
const FamilyHome = L(fa, 'FamilyHome'); const TeenDetail = L(fa, 'TeenDetail'); const Guides = L(fa, 'Guides'); const LinkTeen = L(fa, 'LinkTeen');
const dv = () => import('@/pages/dev/Dev');
const DevKeys = L(dv, 'DevKeys'); const DevDocs = L(dv, 'DevDocs'); const DevExplorer = L(dv, 'DevExplorer'); const OrgDashboard = L(dv, 'OrgDashboard');
const ad = () => import('@/pages/admin/Admin');
const AdminOverview = L(ad, 'AdminOverview'); const AdminUsers = L(ad, 'AdminUsers'); const AdminVerifications = L(ad, 'AdminVerifications'); const AdminModeration = L(ad, 'AdminModeration');
const AdminContent = L(ad, 'AdminContent'); const AdminAudit = L(ad, 'AdminAudit'); const AdminSystem = L(ad, 'AdminSystem');

function Root() { return <><Outlet /><CrisisSheet /></>; }

function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const user = useAuth((s) => s.user); const loc = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (user.status === 'pending_guardian') return <PendingGuardian />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <>{children}</>;
}
function PendingGuardian() {
  const logout = useAuth((s) => s.logout);
  return <PublicShell><div className="mx-auto max-w-md px-5 py-24 text-center"><Logo className="justify-center" /><h1 className="mt-8 font-display text-3xl">Falta la autorización familiar</h1><p className="mt-3 muted">Por tu edad, tu madre, padre o tutor debe vincularse con el código que te dimos al registrarte. En cuanto lo haga, podrás usar Kinkō. Si necesitas ayuda ahora: 024 o ANAR 900 20 20 10.</p><Button className="mt-6" variant="outline" onClick={logout}>Salir</Button></div></PublicShell>;
}
/** Directorio y fichas: dentro de la app si hay sesión, en la web pública si no. */
function Adaptive() {
  const user = useAuth((s) => s.user);
  if (user) return <AppShell />;
  return <PublicShell><header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><Logo /><div className="flex gap-2"><Button variant="ghost" to="/login">Entrar</Button><Button to="/registro">Crear cuenta</Button></div></header><main className="mx-auto max-w-6xl px-5 pb-20"><Outlet /></main></PublicShell>;
}
function ErrorPage() {
  const e: any = useRouteError();
  const stale = /dynamically imported module|Importing a module script failed/i.test(String(e?.message));
  return <PublicShell><div className="mx-auto max-w-md px-5 py-24 text-center"><Logo className="justify-center" /><h1 className="mt-8 font-display text-3xl">{stale ? 'Hay una versión nueva' : 'Algo no ha ido bien'}</h1><p className="mt-3 text-sm muted">{stale ? 'Recarga para actualizar Kinkō.' : String(e?.message || e?.statusText || 'Página no encontrada')}</p><div className="mt-6 flex justify-center gap-2"><Button onClick={() => location.reload()}>Recargar</Button><Button variant="outline" to="/">Inicio</Button></div></div></PublicShell>;
}
const app = (roles: Role[] | undefined, children: any[]) => ({ element: <Guard roles={roles}><AppShell /></Guard>, children });

const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const routes = [{
  element: <Root />, errorElement: <ErrorPage />, children: [
    { path: '/', element: <Landing /> },
    { path: '/login', element: <Login /> },
    { path: '/registro', element: <Register /> },
    { path: '/recuperar', element: <Recover /> },
    { path: '/legal/:doc', element: <LegalRoute /> },
    { element: <Adaptive />, children: [
      { path: '/directorio', element: S(Directory) },
      { path: '/directorio/:id', element: S(ProProfile) },
      { path: '/centros/:slug', element: S(ClinicPage) },
    ] },
    app(['patient'], [
      { path: '/app', element: S(PatientHome) },
      { path: '/app/respirar', element: S(Breathe) },
      { path: '/app/checkin', element: S(Checkin) },
      { path: '/app/tests', element: S(Tests) },
      { path: '/app/tests/:id', element: S(TestRun) },
      { path: '/app/resultados/:id', element: S(TestResult) },
      { path: '/app/diario', element: S(Journal) },
      { path: '/app/kio', element: S(Kio) },
      { path: '/app/kio/:id', element: S(Kio) },
      { path: '/app/progreso', element: S(Progress) },
      { path: '/app/rutas', element: S(Paths) },
      { path: '/app/rutas/:slug', element: S(PathDetail) },
      { path: '/app/biblioteca', element: S(Library) },
      { path: '/app/biblioteca/:slug', element: S(ContentView) },
      { path: '/app/pasiones', element: S(Passions) },
      { path: '/app/tratamiento', element: S(TreatmentPlan) },
      { path: '/app/citas', element: S(Appointments) },
      { path: '/app/equipo', element: S(CareTeam) },
      { path: '/app/dispositivos', element: S(Devices) },
      { path: '/app/tienda', element: S(Shop) },
      { path: '/app/tienda/pedidos', element: S(Orders) },
    ]),
    app(undefined, [
      { path: '/mensajes', element: S(Messages) },
      { path: '/mensajes/:id', element: S(Messages) },
      { path: '/comunidad', element: S(Community) },
      { path: '/comunidad/:id', element: S(Post) },
      { path: '/notificaciones', element: S(Notifications) },
      { path: '/ajustes', element: S(Settings) },
      { path: '/tienda', element: S(Shop) },
      { path: '/tienda/pedidos', element: S(Orders) },
      { path: '/tienda/:id', element: S(ProductPage) },
      { path: '/contenido/:slug', element: S(ContentView) },
    ]),
    { path: '/video/:id', element: <Guard>{S(VideoCall)}</Guard> },
    app(['professional'], [
      { path: '/pro', element: S(ProDashboard) },
      { path: '/pro/pacientes', element: S(ProPatients) },
      { path: '/pro/pacientes/:id', element: S(PatientDetail) },
      { path: '/pro/agenda', element: S(ProAgenda) },
      { path: '/pro/alertas', element: S(ProAlerts) },
      { path: '/pro/contenido', element: S(ProContent) },
      { path: '/pro/perfil', element: S(ProProfileEdit) },
      { path: '/pro/facturacion', element: S(ProBilling) },
    ]),
    app(['clinic_admin'], [
      { path: '/clinica', element: S(ClinicDashboard) },
      { path: '/clinica/equipo', element: S(ClinicTeam) },
      { path: '/clinica/agenda', element: S(ClinicAgenda) },
      { path: '/clinica/pacientes', element: S(ClinicPatients) },
      { path: '/clinica/perfil', element: S(ClinicProfile) },
    ]),
    app(['parent'], [
      { path: '/familia', element: S(FamilyHome) },
      { path: '/familia/hijo/:id', element: S(TeenDetail) },
      { path: '/familia/guias', element: S(Guides) },
      { path: '/familia/vincular', element: S(LinkTeen) },
    ]),
    app(['developer', 'admin'], [
      { path: '/dev', element: S(DevKeys) },
      { path: '/dev/docs', element: S(DevDocs) },
      { path: '/dev/explorador', element: S(DevExplorer) },
    ]),
    app(['org_admin'], [{ path: '/empresa', element: S(OrgDashboard) }]),
    app(['admin'], [
      { path: '/admin', element: S(AdminOverview) },
      { path: '/admin/usuarios', element: S(AdminUsers) },
      { path: '/admin/verificaciones', element: S(AdminVerifications) },
      { path: '/admin/moderacion', element: S(AdminModeration) },
      { path: '/admin/contenido', element: S(AdminContent) },
      { path: '/admin/auditoria', element: S(AdminAudit) },
      { path: '/admin/sistema', element: S(AdminSystem) },
    ]),
    { path: '*', element: <ErrorPage /> },
  ],
}];
/** Hash en web y apps; en memoria si la demo va incrustada (la URL del contenedor no admite rutas #/…). */
export const router = embedded ? createMemoryRouter(routes) : createHashRouter(routes);

import { useParams } from 'react-router-dom';
function LegalRoute() { const { doc } = useParams(); return <Legal doc={doc || 'privacidad'} />; }
