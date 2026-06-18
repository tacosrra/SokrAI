import type {
  AlphaModule,
  GapAbsence,
  GapKind,
  GapOrigin,
  GapStatus,
  ProposalSource,
  StructuredBrief,
} from '../contracts/types';

export interface InitialGapCandidate {
  module: AlphaModule;
  gap_kind: GapKind;
  gap_status: GapStatus;
  origin: GapOrigin;
  field: string;
  description: string;
  absence: GapAbsence;
  question_hint?: string;
  source_refs: ProposalSource[];
  audit_refs: [];
  warnings: string[];
}

export interface DetectInitialGapCandidatesInput {
  structuredBrief: StructuredBrief;
  sources?: ProposalSource[];
  maxCandidates?: number;
}

export interface FilteredInitialGapCandidate {
  module: AlphaModule;
  gap_kind: GapKind;
  origin: GapOrigin;
  field: string;
  reason: 'forbidden_scope';
}

export interface InitialGapAnalysisResult {
  candidates: InitialGapCandidate[];
  filtered: FilteredInitialGapCandidate[];
}

interface FieldRule {
  module: AlphaModule;
  field: keyof StructuredBrief;
  question: string;
  description: string;
}

const MAX_INITIAL_GAPS = 12;
const GENERIC_GAP_FIELDS = new Set(['missing_information', 'ambiguities']);
const STRUCTURED_BRIEF_GAP_ORIGINS = new Set<GapOrigin>([
  'structured_brief_field',
  'structured_brief_missing_information',
  'structured_brief_ambiguity',
]);

const PROBLEM_FIELD_RULES: FieldRule[] = [
  {
    module: 'problem',
    field: 'problem_owner',
    question: 'Que persona o equipo vive hoy este problema y responde por sus consecuencias?',
    description:
      'Falta aclarar quien sera la persona o equipo responsable de operar esta propuesta, tomar decisiones y responder por sus resultados.',
  },
  {
    module: 'problem',
    field: 'problem_statement',
    question: 'Cual es el problema concreto que ocurre hoy, sin describir todavia la solucion deseada?',
    description:
      'Falta describir el problema actual con palabras concretas, separado de la solucion que se quiere construir.',
  },
  {
    module: 'problem',
    field: 'evidence_of_problem',
    question: 'Que evidencia observable tienes de que este problema existe y genera impacto real?',
    description:
      'Falta aportar evidencia concreta de que el problema existe, como datos, ejemplos, frecuencia, impacto o incidencias observadas.',
  },
  {
    module: 'problem',
    field: 'scope',
    question: 'En que contexto exacto aparece este problema y que casos quedarian fuera del alcance?',
    description:
      'Falta delimitar el alcance: donde ocurre el problema, que casos incluye y que queda fuera del primer analisis.',
  },
  {
    module: 'problem',
    field: 'current_alternatives',
    question: 'Como se intenta resolver hoy este problema y que limitaciones tienen esas alternativas actuales?',
    description:
      'Falta explicar como se gestiona hoy el problema y por que las alternativas actuales no son suficientes.',
  },
];

const SOLUTION_FIELD_RULES: FieldRule[] = [
  {
    module: 'solution',
    field: 'target_user',
    question: 'Que usuario o equipo usara directamente la solucion propuesta?',
    description: 'Falta confirmar quien usara directamente la solucion propuesta.',
  },
];

const ARRAY_FIELD_RULES: FieldRule[] = [
  {
    module: 'problem',
    field: 'assumptions',
    question: 'Que supuesto importante estais dando por cierto hoy y todavia no habeis validado?',
    description: 'Falta identificar que supuestos importantes todavia no se han validado.',
  },
];

const FIELD_TEXT_ALIASES: Partial<Record<keyof StructuredBrief, string[]>> = {
  problem_owner: [
    'persona responsable',
    'equipo responsable',
    'responsable operativo',
    'responsable final',
    'responsable del problema',
    'owner del problema',
    'quien responde',
    'quien valida',
    'quien es el responsable',
    'who is responsible',
    'accountable owner',
  ],
  problem_statement: [
    'problema concreto',
    'problema actual',
    'definicion del problema',
    'descripcion del problema',
    'problem definition',
    'concrete problem',
  ],
  evidence_of_problem: [
    'evidencia del problema',
    'evidencia observable',
    'evidencia disponible',
    'datos del problema',
    'problem evidence',
  ],
  scope: [
    'alcance',
    'limites del problema',
    'contexto exacto',
    'fuera de alcance',
    'problem scope',
  ],
  current_alternatives: [
    'alternativas actuales',
    'soluciones actuales',
    'como se gestiona hoy',
    'workaround',
    'current workaround',
  ],
  assumptions: [
    'supuestos',
    'supuestos pendientes',
    'assumptions',
  ],
  target_user: [
    'usuario destinatario',
    'usuario objetivo',
    'quien usara',
    'target stakeholder',
    'direct user',
  ],
};

