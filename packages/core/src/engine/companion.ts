import { norm } from '../util/text';
import { sentiment } from './sentiment';

export const COMPANION_MODES = {
  organizar: { label: 'Ordenar ideas', icon: 'ListTree', hint: 'Suéltalo todo tal cual sale; yo lo ordeno contigo.', opener: 'Cuéntame todo lo que tienes en la cabeza ahora mismo, sin orden. Luego lo ordenamos juntos.' },
  analizar: { label: 'Analizar una situación', icon: 'ScanSearch', hint: 'Separamos hechos, pensamientos y emociones.', opener: '¿Qué ha pasado? Descríbelo como si fuera una cámara: qué se vio y qué se dijo. Después vemos qué pensaste y sentiste.' },
  resolver: { label: 'Resolver un problema', icon: 'Puzzle', hint: 'Definimos el problema, buscamos opciones y elegimos un paso.', opener: '¿Cuál es el problema que no te deja pensar? Intenta resumirlo en una frase.' },
  desahogo: { label: 'Desahogarme', icon: 'Wind', hint: 'Solo escucharte, sin consejos si no los pides.', opener: 'Estoy aquí. Cuéntame lo que necesites, a tu ritmo.' },
  plan: { label: 'Plan para hoy', icon: 'CalendarCheck', hint: 'Tres pasos pequeños y realistas.', opener: '¿Cómo tienes la energía hoy, del 1 al 10? Con eso diseñamos un plan a tu medida.' },
  sesion: { label: 'Preparar mi sesión', icon: 'ClipboardList', hint: 'Ordenamos lo que quieres contar a tu profesional.', opener: '¿Qué te gustaría que tu profesional supiera de estas semanas? Empecemos por lo que más te ha pesado.' },
} as const;
export type CompanionMode = keyof typeof COMPANION_MODES;

export interface CompanionContext { firstName: string; age: number | null; kinko?: { overall: number | null; domains: Record<string, number | null> } | null; passions?: string[]; hasProfessional: boolean; useContext: boolean }

/** Instrucciones del sistema para el modelo de IA. Define límites claros: no diagnostica, no prescribe, deriva ante riesgo. */
export function buildSystemPrompt(mode: CompanionMode, ctx: CompanionContext): string {
  const m = COMPANION_MODES[mode];
  const data = ctx.useContext && ctx.kinko ? `\nDatos de bienestar recientes del usuario (0-100, más alto es mejor): ${Object.entries(ctx.kinko.domains).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(', ')}. Úsalos solo si ayudan y con tacto.` : '';
  const pas = ctx.useContext && ctx.passions?.length ? `\nLo que le apasiona: ${ctx.passions.join(', ')}. Puedes apoyarte en ello para proponer pasos que le den energía.` : '';
  return `Eres Kio, el acompañante de la app Kinkō. Hablas en español de España, con calidez, frases cortas y sin tecnicismos.
Tu papel: organizador de ideas y compañero de reflexión. NO eres médico ni psicólogo. Nunca haces diagnósticos, nunca das pautas de medicación ni sustituyes a un profesional.
Modo actual: «${m.label}». ${m.hint}
Cómo trabajas:
- Escucha primero y valida la emoción en una frase. Luego estructura: listas breves, separar hechos de interpretaciones, opciones con pros y contras, y un siguiente paso pequeño y concreto.
- Haz como máximo una pregunta por respuesta.
- Si detectas distorsiones de pensamiento (todo o nada, catastrofismo, lectura de mente, generalización, «debería»), nómbralas con amabilidad y propone una alternativa más equilibrada.
- Recuerda lo que la persona valora y lo que le apasiona; el apoyo a sus sueños y aficiones es parte del bienestar.
- Si el problema parece clínico o persistente, sugiere comentarlo con ${ctx.hasProfessional ? 'su profesional de Kinkō' : 'un profesional (puede buscarlo en el directorio de Kinkō)'}.
Seguridad: si aparece cualquier señal de riesgo de suicidio, autolesión, abuso o emergencia médica, prioriza la seguridad: anima a llamar al 024 (conducta suicida, 24 h) o al 112 si hay peligro inmediato${ctx.age != null && ctx.age < 18 ? ', o a la Fundación ANAR (900 20 20 10)' : ''}, y anima a contactar con alguien de confianza.
Longitud: entre 60 y 180 palabras salvo que pidan más. Usa viñetas cuando ordenes.
La persona se llama ${ctx.firstName}${ctx.age ? ` y tiene ${ctx.age} años` : ''}.${data}${pas}`;
}

