import type { Db } from '../db/types';
import type { Providers } from '../api/context';
import { addDays, dayKey, madridToUtc } from '../util/dates';
import { rng, type Rng } from '../util/rng';
import { newId } from '../util/ids';
import { INSTRUMENT_BY_ID } from '../instruments';
import { PROVINCES } from '../constants';
import { sentiment } from '../engine/sentiment';
import { systemCtx, runJobs } from '../api/jobs';
import { refreshKinko, hueFor } from '../api/services';
import { CONTENTS, PATHS, FORUM_CATEGORIES, PRODUCTS } from './content';

const FIRST_F = ['Ane', 'Maialen', 'Irene', 'Laura', 'Nerea', 'Paula', 'Marta', 'Sara', 'Leire', 'Carmen', 'Lucía', 'Uxue', 'Ainhoa', 'Claudia', 'Julia', 'Elena', 'Noa', 'Amaia', 'Rocío', 'Alba'];
const FIRST_M = ['Iker', 'Unai', 'Jon', 'Mikel', 'Pablo', 'Aitor', 'Hugo', 'Daniel', 'Asier', 'Álvaro', 'Ander', 'Javier', 'Gorka', 'Sergio', 'Adrián', 'Mario', 'Ibai', 'Diego', 'Xabier', 'Rubén'];
const LAST = ['García', 'Etxebarria', 'Fernández', 'Agirre', 'López', 'Zubizarreta', 'Martínez', 'Ibarra', 'Sánchez', 'Arrieta', 'Pérez', 'Goikoetxea', 'Gómez', 'Uriarte', 'Díaz', 'Larrañaga', 'Ruiz', 'Olabarria', 'Moreno', 'Bilbao', 'Romero', 'Ugarte', 'Navarro', 'Elorza'];

function answersFor(g: Rng, instrumentId: string, target: number): Record<string, number> {
  const inst = INSTRUMENT_BY_ID[instrumentId];
  let best: Record<string, number> = {}; let bestD = Infinity;
  for (let t = 0; t < 120; t++) {
    const a: Record<string, number> = {};
    for (const it of inst.items) {
      if (it.showIfAnyYes) continue;
      const vals = it.options.map((o) => o.value);
      a[it.id] = instrumentId === 'phq9' && it.id === 'q9' ? 0 : g.pick(vals);
    }
    try { const s = inst.score(a).score; const d = Math.abs(s - target); if (d < bestD) { best = a; bestD = d; } if (d === 0) break; } catch { /* sigue */ }
  }
  return best;
}

