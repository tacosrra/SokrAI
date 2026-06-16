import type { AlphaGap } from '../domain/contracts';

const GAP_FIELD_DESCRIPTIONS: Record<string, string> = {
  problem_owner:
    'Falta aclarar quién será la persona o equipo responsable de operar esta propuesta, tomar decisiones y responder por sus resultados.',
  problem_statement:
    'Falta describir el problema actual con palabras concretas, separado de la solución que se quiere construir.',
  evidence_of_problem:
    'Falta aportar evidencia concreta de que el problema existe, como datos, ejemplos, frecuencia, impacto o incidencias observadas.',
  scope:
    'Falta delimitar el alcance: dónde ocurre el problema, qué casos incluye y qué queda fuera del primer análisis.',
  current_alternatives:
    'Falta explicar cómo se gestiona hoy el problema y por qué las alternativas actuales no son suficientes.',
  target_user: 'Falta confirmar quién usará directamente la solución propuesta.',
  solution_summary:
    'Falta resumir qué hace la solución propuesta y qué cambia para el usuario.',
  how_it_works:
    'Falta explicar cómo funcionaría la solución en la práctica, paso a paso y sin asumir detalles no confirmados.',
  workflow_change:
    'Falta describir qué cambiaría en el flujo de trabajo actual si la solución se pusiera en marcha.',
  current_solutions:
    'Falta comparar la propuesta con las formas actuales de resolver el problema.',
  value_differential:
    'Falta aclarar qué aporta la solución frente a las alternativas actuales.',
  scope_limits:
    'Falta marcar los límites de la solución: qué hará, qué no hará y qué queda fuera de esta primera versión.',
  assumptions: 'Falta identificar qué supuestos importantes todavía no se han validado.',
  uncertainties:
    'Falta señalar qué dudas siguen abiertas para que una persona las revise antes de avanzar.',
  missing_information:
    'Falta completar un dato importante que no aparece en la propuesta inicial.',
  ambiguities:
    'Falta aclarar una parte de la propuesta inicial que puede interpretarse de varias formas.',
  personal_or_health_data:
    'Falta concretar si se usarán datos personales, datos de salud u otra información sensible.',
  data_sources:
    'Falta indicar de dónde saldrán los datos y quién controla o valida esas fuentes.',
  ai_system_role:
    'Falta explicar qué papel tendrá la IA dentro del proceso y qué no debe decidir por sí sola.',
  validation_evidence:
    'Falta definir qué evidencia se usará para comprobar que la propuesta funciona de forma fiable.',
  privacy_governance:
    'Falta aclarar qué responsabilidades, permisos y controles de privacidad se aplicarán al uso de datos.',
  cybersecurity_controls:
    'Falta concretar qué controles básicos de seguridad protegerán los datos y el entorno técnico.',
  regulatory_context:
    'Falta recoger el contexto normativo o de revisión que una persona competente debería considerar.',
  human_review_plan:
    'Falta concretar quién revisará los resultados de la IA, cuándo lo hará y cómo podrá corregir o detener el proceso.',
  privacy_controls:
    'Falta aclarar qué controles de privacidad, acceso y seguridad protegerán los datos usados por la propuesta.',
  data_categories:
    'Falta concretar qué tipos de datos se usarán y si incluyen información sensible o identificable.',
  ai_use:
    'Falta explicar cómo se usará la IA dentro de la propuesta y qué decisiones seguirá tomando una persona.',
  validation_plan:
    'Falta definir cómo se comprobará que la propuesta funciona antes de usarla en un entorno real.',
  human_review:
    'Falta concretar quién revisará los resultados de la IA y en qué momentos podrá corregir o detener el proceso.',
  intended_use_claims:
    'Falta describir qué uso previsto o afirmaciones funcionales deberá revisar una persona competente.',
  clinical_decision_role:
    'Falta aclarar si la propuesta influye en decisiones clínicas, triaje, diagnóstico, seguimiento o recomendaciones.',
  evidence_needed:
    'Falta indicar qué evidencia haría falta para revisar con seguridad el encaje sanitario de la propuesta.',
  human_resources:
    'Falta aclarar qué personas y dedicación serían necesarias para preparar o probar la propuesta.',
  technical_resources:
    'Falta concretar qué herramientas, infraestructura o soporte técnico hacen falta.',
  pilot_environment:
    'Falta describir en qué entorno se probaría el piloto y con qué límites operativos.',
  dependencies:
    'Falta identificar dependencias externas o internas que podrían bloquear el piloto.',
  indicators_metrics:
    'Falta definir qué indicadores permitirán revisar si el piloto progresa de forma útil.',
  constraints:
    'Falta recoger restricciones conocidas que puedan afectar al alcance, tiempos o funcionamiento.',
  pilot_context:
    'Falta describir dónde se probaría el piloto, con qué límites y bajo qué condiciones operativas.',
  resource_needs:
    'Falta aclarar qué personas, tiempo, herramientas o dependencias hacen falta para probar la propuesta.',
  success_metrics:
    'Falta definir qué indicadores permitirán saber si el piloto ha funcionado.',
  operational_risks:
    'Falta identificar los riesgos operativos principales y cómo se revisarían antes de avanzar.',
};