// Alpha v1 only suppresses candidates for explicitly out-of-scope modules.
// Ordinary clinical or hospital problem context must still produce Alpha gaps.
const FORBIDDEN_SCOPE_PATTERNS = [
  /regulator/i,
  /regulatory/i,
  /\bclinic pilot\b/i,
  /\bhospital_clinic_v1\b/i,
  /clinical classification/i,
  /medical device/i,
  /cost/i,
  /budget/i,
  /resource/i,
  /pilot/i,
  /rag/i,
  /retrieval/i,
  /legal/i,
  /privacy dictamen/i,
  /dictamen/i,
  /pdf/i,
];

/**
 * Alpha deterministic domain entry point for initial gap detection.
 *
 * Detection runs in stable order: missing structured fields, explicit
 * missing_information items, ambiguities, then source-backed confirmation
 * gaps. Only confirmation gaps may carry source_refs, because absence-backed
 * gaps must not invent evidence. Candidates for Alpha v1 out-of-scope modules
 * are filtered before dedupe, then remaining candidates are deduped by
 * module/field concept and truncated to the configured max candidate limit.
 */
export function detectInitialGapCandidates(input: DetectInitialGapCandidatesInput): InitialGapCandidate[] {
  return analyzeInitialGapCandidates(input).candidates;
}

export function analyzeInitialGapCandidates(input: DetectInitialGapCandidatesInput): InitialGapAnalysisResult {
  const maxCandidates = input.maxCandidates ?? MAX_INITIAL_GAPS;
  const analyzedScope = filterForbiddenScope([
    ...detectMissingFieldGaps(input.structuredBrief),
    ...detectMissingInformationGaps(input.structuredBrief),
    ...detectAmbiguityGaps(input.structuredBrief),
    ...detectSourceConfirmationGaps(input.structuredBrief, input.sources ?? []),
  ]);
  const candidates = dedupeGapCandidates(analyzedScope.kept).slice(0, maxCandidates);

  return {
    candidates,
    filtered: analyzedScope.filtered,
  };
}

export function buildGapQuestionHint(field: string, module: AlphaModule): string {
  const rule = [...PROBLEM_FIELD_RULES, ...SOLUTION_FIELD_RULES, ...ARRAY_FIELD_RULES].find(
    (item) => item.module === module && item.field === field,
  );

  if (rule) {
    return rule.question;
  }

  if (module === 'solution') {
    return 'Que dato falta confirmar para describir la solucion sin inventar informacion?';
  }

  return 'Que dato falta confirmar para definir el problema sin inventar informacion?';
}

export function dedupeGapCandidates(candidates: InitialGapCandidate[]): InitialGapCandidate[] {
  const seen = new Set<string>();
  const deduped: InitialGapCandidate[] = [];

  for (const candidate of candidates) {
    const key = gapCandidateDedupeKey(candidate);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function gapCandidateDedupeKey(candidate: InitialGapCandidate): string {
  if (STRUCTURED_BRIEF_GAP_ORIGINS.has(candidate.origin) && !GENERIC_GAP_FIELDS.has(candidate.field)) {
    return `${candidate.module}:${candidate.field}:structured_brief`;
  }

  return `${candidate.module}:${candidate.field}:${candidate.gap_kind}:${candidate.origin}`;
}

export function filterForbiddenScope(candidates: InitialGapCandidate[]): {
  kept: InitialGapCandidate[];
  filtered: FilteredInitialGapCandidate[];
} {
  const kept: InitialGapCandidate[] = [];
  const filtered: FilteredInitialGapCandidate[] = [];

  for (const candidate of candidates) {
    const combinedText = [
      candidate.field,
      candidate.description,
      candidate.question_hint ?? '',
      ...candidate.warnings,
    ].join(' ');

    if (FORBIDDEN_SCOPE_PATTERNS.some((pattern) => pattern.test(combinedText))) {
      filtered.push({
        module: candidate.module,
        gap_kind: candidate.gap_kind,
        origin: candidate.origin,
        field: candidate.field,
        reason: 'forbidden_scope',
      });
      continue;
    }

    kept.push(candidate);
  }

  return { kept, filtered };
}

function detectMissingFieldGaps(brief: StructuredBrief): InitialGapCandidate[] {
  const candidates: InitialGapCandidate[] = [];

  for (const rule of [...PROBLEM_FIELD_RULES, ...SOLUTION_FIELD_RULES]) {
    if (!isBlank(brief[rule.field])) {
      continue;
    }

    candidates.push(makeMissingCandidate(rule, 'structured_brief_field'));
  }

  for (const rule of ARRAY_FIELD_RULES) {
    const value = brief[rule.field];
    if (!Array.isArray(value) || value.some((item) => !isBlank(item))) {
      continue;
    }

    candidates.push(makeMissingCandidate(rule, 'structured_brief_field'));
  }

  return candidates;
}

function detectMissingInformationGaps(brief: StructuredBrief): InitialGapCandidate[] {
  return brief.missing_information
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const rule = findRuleForText(item) ?? {
        module: 'problem' as const,
        field: 'missing_information' as keyof StructuredBrief,
        question: buildGapQuestionHint('missing_information', 'problem'),
        description: `Falta completar esta informacion de la propuesta inicial: ${item}`,
      };

      return makeMissingCandidate(rule, 'structured_brief_missing_information', rule.description);
    });
}

