import { z } from 'zod';
import { r, RATE } from '../router';
import type { Ctx } from '../context';
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from '../../util/errors';
import { addDays, ageFrom } from '../../util/dates';
import { randomCode, randomToken } from '../../util/ids';
import { audit, hueFor, parse, selfUser } from '../services';

const COMMON = new Set(['1234567890', 'password123', 'qwertyuiop', 'contraseña1', 'contrasena1', '123456789a', 'kinko12345', 'iloveyou12']);
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Usa letras y números';
  if (COMMON.has(pw.toLowerCase())) return 'Esa contraseña es demasiado común';
  return null;
}
const email = z.string().trim().toLowerCase().email('Email no válido').max(200);
const RegisterSchema = z.object({
  email, password: z.string().max(200),
  role: z.enum(['patient', 'parent', 'professional', 'clinic_admin', 'developer']),
  firstName: z.string().trim().min(1, 'Indica tu nombre').max(60), lastName: z.string().trim().max(80).default(''),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), gender: z.enum(['mujer', 'hombre', 'no_binario', 'prefiero_no_decir']).optional(),
  province: z.string().max(60).optional(),
  consents: z.object({ terms: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar las condiciones' }) }), privacy: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar la política de privacidad' }) }), research: z.boolean().default(false), marketing: z.boolean().default(false), healthData: z.boolean().default(true) }),
  professional: z.object({ type: z.string().max(80), licenseNumber: z.string().max(40), college: z.string().max(120) }).optional(),
  clinic: z.object({ name: z.string().min(2).max(120), city: z.string().max(80), province: z.string().max(60) }).optional(),
});

const REFRESH_COOKIE = 'kinko_rt';
const wantsBodyToken = (ctx: Ctx) => ['native', 'local'].includes(String(ctx.req.headers['x-kinko-client'] || ''));

export async function issueSession(ctx: Ctx, user: any) {
  const { db, p } = ctx;
  const secret = randomToken(32);
  const expiresAt = addDays(p.now(), p.config.refreshTtlDays).toISOString();
  const session = await db.col('sessions').insert({ userId: user._id, tokenHash: await p.sha256(secret), prevHash: null, userAgent: (ctx.req.headers['user-agent'] || '').slice(0, 200), ip: ctx.req.ip, expiresAt, lastUsedAt: p.now().toISOString(), revokedAt: null, type: 'refresh' });
  const refreshToken = `${session._id}.${secret}`;
  const accessToken = p.tokens.signAccess({ sub: user._id, role: user.role, sid: session._id });
  if (!wantsBodyToken(ctx)) ctx.setCookie(REFRESH_COOKIE, refreshToken, { httpOnly: true, secure: p.config.cookieSecure, sameSite: 'strict', path: '/api/auth', maxAgeMs: p.config.refreshTtlDays * 86400000 });
  await db.col('users').updateById(user._id, { $set: { lastLoginAt: p.now().toISOString(), failedLogins: 0, lockUntil: null } });
  return { accessToken, expiresIn: p.tokens.accessTtlSec, refreshToken: wantsBodyToken(ctx) ? refreshToken : undefined, user: selfUser(user, p) };
}

