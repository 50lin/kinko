import { describe, it, expect, beforeAll } from 'vitest';
import { MemoryDb, createApp, seedDemo, localProviders, detectRisk, computeKinkoScore, aggregate, relapseSimilarity, PHQ9, ASQ, analyzePassions, recommend, offlineReply, applyUpdate, generateSlots } from '../src';

const { providers } = localProviders({ env: 'test' });
const db = new MemoryDb();
const app = createApp({ db, providers });
const call = async (method: string, path: string, body?: any, token?: string) => {
  const u = new URL('http://x' + path);
  const res = await app.handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, headers: { authorization: token ? `Bearer ${token}` : undefined, 'x-kinko-client': 'local', 'user-agent': 'vitest' }, cookies: {}, ip: '127.0.0.1' });
  return res;
};
const login = async (email: string) => (await call('POST', '/auth/login', { email, password: 'Kinko2026!' })).body.accessToken as string;

describe('motores clínicos', () => {
  it('puntúa el PHQ-9 y marca el ítem 9', () => {
    const a = Object.fromEntries(PHQ9.items.map((i) => [i.id, 2]));
    const r = PHQ9.score({ ...a, q9: 1 });
    expect(r.score).toBe(17); expect(r.severity).toBe('moderately_severe'); expect(r.flags).toContain('phq9_item9');
  });
  it('ASQ agudo activa crisis', () => { expect(ASQ.score({ q1: 1, q2: 0, q3: 1, q4: 0, q5: 1 }).flags).toContain('crisis'); });
  it('detecta riesgo en español sin acentos ni mayúsculas', () => {
    expect(detectRisk('a veces pienso que QUIERO MORIRME').level).toBe('high');
    expect(detectRisk('esta noche me mato').level).toBe('imminent');
    expect(detectRisk('hoy he jugado al fútbol y estoy bien').level).toBe('none');
  });
  it('calcula la puntuación Kinkō', () => {
    const today = new Date();
    const cs = Array.from({ length: 7 }, (_, i) => ({ date: new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10), mood: 8, energy: 7, stress: 3, anxiety: 3, sleepHours: 8, sleepQuality: 4, social: 4, activityMinutes: 40, focus: 7 }));
    const k = computeKinkoScore({ checkins: cs, now: today });
    expect(k.overall).toBeGreaterThan(65); expect(k.domains.sueno).toBeGreaterThan(80);
  });
  it('k-anonimato suprime grupos pequeños', () => {
    const rows = [...Array(12).fill({ ageBand: '18-24', gender: 'mujer', province: 'Bizkaia', phq9: 8 }), ...Array(3).fill({ ageBand: '25-34', gender: 'hombre', province: 'Bizkaia', phq9: 20 })];
    const r = aggregate(rows, ['ageBand'], ['phq9'], { k: 10, epsilon: 1, rand: () => 0.5 });
    expect(r.groups).toHaveLength(1); expect(r.suppressedGroups).toBe(1); expect(r.groups[0].metrics.phq9).toBe(8);
  });
  it('detecta patrón similar a una recaída previa', () => {
    const now = new Date('2027-06-01T12:00:00Z');
    const days: any[] = [];
    for (let d = 200; d >= 0; d--) {
      const date = new Date(now.getTime() - d * 86400000).toISOString().slice(0, 10);
      const falling = (d > 100 && d <= 114) || d <= 14;
      const t = d > 100 ? (114 - d) / 14 : (14 - d) / 14;
      days.push(falling ? { date, mood: 7 - 4 * t, sleepHours: 7 - 2 * t, stress: 4 + 4 * t, energy: 6 - 3 * t, social: 3.5 - 1.5 * t } : { date, mood: 7, sleepHours: 7, stress: 4, energy: 6, social: 3.5 });
    }
    const ep = new Date(now.getTime() - 100 * 86400000).toISOString().slice(0, 10);
    const r = relapseSimilarity(days, [ep], now);
    expect(r.matches.length).toBe(1); expect(r.matches[0].similarity).toBeGreaterThan(0.9);
  });
  it('analiza pasiones sin apoyo', () => {
    const a = analyzePassions([{ key: 'futbol', importance: 5, frequency: 1, support: { family: 1, friends: 4 }, blockers: ['apoyo'] }]);
    expect(a.insights[0].atRisk).toBe(true); expect(a.insights[0].unsupported).toBe(true);
  });
  it('Kio sin conexión ordena ideas', () => {
    const r = offlineReply('organizar', 'Tengo que estudiar estadística. Me preocupa no dormir. Estoy cansada.', { firstName: 'Ana', age: 22, hasProfessional: false, useContext: true }, 1);
    expect(r).toContain('Tareas'); expect(r).toContain('estudiar');
  });
  it('operadores de actualización', () => {
    const d = applyUpdate({ a: 1, tags: ['x'], items: [{ id: 1 }, { id: 2 }] }, { $inc: { a: 2 }, $addToSet: { tags: 'y' }, $pull: { items: { id: 1 } }, $set: { 'n.m': 3 } });
    expect(d).toEqual({ a: 3, tags: ['x', 'y'], items: [{ id: 2 }], n: { m: 3 } });
  });
  it('genera huecos de agenda en horario de Madrid', () => {
    const slots = generateSlots([{ weekday: 1, start: '09:00', end: '11:00' }], 50, [], new Date('2027-03-05T10:00:00Z'), 7);
    expect(slots.length).toBe(2); expect(slots[0].label).toBe('09:00');
  });
});

