export interface PassionDef { key: string; label: string; category: string; icon: string; challenges: string[]; tags: string[]; community: string }
const P = (key: string, label: string, category: string, icon: string, challenges: string[], tags: string[] = [key]): PassionDef =>
  ({ key, label, category, icon, challenges, tags, community: `pasion-${category}` });

export const PASSION_CATEGORIES: Record<string, string> = {
  deporte: 'Deporte y movimiento', musica: 'Música', arte: 'Arte y creatividad', letras: 'Letras', tecnologia: 'Tecnología y juegos', naturaleza: 'Naturaleza y animales', social: 'Comunidad y cuidado', hogar: 'Cocina y hogar',
};

export const PASSIONS: PassionDef[] = [
  P('futbol', 'Fútbol', 'deporte', 'Trophy', ['Toca balón 20 minutos tres días esta semana', 'Busca un partido o pachanga en tu barrio', 'Aprende una habilidad nueva (un regate, un golpeo)']),
  P('baloncesto', 'Baloncesto', 'deporte', 'Dribbble', ['50 tiros libres y apunta tu acierto', 'Juega un 3x3 con alguien', 'Mira un partido y fíjate en una jugada']),
  P('running', 'Correr', 'deporte', 'Footprints', ['Sal a trotar 15 minutos sin mirar el ritmo', 'Descubre una ruta nueva', 'Apúntate a una carrera popular']),
  P('ciclismo', 'Bici', 'deporte', 'Bike', ['Una salida de 30 minutos', 'Ve en bici a un sitio al que irías en coche', 'Revisa y pon a punto tu bici']),
  P('yoga', 'Yoga', 'deporte', 'Flower2', ['10 minutos de yoga al despertar', 'Prueba una clase guiada', 'Aprende el saludo al sol completo']),
  P('gimnasio', 'Gimnasio y fuerza', 'deporte', 'Dumbbell', ['Tres sesiones cortas esta semana', 'Apunta tus marcas', 'Prueba un ejercicio nuevo con buena técnica']),
  P('natacion', 'Natación', 'deporte', 'Waves', ['Dos sesiones de 30 minutos', 'Prueba un estilo distinto', 'Nada 200 m seguidos']),
  P('montana', 'Montaña y senderismo', 'naturaleza', 'Mountain', ['Una ruta corta este fin de semana', 'Invita a alguien a caminar', 'Haz una foto de algo que te sorprenda']),
  P('surf', 'Surf', 'deporte', 'Waves', ['Mira el parte y elige un día', 'Practica el take-off en casa', 'Sesión con un amigo']),
  P('artes_marciales', 'Artes marciales', 'deporte', 'Swords', ['Practica una kata o combinación', 'Clase de prueba en un club', 'Trabaja flexibilidad 10 minutos']),
  P('instrumento', 'Tocar un instrumento', 'musica', 'Guitar', ['15 minutos al día durante 5 días', 'Aprende una canción que te encante', 'Graba un minuto tocando']),
  P('cantar', 'Cantar', 'musica', 'Mic', ['Calienta la voz 5 minutos', 'Canta una canción entera grabándote', 'Busca un coro o grupo']),
  P('produccion', 'Producción musical', 'musica', 'AudioLines', ['Crea un loop de 8 compases', 'Termina una maqueta de 1 minuto', 'Comparte un tema en la comunidad']),
  P('dibujo', 'Dibujo', 'arte', 'PenTool', ['Un boceto al día durante 7 días', 'Dibuja algo que veas desde tu ventana', 'Prueba un material nuevo']),
  P('pintura', 'Pintura', 'arte', 'Palette', ['Pinta 20 minutos sin buscar perfección', 'Copia una obra que admires', 'Prueba acuarela o acrílico']),
  P('fotografia', 'Fotografía', 'arte', 'Camera', ['Una foto al día con un tema', 'Sal a fotografiar luz y sombras', 'Edita y comparte tu mejor foto']),
  P('cine', 'Cine y vídeo', 'arte', 'Clapperboard', ['Graba un vídeo de 30 segundos', 'Analiza una escena que te guste', 'Monta un pequeño corto con el móvil']),
  P('baile', 'Baile', 'arte', 'Music', ['Baila una canción entera cada día', 'Aprende una coreografía corta', 'Prueba una clase de un estilo nuevo']),
  P('teatro', 'Teatro', 'arte', 'Drama', ['Lee en voz alta un monólogo', 'Improvisa una escena con alguien', 'Busca un grupo de teatro']),
  P('escritura', 'Escritura', 'letras', 'NotebookPen', ['Escribe 300 palabras al día', 'Termina un relato corto', 'Escribe una carta que nunca enviarás']),
  P('lectura', 'Lectura', 'letras', 'BookOpen', ['20 páginas al día', 'Únete a un club de lectura', 'Relee un libro que te marcó']),
  P('idiomas', 'Idiomas', 'letras', 'Languages', ['10 minutos al día de práctica', 'Mira una serie en versión original', 'Busca un intercambio de idiomas']),
  P('programacion', 'Programación y tecnología', 'tecnologia', 'Code', ['Construye algo pequeño en una tarde', 'Aprende una función nueva', 'Comparte tu proyecto']),
  P('videojuegos', 'Videojuegos', 'tecnologia', 'Gamepad2', ['Juega con alguien en lugar de solo', 'Pon un límite de tiempo y respétalo', 'Prueba a crear un nivel o mod']),
  P('ajedrez', 'Ajedrez', 'tecnologia', 'Crown', ['Resuelve 5 problemas al día', 'Juega una partida lenta', 'Apúntate a un torneo de club']),
  P('animales', 'Animales', 'naturaleza', 'PawPrint', ['Paseo largo con tu animal', 'Colabora con una protectora', 'Aprende algo nuevo sobre su cuidado']),
  P('jardineria', 'Plantas y jardín', 'naturaleza', 'Sprout', ['Planta algo esta semana', 'Cuida tus plantas 10 minutos al día', 'Visita un huerto urbano']),
  P('cocina', 'Cocina', 'hogar', 'ChefHat', ['Cocina una receta nueva', 'Cocina para alguien', 'Prepara la comida de mañana con calma']),
  P('manualidades', 'Manualidades', 'hogar', 'Scissors', ['Termina un proyecto pequeño', 'Aprende una técnica nueva', 'Regala algo hecho por ti']),
  P('voluntariado', 'Voluntariado', 'social', 'HeartHandshake', ['Busca una entidad cercana', 'Dedica dos horas este mes', 'Invita a alguien a acompañarte']),
];
export const PASSION_BY_KEY: Record<string, PassionDef> = Object.fromEntries(PASSIONS.map((p) => [p.key, p]));

