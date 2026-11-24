import type { Domain } from '../constants';

export interface InstrumentOption { value: number; label: string }
export interface InstrumentItem { id: string; text: string; options: InstrumentOption[]; reverse?: boolean; showIfAnyYes?: string[] }
export type Severity = 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe' | 'low' | 'normal' | 'high' | 'positive' | 'negative' | 'acute';
export interface ScoreResult {
  score: number; max: number; severity: Severity; severityLabel: string; interpretation: string;
  flags: string[]; wellbeing: number; // 0-100, más alto = mejor
  subscores?: Record<string, number>;
}
export interface Instrument {
  id: string; name: string; short: string; description: string; domains: Domain[]; validated: boolean;
  source: string; timeframe: string; minutes: number; tier: 'free' | 'plus'; minAge?: number; maxAge?: number;
  rci?: number; // cambio mínimo fiable (puntos)
  items: InstrumentItem[];
  score(answers: Record<string, number>): ScoreResult;
}

const FREQ4: InstrumentOption[] = [
  { value: 0, label: 'Ningún día' }, { value: 1, label: 'Varios días' }, { value: 2, label: 'Más de la mitad de los días' }, { value: 3, label: 'Casi todos los días' },
];
const sum = (answers: Record<string, number>, ids: string[]) => ids.reduce((a, id) => a + (Number(answers[id]) || 0), 0);
const req = (inst: { items: InstrumentItem[] }, answers: Record<string, number>) => {
  for (const it of inst.items) if (!it.showIfAnyYes && (answers[it.id] === undefined || answers[it.id] === null)) throw new Error(`Falta la respuesta ${it.id}`);
};

export const PHQ9: Instrument = {
  id: 'phq9', name: 'Cuestionario de salud del paciente (PHQ-9)', short: 'Ánimo · PHQ-9', domains: ['animo', 'energia', 'sueno'], validated: true,
  description: 'Cribado y seguimiento de síntomas depresivos. Uso libre (Pfizer). No es un diagnóstico.',
  source: 'Kroenke, Spitzer y Williams, 2001. Versión española validada.', timeframe: 'Durante las últimas 2 semanas, ¿con qué frecuencia te han molestado los siguientes problemas?',
  minutes: 2, tier: 'free', rci: 6,
  items: [
    'Poco interés o placer en hacer cosas',
    'Sentirte decaído/a, deprimido/a o sin esperanza',
    'Dificultad para dormir o mantenerte dormido/a, o dormir demasiado',
    'Sentirte cansado/a o con poca energía',
    'Poco apetito o comer en exceso',
    'Sentirte mal contigo mismo/a, que eres un fracaso o que has quedado mal contigo o con tu familia',
    'Dificultad para concentrarte en cosas como leer o ver la televisión',
    'Moverte o hablar tan despacio que otras personas lo hayan notado, o lo contrario: estar tan inquieto/a que te has movido mucho más de lo normal',
    'Pensamientos de que estarías mejor muerto/a o de hacerte daño de alguna manera',
  ].map((text, i) => ({ id: `q${i + 1}`, text, options: FREQ4 })),
  score(a) {
    req(this, a);
    const s = sum(a, this.items.map((i) => i.id));
    const sev: [Severity, string, string] = s >= 20 ? ['severe', 'Grave', 'Síntomas depresivos graves. Es importante hablar con un profesional cuanto antes.']
      : s >= 15 ? ['moderately_severe', 'Moderadamente grave', 'Síntomas depresivos importantes. Recomendamos valoración profesional.']
      : s >= 10 ? ['moderate', 'Moderado', 'Síntomas depresivos moderados. Un profesional puede ayudarte a entender qué está pasando.']
      : s >= 5 ? ['mild', 'Leve', 'Síntomas leves. Vale la pena cuidarlos y seguir su evolución.']
      : ['minimal', 'Mínimo', 'Pocos o ningún síntoma depresivo en estas dos semanas.'];
    const flags = Number(a.q9) > 0 ? ['phq9_item9'] : [];
    return { score: s, max: 27, severity: sev[0], severityLabel: sev[1], interpretation: sev[2], flags, wellbeing: Math.round(100 - (s / 27) * 100) };
  },
};