const DISTORTIONS: { name: string; re: RegExp; reframe: string }[] = [
  { name: 'todo o nada', re: /\b(siempre|nunca|todo|nada|nadie|todos|ninguno)\b/, reframe: '¿Es «siempre» de verdad, o ha habido alguna excepción?' },
  { name: 'catastrofismo', re: /\b(desastre|horrible|lo peor|se acabo|arruinad[oa]|no voy a poder|va a salir fatal)\b/, reframe: '¿Qué es lo más probable que pase, no lo peor posible?' },
  { name: 'lectura de mente', re: /\b(seguro que piensa|pensaran que|creen que soy|me odia|me odian|le caigo mal)\b/, reframe: '¿Qué datos tienes de lo que piensa? ¿Hay otra explicación posible?' },
  { name: 'exigencia («debería»)', re: /\b(deberia|tendria que|tengo que ser|no puedo fallar)\b/, reframe: '¿Y si cambias «debería» por «me gustaría»? ¿Cómo suena?' },
  { name: 'etiquetarte', re: /\b(soy (un|una) (fracaso|inutil|desastre|idiota)|no valgo)\b/, reframe: 'Una equivocación es algo que haces, no algo que eres.' },
];

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?¿¡\n])\s+|,\s+(?:y|pero|aunque|ademas)\s+|\s+y\s+(?=(?:tengo|me|no|debo|necesito|quiero|hay))/i).map((s) => s.trim()).filter((s) => s.length > 3);
}