export async function seedDemo(db: Db, p: Providers, opts: { force?: boolean } = {}) {
  if (!opts.force && (await db.col('users').findOne({ email: 'admin@kinko.app' }))) return { skipped: true };
  const g = rng(2027);
  const now = p.now();
  const pw = await p.hasher.hash('Kinko2026!');
  const today = dayKey(now);
  const at = (daysAgo: number, hhmm = '20:30') => madridToUtc(dayKey(addDays(now, -daysAgo)), hhmm).toISOString();
  const users: Record<string, any> = {};
  async function user(email: string, role: string, profile: any, extra: any = {}) {
    const u = await db.col('users').insert({
      email, passwordHash: pw, role, status: 'active', plan: extra.plan || 'free', emailVerified: true,
      profile: { avatarHue: hueFor(email), ...profile }, consents: { terms: true, privacy: true, research: extra.research ?? true, marketing: false, acceptedAt: at(300), version: '2027-01' },
      settings: { reminders: true, reminderHour: 20, theme: 'system', sphereFace: false, aiUseContext: true, ...(extra.settings || {}) },
      gamification: { points: extra.points || 0, streak: extra.streak || 0, bestStreak: extra.streak || 0, badges: extra.badges || [], lastCheckinDate: extra.streak ? today : null },
      twoFactor: { enabled: false }, failedLogins: 0, organization: extra.organization || null, createdAt: extra.createdAt || at(320),
    });
    users[email] = u; return u;
  }

  // ---------- Plataforma ----------
  await user('admin@kinko.app', 'admin', { firstName: 'Admin', lastName: 'Kinkō' }, { research: false });
  await db.col('contents').insertMany(CONTENTS.map((c) => ({ ...c, status: 'published', authorId: null, views: g.int(40, 900), url: c.url || '', cover: '' })));
  await db.col('carePaths').insertMany(PATHS.map((x) => ({ ...x, status: 'published' })));
  const cats = await db.col('forumCategories').insertMany(FORUM_CATEGORIES);
  const cat = (slug: string) => cats.find((c) => c.slug === slug)!._id;
  await db.col('products').insertMany(PRODUCTS.map((x) => ({ ...x, ownerId: users['admin@kinko.app']._id })));

  // ---------- Clínicas ----------
  const clinicAdmin = await user('clinica@kinko.app', 'clinic_admin', { firstName: 'Itziar', lastName: 'Lasa' }, { plan: 'clinic', research: false });
  const bihotz = await db.col('clinics').insert({ name: 'Centro Bihotz Psicología', slug: 'centro-bihotz', city: 'Bilbao', province: 'Bizkaia', address: 'Gran Vía 50, 3.º, Bilbao (dirección ficticia)', phone: '944 000 000', description: 'Centro de psicología y psiquiatría en Bilbao. Ansiedad, ánimo, adolescentes y estrés laboral, presencial y online.', specialties: ['Ansiedad', 'Depresión', 'Adolescentes', 'Estrés laboral y burnout', 'Psiquiatría'], adminIds: [clinicAdmin._id], members: [{ userId: clinicAdmin._id, role: 'admin' }], verificationStatus: 'verified', verified: true, logoHue: 165 });
  const itsaso = await db.col('clinics').insert({ name: 'Itsaso Salud Mental', slug: 'itsaso-salud-mental', city: 'Donostia', province: 'Gipuzkoa', address: 'Calle ficticia 12, Donostia', description: 'Equipo multidisciplinar con enfoque en trauma, duelo y familia.', specialties: ['Trauma', 'Duelo', 'Familia'], adminIds: [], members: [], verificationStatus: 'verified', verified: true, logoHue: 200 });
  const equilibrio = await db.col('clinics').insert({ name: 'Clínica Equilibrio Madrid', slug: 'clinica-equilibrio-madrid', city: 'Madrid', province: 'Madrid', address: 'Calle ficticia 8, Madrid', description: 'Psicología online y presencial para jóvenes y profesionales.', specialties: ['Ansiedad', 'Autoestima', 'Pareja'], adminIds: [], members: [], verificationStatus: 'verified', verified: true, logoHue: 30 });
  await db.col('clinics').insert({ name: 'Centro Arima', slug: 'centro-arima', city: 'Vitoria-Gasteiz', province: 'Álava', description: 'Pendiente de verificación (demo para el panel de administración).', specialties: ['Infancia'], adminIds: [], members: [], verificationStatus: 'pending', verified: false, logoHue: 90 });

  // ---------- Profesionales ----------
  const AV = [1, 2, 3, 4].flatMap((d) => [{ weekday: d, start: '09:00', end: '14:00' }, { weekday: d, start: '16:00', end: '20:00' }]).concat([{ weekday: 5, start: '09:00', end: '14:00' }]);
  const PROS = [
    ['elena@kinko.app', 'Elena', 'Urrutia Goikoetxea', 'mujer', 'Psicólogo/a clínico/a (PIR)', ['Ansiedad', 'Depresión', 'Estrés laboral y burnout', 'Adolescentes'], ['Cognitivo-conductual', 'ACT'], 60, 'Bizkaia', 'Bilbao', bihotz._id, 4.9, 38, ['Español', 'Euskera', 'Inglés'], 'Psicóloga clínica vía PIR con 12 años de experiencia. Acompaño a adultos y adolescentes con ansiedad, ánimo bajo y agotamiento laboral. Trabajo con datos entre sesiones para que cada encuentro cuente.'],
    ['mikel@kinko.app', 'Mikel', 'Etxeberria Zubiri', 'hombre', 'Psiquiatra', ['Psiquiatría', 'Depresión', 'TDAH', 'Sueño'], ['Farmacológica (psiquiatría)', 'Integradora'], 90, 'Bizkaia', 'Bilbao', bihotz._id, 4.8, 21, ['Español', 'Euskera'], 'Psiquiatra. Valoración diagnóstica, seguimiento farmacológico y coordinación con psicología.'],
    ['amaia.p@kinko.app', 'Amaia', 'Pagola', 'mujer', 'Psicólogo/a general sanitario/a', ['Trauma', 'Duelo', 'Familia'], ['EMDR', 'Sistémica'], 55, 'Gipuzkoa', 'Donostia', itsaso._id, 4.7, 17, ['Español', 'Euskera'], 'Especialista en trauma y duelo. EMDR y terapia familiar.'],
    ['jon.l@kinko.app', 'Jon', 'Larrea', 'hombre', 'Psicólogo/a general sanitario/a', ['Psicología deportiva', 'Ansiedad', 'Adolescentes', 'Rendimiento académico'], ['Cognitivo-conductual', 'Mindfulness'], 50, 'Gipuzkoa', 'Donostia', itsaso._id, 4.9, 26, ['Español', 'Euskera'], 'Psicología del deporte y jóvenes deportistas. Presión, motivación y conciliación con los estudios.'],
    ['carla.m@kinko.app', 'Carla', 'Moreno Vidal', 'mujer', 'Psicólogo/a general sanitario/a', ['Ansiedad', 'Autoestima', 'LGTBI+'], ['ACT', 'Humanista'], 55, 'Madrid', 'Madrid', equilibrio._id, 4.8, 44, ['Español', 'Inglés'], 'Ansiedad, autoestima y diversidad. Online en toda España.'],
    ['david.s@kinko.app', 'David', 'Serrano', 'hombre', 'Psicólogo/a general sanitario/a', ['Pareja', 'Familia', 'Estrés laboral y burnout'], ['Sistémica', 'Integradora'], 60, 'Madrid', 'Madrid', equilibrio._id, 4.6, 12, ['Español'], 'Terapia de pareja y familia; estrés laboral en directivos.'],
    ['montse.r@kinko.app', 'Montse', 'Riera', 'mujer', 'Psicólogo/a general sanitario/a', ['TCA', 'Autoestima', 'Adolescentes'], ['Cognitivo-conductual'], 65, 'Barcelona', 'Barcelona', null, 4.9, 31, ['Español', 'Catalán'], 'Trastornos de la conducta alimentaria e imagen corporal.'],
    ['pablo.v@kinko.app', 'Pablo', 'Vera', 'hombre', 'Psicólogo/a general sanitario/a', ['Adicciones', 'Depresión'], ['Cognitivo-conductual', 'ACT'], 45, 'Valencia', 'Valencia', null, 4.5, 9, ['Español', 'Valenciano'], 'Adicciones con y sin sustancia; prevención de recaídas.'],
    ['rocio.g@kinko.app', 'Rocío', 'Gálvez', 'mujer', 'Psicólogo/a general sanitario/a', ['Infancia', 'TDAH', 'Familia'], ['Cognitivo-conductual', 'Sistémica'], 50, 'Sevilla', 'Sevilla', null, 4.8, 19, ['Español'], 'Infancia y adolescencia, TDAH y orientación a familias.'],
    ['ander.u@kinko.app', 'Ander', 'Uribe', 'hombre', 'Psicólogo/a general sanitario/a', ['Mindfulness', 'Estrés laboral y burnout', 'Sueño'], ['Mindfulness', 'ACT'], 55, 'Álava', 'Vitoria-Gasteiz', null, 4.7, 14, ['Español', 'Euskera'], 'Mindfulness y estrés; programas para empresas.'],
    ['sofia.n@kinko.app', 'Sofía', 'Navarro', 'mujer', 'Psicólogo/a clínico/a (PIR)', ['Depresión', 'Duelo', 'Dolor crónico'], ['Integradora', 'Cognitivo-conductual'], 70, 'Navarra', 'Pamplona', null, 4.9, 22, ['Español'], 'Psicóloga clínica. Depresión, duelo y dolor crónico.'],
    ['nerea@kinko.app', 'Nerea', 'Ortega', 'mujer', 'Psicólogo/a general sanitario/a', ['Ansiedad'], ['Cognitivo-conductual'], 45, 'Bizkaia', 'Getxo', null, null, 0, ['Español'], 'Pendiente de verificación (demo).'],
  ] as const;
  for (const [i, x] of PROS.entries()) {
    const [email, first, last, gender, type, specialties, approaches, price, province, city, clinicId, rating, reviews, languages, bio] = x;
    const u = await user(email, 'professional', { firstName: first, lastName: last, gender, province, city, birthDate: `${1975 + i}-0${(i % 9) + 1}-1${i % 9}` }, { plan: i < 2 ? 'pro_plus' : 'pro_solo', research: false });
    const pending = email === 'nerea@kinko.app';
    await db.col('professionals').insert({ userId: u._id, type, licenseNumber: `BI0${4800 + i * 37}`, college: province === 'Bizkaia' ? 'COP Bizkaia' : `COP ${province}`, verificationStatus: pending ? 'pending' : 'verified', verified: !pending, specialties, approaches, languages, modalities: i % 3 === 2 ? ['online'] : ['online', 'presencial'], price, sessionMinutes: 50, bio, city, province, clinicId, availability: AV, acceptingNew: true, autoConfirm: i % 2 === 1, rating, reviewsCount: reviews, featured: i < 2 });
    if (clinicId) await db.col('clinics').updateById(clinicId, { $push: { members: { userId: u._id, role: 'professional', joinedAt: at(400) } } });
  }
  const elena = users['elena@kinko.app'], mikel = users['mikel@kinko.app'];

  // ---------- Pacientes protagonistas ----------
  const mateo = await user('mateo@kinko.app', 'patient', { firstName: 'Mateo', lastName: 'Garrido Ruiz', birthDate: '1998-03-14', gender: 'hombre', province: 'Bizkaia', city: 'Bilbao', phone: '600 000 001', bio: 'Ingeniero de software. Corro cuando puedo y toco la guitarra.' }, { plan: 'care', streak: 6, points: 2140, badges: ['primer-checkin', 'racha-7', 'explorador', 'pasiones', 'diario-5'], createdAt: at(310) });
  const lucia = await user('lucia@kinko.app', 'patient', { firstName: 'Lucía', lastName: 'Ortiz Arana', birthDate: '2010-06-02', gender: 'mujer', province: 'Bizkaia', city: 'Barakaldo' }, { plan: 'family', streak: 3, points: 640, badges: ['primer-checkin', 'pasiones'], settings: { sphereFace: true }, research: false, createdAt: at(70) });
  const ana = await user('ana@kinko.app', 'patient', { firstName: 'Ana', lastName: 'Martín Soto', birthDate: '2004-09-21', gender: 'mujer', province: 'Madrid', city: 'Madrid' }, { plan: 'free', streak: 2, points: 310, badges: ['primer-checkin'], createdAt: at(30) });
  const javier = await user('javier@kinko.app', 'parent', { firstName: 'Javier', lastName: 'Ortiz', gender: 'hombre', province: 'Bizkaia', city: 'Barakaldo', birthDate: '1978-02-08' }, { plan: 'family', research: false });
  const dev = await user('dev@kinko.app', 'developer', { firstName: 'Laura', lastName: 'Pérez Analytics' }, { plan: 'developer', research: false });
  const orgAdmin = await user('empresa@kinko.app', 'org_admin', { firstName: 'Iñigo', lastName: 'Barrena' }, { plan: 'org', research: false });
  const org = await db.col('organizations').insert({ name: 'Ferrería Digital S.L. (ficticia)', employees: 85, adminIds: [orgAdmin._id], joinCode: 'FERRE1', plan: 'org' });

  // ---------- Generador de check-ins ----------
  type Day = { mood: number; sleep: number; stress: number; energy: number; social: number; act: number; anxiety?: number; focus?: number };
  const clampN = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const EMO_POS = ['alegría', 'calma', 'gratitud', 'ilusión', 'orgullo', 'alivio'], EMO_NEG = ['cansancio', 'agobio', 'ansiedad', 'tristeza', 'frustración', 'soledad'];
  async function checkins(userId: string, days: number, fn: (d: number) => Day, adherence: number, notes: string[] = []) {
    const docs: any[] = [];
    for (let d = days; d >= 0; d--) {
      if (d > 0 && !g.chance(adherence)) continue;
      const b = fn(d);
      const mood = Math.round(clampN(b.mood + g.normal(0, 0.8), 1, 10));
      const emotions = g.pickN(mood >= 6 ? EMO_POS : EMO_NEG, g.int(1, 3));
      docs.push({ userId, date: dayKey(addDays(now, -d)), mood, energy: Math.round(clampN(b.energy + g.normal(0, 0.9), 1, 10)), stress: Math.round(clampN(b.stress + g.normal(0, 0.9), 1, 10)), anxiety: Math.round(clampN((b.anxiety ?? b.stress - 0.5) + g.normal(0, 0.9), 1, 10)), sleepHours: Math.round(clampN(b.sleep + g.normal(0, 0.5), 3, 11) * 2) / 2, sleepQuality: Math.round(clampN(b.sleep - 3.5 + g.normal(0, 0.6), 1, 5)), social: Math.round(clampN(b.social + g.normal(0, 0.6), 1, 5)), activityMinutes: Math.max(0, Math.round(b.act + g.normal(0, 10))), focus: Math.round(clampN((b.focus ?? b.energy) + g.normal(0, 1), 1, 10)), emotions, behaviors: { outdoors: g.chance(0.5), screensLate: g.chance(0.5), passionTime: b.act > 25 }, gratitude: g.chance(0.3) ? g.pick(['Un café tranquilo', 'Hablar con mi hermana', 'Terminar una tarea pendiente', 'El sol de la tarde', 'Una buena canción']) : '', note: notes.length && g.chance(0.12) ? g.pick(notes) : '', tags: [], createdAt: at(d, '21:10'), updatedAt: at(d, '21:10') });
    }
    await db.col('checkins').insertMany(docs);
    return docs;
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * clampN(t, 0, 1);
  // Mateo: estable, episodio hace ~230 días precedido de 14 días de caída, y caída similar en las dos últimas semanas.
  await checkins(mateo._id, 300, (d) => {
    const base: Day = { mood: 7, sleep: 7.2, stress: 4.5, energy: 6.5, social: 3.4, act: 35 };
    const fall = (t: number): Day => ({ mood: lerp(7, 3.2, t), sleep: lerp(7.2, 5, t), stress: lerp(4.5, 8.3, t), energy: lerp(6.5, 3, t), social: lerp(3.4, 1.8, t), act: lerp(35, 5, t) });
    if (d > 245) return base;
    if (d > 230) return fall((245 - d) / 14);
    if (d > 150) { const t = (230 - d) / 80; return { mood: lerp(3.2, 6.8, t), sleep: lerp(5, 7, t), stress: lerp(8.3, 5, t), energy: lerp(3, 6, t), social: lerp(1.8, 3.2, t), act: lerp(5, 30, t) }; }
    if (d > 14) return base;
    return fall((14 - d) / 14);
  }, 0.86, ['Reunión de equipo otra vez hasta las 20:00.', 'Hoy he corrido 20 minutos y me he sentido mejor.', 'No consigo desconectar del trabajo por la noche.']);
  await checkins(lucia._id, 60, (d) => ({ mood: 5.2 + Math.sin(d / 6) * 0.8, sleep: 7.6, stress: d < 20 ? 7 : 5.5, energy: 5.3, social: 2.4, act: 8, anxiety: 6, focus: 5 }), 0.72, ['Echo de menos entrenar.', 'Examen de mates mañana.']);
  await checkins(ana._id, 25, () => ({ mood: 5.4, sleep: 6.1, stress: 7.1, energy: 5, social: 3, act: 15, anxiety: 7.4, focus: 4.5 }), 0.8);

  // ---------- Tests ----------
  const assess: any[] = [];
  const A = (userId: string, instrumentId: string, target: number, daysAgo: number, context = 'self') => {
    const inst = INSTRUMENT_BY_ID[instrumentId];
    const answers = answersFor(g, instrumentId, target);
    const res = inst.score(answers);
    assess.push({ userId, instrumentId, answers, ...res, context, completedAt: at(daysAgo, '19:00'), createdAt: at(daysAgo, '19:00'), updatedAt: at(daysAgo, '19:00') });
  };
  [[230, 18], [200, 12], [160, 8], [110, 6], [60, 5], [28, 6], [14, 7], [2, 14]].forEach(([d, s]) => A(mateo._id, 'phq9', s, d, d < 30 ? 'scheduled' : 'self'));
  [[230, 15], [200, 10], [110, 6], [60, 5], [14, 6], [2, 11]].forEach(([d, s]) => A(mateo._id, 'gad7', s, d));
  A(mateo._id, 'cbi', 71, 3); A(mateo._id, 'who5', 40, 3); A(mateo._id, 'sleep', 46, 5); A(mateo._id, 'ucla3', 5, 20);
  A(lucia._id, 'phq9', 11, 6); A(lucia._id, 'gad7', 9, 6); A(lucia._id, 'asq', 0, 6); A(lucia._id, 'ucla3', 7, 10); A(lucia._id, 'rses', 14, 12); A(lucia._id, 'phq9', 9, 40);
  A(ana._id, 'gad7', 13, 4); A(ana._id, 'phq9', 8, 4); A(ana._id, 'sleep', 52, 9);
  // Cambio fiable respecto al anterior
  assess.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const lastBy: Record<string, number> = {};
  for (const a of assess) { const k = `${a.userId}:${a.instrumentId}`; const prev = lastBy[k]; const inst = INSTRUMENT_BY_ID[a.instrumentId]; a.previousScore = prev ?? null; a.change = prev == null || !inst.rci ? null : Math.abs(a.score - prev) < inst.rci ? 'same' : (a.score > prev) === ['who5', 'rses', 'sleep'].includes(inst.id) ? 'better' : 'worse'; lastBy[k] = a.score; }

  // ---------- Pacientes sintéticos (directorio, triaje, empresa e insights) ----------
  const synth: any[] = [];
  const depts = ['Desarrollo', 'Desarrollo', 'Desarrollo', 'Atención al cliente', 'Atención al cliente', 'Operaciones', 'Operaciones', 'Dirección'];
  for (let i = 0; i < 78; i++) {
    const fem = g.chance(0.55);
    const first = fem ? g.pick(FIRST_F) : g.pick(FIRST_M);
    const last = `${g.pick(LAST)} ${g.pick(LAST)}`;
    const age = i < 44 ? g.int(23, 58) : g.pick([g.int(14, 17), g.int(18, 24), g.int(25, 34), g.int(35, 64)]);
    const birth = `${now.getFullYear() - age}-${String(g.int(1, 12)).padStart(2, '0')}-${String(g.int(1, 28)).padStart(2, '0')}`;
    const inOrg = i < 44;
    const province = inOrg ? 'Bizkaia' : g.chance(0.5) ? g.pick(['Bizkaia', 'Gipuzkoa', 'Álava']) : g.pick(PROVINCES);
    const u = await user(`paciente${i + 1}@demo.kinko.app`, 'patient', { firstName: first, lastName: last, birthDate: birth, gender: fem ? 'mujer' : g.chance(0.95) ? 'hombre' : 'no_binario', province }, { plan: inOrg ? 'org' : g.chance(0.3) ? 'plus' : 'free', research: g.chance(0.88), streak: g.int(0, 12), points: g.int(30, 900), organization: inOrg ? { id: org._id, name: org.name, department: depts[i % depts.length], joinedAt: at(100) } : null, createdAt: at(g.int(20, 200)) });
    const severity = g.normal(0, 1);
    const sevBoost = inOrg && depts[i % depts.length] === 'Atención al cliente' ? 1 : 0;
    await checkins(u._id, 32, () => ({ mood: 6.4 - severity * 1.2 - sevBoost * 0.6, sleep: 7 - severity * 0.5, stress: 5 + severity * 1.2 + sevBoost * 1.3, energy: 6 - severity, social: 3.2 - severity * 0.4, act: 25 - severity * 6 }), g.next() * 0.6 + 0.25);
    A(u._id, 'phq9', Math.round(clampN(6 + severity * 4.5, 0, 26)), g.int(1, 25));
    A(u._id, 'gad7', Math.round(clampN(5 + severity * 4 + sevBoost * 2, 0, 20)), g.int(1, 25));
    A(u._id, 'who5', Math.round(clampN(60 - severity * 14, 4, 100)), g.int(1, 25));
    if (inOrg) A(u._id, 'cbi', Math.round(clampN(42 + severity * 15 + sevBoost * 12, 0, 100)), g.int(1, 20));
    const ints = g.pickN(['futbol', 'running', 'yoga', 'instrumento', 'dibujo', 'lectura', 'montana', 'cocina', 'videojuegos', 'fotografia', 'baile', 'gimnasio'], g.int(1, 3)).map((key) => ({ key, importance: g.int(3, 5), frequency: g.int(0, 4), support: { family: g.int(1, 5), friends: g.int(2, 5) }, blockers: [] }));
    await db.col('passionProfiles').insert({ userId: u._id, interests: ints, dreams: '' });
    synth.push(u);
  }
  await db.col('assessments').insertMany(assess);

  // ---------- Relaciones de cuidado ----------
  const ALL = ['checkins', 'assessments', 'journal_shared', 'biometrics', 'companion_summaries', 'passions', 'plan'];
  const rel = (patientId: string, professionalId: string, scopes: string[], startedDays: number, clinicId: string | null = bihotz._id, status = 'active') =>
    db.col('careRelations').insert({ patientId, professionalId, clinicId, status, source: 'invite', startedAt: at(startedDays), consent: { scopes, historyFrom: null, grantedAt: at(startedDays) }, createdAt: at(startedDays) });
  await rel(mateo._id, elena._id, ALL, 250);
  await rel(mateo._id, mikel._id, ['checkins', 'assessments', 'biometrics'], 235);
  await rel(lucia._id, elena._id, ['checkins', 'assessments', 'plan', 'passions'], 45);
  const elenaPatients = synth.slice(44, 56), mikelPatients = synth.slice(56, 62);
  for (const s of elenaPatients) await rel(s._id, elena._id, ['checkins', 'assessments', 'plan'], g.int(20, 160));
  for (const s of mikelPatients) await rel(s._id, mikel._id, ['checkins', 'assessments'], g.int(20, 160));
  await db.col('careRelations').insert({ patientId: synth[62]._id, professionalId: elena._id, clinicId: bihotz._id, status: 'pending', source: 'invite', requestedScopes: ['checkins', 'assessments'], consent: { scopes: [], historyFrom: null } });

  // ---------- Familia ----------
  await db.col('guardianLinks').insert({ teenId: lucia._id, parentId: javier._id, status: 'active', scopes: ['progress', 'adherence', 'appointments', 'plan', 'parent_chat'], createdBy: 'teen', linkedAt: at(60), guardianConsentAt: at(60) });

  // ---------- Pasiones ----------
  await db.col('passionProfiles').insertMany([
    { userId: mateo._id, interests: [{ key: 'running', importance: 4, frequency: 1, skill: 3, support: { family: 4, friends: 3 }, blockers: ['tiempo', 'motivacion'] }, { key: 'instrumento', importance: 5, frequency: 2, skill: 3, support: { family: 4, friends: 4 }, blockers: ['tiempo'], dream: 'Tocar en un bolo con amigos' }, { key: 'cocina', importance: 3, frequency: 3, support: { family: 4 }, blockers: [] }], dreams: 'Volver a disfrutar del trabajo y montar una banda.' },
    { userId: lucia._id, interests: [{ key: 'futbol', importance: 5, frequency: 1, skill: 4, support: { family: 1, friends: 4, school: 3 }, blockers: ['apoyo', 'estudios'], dream: 'Jugar en un equipo femenino de primera' }, { key: 'dibujo', importance: 3, frequency: 2, skill: 3, support: { family: 3, friends: 3 }, blockers: [] }], dreams: 'Jugar al fútbol en serio.' },
    { userId: ana._id, interests: [{ key: 'yoga', importance: 4, frequency: 1, skill: 2, support: { family: 4, friends: 3 }, blockers: ['tiempo', 'dinero'] }, { key: 'fotografia', importance: 4, frequency: 2, skill: 3, support: { family: 3, friends: 4 }, blockers: [] }], dreams: 'Terminar la carrera con calma.' },
  ]);

  // ---------- Citas ----------
  const appts: any[] = [];
  const appt = (patientId: string, pro: any, startIso: string, status: string, source = 'own', modality = 'video') => {
    const s = new Date(startIso); const e = new Date(s.getTime() + 50 * 60000);
    appts.push({ _id: newId(), patientId, professionalId: pro._id, clinicId: bihotz._id, startAt: s.toISOString(), endAt: e.toISOString(), modality, status, price: pro === mikel ? 90 : 60, currency: 'EUR', paid: status !== 'requested', source, commissionRate: source === 'directory' ? 0.1 : 0, reason: '', roomId: crypto.randomUUID(), reminders: [], createdAt: new Date(s.getTime() - 7 * 86400000).toISOString() });
  };
  for (let d = 244; d > 7; d -= 14) appt(mateo._id, elena, madridToUtc(dayKey(addDays(now, -d)), '17:00').toISOString(), 'completed');
  for (let d = 42; d > 0; d -= 7) appt(lucia._id, elena, madridToUtc(dayKey(addDays(now, -d)), '18:00').toISOString(), 'completed');
  for (let d = 230; d > 20; d -= 45) appt(mateo._id, mikel, madridToUtc(dayKey(addDays(now, -d)), '10:00').toISOString(), 'completed', 'own', 'presencial');
  const soon = new Date(now.getTime() + 2 * 3600000); soon.setUTCMinutes(0, 0, 0);
  appt(mateo._id, elena, soon.toISOString(), 'confirmed');
  appt(lucia._id, elena, madridToUtc(dayKey(addDays(now, 3)), '18:00').toISOString(), 'confirmed');
  for (const [i, s] of elenaPatients.slice(0, 6).entries()) {
    const day = dayKey(addDays(now, Math.floor(i / 2)));
    const start = madridToUtc(day, ['10:00', '12:00', '16:00', '19:00', '11:00', '17:00'][i]);
    appt(s._id, elena, start.toISOString(), start < now ? 'completed' : i === 5 ? 'requested' : 'confirmed', i % 3 === 0 ? 'directory' : 'own', i % 2 ? 'presencial' : 'video');
  }
  for (let m = 1; m <= 5; m++) for (const [i, s] of elenaPatients.slice(6, 12).entries()) appt(s._id, elena, madridToUtc(dayKey(addDays(now, -(m * 9 + i))), '12:00').toISOString(), g.chance(0.92) ? 'completed' : 'no_show', i % 2 ? 'directory' : 'own');
  await db.col('appointments').insertMany(appts);

  // ---------- Historia clínica (Mateo) ----------
  const mateoSessions = appts.filter((a) => a.patientId === mateo._id && a.professionalId === elena._id && a.status === 'completed').sort((a, b) => a.startAt.localeCompare(b.startAt));
  const NOTES = [
    { title: 'Primera consulta: valoración inicial', s: 'Refiere agotamiento, insomnio de mantenimiento y desmotivación de 6 semanas tras cambio de puesto con más carga. Rumiación nocturna sobre el trabajo.', o: 'Afecto aplanado, discurso coherente. PHQ-9 18, GAD-7 15. Sin ideación autolítica estructurada.', a: 'Cuadro compatible con agotamiento laboral con síntomas depresivos y ansiosos moderados-graves. Valoración psiquiátrica recomendada.', p: 'Psicoeducación, registro diario en Kinkō, derivación a Dr. Etxeberria, higiene del sueño. Revisión en 14 días.', dx: ['Z73.0', 'Agotamiento (burnout), en valoración'] },
    { title: 'Sesión 2: sueño y activación', s: 'Duerme algo mejor con la rutina. Sigue evitando correr («no tengo energía»).', o: 'Check-ins: ánimo 3-4/10, estrés 8/10, adherencia 90%.', a: 'Mejoría inicial del sueño. Inactividad mantiene el bajo ánimo.', p: 'Activación conductual: 10 minutos de guitarra 3 días. Respiración 4-7-8.' },
    { title: 'Sesión 6: pensamientos de exigencia', s: 'Identifica «tengo que poder con todo». Ha vuelto a tocar la guitarra.', o: 'PHQ-9 8, GAD-7 6. Línea de vida con tendencia ascendente.', a: 'Respuesta favorable. Trabajar creencias de exigencia y límites.', p: 'Registro de pensamientos con Kio (modo analizar). Conversación con su responsable.' },
    { title: 'Sesión 12: mantenimiento', s: 'Estable. Corre 2 veces por semana. Ha negociado horario de cierre.', o: 'PHQ-9 5. Sueño 7 h de media.', a: 'Remisión de síntomas. Riesgo de recaída en picos de carga.', p: 'Espaciar sesiones a quincenal. Plan de prevención de recaídas con señales tempranas.' },
    { title: 'Sesión 16: señales tempranas', s: 'Nuevo proyecto con fechas exigentes. Nota más cansancio.', o: 'Kinkō: sueño y ánimo bajando la última semana.', a: 'Posible inicio de recaída; patrón similar al previo al episodio.', p: 'Reforzar límites, retomar respiración y registro. Revisar en 7 días.' },
  ];
  const recs: any[] = [];
  NOTES.forEach((n, i) => {
    const sess = mateoSessions[[0, 1, 5, 11, mateoSessions.length - 1][i]] || mateoSessions[i];
    recs.push({ patientId: mateo._id, professionalId: elena._id, clinicId: bihotz._id, type: 'note', title: n.title, soap: { s: n.s, o: n.o, a: n.a, p: n.p }, sessionDate: sess.startAt, appointmentId: sess._id, confidentiality: 'normal', version: 1, versions: [], signedAt: sess.endAt, createdAt: sess.endAt, updatedAt: sess.endAt });
    if (n.dx) recs.push({ patientId: mateo._id, professionalId: elena._id, clinicId: bihotz._id, type: 'diagnosis', title: 'Impresión diagnóstica', diagnosisCode: n.dx[0], diagnosisLabel: n.dx[1], content: 'Impresión clínica inicial pendiente de completar con valoración psiquiátrica.', sessionDate: sess.startAt, confidentiality: 'normal', version: 1, versions: [], signedAt: sess.endAt, createdAt: sess.endAt, updatedAt: sess.endAt });
  });
  recs.push({ patientId: lucia._id, professionalId: elena._id, clinicId: bihotz._id, type: 'note', title: 'Primera consulta', soap: { s: 'Derivada por la familia por tristeza e irritabilidad. Ha dejado el equipo de fútbol por presión académica en casa.', o: 'PHQ-9 9, UCLA-3 7, ASQ negativo.', a: 'Ánimo bajo reactivo con aislamiento; pérdida de actividad significativa.', p: 'Mapa de pasiones, ruta de pasiones, sesión familiar con consentimiento de Lucía.' }, sessionDate: at(42, '18:00'), confidentiality: 'normal', version: 1, versions: [], signedAt: at(42, '19:00') });
  await db.col('clinicalRecords').insertMany(recs);

  // ---------- Planes de tratamiento ----------
  const comp = (days: number[], ) => days.map((d) => ({ date: dayKey(addDays(now, -d)), note: '', at: at(d, '21:00') }));
  await db.col('treatmentPlans').insertMany([
    { patientId: mateo._id, professionalId: elena._id, title: 'Recuperar energía y poner límites', focus: 'Prevención de recaídas y regulación del sueño', status: 'active', startDate: at(240), reviewDate: dayKey(addDays(now, 10)),
      goals: [{ id: newId(), text: 'Dormir 7 h al menos 5 noches por semana', status: 'active', progress: 55 }, { id: newId(), text: 'Reducir la rumiación nocturna sobre el trabajo', status: 'active', progress: 40 }, { id: newId(), text: 'Correr dos veces por semana', status: 'active', progress: 30 }, { id: newId(), text: 'Pedir ajuste de horario a su responsable', status: 'achieved', progress: 100 }],
      tasks: [
        { id: newId(), title: 'Respiración 4-7-8 antes de dormir', description: 'Cuatro ciclos en la cama.', type: 'exercise', frequency: 'daily', contentSlug: 'respiracion-4-7-8', status: 'active', completions: comp([1, 2, 4, 5, 6]) },
        { id: newId(), title: 'Registro de pensamientos', description: 'Cuando aparezca «tengo que poder con todo», analízalo con Kio.', type: 'journal', frequency: '3x_week', status: 'active', completions: comp([2, 6]) },
        { id: newId(), title: 'Desconexión digital a las 21:30', description: 'Móvil del trabajo en silencio.', type: 'habit', frequency: 'daily', status: 'active', completions: comp([1, 3, 6]) },
        { id: newId(), title: 'Correr 20 minutos', description: 'Ritmo suave, sin reloj.', type: 'passion', frequency: '3x_week', status: 'active', completions: comp([9]) },
        { id: newId(), title: 'Leer «Límites en el trabajo»', description: '', type: 'reading', frequency: 'once', contentSlug: 'limites-en-el-trabajo', status: 'active', completions: comp([20]) },
      ] },
    { patientId: lucia._id, professionalId: elena._id, title: 'Volver a lo que te hace bien', focus: 'Activación a través del fútbol y conciliación con los estudios', status: 'active', startDate: at(40), reviewDate: dayKey(addDays(now, 14)),
      goals: [{ id: newId(), text: 'Volver a entrenar una vez por semana', status: 'active', progress: 20 }, { id: newId(), text: 'Acordar en casa un horario de estudio y entreno', status: 'active', progress: 35 }],
      tasks: [
        { id: newId(), title: 'Reto: toca balón 20 minutos', description: 'En el parque o en el patio.', type: 'passion', frequency: '3x_week', status: 'active', completions: comp([3]) },
        { id: newId(), title: 'Ruta «Recupera lo que te mueve»', description: '', type: 'habit', frequency: 'daily', status: 'active', completions: comp([1, 2]) },
        { id: newId(), title: 'Preparar con Kio la conversación con tu padre', description: 'Modo «Resolver un problema».', type: 'journal', frequency: 'once', status: 'active', completions: [] },
      ] },
  ]);
  await db.col('scheduledMeasures').insertMany([
    { patientId: mateo._id, professionalId: elena._id, instrumentId: 'phq9', frequency: 'biweekly', active: true, nextDueAt: addDays(now, 12).toISOString() },
    { patientId: mateo._id, professionalId: elena._id, instrumentId: 'gad7', frequency: 'biweekly', active: true, nextDueAt: addDays(now, -0.2).toISOString() },
    { patientId: lucia._id, professionalId: elena._id, instrumentId: 'phq9', frequency: 'monthly', active: true, nextDueAt: addDays(now, 20).toISOString() },
  ]);

  // ---------- Diario ----------
  const J = (userId: string, d: number, title: string, content: string, shared: boolean, mood: number, emotions: string[]) => {
    const s = sentiment(`${title} ${content}`);
    return { userId, title, content, shared, mood, emotions, tags: [], photos: [], sentiment: { score: s.score, label: s.label }, createdAt: at(d, '22:15'), updatedAt: at(d, '22:15') };
  };
  await db.col('journal').insertMany([
    J(mateo._id, 1, 'Otra vez la cabeza a mil', 'Me he despertado a las 4 pensando en la entrega del viernes. Siento que si no llego todo se viene abajo. Mañana intentaré hacer la respiración antes de dormir.', true, 4, ['agobio', 'cansancio']),
    J(mateo._id, 5, 'He tocado la guitarra', 'Media hora con la guitarra después de cenar. Me he olvidado del trabajo un rato y he dormido mejor.', true, 7, ['calma', 'alegría']),
    J(mateo._id, 12, 'Reunión difícil', 'El jefe ha vuelto a cambiar las prioridades. No he dicho nada y luego me he enfadado conmigo mismo.', false, 4, ['frustración', 'rabia']),
    J(mateo._id, 60, 'Buena semana', 'He corrido tres veces y he cerrado el portátil a las siete todos los días. Me siento orgulloso.', true, 8, ['orgullo', 'calma']),
    J(mateo._id, 120, 'Pequeños pasos', 'Elena me dijo que no tengo que tener ganas para empezar. Hoy he salido a caminar aunque no me apetecía y después estaba mejor.', false, 6, ['alivio']),
    J(lucia._id, 2, 'El partido', 'Hoy jugaban mis antiguas compañeras y no he ido. Me da pena pero en casa dicen que primero los estudios.', false, 4, ['tristeza', 'frustración']),
    J(lucia._id, 9, 'Dibujar', 'He dibujado un rato una portería y a mí metiendo gol. Suena tonto pero me ha gustado.', false, 6, ['ilusión']),
    J(ana._id, 3, 'Antes del examen', 'Tengo el estómago cerrado. ¿Y si no apruebo? Mis padres han pagado la matrícula y no puedo fallar.', false, 4, ['ansiedad', 'miedo']),
  ]);

  // ---------- Kio ----------
  const t1 = await db.col('companionThreads').insert({ userId: mateo._id, mode: 'analizar', title: 'La reunión del martes', lastMessageAt: at(3, '22:40'), messageCount: 4, riskLevel: 'none', summary: 'Conversación de 2 mensajes. Temas: trabajo o estudios, autoestima. Tono emocional negativo. Pensamiento de exigencia («tengo que poder con todo») reencuadrado.', sharedSummary: true, summarizedAt: at(3, '22:50'), createdAt: at(3, '22:30') });
  await db.col('companionMessages').insertMany([
    { threadId: t1._id, userId: mateo._id, role: 'assistant', content: 'Hola, Mateo. ¿Qué ha pasado? Descríbelo como si fuera una cámara.', source: 'offline', createdAt: at(3, '22:30') },
    { threadId: t1._id, userId: mateo._id, role: 'user', content: 'En la reunión me pidieron otra entrega para el viernes y dije que sí. Siempre digo que sí y luego no llego a nada.', createdAt: at(3, '22:32') },
    { threadId: t1._id, userId: mateo._id, role: 'assistant', content: 'Suena a que esto te está pesando de verdad. He notado un «siempre»: ¿ha habido alguna vez en que dijiste que no o negociaste un plazo?', source: 'offline', createdAt: at(3, '22:33') },
    { threadId: t1._id, userId: mateo._id, role: 'user', content: 'Sí, en primavera negocié y salió bien. Pero ahora tengo que poder con todo.', createdAt: at(3, '22:38') },
  ]);
  const t2 = await db.col('companionThreads').insert({ userId: ana._id, mode: 'organizar', title: 'Exámenes y trabajo', lastMessageAt: at(2, '23:00'), messageCount: 2, riskLevel: 'none', summary: null, sharedSummary: false, createdAt: at(2, '22:50') });
  await db.col('companionMessages').insertMany([
    { threadId: t2._id, userId: ana._id, role: 'assistant', content: 'Hola, Ana. Cuéntame todo lo que tienes en la cabeza, sin orden.', source: 'offline', createdAt: at(2, '22:50') },
    { threadId: t2._id, userId: ana._id, role: 'user', content: 'Tengo que estudiar estadística, tengo que entregar el trabajo de grupo y me preocupa no dormir otra vez.', createdAt: at(2, '22:55') },
  ]);

  // ---------- Dispositivos y biometría (Mateo) ----------
  const band = await db.col('devices').insert({ userId: mateo._id, type: 'heart_rate', name: 'Banda de pulso BLE', bleId: 'demo-hr-band', lastSyncAt: at(0, '08:00') });
  const meas: any[] = [];
  for (let d = 35; d >= 0; d--) {
    const t = d <= 14 ? (14 - d) / 14 : 0;
    const iso = at(d, '07:30');
    meas.push({ userId: mateo._id, deviceId: band._id, type: 'heart_rate', value: Math.round(61 + t * 9 + g.normal(0, 1.5)), unit: 'lpm', measuredAt: iso, source: 'ble' });
    meas.push({ userId: mateo._id, deviceId: band._id, type: 'hrv_rmssd', value: Math.round(56 - t * 22 + g.normal(0, 3)), unit: 'ms', measuredAt: iso, source: 'ble' });
    meas.push({ userId: mateo._id, deviceId: null, type: 'steps', value: Math.round(8600 - t * 4200 + g.normal(0, 900)), unit: 'pasos', measuredAt: at(d, '23:00'), source: 'health_connect' });
    meas.push({ userId: mateo._id, deviceId: null, type: 'sleep_minutes', value: Math.round(430 - t * 105 + g.normal(0, 20)), unit: 'min', measuredAt: iso, source: 'health_connect' });
  }
  meas.push({ userId: mateo._id, deviceId: null, type: 'bp_systolic', value: 128, unit: 'mmHg', measuredAt: at(2, '09:00'), source: 'ble' }, { userId: mateo._id, deviceId: null, type: 'bp_diastolic', value: 82, unit: 'mmHg', measuredAt: at(2, '09:00'), source: 'ble' });
  await db.col('measurements').insertMany(meas);

  // ---------- Rutas ----------
  const pathId = async (slug: string) => (await db.col('carePaths').findOne({ slug }))!._id;
  await db.col('pathEnrollments').insertMany([
    { userId: mateo._id, pathId: await pathId('ruta-dormir-mejor'), slug: 'ruta-dormir-mejor', title: 'Dormir mejor', currentDay: 4, completedDays: [1, 2, 3], startedAt: at(4), status: 'active' },
    { userId: lucia._id, pathId: await pathId('ruta-pasiones'), slug: 'ruta-pasiones', title: 'Recupera lo que te mueve', currentDay: 3, completedDays: [1, 2], startedAt: at(3), status: 'active' },
    { userId: ana._id, pathId: await pathId('ruta-calma-7-dias'), slug: 'ruta-calma-7-dias', title: 'Calma en 7 días', currentDay: 3, completedDays: [1, 2], startedAt: at(3), status: 'active' },
  ]);

  // ---------- Mensajes ----------
  const conv = async (a: string, b: string, type: string, msgs: [string, string, number, string][]) => {
    const c = await db.col('conversations').insert({ participants: [a, b], type, lastMessageAt: at(msgs[msgs.length - 1][2], msgs[msgs.length - 1][3]) });
    await db.col('messages').insertMany(msgs.map(([from, body, d, h], i) => ({ conversationId: c._id, senderId: from, body, attachments: [], readBy: i < msgs.length - 1 ? [a, b] : [from], createdAt: at(d, h), updatedAt: at(d, h) })));
  };
  await conv(mateo._id, elena._id, 'patient_professional', [[elena._id, 'Hola Mateo, he visto en tu línea de vida que esta semana has dormido menos. ¿Cómo estás?', 2, '10:05'], [mateo._id, 'Hola Elena. Ha sido una semana dura con la entrega. Te lo cuento en la sesión.', 2, '13:40'], [elena._id, 'Perfecto. Mientras tanto, prueba la respiración 4-7-8 antes de dormir. Te la he dejado en tu plan.', 1, '09:15']]);
  await conv(javier._id, elena._id, 'parent_professional', [[javier._id, 'Buenas, Elena. Veo que Lucía tiene una sesión el jueves. ¿Hay algo que podamos hacer en casa?', 4, '19:00'], [elena._id, 'Hola Javier. Gracias por escribir. Lucía ha autorizado este canal. Os propongo hablar juntos sobre horarios de estudio y fútbol en la próxima sesión familiar.', 3, '09:30']]);
  await conv(elena._id, mikel._id, 'professional_professional', [[elena._id, 'Mikel, Mateo vuelve a mostrar el patrón previo al episodio de hace unos meses. ¿Lo valoras esta semana?', 1, '11:00'], [mikel._id, 'Lo veo el jueves. Gracias por avisar.', 1, '12:20']]);
  await conv(lucia._id, javier._id, 'parent_patient', [[javier._id, '¿Qué tal el examen, campeona?', 1, '14:00']]);

  // ---------- Comunidad ----------
  const posts = [
    [lucia._id, 'pasion-deporte', 'He dejado el fútbol y lo echo muchísimo de menos', 'En casa dicen que primero los estudios y lo entiendo, pero desde que lo dejé estoy de bajón todo el rato. ¿A alguien le ha pasado?', true, 2],
    [ana._id, 'estudios', '¿Cómo hacéis para no bloquearos en los exámenes?', 'Me sé el temario pero cuando entro me quedo en blanco. Me late el corazón a mil.', true, 4],
    [synth[3]._id, 'trabajo', 'Mi primer mes poniendo límites', 'Llevo un mes cerrando el portátil a las 18:00. Al principio me sentía culpable, ahora duermo mejor y rindo igual.', false, 9],
    [synth[7]._id, 'ansiedad', 'La respiración en caja me salvó en el metro', 'Sentí que me ahogaba y la hice siguiendo la esfera. En tres minutos estaba mejor. Lo comparto por si a alguien le sirve.', true, 12],
    [synth[11]._id, 'logros', '30 días de check-in seguidos', 'No pensaba que fuera a ser constante. Ver mi esfera cambiar me ha ayudado a entenderme.', false, 6],
    [synth[15]._id, 'pasion-musica', 'Volver a tocar después de años', 'He recuperado el piano gracias a un reto de 15 minutos al día. Recomendado.', true, 15],
    [synth[19]._id, 'animo', 'Días grises', 'Hoy no tengo ganas de nada. Solo quería escribirlo en algún sitio donde no me juzguen.', true, 1],
    [synth[23]._id, 'pasion-arte', 'Mi primer cuadro con acuarela', 'No es perfecto pero me ha relajado muchísimo. ¿Alguien más pinta para desconectar?', false, 8],
  ] as const;
  for (const [author, c, title, body, anonymous, d] of posts) {
    const post = await db.col('forumPosts').insert({ categoryId: cat(c), authorId: author, title, body, anonymous, tags: [], status: 'visible', audience: 'all', reactions: synth.slice(0, g.int(2, 9)).map((s) => ({ userId: s._id, type: g.pick(['apoyo', 'meidentifico', 'gracias', 'fuerza']) })), commentsCount: 0, lastActivityAt: at(d, '20:00'), moderation: { risk: 'none' }, createdAt: at(d, '20:00') });
    const cmts: any[] = [];
    if (title.includes('fútbol')) cmts.push({ authorId: synth[30]._id, body: 'Me pasó con el baloncesto. Al final pacté con mis padres dos entrenos a la semana y mis notas no bajaron. ¡Ánimo!', anonymous: true }, { authorId: users['jon.l@kinko.app']._id, body: 'Soy psicólogo deportivo. Dejar de golpe una actividad tan importante suele afectar al ánimo. Proponer un horario concreto en casa suele funcionar mejor que pedir «más tiempo». 💪', anonymous: false });
    if (title.includes('exámenes')) cmts.push({ authorId: elena._id, body: 'Quedarse en blanco es la ansiedad reduciendo la memoria de trabajo. Antes de entrar, prueba la respiración en caja y empieza por la pregunta que mejor sabes.', anonymous: false }, { authorId: synth[9]._id, body: 'A mí me ayuda hacer simulacros con tiempo en casa.', anonymous: true });
    if (title.includes('grises')) cmts.push({ authorId: synth[2]._id, body: 'Aquí estamos. Mañana puede ser un poco mejor. Un abrazo.', anonymous: true });
    if (cmts.length) {
      await db.col('forumComments').insertMany(cmts.map((x, i) => ({ postId: post._id, ...x, status: 'visible', moderation: { risk: 'none' }, createdAt: at(d - 0.2 * (i + 1), '21:00') })));
      await db.col('forumPosts').updateById(post._id, { $set: { commentsCount: cmts.length } });
    }
  }
  await db.col('forumPosts').insert({ categoryId: cat('familias'), authorId: javier._id, title: 'Mi hija ha dejado el fútbol y la veo apagada', body: '¿Cómo equilibráis estudios y deporte sin que sea una pelea constante?', anonymous: false, tags: [], status: 'visible', audience: 'parent', reactions: [], commentsCount: 0, lastActivityAt: at(5), createdAt: at(5) });

  // ---------- Reseñas, pedidos, alertas, notificaciones ----------
  const REV = ['Me ayudó a entender lo que me pasaba.', 'Muy cercana y práctica.', 'Las tareas entre sesiones marcan la diferencia.', 'Profesional y empática.'];
  for (const s of elenaPatients.slice(6, 10)) await db.col('reviews').insert({ professionalId: elena._id, patientId: s._id, rating: g.pick([5, 5, 5, 4]), comment: g.pick(REV), anonymous: true, authorName: `${s.profile.firstName} ${s.profile.lastName[0]}.`, status: 'visible' });
  const cojin = await db.col('products').findOne({ name: 'Cojín de meditación' });
  await db.col('orders').insert({ userId: ana._id, items: [{ productId: cojin!._id, name: cojin!.name, price: cojin!.price, qty: 1 }], subtotal: cojin!.price, shippingCost: 3.95, total: Math.round((cojin!.price + 3.95) * 100) / 100, currency: 'EUR', status: 'paid', shipping: { name: 'Ana Martín', address: 'Calle ficticia 1', city: 'Madrid', postalCode: '28001', phone: '600000000' }, paidAt: at(6) });
  await db.col('alerts').insertMany([
    { patientId: mateo._id, professionalIds: [elena._id], guardianIds: [], type: 'deterioration', severity: 'medium', status: 'open', message: 'PHQ-9: empeoramiento fiable (7 → 14).', createdAt: at(2, '19:05') },
    { patientId: elenaPatients[0]._id, professionalIds: [elena._id], guardianIds: [], type: 'phq9_item9', severity: 'high', status: 'open', message: 'PHQ-9 ítem 9 = 1. Explorar ideación en la próxima sesión o antes.', createdAt: at(1, '22:10') },
    { patientId: elenaPatients[4]._id, professionalIds: [elena._id], guardianIds: [], type: 'missed_checkins', severity: 'low', status: 'acknowledged', message: 'Sin check-ins desde hace 6 días.', createdAt: at(3, '08:00') },
  ]);
  const N = (userId: string, title: string, body: string, link: string, d: number, type = 'info', read = false) => ({ userId, type, title, body, link, read, priority: 'normal', createdAt: at(d, '09:00') });
  await db.col('notifications').insertMany([
    N(mateo._id, 'Elena te ha dejado un mensaje', 'Prueba la respiración 4-7-8 antes de dormir…', '/mensajes', 1, 'message'),
    N(mateo._id, 'Toca: Ansiedad · GAD-7', 'Tu profesional te ha pedido este cuestionario.', '/app/tests/gad7', 0, 'measure'),
    N(lucia._id, 'Nuevo reto de tu pasión', 'Toca balón 20 minutos tres días esta semana.', '/app/pasiones', 1, 'passion'),
    N(javier._id, 'Resumen semanal de Lucía', 'Ha hecho 5 check-ins esta semana. Sesión el jueves.', '/familia', 1, 'family'),
    N(elena._id, 'Nueva solicitud de cita', 'Un paciente ha solicitado cita desde el directorio.', '/pro/agenda', 0, 'appointment'),
    N(dev._id, 'Tu clave sandbox está lista', 'Prueba la API con la clave de demostración.', '/dev', 2, 'apikey'),
  ]);

  // ---------- Desarrolladores ----------
  await db.col('apiKeys').insertMany([
    { ownerId: dev._id, name: 'Sandbox demo', env: 'sandbox', purpose: 'Pruebas', prefix: 'kk_test_demo_', keyHash: await p.sha256('kk_test_demo_kinko2026'), status: 'approved', rateLimitPerMin: 60, revokedAt: null, lastUsedAt: null, scopes: ['insights:read'] },
    { ownerId: dev._id, name: 'Estudio bienestar universitario', env: 'live', purpose: 'Estudio de la Universidad sobre bienestar en estudiantes de 18 a 24 años por provincia, con datos agregados y anónimos.', prefix: 'kk_live_pend', keyHash: await p.sha256(`kk_live_${newId()}`), status: 'pending', rateLimitPerMin: 120, revokedAt: null, lastUsedAt: null, scopes: ['insights:read'] },
  ]);

  // ---------- Puntuaciones y tareas ----------
  const ctx = systemCtx(db, p);
  for (const u of [mateo, lucia, ana, ...synth]) await refreshKinko(ctx, u._id);
  const jobs = await runJobs(db, p);
  return { skipped: false, users: Object.keys(users).length, checkins: await db.col('checkins').count({}), assessments: assess.length, appointments: appts.length, jobs };
}