export const PHQ2: Instrument = {
  ...PHQ9, id: 'phq2', name: 'PHQ-2 (versión breve)', short: 'Ánimo rápido · PHQ-2', minutes: 1, rci: 2,
  description: 'Dos preguntas del PHQ-9 para el seguimiento semanal. Una puntuación de 3 o más sugiere completar el PHQ-9.',
  items: PHQ9.items.slice(0, 2),
  score(a) {
    req(this, a);
    const s = sum(a, ['q1', 'q2']);
    const pos = s >= 3;
    return { score: s, max: 6, severity: pos ? 'positive' : 'negative', severityLabel: pos ? 'Conviene ampliar' : 'Sin señal', interpretation: pos ? 'Te proponemos completar el PHQ-9 para entenderlo mejor.' : 'Sin señales relevantes esta semana.', flags: pos ? ['suggest_phq9'] : [], wellbeing: Math.round(100 - (s / 6) * 100) };
  },
};

export const GAD7: Instrument = {
  id: 'gad7', name: 'Escala de ansiedad generalizada (GAD-7)', short: 'Ansiedad · GAD-7', domains: ['calma'], validated: true,
  description: 'Cribado y seguimiento de síntomas de ansiedad. Uso libre. No es un diagnóstico.',
  source: 'Spitzer, Kroenke, Williams y Löwe, 2006. Versión española validada (García-Campayo et al., 2010).',
  timeframe: 'Durante las últimas 2 semanas, ¿con qué frecuencia te han molestado los siguientes problemas?', minutes: 2, tier: 'free', rci: 4,
  items: [
    'Sentirte nervioso/a, ansioso/a o con los nervios de punta',
    'No poder dejar de preocuparte o no poder controlar la preocupación',
    'Preocuparte demasiado por diferentes cosas',
    'Dificultad para relajarte',
    'Estar tan inquieto/a que te cuesta quedarte quieto/a',
    'Molestarte o irritarte con facilidad',
    'Sentir miedo, como si algo terrible fuera a pasar',
  ].map((text, i) => ({ id: `q${i + 1}`, text, options: FREQ4 })),
  score(a) {
    req(this, a);
    const s = sum(a, this.items.map((i) => i.id));
    const sev: [Severity, string, string] = s >= 15 ? ['severe', 'Grave', 'Ansiedad intensa. Recomendamos valoración profesional pronto.']
      : s >= 10 ? ['moderate', 'Moderada', 'Ansiedad moderada. Un profesional puede ayudarte a manejarla.']
      : s >= 5 ? ['mild', 'Leve', 'Ansiedad leve. Las técnicas de regulación pueden ayudarte.']
      : ['minimal', 'Mínima', 'Pocos síntomas de ansiedad en estas dos semanas.'];
    return { score: s, max: 21, severity: sev[0], severityLabel: sev[1], interpretation: sev[2], flags: [], wellbeing: Math.round(100 - (s / 21) * 100) };
  },
};
export const GAD2: Instrument = {
  ...GAD7, id: 'gad2', name: 'GAD-2 (versión breve)', short: 'Ansiedad rápida · GAD-2', minutes: 1, rci: 2, items: GAD7.items.slice(0, 2),
  description: 'Dos preguntas del GAD-7 para el seguimiento semanal. Una puntuación de 3 o más sugiere completar el GAD-7.',
  score(a) {
    req(this, a);
    const s = sum(a, ['q1', 'q2']); const pos = s >= 3;
    return { score: s, max: 6, severity: pos ? 'positive' : 'negative', severityLabel: pos ? 'Conviene ampliar' : 'Sin señal', interpretation: pos ? 'Te proponemos completar el GAD-7.' : 'Sin señales relevantes esta semana.', flags: pos ? ['suggest_gad7'] : [], wellbeing: Math.round(100 - (s / 6) * 100) };
  },
};

