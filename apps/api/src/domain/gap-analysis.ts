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

interface FieldRule {
  module: AlphaModule;
  field: keyof StructuredBrief;
  question: string;
  description: string;
}

const MAX_INITIAL_GAPS = 12;

const PROBLEM_FIELD_RULES: FieldRule[] = [
  {
    module: 'problem',
    field: 'problem_owner',
    question: 'Que persona o equipo vive hoy este problema y responde por sus consecuencias?',
    description: 'The problem owner is missing from the structured brief.',
  },
  {
    module: 'problem',
    field: 'problem_statement',
    question: 'Cual es el problema concreto que ocurre hoy, sin describir todavia la solucion deseada?',
    description: 'The concrete problem statement is missing from the structured brief.',
  },
  {
    module: 'problem',
    field: 'evidence_of_problem',
    question: 'Que evidencia observable tienes de que este problema existe y genera impacto real?',
    description: 'Observable evidence of the problem is missing from the structured brief.',
  },
  {
    module: 'problem',
    field: 'scope',
    question: 'En que contexto exacto aparece este problema y que casos quedarian fuera del alcance?',
    description: 'The problem scope is missing from the structured brief.',
  },
  {
    module: 'problem',
    field: 'current_alternatives',
    question: 'Como se intenta resolver hoy este problema y que limitaciones tienen esas alternativas actuales?',
    description: 'Current alternatives are missing from the structured brief.',
  },
];

const SOLUTION_FIELD_RULES: FieldRule[] = [
  {
    module: 'solution',
    field: 'target_user',
    question: 'Que usuario o equipo usara directamente la solucion propuesta?',
    description: 'The direct target user is missing from the structured brief.',
  },
];

const ARRAY_FIELD_RULES: FieldRule[] = [
  {
    module: 'problem',
    field: 'assumptions',
    question: 'Que supuesto importante estais dando por cierto hoy y todavia no habeis validado?',
    description: 'Major assumptions are missing from the structured brief.',
  },
];

const FORBIDDEN_SCOPE_PATTERNS = [
  /regulator/i,
  /regulatory/i,
  /clinic/i,
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

export function detectInitialGapCandidates(input: DetectInitialGapCandidatesInput): InitialGapCandidate[] {
  const maxCandidates = input.maxCandidates ?? MAX_INITIAL_GAPS;
  const candidates = filterForbiddenScope([
    ...detectMissingFieldGaps(input.structuredBrief),
    ...detectMissingInformationGaps(input.structuredBrief),
    ...detectAmbiguityGaps(input.structuredBrief),
    ...detectSourceConfirmationGaps(input.structuredBrief, input.sources ?? []),
  ]);

  return dedupeGapCandidates(candidates).slice(0, maxCandidates);
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
    const key = `${candidate.module}:${candidate.field}:${candidate.gap_kind}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

export function filterForbiddenScope(candidates: InitialGapCandidate[]): InitialGapCandidate[] {
  return candidates.filter((candidate) => {
    const combinedText = [
      candidate.field,
      candidate.description,
      candidate.question_hint ?? '',
      ...candidate.warnings,
    ].join(' ');

    return !FORBIDDEN_SCOPE_PATTERNS.some((pattern) => pattern.test(combinedText));
  });
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
        description: `The structured brief flags missing information: ${item}`,
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
        description: `The structured brief flags ambiguous information: ${item}`,
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
      description: 'The target user is present and should be confirmed against the submitted source material.',
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
      reason: 'Required information was not found in the available structured brief.',
    },
    question_hint: rule.question,
    source_refs: [],
    audit_refs: [],
    warnings: [],
  };
}

function findRuleForText(text: string): FieldRule | undefined {
  const normalizedText = normalizeToken(text);

  return [...PROBLEM_FIELD_RULES, ...SOLUTION_FIELD_RULES, ...ARRAY_FIELD_RULES].find((rule) => {
    const field = String(rule.field);
    return normalizedText.includes(normalizeToken(field)) || normalizedText.includes(normalizeToken(fieldLabel(field)));
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
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