const LEGACY_GAP_PREFIX_PATTERNS = [
  /^The (?:structured brief|resumen inicial) flags ambiguous information:\s*/i,
  /^The (?:structured brief|resumen inicial) flags missing information:\s*/i,
];

const LEGACY_GAP_DETAIL_PATTERNS = [
  /^The (?:structured brief|resumen inicial) flags ambiguous information:\s*(.+)$/i,
  /^The (?:structured brief|resumen inicial) flags missing information:\s*(.+)$/i,
  /^Solution definition needs clarification for\s+(.+?)\.?$/i,
  /^Data AI privacy information gap for\s+(.+?)\.?$/i,
  /^Medical-device triage gap for\s+(.+?)\.?$/i,
  /^Resources pilot viability information gap for\s+(.+?)\.?$/i,
];

const LEGACY_GAP_LANGUAGE_PATTERNS = [
  /\bThe (?:structured brief|resumen inicial) flags\b/i,
  /\b(?:is|are) missing from (?:the )?(?:structured brief|resumen inicial)\b/i,
  /\bneeds clarification for\b/i,
  /\binformation gap for\b/i,
  /\btriage gap for\b/i,
  /\bshould be confirmed against\b/i,
  /\bMajor assumptions\b/i,
  /\bObservable evidence\b/i,
  /\bCurrent alternatives\b/i,
];

const TECHNICAL_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^The (?:structured brief|resumen inicial) flags ambiguous information:\s*/i, 'Falta aclarar este punto de la propuesta inicial: '],
  [/^The (?:structured brief|resumen inicial) flags missing information:\s*/i, 'Falta completar este dato de la propuesta inicial: '],
  [/^Major assumptions are missing from (?:the )?(?:structured brief|resumen inicial)\.?$/i, 'Falta identificar qué supuestos importantes todavía no se han validado.'],
  [/^Observable evidence of the problem is missing from (?:the )?(?:structured brief|resumen inicial)\.?$/i, 'Falta aportar evidencia concreta de que el problema existe.'],
  [/^Current alternatives are missing from (?:the )?(?:structured brief|resumen inicial)\.?$/i, 'Falta explicar cómo se gestiona hoy el problema y qué limitaciones tienen las alternativas actuales.'],
  [/^The problem owner is missing from (?:the )?(?:structured brief|resumen inicial)\.?$/i, 'Falta aclarar quién será la persona o equipo responsable de esta propuesta.'],
  [/^The concrete problem statement is missing from (?:the )?(?:structured brief|resumen inicial)\.?$/i, 'Falta describir el problema actual con palabras concretas.'],
  [/^The problem scope is missing from (?:the )?(?:structured brief|resumen inicial)\.?$/i, 'Falta delimitar el alcance del problema.'],
  [/^The direct target user is missing from (?:the )?(?:structured brief|resumen inicial)\.?$/i, 'Falta confirmar quién usará directamente la solución propuesta.'],
  [/^The target user is present and should be confirmed against the submitted source material\.?$/i, 'Conviene confirmar que el usuario destinatario indicado coincide con el material aportado.'],
  [/\bstructured brief\b/gi, 'resumen inicial'],
  [/\bbasic alpha report\b/gi, 'informe'],
  [/\bmedical-device triage\b/gi, 'revisión sanitaria'],
  [/\bmedical device triage\b/gi, 'revisión sanitaria'],
  [/\bdata\s*\/\s*ia\s*\/\s*privacy\b/gi, 'datos y privacidad'],
  [/\bdata\s*\/\s*ai\s*\/\s*privacy\b/gi, 'datos y privacidad'],
  [/\bresources\s*\/\s*pilot\s*\/\s*viability\b/gi, 'piloto y recursos'],
  [/\bsession_id\b/gi, 'propuesta'],
  [/\brequest_id\b/gi, 'paso'],
  [/\bsource_id\b/gi, 'material'],
  [/\bJSON\b/g, 'contenido'],
  [/\bpayload\b/gi, 'contenido'],
  [/\bschema version\b/gi, 'versión interna'],
  [/\bschema\b/gi, 'formato'],
  [/\bworkflow\b/gi, 'proceso'],
  [/\bbackend\b/gi, 'servicio local'],
  [/\bn8n\b/gi, 'servicio local'],
  [/\bFastify\b/g, 'servicio local'],
  [/\bOllama\b/g, 'asistente local'],
  [/\bPostgreSQL\b/g, 'almacenamiento local'],
];