const WHO5_OPTS: InstrumentOption[] = [
  { value: 5, label: 'Todo el tiempo' }, { value: 4, label: 'La mayor parte del tiempo' }, { value: 3, label: 'Más de la mitad del tiempo' },
  { value: 2, label: 'Menos de la mitad del tiempo' }, { value: 1, label: 'De vez en cuando' }, { value: 0, label: 'Nunca' },
];
export const WHO5: Instrument = {
  id: 'who5', name: 'Índice de bienestar de la OMS (WHO-5)', short: 'Bienestar · WHO-5', domains: ['animo', 'energia', 'proposito'], validated: true,
  description: 'Mide el bienestar subjetivo de forma positiva. Uso libre (OMS).', source: 'WHO Collaborating Centre in Mental Health, 1998.',
  timeframe: 'Durante las últimas 2 semanas…', minutes: 1, tier: 'free', rci: 10,
  items: [
    'Me he sentido alegre y de buen humor', 'Me he sentido tranquilo/a y relajado/a', 'Me he sentido activo/a y con energía',
    'Me he despertado fresco/a y descansado/a', 'Mi vida diaria ha estado llena de cosas que me interesan',
  ].map((text, i) => ({ id: `q${i + 1}`, text, options: WHO5_OPTS })),
  score(a) {
    req(this, a);
    const raw = sum(a, this.items.map((i) => i.id)); const pct = raw * 4;
    const sev: [Severity, string, string] = pct <= 28 ? ['low', 'Muy bajo', 'Bienestar muy bajo. Conviene hablarlo con un profesional; a veces indica depresión.']
      : pct <= 50 ? ['low', 'Bajo', 'Bienestar bajo. Te proponemos rutas de cuidado y seguir la evolución.']
      : ['normal', 'Adecuado', 'Tu bienestar está en un rango adecuado.'];
    return { score: pct, max: 100, severity: sev[0], severityLabel: sev[1], interpretation: sev[2], flags: pct <= 28 ? ['who5_very_low'] : [], wellbeing: pct };
  },
};

const CBI_OPTS: InstrumentOption[] = [
  { value: 100, label: 'Siempre' }, { value: 75, label: 'A menudo' }, { value: 50, label: 'A veces' }, { value: 25, label: 'Rara vez' }, { value: 0, label: 'Nunca o casi nunca' },
];
export const CBI: Instrument = {
  id: 'cbi', name: 'Inventario de burnout de Copenhague (personal)', short: 'Burnout · CBI', domains: ['energia', 'calma'], validated: true,
  description: 'Agotamiento físico y emocional. Escala de uso libre.', source: 'Kristensen et al., 2005. Adaptación española.',
  timeframe: 'Piensa en tus últimas semanas.', minutes: 2, tier: 'free', rci: 10,
  items: [
    '¿Con qué frecuencia te sientes cansado/a?', '¿Con qué frecuencia estás físicamente agotado/a?', '¿Con qué frecuencia estás emocionalmente agotado/a?',
    '¿Con qué frecuencia piensas «no puedo más»?', '¿Con qué frecuencia te sientes desgastado/a?', '¿Con qué frecuencia te sientes débil y propenso/a a enfermar?',
  ].map((text, i) => ({ id: `q${i + 1}`, text, options: CBI_OPTS })),
  score(a) {
    req(this, a);
    const m = Math.round(sum(a, this.items.map((i) => i.id)) / 6);
    const sev: [Severity, string, string] = m >= 75 ? ['severe', 'Alto', 'Agotamiento alto. Es una señal para parar, redistribuir carga y pedir ayuda.']
      : m >= 50 ? ['moderate', 'Moderado', 'Agotamiento moderado. Las pausas, los límites y el descanso son prioritarios.']
      : ['minimal', 'Bajo', 'Nivel de agotamiento bajo.'];
    return { score: m, max: 100, severity: sev[0], severityLabel: sev[1], interpretation: sev[2], flags: [], wellbeing: 100 - m };
  },
};