async function register(ctx: Ctx) {
  const { db, p } = ctx;
  const b = parse(RegisterSchema, ctx.body);
  const prob = passwordProblem(b.password); if (prob) throw badRequest(prob);
  if (await db.col('users').findOne({ email: b.email })) throw conflict('Ya existe una cuenta con ese email');
  const age = ageFrom(b.birthDate, p.now());
  if (b.role === 'patient' && age == null) throw badRequest('Indica tu fecha de nacimiento');
  if (age != null && age < 12) throw badRequest('Kinkō está disponible a partir de 12 años, siempre con autorización familiar');
  const needsGuardian = b.role === 'patient' && age != null && age < p.config.minorConsentAge;
  const plan = b.role === 'professional' ? 'pro_solo' : b.role === 'clinic_admin' ? 'clinic' : b.role === 'developer' ? 'developer' : 'free';
  const user = await db.col('users').insert({
    email: b.email, passwordHash: await p.hasher.hash(b.password), role: b.role, status: needsGuardian ? 'pending_guardian' : 'active', plan,
    profile: { firstName: b.firstName, lastName: b.lastName, birthDate: b.birthDate || null, gender: b.gender || null, province: b.province || null, avatarHue: hueFor(b.email) },
    consents: { ...b.consents, acceptedAt: p.now().toISOString(), version: '2027-01' },
    settings: { reminders: true, reminderHour: 20, theme: 'system', sphereFace: age != null && age < 18, aiUseContext: true },
    gamification: { points: 0, streak: 0, badges: [] }, twoFactor: { enabled: false }, failedLogins: 0, emailVerified: false,
  });
  if (b.role === 'professional') {
    await db.col('professionals').insert({ userId: user._id, type: b.professional?.type || 'Psicólogo/a general sanitario/a', licenseNumber: b.professional?.licenseNumber || '', college: b.professional?.college || '', verificationStatus: 'pending', verified: false, specialties: [], approaches: [], languages: ['Español'], modalities: ['online'], price: 50, sessionMinutes: 50, bio: '', city: '', province: b.province || '', availability: [], acceptingNew: true, autoConfirm: false, rating: null, reviewsCount: 0 });
  }
  if (b.role === 'clinic_admin' && b.clinic) {
    await db.col('clinics').insert({ name: b.clinic.name, slug: `${b.clinic.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${randomCode(4).toLowerCase()}`, city: b.clinic.city, province: b.clinic.province, adminIds: [user._id], members: [{ userId: user._id, role: 'admin' }], verified: false, verificationStatus: 'pending', specialties: [], description: '' });
  }
  let guardianCode: string | null = null;
  if (needsGuardian) {
    guardianCode = randomCode(8);
    await db.col('guardianLinks').insert({ teenId: user._id, parentId: null, code: guardianCode, status: 'pending', scopes: ['progress', 'adherence', 'appointments', 'plan'], createdBy: 'teen' });
  }
  const verifyToken = randomToken(24);
  await db.col('passwordResets').insert({ userId: user._id, tokenHash: await p.sha256(verifyToken), purpose: 'verify', expiresAt: addDays(p.now(), 7).toISOString(), usedAt: null });
  await p.mailer.send(b.email, 'Confirma tu email en Kinkō', `Hola ${b.firstName}, confirma tu cuenta: ${p.config.publicUrl}/#/verificar?token=${verifyToken}`);
  await audit({ ...ctx, user: { id: user._id, role: user.role } as any }, 'user.register', 'user', user._id);
  const session = await issueSession(ctx, user);
  return { ...session, guardianCode };
}

async function login(ctx: Ctx) {
  const { db, p } = ctx;
  const b = parse(z.object({ email, password: z.string().max(200) }), ctx.body);
  const user = await db.col('users').findOne({ email: b.email });
  if (user?.lockUntil && new Date(user.lockUntil) > p.now()) throw new HttpError(423, 'locked', 'Cuenta bloqueada temporalmente por varios intentos fallidos. Prueba en 15 minutos.');
  if (!user || !(await p.hasher.verify(user.passwordHash, b.password))) {
    if (user) {
      const failed = (user.failedLogins || 0) + 1;
      await db.col('users').updateById(user._id, { $set: { failedLogins: failed, lockUntil: failed >= 5 ? addDays(p.now(), 15 / 1440).toISOString() : null } });
    }
    throw unauthorized('Email o contraseña incorrectos', 'invalid_credentials');
  }
  if (['suspended', 'deleted'].includes(user.status)) throw forbidden('Esta cuenta no está activa');
  if (user.twoFactor?.enabled) {
    const token = randomToken(24);
    await db.col('sessions').insert({ userId: user._id, type: 'mfa', tokenHash: await p.sha256(token), expiresAt: addDays(p.now(), 5 / 1440).toISOString(), revokedAt: null });
    return { mfaRequired: true, mfaToken: token };
  }
  await audit({ ...ctx, user: { id: user._id, role: user.role } as any }, 'auth.login', 'user', user._id);
  return issueSession(ctx, user);
}