describe('API completa con datos de demostración', () => {
  let mateo: string, elena: string, javier: string, admin: string, dev: string;
  beforeAll(async () => {
    const r = await seedDemo(db, providers);
    expect(r.skipped).toBe(false);
    [mateo, elena, javier, admin, dev] = await Promise.all(['mateo@kinko.app', 'elena@kinko.app', 'javier@kinko.app', 'admin@kinko.app', 'dev@kinko.app'].map(login));
  }, 60_000);
  it('rechaza sin sesión y con rol equivocado', async () => {
    expect((await call('GET', '/me/dashboard')).status).toBe(401);
    expect((await call('GET', '/pro/dashboard', undefined, mateo)).status).toBe(403);
  });
  it('dashboard del paciente con esfera y recomendaciones', async () => {
    const r = await call('GET', '/me/dashboard', undefined, mateo);
    expect(r.status).toBe(200); expect(r.body.kinko.overall).toBeGreaterThan(0); expect(r.body.recommendations.length).toBeGreaterThan(2); expect(r.body.careTeam.length).toBe(2);
  });
  it('check-in con nota de riesgo genera alerta para su profesional', async () => {
    const r = await call('POST', '/checkins', { mood: 2, stress: 9, sleepHours: 4, note: 'no quiero seguir viviendo así' }, mateo);
    expect(r.status).toBe(200); expect(r.body.crisis.level).toBe('high');
    const alerts = await call('GET', '/alerts', undefined, elena);
    expect(alerts.body.some((a: any) => a.type === 'crisis' && a.patient.firstName === 'Mateo')).toBe(true);
  });
  it('test PHQ-9 con cambio fiable', async () => {
    const r = await call('POST', '/assessments', { instrumentId: 'phq9', answers: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 2, q6: 2, q7: 2, q8: 1, q9: 0 } }, mateo);
    expect(r.status).toBe(200); expect(r.body.assessment.score).toBe(19);
  });
  it('panel profesional: triaje, línea de vida, patrones y resumen', async () => {
    const d = await call('GET', '/pro/dashboard', undefined, elena);
    expect(d.status).toBe(200); expect(d.body.triage.length).toBeGreaterThan(10);
    const pid = d.body.triage.find((t: any) => t.patient.firstName === 'Mateo').patient.id;
    const t = await call('GET', `/pro/patients/${pid}/timeline?period=all`, undefined, elena);
    expect(t.status).toBe(200); expect(t.body.series.length).toBeGreaterThan(100);
    const pat = await call('GET', `/pro/patients/${pid}/patterns`, undefined, elena);
    expect(pat.status).toBe(200); expect(pat.body.episodes.length).toBeGreaterThan(0);
    const pre = await call('GET', `/pro/patients/${pid}/presession`, undefined, elena);
    expect(pre.body.narrative).toContain('check-ins');
    const recs = await call('GET', `/pro/patients/${pid}/records`, undefined, elena);
    expect(recs.body.length).toBeGreaterThan(3);
    expect(recs.body[0].soap?.s || recs.body[0].content).toBeTruthy();
  });
  it('el psiquiatra no ve el diario porque el paciente no lo autorizó', async () => {
    const mikel = await login('mikel@kinko.app');
    const d = await call('GET', '/pro/patients', undefined, mikel);
    const pid = d.body.find((t: any) => t.patient.firstName === 'Mateo').patient.id;
    expect((await call('GET', `/pro/patients/${pid}/journal`, undefined, mikel)).status).toBe(403);
  });
  it('familia ve progreso pero nunca el diario', async () => {
    const teens = await call('GET', '/family/teens', undefined, javier);
    expect(teens.body.length).toBe(1);
    const detail = await call('GET', `/family/teens/${teens.body[0].teen.id}`, undefined, javier);
    expect(detail.status).toBe(200); expect(detail.body.weekly.length).toBeGreaterThan(3); expect(detail.body.journal).toBeUndefined();
  });
  it('Kio responde y detecta crisis', async () => {
    const th = await call('POST', '/companion/threads', { mode: 'organizar' }, mateo);
    const m = await call('POST', `/companion/threads/${th.body._id}/messages`, { content: 'Tengo que entregar el proyecto y me preocupa no llegar' }, mateo);
    expect(m.status).toBe(200); expect(m.body.message.content.length).toBeGreaterThan(20);
    const c = await call('POST', `/companion/threads/${th.body._id}/messages`, { content: 'a veces pienso en suicidarme' }, mateo);
    expect(c.body.crisis.level).toBe('high'); expect(c.body.message.content).toContain('024');
  });
  it('API de insights con clave sandbox y k-anonimato', async () => {
    const res = await app.handle({ method: 'GET', path: '/v1/insights/wellbeing', query: { groupBy: 'ageBand,gender', metrics: 'phq9,gad7' }, body: null, headers: { 'x-api-key': 'kk_test_demo_kinko2026' }, cookies: {}, ip: '1.1.1.1' });
    expect(res.status).toBe(200); expect(res.body.groups.length).toBeGreaterThan(5);
    expect(res.body.groups.every((g: any) => g.n >= 10)).toBe(true);
    const bad = await app.handle({ method: 'GET', path: '/v1/insights/overview', query: {}, body: null, headers: { 'x-api-key': 'kk_test_falsa' }, cookies: {}, ip: '1.1.1.1' });
    expect(bad.status).toBe(401);
  });
  it('panel de empresa solo con datos agregados', async () => {
    const org = await login('empresa@kinko.app');
    const r = await call('GET', '/org/dashboard', undefined, org);
    expect(r.status).toBe(200); expect(r.body.totals.kinko).toBeGreaterThan(0); expect(r.body.departments.every((d: any) => d.n >= 10)).toBe(true);
  });
  it('reserva de cita desde el directorio', async () => {
    const ana = await login('ana@kinko.app');
    const pros = await call('GET', '/directory/professionals?specialty=Ansiedad', undefined, ana);
    expect(pros.body[0].match.score).toBeGreaterThan(50);
    const prof = await call('GET', `/directory/professionals/${pros.body[0].id}`, undefined, ana);
    const b = await call('POST', '/appointments', { professionalId: pros.body[0].id, start: prof.body.slots[0].start, modality: 'video' }, ana);
    expect(b.status).toBe(200); expect(b.body.appointment.paid).toBe(true);
  });
  it('tienda bloquea fármacos y suplementos', async () => {
    const r = await call('POST', '/shop/products', { name: 'Melatonina extra fuerte', price: 10, type: 'own', category: 'Descanso' }, admin);
    expect(r.status).toBe(400);
  });
  it('rotación de refresh token y detección de reutilización', async () => {
    const l = await call('POST', '/auth/login', { email: 'ana@kinko.app', password: 'Kinko2026!' });
    const r1 = await call('POST', '/auth/refresh', { refreshToken: l.body.refreshToken });
    expect(r1.status).toBe(200);
    const reuse = await call('POST', '/auth/refresh', { refreshToken: l.body.refreshToken });
    expect(reuse.status).toBe(401);
    const r2 = await call('POST', '/auth/refresh', { refreshToken: r1.body.refreshToken });
    expect(r2.status).toBe(401);
  });
  it('bloqueo tras 5 intentos fallidos', async () => {
    for (let i = 0; i < 5; i++) await call('POST', '/auth/login', { email: 'javier@kinko.app', password: 'mal-' + i });
    expect((await call('POST', '/auth/login', { email: 'javier@kinko.app', password: 'Kinko2026!' })).status).toBe(423);
  });
  it('registro de menor queda pendiente de tutor', async () => {
    const r = await call('POST', '/auth/register', { email: 'teen@test.app', password: 'Secreto12345', role: 'patient', firstName: 'Teo', birthDate: '2012-05-05', consents: { terms: true, privacy: true } });
    expect(r.status).toBe(200); expect(r.body.user.status).toBe('pending_guardian'); expect(r.body.guardianCode).toHaveLength(8);
    expect((await call('GET', '/checkins', undefined, r.body.accessToken)).status).toBe(403);
  });
  it('inyección NoSQL neutralizada', async () => {
    const r = await call('POST', '/auth/login', { email: { $gt: '' }, password: { $gt: '' } });
    expect(r.status).toBe(400);
  });
  it('exportación RGPD y auditoría', async () => {
    const e = await call('GET', '/me/export', undefined, mateo);
    expect(e.body.checkins.length).toBeGreaterThan(100);
    const a = await call('GET', '/admin/audit', undefined, admin);
    expect(a.body.some((l: any) => l.action === 'patient.timeline')).toBe(true);
  });
});