const RSES_OPTS: InstrumentOption[] = [
  { value: 3, label: 'Muy de acuerdo' }, { value: 2, label: 'De acuerdo' }, { value: 1, label: 'En desacuerdo' }, { value: 0, label: 'Muy en desacuerdo' },
];
export const RSES: Instrument = {
  id: 'rses', name: 'Escala de autoestima de Rosenberg', short: 'Autoestima · Rosenberg', domains: ['animo', 'proposito'], validated: true,
  description: 'Autoestima global. Escala de dominio público.', source: 'Rosenberg, 1965. Versión española (Atienza et al., 2000).',
  timeframe: 'Indica tu grado de acuerdo.', minutes: 2, tier: 'plus', rci: 5,
  items: [
    ['Siento que soy una persona digna de aprecio, al menos tanto como los demás', false],
    ['Estoy convencido/a de que tengo buenas cualidades', false],
    ['Soy capaz de hacer las cosas tan bien como la mayoría de la gente', false],
    ['Tengo una actitud positiva hacia mí mismo/a', false],
    ['En general estoy satisfecho/a conmigo mismo/a', false],
    ['Siento que no tengo mucho de lo que estar orgulloso/a', true],
    ['En general, me inclino a pensar que soy un fracaso', true],
    ['Me gustaría poder sentir más respeto por mí mismo/a', true],
    ['Hay veces que realmente pienso que soy un/a inútil', true],
    ['A veces creo que no soy buena persona', true],
  ].map(([text, reverse], i) => ({ id: `q${i + 1}`, text: text as string, options: RSES_OPTS, reverse: reverse as boolean })),
  score(a) {
    req(this, a);
    const s = this.items.reduce((acc, it) => acc + (it.reverse ? 3 - Number(a[it.id]) : Number(a[it.id])), 0);
    const sev: [Severity, string, string] = s < 15 ? ['low', 'Baja', 'Autoestima baja. Es algo que se puede trabajar y mejorar con apoyo.']
      : s <= 25 ? ['normal', 'Media', 'Autoestima en rango medio.'] : ['high', 'Alta', 'Autoestima alta.'];
    return { score: s, max: 30, severity: sev[0], severityLabel: sev[1], interpretation: sev[2], flags: [], wellbeing: Math.round((s / 30) * 100) };
  },
};

const UCLA_OPTS: InstrumentOption[] = [{ value: 1, label: 'Casi nunca' }, { value: 2, label: 'A veces' }, { value: 3, label: 'A menudo' }];
export const UCLA3: Instrument = {
  id: 'ucla3', name: 'Escala breve de soledad (UCLA-3)', short: 'Soledad · UCLA-3', domains: ['vinculos'], validated: true,
  description: 'Tres preguntas sobre soledad percibida.', source: 'Hughes, Waite, Hawkley y Cacioppo, 2004.', timeframe: 'Piensa en tu día a día.',
  minutes: 1, tier: 'free', rci: 2,
  items: ['¿Con qué frecuencia sientes que te falta compañía?', '¿Con qué frecuencia te sientes excluido/a?', '¿Con qué frecuencia te sientes aislado/a de los demás?']
    .map((text, i) => ({ id: `q${i + 1}`, text, options: UCLA_OPTS })),
  score(a) {
    req(this, a);
    const s = sum(a, ['q1', 'q2', 'q3']); const lonely = s >= 6;
    return { score: s, max: 9, severity: lonely ? 'high' : 'normal', severityLabel: lonely ? 'Soledad elevada' : 'Sin soledad relevante', interpretation: lonely ? 'Te sientes solo/a a menudo. Conectar con personas que compartan lo que te gusta puede ayudar mucho.' : 'Tu sensación de conexión con otras personas es adecuada.', flags: [], wellbeing: Math.round(100 - ((s - 3) / 6) * 100) };
  },
};