export function toUserFacingText(value: string): string {
  return TECHNICAL_TERM_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

export function describeGapForUser(
  gap: Pick<AlphaGap, 'description' | 'field' | 'gap_kind' | 'module'>,
): string {
  const rawDescription = gap.description.trim();
  const normalizedDescription = toUserFacingText(rawDescription).replace(/\s+/g, ' ').trim();
  const legacyDetail = extractLegacyGapDetail(rawDescription);
  const hasLegacyLanguage = isLegacyGapDescription(rawDescription);
  const fieldDescription = GAP_FIELD_DESCRIPTIONS[gap.field];

  if (hasLegacyLanguage && fieldDescription) {
    const detail = legacyDetail ?? detailFromField(gap.field);

    if (detail && !detailIsFieldName(detail, gap.field)) {
      return `${fieldDescription} Punto detectado: ${ensureSentence(toUserFacingText(detail))}`;
    }

    return fieldDescription;
  }

  if (hasLegacyLanguage && legacyDetail) {
    return `${fallbackGapDescription(gap)} Punto detectado: ${ensureSentence(toUserFacingText(legacyDetail))}`;
  }

  if (normalizedDescription) {
    return normalizedDescription;
  }

  return fieldDescription ?? fallbackGapDescription(gap);
}

function isLegacyGapDescription(value: string): boolean {
  return LEGACY_GAP_LANGUAGE_PATTERNS.some((pattern) => pattern.test(value));
}

function extractLegacyGapDetail(value: string): string | null {
  for (const pattern of LEGACY_GAP_DETAIL_PATTERNS) {
    const match = value.match(pattern);

    if (match?.[1]) {
      return cleanLegacyDetail(match[1]);
    }
  }

  for (const pattern of LEGACY_GAP_PREFIX_PATTERNS) {
    const cleaned = value.replace(pattern, '').trim();

    if (cleaned !== value.trim() && cleaned.length > 0) {
      return cleanLegacyDetail(cleaned);
    }
  }

  return null;
}

function cleanLegacyDetail(value: string): string {
  return value
    .replace(/\.$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detailFromField(field: string): string | null {
  const label = FIELD_LABELS[field] ?? field.replace(/[_-]+/g, ' ');

  return label ? `el campo ${label}` : null;
}

function detailIsFieldName(detail: string, field: string): boolean {
  const normalizedDetail = normalizeFieldLikeText(detail);
  const normalizedField = normalizeFieldLikeText(field);
  const normalizedLabel = normalizeFieldLikeText(FIELD_LABELS[field] ?? '');

  return normalizedDetail === normalizedField || normalizedDetail === normalizedLabel;
}

function normalizeFieldLikeText(value: string): string {
  return value
    .replace(/\bel campo\b/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function fallbackGapDescription(gap: Pick<AlphaGap, 'field' | 'gap_kind' | 'module'>): string {
  const fieldLabel = FIELD_LABELS[gap.field] ?? gap.field.replace(/[_-]+/g, ' ');

  if (gap.gap_kind === 'ambiguous_information') {
    return `Falta aclarar ${fieldLabel} para que la propuesta no dependa de interpretaciones.`;
  }

  if (gap.gap_kind === 'needs_user_confirmation') {
    return `Conviene confirmar ${fieldLabel} antes de avanzar.`;
  }

  return `Falta completar ${fieldLabel} para continuar con esta fase.`;
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const FIELD_LABELS: Record<string, string> = {
  problem_owner: 'responsable operativo',
  problem_statement: 'problema concreto',
  evidence_of_problem: 'evidencia del problema',
  scope: 'alcance',
  current_alternatives: 'alternativas actuales',
  target_user: 'usuario destinatario',
  solution_summary: 'resumen de la solución',
  how_it_works: 'funcionamiento de la solución',
  workflow_change: 'cambio en el flujo de trabajo',
  current_solutions: 'soluciones actuales',
  value_differential: 'valor diferencial',
  scope_limits: 'límites de alcance',
  assumptions: 'supuestos pendientes',
  uncertainties: 'dudas abiertas',
  missing_information: 'información pendiente',
  ambiguities: 'información ambigua',
  personal_or_health_data: 'datos personales o de salud',
  data_sources: 'fuentes de datos',
  ai_system_role: 'papel de la IA',
  validation_evidence: 'evidencia de validación',
  privacy_governance: 'gobernanza de privacidad',
  cybersecurity_controls: 'controles de ciberseguridad',
  regulatory_context: 'contexto de revisión',
  human_review_plan: 'plan de revisión humana',
  privacy_controls: 'controles de privacidad',
  data_categories: 'tipos de datos',
  ai_use: 'uso de IA',
  validation_plan: 'plan de validación',
  human_review: 'revisión humana',
  intended_use_claims: 'uso previsto',
  clinical_decision_role: 'papel en decisiones clínicas',
  evidence_needed: 'evidencia necesaria',
  human_resources: 'recursos humanos',
  technical_resources: 'recursos técnicos',
  pilot_context: 'contexto del piloto',
  pilot_environment: 'entorno del piloto',
  dependencies: 'dependencias',
  indicators_metrics: 'indicadores y métricas',
  constraints: 'restricciones',
  resource_needs: 'recursos necesarios',
  success_metrics: 'indicadores de éxito',
  operational_risks: 'riesgos operativos',
};