export const FREQUENCY_LABEL = ['Nunca', 'Alguna vez al mes', 'Cada semana', 'Varias veces por semana', 'A diario'];
export const BLOCKERS: Record<string, string> = {
  tiempo: 'Falta de tiempo', dinero: 'Dinero', apoyo: 'Falta de apoyo', miedo: 'Miedo a no ser bueno/a', motivacion: 'Motivación', lugar: 'No tengo dónde', lesion: 'Lesión o salud', estudios: 'Estudios o trabajo',
};

export interface PassionInterest { key: string; importance: number; frequency: number; skill?: number; support?: { family?: number; friends?: number; school?: number }; blockers?: string[]; dream?: string }
export interface PassionInsight {
  key: string; label: string; icon: string; category: string; strength: number; supportAvg: number | null; atRisk: boolean; unsupported: boolean; headline: string; message: string; challenges: string[]; tags: string[]; community: string;
}

/** Interpreta el mapa de pasiones: qué te mueve, qué está en riesgo y dónde falta apoyo. */
export function analyzePassions(interests: PassionInterest[]): { insights: PassionInsight[]; summary: string } {
  const insights = interests.map((i) => {
    const def = PASSION_BY_KEY[i.key] || { key: i.key, label: i.key, category: 'otros', icon: 'Sparkles', challenges: [], tags: [i.key], community: 'pasion-otros' };
    const strength = Math.round(((i.importance / 5) * 0.6 + (i.frequency / 4) * 0.4) * 100);
    const sup = [i.support?.family, i.support?.friends, i.support?.school].filter((x): x is number => typeof x === 'number');
    const supportAvg = sup.length ? sup.reduce((a, b) => a + b, 0) / sup.length : null;
    const atRisk = i.importance >= 4 && i.frequency <= 1;
    const unsupported = i.importance >= 4 && ((i.support?.family ?? 5) <= 2 || (supportAvg ?? 5) <= 2.5);
    const blockers = (i.blockers || []).map((b) => BLOCKERS[b] || b);
    let headline = `${def.label}: forma parte de ti`;
    let message = `Le das una importancia de ${i.importance}/5 y lo practicas ${FREQUENCY_LABEL[i.frequency]?.toLowerCase()}.`;
    if (atRisk && unsupported) {
      headline = `${def.label}: tu pasión necesita aire`;
      message = `Es muy importante para ti, pero ahora casi no la practicas y sientes poco apoyo${blockers.length ? ` (${blockers.join(', ').toLowerCase()})` : ''}. Eso puede pesar en tu ánimo más de lo que parece. Aquí tienes apoyo: retos pequeños, gente que comparte lo mismo y recursos para retomarla a tu ritmo.`;
    } else if (atRisk) {
      headline = `${def.label}: es momento de retomarla`;
      message = `La valoras mucho pero la practicas poco${blockers.length ? `; lo que más te frena: ${blockers.join(', ').toLowerCase()}` : ''}. Un reto pequeño esta semana puede reactivar la motivación.`;
    } else if (unsupported) {
      headline = `${def.label}: sigue adelante, aquí tienes apoyo`;
      message = 'La practicas, pero no te sientes respaldado/a. Tu pasión es válida aunque otros no la entiendan; en la comunidad hay personas que la viven igual que tú.';
    } else if (strength >= 70) {
      headline = `${def.label}: tu fuente de energía`;
      message = 'Es una de tus mayores fuentes de bienestar. Protégela en tu agenda, sobre todo en semanas difíciles.';
    }
    return { key: def.key, label: def.label, icon: def.icon, category: def.category, strength, supportAvg, atRisk, unsupported, headline, message, challenges: def.challenges, tags: def.tags, community: def.community } as PassionInsight;
  }).sort((a, b) => b.strength - a.strength);
  const top = insights[0];
  const risk = insights.find((x) => x.atRisk || x.unsupported);
  const summary = !insights.length ? 'Cuéntanos qué te apasiona para personalizar tu Kinkō.'
    : risk ? `Tu mayor fuente de energía es ${top.label.toLowerCase()}. Hemos visto que ${risk.label.toLowerCase()} necesita más espacio o apoyo: lo tendrás en cuenta en tus recomendaciones.`
    : `Tu mayor fuente de energía es ${top.label.toLowerCase()}. La usaremos para proponerte retos y descansos que te sienten bien.`;
  return { insights, summary };
}