const YESNO: InstrumentOption[] = [{ value: 1, label: 'Sí' }, { value: 0, label: 'No' }];
export const ASQ: Instrument = {
  id: 'asq', name: 'Preguntas de cribado de riesgo de suicidio (ASQ)', short: 'Seguridad · ASQ', domains: ['animo'], validated: true,
  description: 'Cribado breve de riesgo de suicidio del NIMH (dominio público). Si alguna respuesta es «sí», te mostraremos ayuda inmediata.',
  source: 'Horowitz et al., NIMH, 2012.', timeframe: 'Responde con sinceridad. Nadie te va a juzgar.', minutes: 1, tier: 'free', minAge: 10,
  items: [
    { id: 'q1', text: 'En las últimas semanas, ¿has deseado estar muerto/a?', options: YESNO },
    { id: 'q2', text: 'En las últimas semanas, ¿has sentido que tú o tu familia estaríais mejor si estuvieras muerto/a?', options: YESNO },
    { id: 'q3', text: 'En la última semana, ¿has pensado en suicidarte?', options: YESNO },
    { id: 'q4', text: '¿Alguna vez has intentado suicidarte?', options: YESNO },
    { id: 'q5', text: '¿Estás pensando en suicidarte en este momento?', options: YESNO, showIfAnyYes: ['q1', 'q2', 'q3', 'q4'] },
  ],
  score(a) {
    req(this, a);
    const anyYes = ['q1', 'q2', 'q3', 'q4'].some((k) => Number(a[k]) === 1);
    const acute = Number(a.q5) === 1;
    if (acute) return { score: 5, max: 5, severity: 'acute', severityLabel: 'Riesgo agudo', interpretation: 'Ahora mismo lo más importante es tu seguridad. Llama al 024 o al 112, o pide a alguien de confianza que esté contigo.', flags: ['asq_acute', 'crisis'], wellbeing: 0 };
    if (anyYes) return { score: 1, max: 5, severity: 'positive', severityLabel: 'Cribado positivo', interpretation: 'Gracias por contarlo. Es importante que un profesional valore cómo estás en los próximos días. No estás solo/a.', flags: ['asq_positive'], wellbeing: 20 };
    return { score: 0, max: 5, severity: 'negative', severityLabel: 'Negativo', interpretation: 'No hay señales de riesgo en tus respuestas.', flags: [], wellbeing: 100 };
  },
};

export const AUDITC: Instrument = {
  id: 'auditc', name: 'Consumo de alcohol (AUDIT-C)', short: 'Alcohol · AUDIT-C', domains: ['energia'], validated: true, minAge: 18,
  description: 'Tres preguntas de la OMS sobre consumo de alcohol.', source: 'Bush et al., 1998; OMS.', timeframe: 'Piensa en el último año.', minutes: 1, tier: 'plus',
  items: [
    { id: 'q1', text: '¿Con qué frecuencia tomas alguna bebida con alcohol?', options: [{ value: 0, label: 'Nunca' }, { value: 1, label: 'Una vez al mes o menos' }, { value: 2, label: '2 a 4 veces al mes' }, { value: 3, label: '2 o 3 veces por semana' }, { value: 4, label: '4 o más veces por semana' }] },
    { id: 'q2', text: '¿Cuántas consumiciones tomas en un día normal en que bebes?', options: [{ value: 0, label: '1 o 2' }, { value: 1, label: '3 o 4' }, { value: 2, label: '5 o 6' }, { value: 3, label: '7 a 9' }, { value: 4, label: '10 o más' }] },
    { id: 'q3', text: '¿Con qué frecuencia tomas 6 o más consumiciones en una sola ocasión?', options: [{ value: 0, label: 'Nunca' }, { value: 1, label: 'Menos de una vez al mes' }, { value: 2, label: 'Mensualmente' }, { value: 3, label: 'Semanalmente' }, { value: 4, label: 'A diario o casi' }] },
  ],
  score(a) {
    req(this, a);
    const s = sum(a, ['q1', 'q2', 'q3']); const pos = s >= 4;
    return { score: s, max: 12, severity: pos ? 'positive' : 'negative', severityLabel: pos ? 'Consumo de riesgo' : 'Sin riesgo relevante', interpretation: pos ? 'Tu consumo podría estar afectando a tu bienestar. Podemos ayudarte a revisarlo sin juicios.' : 'Tu consumo no muestra señales de riesgo.', flags: [], wellbeing: Math.round(100 - (s / 12) * 100) };
  },
};

