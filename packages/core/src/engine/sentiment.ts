import { norm } from '../util/text';
const POS = ['bien', 'feliz', 'contento', 'contenta', 'alegre', 'tranquilo', 'tranquila', 'genial', 'orgulloso', 'orgullosa', 'gracias', 'agradecido', 'agradecida', 'ilusion', 'disfrute', 'disfrutar', 'paz', 'calma', 'logre', 'consegui', 'mejor', 'animado', 'animada', 'divertido', 'amor', 'quiero', 'motivado', 'motivada', 'descansado', 'descansada', 'esperanza', 'risa', 'reir', 'apoyo', 'abrazo'];
const NEG = ['mal', 'triste', 'ansiedad', 'ansioso', 'ansiosa', 'miedo', 'agobio', 'agobiado', 'agobiada', 'cansado', 'cansada', 'solo', 'sola', 'soledad', 'rabia', 'enfadado', 'enfadada', 'frustrado', 'frustrada', 'culpa', 'llorar', 'llore', 'horrible', 'fatal', 'peor', 'estres', 'estresado', 'estresada', 'nervios', 'nervioso', 'nerviosa', 'vacio', 'dolor', 'odio', 'harto', 'harta', 'insomnio', 'discusion', 'pelea', 'fracaso', 'inutil', 'verguenza', 'preocupado', 'preocupada', 'preocupa'];
const INTENS = ['muy', 'mucho', 'demasiado', 'super', 'fatal', 'totalmente'];
const NEGATORS = ['no', 'nunca', 'nada', 'tampoco'];

/** Análisis de sentimiento léxico en español, de -1 (muy negativo) a 1 (muy positivo). Explicable y sin enviar datos fuera. */
export function sentiment(text: string): { score: number; label: 'positivo' | 'neutro' | 'negativo'; positives: string[]; negatives: string[] } {
  const words = norm(text).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  let s = 0; const positives: string[] = []; const negatives: string[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1] || ''; const prev2 = words[i - 2] || '';
    const mult = INTENS.includes(prev) ? 1.5 : 1;
    const negated = NEGATORS.includes(prev) || NEGATORS.includes(prev2);
    if (POS.includes(w)) { s += (negated ? -0.7 : 1) * mult; (negated ? negatives : positives).push(w); }
    if (NEG.includes(w)) { s += (negated ? 0.5 : -1) * mult; (negated ? positives : negatives).push(w); }
  });
  const score = Math.max(-1, Math.min(1, s / Math.max(4, Math.sqrt(words.length) * 1.5)));
  return { score: Math.round(score * 100) / 100, label: score > 0.15 ? 'positivo' : score < -0.15 ? 'negativo' : 'neutro', positives, negatives };
}
