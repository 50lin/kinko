import { norm } from '../util/text';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'imminent';
export interface RiskResult { level: RiskLevel; categories: string[]; matches: string[] }

const PATTERNS: { level: RiskLevel; category: string; re: RegExp }[] = [
  { level: 'imminent', category: 'suicide', re: /\b(me voy a (matar|suicidar|tirar)|voy a (matarme|suicidarme|quitarme la vida|acabar con todo)|esta noche (me mato|acabo con todo)|ya (lo )?he decidido (morir|matarme)|carta de despedida|despedirme de todos|tengo (las|unas) pastillas para|me he tomado (todas|muchas|un monton de) (las )?pastillas)\b/ },
  { level: 'high', category: 'suicide', re: /\b(suicid\w*|quiero morir\w*|me quiero morir|no quiero (vivir|seguir viviendo)|mejor (estaria )?muert[oa]|acabar con mi vida|quitarme la vida|no vale la pena vivir|desaparecer para siempre|ojala no despertar|ojala estuviera muert[oa])\b/ },
  { level: 'high', category: 'self_harm', re: /\b(autolesi\w*|hacerme dano|me hago dano|cortarme|me corto|me he cortado|quemarme|golpearme)\b/ },
  { level: 'high', category: 'abuse', re: /\b(me (pega|pegan|maltrata|maltratan|viola|violo|toca sin)|abus(a|an|o|aron) de mi|me obligan? a|violacion|agresion sexual)\b/ },
  { level: 'high', category: 'violence', re: /\b(voy a (matar|pegar|hacer dano) a|quiero matar a)\b/ },
  { level: 'high', category: 'medical', re: /\b(sobredosis|no puedo respirar|dolor (fuerte )?en el pecho|me desmayo)\b/ },
  { level: 'medium', category: 'hopelessness', re: /\b(no puedo mas|no aguanto mas|sin salida|todo me da igual|nadie me echaria de menos|soy una carga|no tiene sentido nada|estoy harta? de todo)\b/ },
  { level: 'medium', category: 'eating', re: /\b(vomitar despues de comer|me provoco el vomito|llevo dias sin comer|no comer nada en dias)\b/ },
  { level: 'low', category: 'distress', re: /\b(ansiedad|ataque de panico|no puedo dormir|muy triste|lloro mucho|estoy fatal|me siento vaci[oa])\b/ },
];
const ORDER: RiskLevel[] = ['none', 'low', 'medium', 'high', 'imminent'];

/** Detección de riesgo en texto libre (español). Se aplica antes y después de cualquier respuesta de IA y en el foro. */
export function detectRisk(text: string): RiskResult {
  const t = norm(text);
  let level: RiskLevel = 'none';
  const categories = new Set<string>(); const matches: string[] = [];
  for (const p of PATTERNS) {
    const m = t.match(p.re);
    if (m) {
      categories.add(p.category); matches.push(m[0]);
      if (ORDER.indexOf(p.level) > ORDER.indexOf(level)) level = p.level;
    }
  }
  // Negaciones simples: «no quiero hacerme daño» rebaja un nivel salvo inminente.
  if (level === 'high' && /\bno (quiero|pienso|voy a) (hacerme dano|suicidarme|morir)\b/.test(t) && !/\bpero\b/.test(t)) level = 'medium';
  return { level, categories: [...categories], matches };
}
export const isUrgent = (r: RiskResult) => r.level === 'high' || r.level === 'imminent';

export function crisisMessage(isMinor: boolean): string {
  return [
    'Gracias por contármelo. Lo que sientes importa y no tienes que pasarlo a solas.',
    'Si estás en peligro ahora mismo, llama al 112. Si tienes pensamientos de quitarte la vida, la Línea 024 te atiende 24 horas, gratis y de forma confidencial.' + (isMinor ? ' También puedes llamar a la Fundación ANAR (900 20 20 10), especializada en jóvenes.' : ''),
    'Si te parece bien, avisaré a tu profesional de referencia para que pueda contactarte. Mientras tanto, ¿hay alguien de confianza que pueda estar contigo?',
    'Podemos hacer juntos un ejercicio de respiración de un minuto: inspira 4 segundos, mantén 4, suelta 6.',
  ].join('\n\n');
}

/** Filtro de salida: evita que la IA dé diagnósticos o pautas de medicación. */
export function sanitizeAiOutput(text: string): string {
  const t = norm(text);
  if (/\b(te diagnostico|tienes (un )?trastorno|padeces (de )?depresion|toma(r)? \d+ ?mg|aumenta la dosis|deja la medicacion|deja de tomar)\b/.test(t)) {
    return text + '\n\nRecuerda: no puedo hacer diagnósticos ni darte pautas sobre medicación. Eso siempre con tu médico o tu psicólogo/a.';
  }
  return text;
}