export const SLEEP: Instrument = {
  id: 'sleep', name: 'Chequeo de sueño Kinkō', short: 'Sueño · Kinkō', domains: ['sueno', 'energia'], validated: false,
  description: 'Chequeo orientativo de hábitos de sueño creado por Kinkō (no es una escala clínica validada).', source: 'Kinkō, basado en recomendaciones de higiene del sueño.',
  timeframe: 'Piensa en las dos últimas semanas.', minutes: 2, tier: 'free',
  items: [
    { id: 'q1', text: '¿Cuántas horas duermes de media?', options: [{ value: 0, label: 'Menos de 5' }, { value: 2, label: '5 a 6' }, { value: 3, label: '6 a 7' }, { value: 4, label: '7 a 9' }, { value: 2, label: 'Más de 9' }] },
    { id: 'q2', text: '¿Cuánto tardas en dormirte?', options: [{ value: 4, label: 'Menos de 15 minutos' }, { value: 3, label: '15 a 30 minutos' }, { value: 1, label: '30 a 60 minutos' }, { value: 0, label: 'Más de una hora' }] },
    { id: 'q3', text: '¿Te despiertas por la noche y te cuesta volver a dormir?', options: [{ value: 4, label: 'Nunca' }, { value: 3, label: 'Rara vez' }, { value: 1, label: 'A menudo' }, { value: 0, label: 'Casi cada noche' }] },
    { id: 'q4', text: '¿Te levantas descansado/a?', options: [{ value: 4, label: 'Casi siempre' }, { value: 3, label: 'A menudo' }, { value: 1, label: 'Pocas veces' }, { value: 0, label: 'Casi nunca' }] },
    { id: 'q5', text: '¿Usas pantallas en la hora antes de dormir?', options: [{ value: 4, label: 'Nunca' }, { value: 3, label: 'Algún día' }, { value: 1, label: 'Casi siempre' }, { value: 0, label: 'Siempre, hasta dormirme' }] },
    { id: 'q6', text: '¿Mantienes horarios parecidos para acostarte y levantarte?', options: [{ value: 4, label: 'Sí, casi siempre' }, { value: 2, label: 'Más o menos' }, { value: 0, label: 'No, cambian mucho' }] },
  ],
  score(a) {
    req(this, a);
    const s = sum(a, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']); const pct = Math.round((s / 24) * 100);
    const sev: [Severity, string, string] = pct < 45 ? ['low', 'Mejorable', 'Tu sueño necesita atención. La ruta «Dormir mejor» puede ayudarte.']
      : pct < 70 ? ['normal', 'Aceptable', 'Tu sueño es aceptable; hay hábitos que puedes ajustar.'] : ['high', 'Bueno', 'Tus hábitos de sueño son buenos.'];
    return { score: pct, max: 100, severity: sev[0], severityLabel: sev[1], interpretation: sev[2], flags: [], wellbeing: pct };
  },
};

export const INSTRUMENTS: Instrument[] = [PHQ9, GAD7, WHO5, CBI, UCLA3, SLEEP, RSES, AUDITC, ASQ, PHQ2, GAD2];
export const INSTRUMENT_BY_ID: Record<string, Instrument> = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

/** Versión serializable (sin la función de puntuación) para enviar al cliente. */
export function publicInstrument(i: Instrument) {
  const { score, ...rest } = i;
  void score;
  return rest;
}

/** Cambio clínicamente relevante respecto al resultado anterior (índice de cambio fiable simplificado). */
export function reliableChange(inst: Instrument, prev: number | null | undefined, curr: number): 'better' | 'worse' | 'same' | null {
  if (prev == null || !inst.rci) return null;
  const d = curr - prev;
  const higherIsBetter = ['who5', 'rses', 'sleep'].includes(inst.id);
  if (Math.abs(d) < inst.rci) return 'same';
  return (d > 0) === higherIsBetter ? 'better' : 'worse';
}