async function verify2fa(ctx: Ctx) {
  const { db, p } = ctx;
  const b = parse(z.object({ mfaToken: z.string().max(200), code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos') }), ctx.body);
  const s = await db.col('sessions').findOne({ type: 'mfa', tokenHash: await p.sha256(b.mfaToken), revokedAt: null });
  if (!s || new Date(s.expiresAt) < p.now()) throw unauthorized('El código ha caducado, vuelve a iniciar sesión');
  const user = await db.col('users').findById(s.userId);
  if (!user || !p.totp.verify(b.code, user.twoFactor?.secret || '')) throw unauthorized('Código incorrecto', 'invalid_code');
  await db.col('sessions').updateById(s._id, { $set: { revokedAt: p.now().toISOString() } });
  return issueSession(ctx, user);
}

async function refresh(ctx: Ctx) {
  const { db, p } = ctx;
  const raw = ctx.req.cookies?.[REFRESH_COOKIE] || ctx.body?.refreshToken || '';
  const [sid, secret] = String(raw).split('.');
  if (!sid || !secret) throw unauthorized('Sin sesión', 'no_session');
  const s = await db.col('sessions').findById(sid);
  if (!s || s.type !== 'refresh' || s.revokedAt || new Date(s.expiresAt) < p.now()) throw unauthorized('Sesión caducada', 'no_session');
  const h = await p.sha256(secret);
  if (h !== s.tokenHash) {
    if (s.prevHash && h === s.prevHash) {
      // Reutilización de un token ya rotado: posible robo. Se revoca la sesión.
      await db.col('sessions').updateById(sid, { $set: { revokedAt: p.now().toISOString(), revokedReason: 'reuse_detected' } });
      await audit(ctx, 'auth.refresh_reuse_detected', 'session', sid, null, { userId: s.userId });
    }
    throw unauthorized('Sesión no válida', 'no_session');
  }
  const user = await db.col('users').findById(s.userId);
  if (!user || !['active', 'pending_guardian'].includes(user.status)) throw unauthorized('Cuenta no activa', 'no_session');
  const next = randomToken(32);
  await db.col('sessions').updateById(sid, { $set: { prevHash: s.tokenHash, tokenHash: await p.sha256(next), lastUsedAt: p.now().toISOString() } });
  const refreshToken = `${sid}.${next}`;
  if (!wantsBodyToken(ctx)) ctx.setCookie(REFRESH_COOKIE, refreshToken, { httpOnly: true, secure: p.config.cookieSecure, sameSite: 'strict', path: '/api/auth', maxAgeMs: p.config.refreshTtlDays * 86400000 });
  return { accessToken: p.tokens.signAccess({ sub: user._id, role: user.role, sid }), expiresIn: p.tokens.accessTtlSec, refreshToken: wantsBodyToken(ctx) ? refreshToken : undefined, user: selfUser(user, p) };
}

async function logout(ctx: Ctx) {
  const raw = ctx.req.cookies?.[REFRESH_COOKIE] || ctx.body?.refreshToken || '';
  const sid = ctx.user?.sid || String(raw).split('.')[0];
  if (sid) await ctx.db.col('sessions').updateById(sid, { $set: { revokedAt: ctx.p.now().toISOString() } });
  ctx.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  return { ok: true };
}

export const DEMO_ACCOUNTS = [
  { email: 'mateo@kinko.app', role: 'patient', label: 'Mateo, 28 años · burnout, en tratamiento' },
  { email: 'lucia@kinko.app', role: 'patient', label: 'Lucía, 16 años · fútbol sin apoyo en casa' },
  { email: 'ana@kinko.app', role: 'patient', label: 'Ana, 22 años · estudiante con ansiedad, sin profesional' },
  { email: 'elena@kinko.app', role: 'professional', label: 'Dra. Elena Urrutia · psicóloga clínica' },
  { email: 'mikel@kinko.app', role: 'professional', label: 'Dr. Mikel Etxeberria · psiquiatra' },
  { email: 'clinica@kinko.app', role: 'clinic_admin', label: 'Centro Bihotz · administración de clínica' },
  { email: 'javier@kinko.app', role: 'parent', label: 'Javier, padre de Lucía' },
  { email: 'dev@kinko.app', role: 'developer', label: 'Laura · analista de datos (Insights API)' },
  { email: 'empresa@kinko.app', role: 'org_admin', label: 'Ferrería Digital · bienestar de la plantilla' },
  { email: 'admin@kinko.app', role: 'admin', label: 'Administración Kinkō' },
] as const;

export const authRoutes = [
  r.post('/auth/register', 'public', register, { rate: RATE.auth }),
  r.post('/auth/login', 'public', login, { rate: RATE.auth }),
  r.post('/auth/2fa/verify', 'public', verify2fa, { rate: RATE.auth }),
  r.post('/auth/refresh', 'public', refresh),
  r.post('/auth/logout', 'optional', logout),
  r.get('/auth/me', 'user', async (ctx) => selfUser(ctx.user!.doc, ctx.p)),
  r.get('/auth/demo-accounts', 'public', async (ctx) => (ctx.p.config.demoMode ? { enabled: true, password: 'Kinko2026!', accounts: DEMO_ACCOUNTS } : { enabled: false, accounts: [] })),
  r.post('/auth/demo-login', 'public', async (ctx) => {
    if (!ctx.p.config.demoMode) throw forbidden('El acceso de demostración está desactivado');
    const b = parse(z.object({ email }), ctx.body);
    if (!DEMO_ACCOUNTS.some((a) => a.email === b.email)) throw notFound('Cuenta de demo no encontrada');
    const user = await ctx.db.col('users').findOne({ email: b.email });
    if (!user) throw notFound('Ejecuta el seed de datos de demostración');
    return issueSession(ctx, user);
  }),
  r.post('/auth/verify-email', 'public', async (ctx) => {
    const b = parse(z.object({ token: z.string().max(200) }), ctx.body);
    const t = await ctx.db.col('passwordResets').findOne({ tokenHash: await ctx.p.sha256(b.token), purpose: 'verify', usedAt: null });
    if (!t || new Date(t.expiresAt) < ctx.p.now()) throw badRequest('Enlace caducado');
    await ctx.db.col('users').updateById(t.userId, { $set: { emailVerified: true } });
    await ctx.db.col('passwordResets').updateById(t._id, { $set: { usedAt: ctx.p.now().toISOString() } });
  }),
  r.post('/auth/2fa/setup', 'user', async (ctx) => {
    const secret = ctx.p.totp.generateSecret();
    await ctx.db.col('users').updateById(ctx.user!.id, { $set: { 'twoFactor.pendingSecret': secret } });
    const uri = ctx.p.totp.keyuri(ctx.user!.email, secret);
    return { secret, otpauthUrl: uri, qr: await ctx.p.totp.qr(uri) };
  }),
  r.post('/auth/2fa/enable', 'user', async (ctx) => {
    const b = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), ctx.body);
    const u = await ctx.db.col('users').findById(ctx.user!.id);
    const secret = u?.twoFactor?.pendingSecret;
    if (!secret || !ctx.p.totp.verify(b.code, secret)) throw badRequest('Código incorrecto');
    await ctx.db.col('users').updateById(ctx.user!.id, { $set: { twoFactor: { enabled: true, secret, enabledAt: ctx.p.now().toISOString() } } });
    await audit(ctx, 'auth.2fa_enabled', 'user', ctx.user!.id);
    return { enabled: true };
  }),
  r.post('/auth/2fa/disable', 'user', async (ctx) => {
    const b = parse(z.object({ code: z.string().regex(/^\d{6}$/), password: z.string() }), ctx.body);
    const u = await ctx.db.col('users').findById(ctx.user!.id);
    if (!u || !(await ctx.p.hasher.verify(u.passwordHash, b.password)) || !ctx.p.totp.verify(b.code, u.twoFactor?.secret || '')) throw badRequest('Datos incorrectos');
    await ctx.db.col('users').updateById(ctx.user!.id, { $set: { twoFactor: { enabled: false } } });
    await audit(ctx, 'auth.2fa_disabled', 'user', ctx.user!.id);
    return { enabled: false };
  }),
  r.post('/auth/password/forgot', 'public', async (ctx) => {
    const b = parse(z.object({ email }), ctx.body);
    const u = await ctx.db.col('users').findOne({ email: b.email });
    if (u) {
      const token = randomToken(24);
      await ctx.db.col('passwordResets').insert({ userId: u._id, tokenHash: await ctx.p.sha256(token), purpose: 'reset', expiresAt: addDays(ctx.p.now(), 1 / 24).toISOString(), usedAt: null });
      await ctx.p.mailer.send(u.email, 'Restablece tu contraseña de Kinkō', `Usa este enlace en la próxima hora: ${ctx.p.config.publicUrl}/#/restablecer?token=${token}`);
    }
    return { ok: true, message: 'Si el email existe, te hemos enviado un enlace.' };
  }, { rate: RATE.auth }),
  r.post('/auth/password/reset', 'public', async (ctx) => {
    const b = parse(z.object({ token: z.string().max(200), password: z.string().max(200) }), ctx.body);
    const prob = passwordProblem(b.password); if (prob) throw badRequest(prob);
    const t = await ctx.db.col('passwordResets').findOne({ tokenHash: await ctx.p.sha256(b.token), purpose: 'reset', usedAt: null });
    if (!t || new Date(t.expiresAt) < ctx.p.now()) throw badRequest('Enlace caducado');
    await ctx.db.col('users').updateById(t.userId, { $set: { passwordHash: await ctx.p.hasher.hash(b.password), failedLogins: 0, lockUntil: null } });
    await ctx.db.col('passwordResets').updateById(t._id, { $set: { usedAt: ctx.p.now().toISOString() } });
    await ctx.db.col('sessions').updateMany({ userId: t.userId, revokedAt: null }, { $set: { revokedAt: ctx.p.now().toISOString() } });
  }, { rate: RATE.auth }),
  r.post('/auth/password/change', 'user', async (ctx) => {
    const b = parse(z.object({ current: z.string(), next: z.string().max(200) }), ctx.body);
    const u = await ctx.db.col('users').findById(ctx.user!.id);
    if (!u || !(await ctx.p.hasher.verify(u.passwordHash, b.current))) throw badRequest('La contraseña actual no es correcta');
    const prob = passwordProblem(b.next); if (prob) throw badRequest(prob);
    await ctx.db.col('users').updateById(u._id, { $set: { passwordHash: await ctx.p.hasher.hash(b.next) } });
    await ctx.db.col('sessions').updateMany({ userId: u._id, revokedAt: null, _id: { $ne: ctx.user!.sid } }, { $set: { revokedAt: ctx.p.now().toISOString() } });
    await audit(ctx, 'auth.password_changed', 'user', u._id);
  }),
  r.get('/auth/sessions', 'user', async (ctx) => (await ctx.db.col('sessions').find({ userId: ctx.user!.id, type: 'refresh', revokedAt: null }, { sort: { lastUsedAt: -1 } }))
    .map((s) => ({ id: s._id, userAgent: s.userAgent, ip: s.ip, lastUsedAt: s.lastUsedAt, createdAt: s.createdAt, current: s._id === ctx.user!.sid }))),
  r.del('/auth/sessions/:id', 'user', async (ctx) => {
    const n = await ctx.db.col('sessions').updateMany({ _id: ctx.params.id, userId: ctx.user!.id }, { $set: { revokedAt: ctx.p.now().toISOString() } });
    if (!n) throw notFound();
  }),
];