function detectAmbiguityGaps(brief: StructuredBrief): InitialGapCandidate[] {
  return brief.ambiguities
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const rule = findRuleForText(item);
      const module = rule?.module ?? 'problem';
      const field = rule?.field ? String(rule.field) : 'ambiguities';

      return {
        module,
        gap_kind: 'ambiguous_information',
        gap_status: 'open',
        origin: 'structured_brief_ambiguity',
        field,
        description: buildAmbiguityDescription(field, item),
        absence: presentAbsence(),
        question_hint: buildGapQuestionHint(field, module),
        source_refs: [],
        audit_refs: [],
        warnings: [],
      };
    });
}

function detectSourceConfirmationGaps(brief: StructuredBrief, sources: ProposalSource[]): InitialGapCandidate[] {
  const primarySource = sources.find((source) => source.span) ?? sources[0];

  if (!primarySource || isBlank(brief.target_user)) {
    return [];
  }

  return [
    {
      module: 'solution',
      gap_kind: 'needs_user_confirmation',
      gap_status: 'open',
      origin: 'proposal_source',
      field: 'target_user',
      description:
        'Conviene confirmar que el usuario destinatario indicado coincide con el material aportado.',
      absence: presentAbsence(),
      question_hint: buildGapQuestionHint('target_user', 'solution'),
      source_refs: [primarySource],
      audit_refs: [],
      warnings: [],
    },
  ];
}

function makeMissingCandidate(
  rule: FieldRule,
  origin: Extract<GapOrigin, 'structured_brief_field' | 'structured_brief_missing_information'>,
  description = rule.description,
): InitialGapCandidate {
  return {
    module: rule.module,
    gap_kind: 'missing_information',
    gap_status: 'open',
    origin,
    field: String(rule.field),
    description,
    absence: {
      is_absent: true,
      checked_fields: [String(rule.field)],
      reason: 'No se encontro esta informacion en el resumen inicial disponible.',
    },
    question_hint: rule.question,
    source_refs: [],
    audit_refs: [],
    warnings: [],
  };
}

function buildAmbiguityDescription(field: string, item: string): string {
  const fieldSpecificIntro = gapDescriptionForField(field);

  if (fieldSpecificIntro) {
    return `${fieldSpecificIntro} Punto detectado: ${item}`;
  }

  return `Falta aclarar una parte de la propuesta inicial que puede interpretarse de varias formas: ${item}`;
}

function gapDescriptionForField(field: string): string | null {
  return [...PROBLEM_FIELD_RULES, ...SOLUTION_FIELD_RULES, ...ARRAY_FIELD_RULES]
    .find((rule) => rule.field === field)?.description ?? null;
}

function findRuleForText(text: string): FieldRule | undefined {
  const normalizedText = normalizeToken(text);

  return [...PROBLEM_FIELD_RULES, ...SOLUTION_FIELD_RULES, ...ARRAY_FIELD_RULES].find((rule) => {
    const field = String(rule.field);
    const aliases = [field, fieldLabel(field), ...(FIELD_TEXT_ALIASES[rule.field] ?? [])];

    return aliases.some((alias) => normalizedText.includes(normalizeToken(alias)));
  });
}

function fieldLabel(field: string): string {
  return field.replace(/_/g, ' ');
}

function presentAbsence(): GapAbsence {
  return {
    is_absent: false,
    checked_fields: [],
    reason: '',
  };
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
