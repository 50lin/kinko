export const ROLES = ['patient', 'parent', 'professional', 'clinic_admin', 'developer', 'org_admin', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['professional', 'clinic_admin', 'developer', 'org_admin', 'admin'];

export const ROLE_LABEL: Record<Role, string> = {
  patient: 'Paciente', parent: 'Familia', professional: 'Profesional', clinic_admin: 'Clínica',
  developer: 'Desarrollador', org_admin: 'Empresa', admin: 'Administración',
};

/** Ámbitos de datos que un paciente puede compartir con su profesional. */
export const CARE_SCOPES = ['checkins', 'assessments', 'journal_shared', 'biometrics', 'companion_summaries', 'passions', 'plan'] as const;
export type CareScope = (typeof CARE_SCOPES)[number];
export const CARE_SCOPE_LABEL: Record<CareScope, string> = {
  checkins: 'Check-ins diarios', assessments: 'Resultados de tests', journal_shared: 'Entradas de diario que marque como compartidas',
  biometrics: 'Datos de dispositivos', companion_summaries: 'Resúmenes de Kio (nunca la conversación)', passions: 'Mapa de pasiones', plan: 'Plan de tratamiento y tareas',
};

/** Lo que un adolescente puede compartir con su familia (las alertas de crisis se comparten siempre). */
export const GUARDIAN_SCOPES = ['progress', 'adherence', 'appointments', 'plan', 'parent_chat'] as const;
export type GuardianScope = (typeof GUARDIAN_SCOPES)[number];
export const GUARDIAN_SCOPE_LABEL: Record<GuardianScope, string> = {
  progress: 'Evolución general (puntuación Kinkō)', adherence: 'Constancia (días con check-in)', appointments: 'Citas',
  plan: 'Tareas completadas del plan', parent_chat: 'Que mi familia hable con mi profesional',
};

export const DOMAINS = ['animo', 'calma', 'sueno', 'energia', 'vinculos', 'proposito', 'actividad'] as const;
export type Domain = (typeof DOMAINS)[number];
export const DOMAIN_LABEL: Record<Domain, string> = {
  animo: 'Ánimo', calma: 'Calma', sueno: 'Sueño', energia: 'Energía', vinculos: 'Vínculos', proposito: 'Propósito', actividad: 'Actividad',
};
export const DOMAIN_COLOR: Record<Domain, string> = {
  animo: '#E8A15C', calma: '#5FA8A0', sueno: '#7C83D6', energia: '#E3C25A', vinculos: '#D98BA8', proposito: '#9C7BD1', actividad: '#6FBF73',
};

export const PLANS = ['free', 'plus', 'family', 'care', 'pro_solo', 'pro_plus', 'clinic', 'org', 'developer'] as const;
export type Plan = (typeof PLANS)[number];
export const PLAN_INFO: Record<Plan, { name: string; price: string; features: string[] }> = {
  free: { name: 'Kinkō Free', price: '0 €', features: ['Check-in diario', 'Esfera Kinkō', 'Tests básicos', 'Diario', 'Kio: 15 mensajes al día', 'Comunidad'] },
  plus: { name: 'Kinkō Plus', price: '7,99 €/mes · 59,99 €/año', features: ['Todos los tests', 'Kio sin límite', 'Rutas de cuidado completas', 'Informes PDF', 'Dispositivos'] },
  family: { name: 'Kinkō Familia', price: '11,99 €/mes · 99,99 €/año', features: ['Plus para el adolescente', 'Portal de padres', 'Alertas de crisis', 'Guías para familias'] },
  care: { name: 'Kinkō Care', price: 'Incluido por tu profesional', features: ['Todo Plus mientras dure el tratamiento'] },
  pro_solo: { name: 'Pro Solo', price: '39 €/mes', features: ['Hasta 25 pacientes monitorizados', 'Agenda, vídeo y chat', 'Historia clínica cifrada', 'Resúmenes IA'] },
  pro_plus: { name: 'Pro Plus', price: '69 €/mes', features: ['Pacientes ilimitados', 'Alertas de recaída', 'Analítica avanzada', 'Perfil destacado'] },
  clinic: { name: 'Clínica', price: '59 € por profesional/mes', features: ['Panel de centro', 'Agenda compartida', 'Roles y equipo', 'Informes'] },
  org: { name: 'Empresa', price: '3 € por empleado/mes', features: ['Plus para la plantilla', 'Panel agregado y anónimo'] },
  developer: { name: 'Insights API', price: 'Sandbox gratis · Live desde 290 €/mes', features: ['Estadísticas anonimizadas', 'k-anonimato y ruido diferencial'] },
};

export const SPECIALTIES = [
  'Ansiedad', 'Depresión', 'Estrés laboral y burnout', 'Adolescentes', 'Infancia', 'Pareja', 'Familia', 'Duelo', 'Trauma', 'TCA',
  'Adicciones', 'TDAH', 'Autoestima', 'Sueño', 'Psicología deportiva', 'Psiquiatría', 'Mindfulness', 'LGTBI+', 'Rendimiento académico', 'Dolor crónico',
];
export const APPROACHES = ['Cognitivo-conductual', 'ACT', 'Sistémica', 'Humanista', 'EMDR', 'Psicodinámica', 'Mindfulness', 'Integradora', 'Farmacológica (psiquiatría)'];
export const PRO_TYPES = ['Psicólogo/a general sanitario/a', 'Psicólogo/a clínico/a (PIR)', 'Psiquiatra', 'Terapeuta ocupacional', 'Enfermero/a de salud mental', 'Trabajador/a social sanitario/a'];

export const PROVINCES = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Baleares', 'Barcelona', 'Bizkaia', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria',
  'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Jaén', 'La Coruña', 'La Rioja',
  'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife',
  'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Zamora', 'Zaragoza',
];

export const EMOTIONS = [
  'alegría', 'calma', 'gratitud', 'ilusión', 'orgullo', 'amor', 'alivio',
  'tristeza', 'ansiedad', 'miedo', 'rabia', 'frustración', 'culpa', 'vergüenza', 'soledad', 'cansancio', 'agobio', 'aburrimiento', 'confusión',
];
export const NEGATIVE_EMOTIONS = new Set(['tristeza', 'ansiedad', 'miedo', 'rabia', 'frustración', 'culpa', 'vergüenza', 'soledad', 'cansancio', 'agobio', 'aburrimiento', 'confusión']);

export const AGE_BANDS = ['14-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;

export const CRISIS_RESOURCES = [
  { name: 'Línea 024', desc: 'Atención a la conducta suicida, 24 h, gratuita y confidencial', phone: '024' },
  { name: 'Emergencias 112', desc: 'Si hay peligro inmediato para ti o para otra persona', phone: '112' },
  { name: 'Fundación ANAR', desc: 'Ayuda a niños, niñas y adolescentes, 24 h', phone: '900202010' },
];

export const BANNED_PRODUCT_TERMS = ['medicamento', 'fármaco', 'farmaco', 'pastilla', 'ansiolítico', 'ansiolitico', 'antidepresivo', 'suplemento', 'cbd', 'melatonina', 'benzodiacepina', 'nootrópico', 'nootropico', 'píldora', 'pildora'];

export const ALERT_LABEL: Record<string, string> = {
  crisis: 'Riesgo de crisis', phq9_item9: 'PHQ-9 ítem 9 positivo', asq_positive: 'Cribado ASQ positivo', deterioration: 'Empeoramiento significativo',
  missed_checkins: 'Sin check-ins', relapse_pattern: 'Patrón similar a recaída previa', biometric: 'Señal biométrica', companion_risk: 'Riesgo en conversación con Kio',
};