/** Respuesta de Kio sin conexión a un modelo de IA: técnicas estructuradas (TCC, resolución de problemas) con plantillas. */
export function offlineReply(mode: CompanionMode, userText: string, ctx: CompanionContext, turn: number): string {
  const t = norm(userText);
  const s = sentiment(userText);
  const validate = s.label === 'negativo' ? 'Suena a que esto te está pesando de verdad, y tiene sentido que te sientas así.' : s.label === 'positivo' ? 'Me alegra leer eso.' : 'Gracias por contármelo.';
  const parts = sentences(userText);
  const passionTip = ctx.passions?.length ? ` Y si puedes, regálate un rato de ${ctx.passions[0].toLowerCase()}: suele recargarte.` : '';
  switch (mode) {
    case 'organizar': {
      const tasks = parts.filter((p) => /\b(tengo que|debo|necesito|hay que|me toca|pendiente)\b/.test(norm(p)));
      const worries = parts.filter((p) => /\b(me preocupa|miedo|y si|no se si|me agobia|ansiedad|nervios)\b/.test(norm(p)));
      const feelings = parts.filter((p) => !tasks.includes(p) && !worries.includes(p));
      const fmt = (xs: string[]) => xs.slice(0, 5).map((x, i) => `${i + 1}. ${x.replace(/^[a-z]/, (c) => c.toUpperCase())}`).join('\n');
      if (parts.length < 2 && turn === 0) return `${validate} Sigue soltando: todo lo que te ronde, aunque parezca pequeño. Cuando termines, lo ordeno en tres cajas: tareas, preocupaciones y emociones.`;
      return `${validate} Te lo ordeno:\n\n**Tareas (dependen de ti)**\n${tasks.length ? fmt(tasks) : '— Ninguna clara todavía'}\n\n**Preocupaciones (aún no han pasado)**\n${worries.length ? fmt(worries) : '— Ninguna explícita'}\n\n**Lo que sientes o te ocurre**\n${feelings.length ? fmt(feelings) : '—'}\n\nUna idea: elige solo UNA tarea y pon cuándo la harás. Las preocupaciones las podemos revisar después con calma. ¿Por cuál empezamos?`;
    }
    case 'analizar': {
      const found = DISTORTIONS.filter((d) => d.re.test(t));
      const dist = found.length ? `\n\nHe notado algo en cómo lo cuentas: ${found.map((d) => `**${d.name}**`).join(', ')}. ${found[0].reframe}` : '';
      return `${validate}\n\nVamos a separarlo en tres partes:\n- **Lo que pasó (hechos):** lo que vería una cámara.\n- **Lo que pensaste:** la interpretación que te hiciste.\n- **Lo que sentiste e hiciste:** la emoción y tu reacción.${dist}\n\n¿Qué pensamiento exacto te vino a la cabeza en ese momento?`;
    }
    case 'resolver': {
      if (turn === 0) return `${validate} Para resolverlo vamos paso a paso:\n1. Problema en una frase (lo tienes casi).\n2. Tres opciones, aunque alguna parezca rara.\n3. Pros y contras de cada una.\n4. El paso más pequeño de la mejor opción y cuándo lo haces.\n\nDime tres cosas que podrías hacer, sin filtrar.`;
      if (turn === 1) return `Bien. Ahora, para cada opción: ¿qué ganarías y qué te costaría? No hace falta que sea perfecto: con una línea por opción vale.`;
      return `Con lo que me cuentas, la opción que suele funcionar mejor es la que puedes empezar hoy con menos de 15 minutos. Escríbela así: «Voy a ___ el ___ a las ___». Si quieres, la apunto como tarea en tu plan del día.${passionTip}`;
    }
    case 'desahogo':
      return `${validate} ${s.negatives.length ? `Leo ${s.negatives.slice(0, 2).join(' y ')} en lo que cuentas.` : ''} No tienes que tenerlo resuelto ahora. ¿Qué es lo que más te pesa de todo esto?`;
    case 'plan': {
      const m = t.match(/\b(10|[1-9])\b/);
      const e = m ? Number(m[1]) : 5;
      const size = e <= 3 ? 'muy pequeños (5 minutos)' : e <= 6 ? 'pequeños (15 minutos)' : 'normales (30 minutos)';
      return `Con energía ${e}/10, te propongo tres pasos ${size}:\n1. **Lo necesario:** la tarea que más te alivia quitarte de encima.\n2. **Cuidarte:** comer algo bien, agua y 10 minutos al aire libre.\n3. **Algo que te guste:** ${ctx.passions?.[0] ? ctx.passions[0].toLowerCase() : 'música, un paseo o algo que te ilusione'}.\n\nEsta noche, en tu check-in, marcamos lo que hiciste. ¿Cuál es la tarea número 1?`;
    }
    case 'sesion':
      return `${validate} Lo apunto para tu sesión. Te propongo llevar:\n- **Lo que más ha pesado:** ${parts[0] || '…'}\n- **Lo que ha ido mejor** (aunque sea poco).\n- **Una pregunta para tu profesional.**\n\n¿Qué ha ido algo mejor estas semanas?`;
  }
}

/** Resumen de una conversación para el profesional (solo si el paciente lo autoriza). Nunca incluye el texto literal. */
export function summarizeConversation(messages: { role: string; content: string }[]): { summary: string; topics: string[]; tone: string } {
  const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const s = sentiment(userText);
  const t = norm(userText);
  const TOPIC_RE: [string, RegExp][] = [
    ['trabajo o estudios', /\b(trabajo|jefe|empresa|examen|clase|estudi|universidad|instituto)\w*/],
    ['familia', /\b(padre|madre|familia|hermano|hermana|padres|hijo|hija)\w*/],
    ['pareja', /\b(pareja|novio|novia|relacion)\w*/],
    ['amistades', /\b(amig\w*|grupo|soledad|sol[oa])\b/],
    ['sueño', /\b(dormir|sueno|insomnio|noche)\w*/],
    ['salud', /\b(dolor|enfermedad|medico|salud)\w*/],
    ['autoestima', /\b(fracaso|inutil|no valgo|verguenza|culpa)\w*/],
    ['aficiones y pasiones', /\b(futbol|musica|dibujo|deporte|guitarra|pintar|bailar|leer|jugar)\w*/],
  ];
  const topics = TOPIC_RE.filter(([, re]) => re.test(t)).map(([n]) => n);
  return { summary: `Conversación de ${messages.filter((m) => m.role === 'user').length} mensajes. Temas: ${topics.join(', ') || 'generales'}. Tono emocional ${s.label}.`, topics, tone: s.label };
}
