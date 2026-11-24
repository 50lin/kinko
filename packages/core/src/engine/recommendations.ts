import type { Domain } from '../constants';
import type { KinkoScore } from './kinkoScore';
import type { PassionInsight } from './passions';

export interface Recommendation {
  id: string; type: 'crisis' | 'professional' | 'exercise' | 'path' | 'content' | 'test' | 'checkin' | 'passion' | 'product' | 'community' | 'habit' | 'companion';
  title: string; body: string; reason: string; priority: number; domain?: Domain;
  action: { kind: 'crisis' | 'directory' | 'breathing' | 'path' | 'content' | 'test' | 'checkin' | 'passions' | 'shop' | 'community' | 'companion' | 'plan'; target?: string; label: string };
}
export interface RecoInput {
  score: KinkoScore; latest: Record<string, { score: number; severity: string; flags: string[]; completedAt: string } | undefined>;
  passions: PassionInsight[]; hasProfessional: boolean; checkedInToday: boolean; age: number | null; hour: number; openCrisis?: boolean;
}

/** Motor de recomendaciones explicable: cada sugerencia dice por qué aparece. Nunca sustituye la valoración profesional. */
export function recommend(inp: RecoInput): Recommendation[] {
  const r: Recommendation[] = [];
  const d = inp.score.domains;
  const L = inp.latest;
  const low = (k: Domain, thr = 45) => d[k] != null && (d[k] as number) < thr;
  if (inp.openCrisis || L.asq?.flags.includes('asq_acute') || (L.phq9 && L.phq9.flags.includes('phq9_item9'))) {
    r.push({ id: 'crisis', type: 'crisis', title: 'Tu seguridad es lo primero', body: 'Si estás pasando un momento muy duro, hay personas preparadas para ayudarte ahora mismo: 024, 112 o ANAR si eres menor.', reason: 'Has indicado pensamientos de hacerte daño en un test reciente.', priority: 100, action: { kind: 'crisis', label: 'Ver ayuda inmediata' } });
  }
  const severe = (L.phq9 && L.phq9.score >= 15) || (L.gad7 && L.gad7.score >= 15) || L.asq?.severity === 'positive';
  if (severe && !inp.hasProfessional) {
    r.push({ id: 'pro', type: 'professional', title: 'Habla con un profesional', body: 'Tus resultados indican que te vendría bien el acompañamiento de un psicólogo/a. Te mostramos profesionales afines a lo que estás viviendo.', reason: `Resultado reciente: ${L.phq9 && L.phq9.score >= 15 ? `PHQ-9 ${L.phq9.score}` : L.gad7 ? `GAD-7 ${L.gad7.score}` : 'cribado positivo'}.`, priority: 95, action: { kind: 'directory', label: 'Buscar profesional' } });
  }
  if (!inp.checkedInToday) r.push({ id: 'checkin', type: 'checkin', title: inp.hour < 14 ? '¿Cómo empiezas el día?' : '¿Cómo ha ido tu día?', body: 'Un check-in de 60 segundos mantiene tu esfera al día y ayuda a tu profesional a entenderte.', reason: 'Aún no has registrado cómo estás hoy.', priority: 80, action: { kind: 'checkin', label: 'Hacer check-in' } });
  if (low('calma')) r.push({ id: 'breath', type: 'exercise', domain: 'calma', title: 'Respira con tu esfera (2 min)', body: 'Respiración en caja: 4 segundos dentro, 4 retienes, 4 fuera, 4 pausa. Tu esfera marca el ritmo.', reason: `Tu calma está en ${d.calma}/100 esta semana.`, priority: 78, action: { kind: 'breathing', target: 'caja', label: 'Empezar' } });
  if (low('sueno')) r.push({ id: 'sleep', type: 'path', domain: 'sueno', title: 'Ruta «Dormir mejor» (7 días)', body: 'Pequeños cambios de horario, luz y pantallas que se notan en una semana.', reason: `Tu sueño está en ${d.sueno}/100.`, priority: 70, action: { kind: 'path', target: 'ruta-dormir-mejor', label: 'Ver ruta' } });
  if (low('animo') && low('actividad', 55)) r.push({ id: 'ba', type: 'path', domain: 'animo', title: 'Activación conductual: un paso pequeño', body: 'Cuando el ánimo baja, hacer algo pequeño que te importa ayuda antes de tener ganas. Elige una tarea de 10 minutos.', reason: `Ánimo ${d.animo}/100 y actividad ${d.actividad}/100.`, priority: 72, action: { kind: 'path', target: 'ruta-activacion-conductual', label: 'Empezar' } });
  if (L.cbi && L.cbi.score >= 50) r.push({ id: 'burnout', type: 'path', domain: 'energia', title: 'Ruta anti-burnout', body: 'Pausas, límites y recuperación real. Diseñada para semanas de mucha carga.', reason: `Tu nivel de agotamiento (CBI) es ${L.cbi.score}/100.`, priority: 68, action: { kind: 'path', target: 'ruta-burnout', label: 'Ver ruta' } });
  if (low('vinculos')) r.push({ id: 'connect', type: 'community', domain: 'vinculos', title: 'Conecta con alguien hoy', body: 'Un mensaje, una llamada o un rato en la comunidad Kinkō. La conexión es uno de los mejores protectores.', reason: `Tus vínculos están en ${d.vinculos}/100.`, priority: 60, action: { kind: 'community', label: 'Ir a la comunidad' } });
  for (const p of inp.passions.slice(0, 3)) {
    if (p.atRisk || p.unsupported) {
      r.push({ id: `passion-${p.key}`, type: 'passion', domain: 'proposito', title: p.headline, body: `${p.message} Reto de esta semana: ${p.challenges[0] || 'dedícale 15 minutos'}.`, reason: 'Tu mapa de pasiones muestra que es importante para ti y necesita espacio o apoyo.', priority: 66, action: { kind: 'passions', target: p.key, label: 'Ver apoyo' } });
      r.push({ id: `shop-${p.key}`, type: 'product', domain: 'proposito', title: `Recursos para ${p.label.toLowerCase()}`, body: 'Material y cursos seleccionados para retomar lo que te gusta.', reason: `Relacionado con tu pasión: ${p.label}.`, priority: 35, action: { kind: 'shop', target: p.key, label: 'Ver en la tienda' } });
    } else if (p.strength >= 70 && (low('animo', 55) || low('energia', 55))) {
      r.push({ id: `passion-${p.key}`, type: 'passion', domain: 'proposito', title: `Recarga con ${p.label.toLowerCase()}`, body: `Es tu mayor fuente de energía. Hazle hueco hoy aunque sean 15 minutos: ${p.challenges[0] || ''}`, reason: 'Tu ánimo o energía están bajos y esta pasión suele recargarte.', priority: 58, action: { kind: 'passions', target: p.key, label: 'Ver retos' } });
    }
  }
  if (!inp.passions.length) r.push({ id: 'passions-map', type: 'passion', title: 'Descubre tu mapa de pasiones', body: 'Lo que te apasiona dice mucho de lo que te da energía. 3 minutos para personalizar tu Kinkō.', reason: 'Aún no has completado tu mapa de pasiones.', priority: 50, action: { kind: 'passions', label: 'Empezar' } });
  const days = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);
  if (days(L.phq9?.completedAt) > 14) r.push({ id: 'test-phq9', type: 'test', title: 'Revisa tu ánimo (2 min)', body: 'El PHQ-9 es el cuestionario de referencia mundial para seguir el ánimo.', reason: L.phq9 ? 'Han pasado más de dos semanas desde el último.' : 'Nos ayuda a calibrar tu esfera.', priority: 45, action: { kind: 'test', target: 'phq9', label: 'Hacer test' } });
  if (days(L.gad7?.completedAt) > 14) r.push({ id: 'test-gad7', type: 'test', title: 'Revisa tu ansiedad (2 min)', body: 'El GAD-7 mide preocupación y nerviosismo de las dos últimas semanas.', reason: L.gad7 ? 'Han pasado más de dos semanas desde el último.' : 'Aún no lo has hecho.', priority: 44, action: { kind: 'test', target: 'gad7', label: 'Hacer test' } });
  r.push({ id: 'kio', type: 'companion', title: '¿Mucho ruido en la cabeza?', body: 'Kio te ayuda a ordenar ideas, separar hechos de interpretaciones y decidir el siguiente paso.', reason: 'Disponible siempre que lo necesites.', priority: 30, action: { kind: 'companion', label: 'Hablar con Kio' } });
  if (inp.hour >= 21 || inp.hour < 1) r.push({ id: 'wind-down', type: 'content', domain: 'sueno', title: 'Relajación para dormir (8 min)', body: 'Audio guiado para soltar el día.', reason: 'Es hora de ir preparando el descanso.', priority: 55, action: { kind: 'content', target: 'audio-relajacion-sueno', label: 'Escuchar' } });
  const seen = new Set<string>();
  return r.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).sort((a, b) => b.priority - a.priority);
}
