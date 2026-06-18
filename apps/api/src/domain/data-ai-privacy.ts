import type {
  AlphaGap,
  DataAiPrivacyState,
  DataAiPrivacyTurn,
  GeneratedSection,
  ProposalSource,
} from '../contracts/types';
import { enforceSingleQuestion, isVagueAnswer } from './problem-definition';
import {
  ensureDistinctNextQuestion,
  selectNonRepeatedQuestion,
} from './conversation-question';

export const DATA_AI_PRIVACY_REVIEW_WARNING = 'requires competent human review';

const DATA_AI_PRIVACY_FIELD_PRIORITY = [
  'personal_or_health_data',
  'data_sources',
  'ai_system_role',
  'validation_evidence',
  'privacy_governance',
  'cybersecurity_controls',
  'regulatory_context',
  'human_review_plan',
  'assumptions',
  'uncertainties',
] as const;

const MIN_FIELD_LENGTH = 8;
const MAX_OPEN_UNCERTAINTIES_FOR_COMPLETION = 2;

const FORBIDDEN_OUTPUT_PATTERNS = [
  /\bdictamen\b/i,
  /\bopinion\s+(legal|regulatoria|clinica|de privacidad)\b/i,
  /\bcompliant\b/i,
  /\bnon[-\s]?compliant\b/i,
  /\bcumple\b/i,
  /\bincumple\b/i,
  /\bcumplimiento\s+definitivo\b/i,
  /\bincumplimiento\s+definitivo\b/i,
  /\bconforme\b/i,
  /\bno\s+conforme\b/i,
  /\bapproved\b/i,
  /\brejected\b/i,
  /\bapproval\b/i,
  /\brejection\b/i,
  /\baprobado\b/i,
  /\baprobada\b/i,
  /\brechazado\b/i,
  /\brechazada\b/i,
  /\bscore\b/i,
  /\bscoring\b/i,
  /\bpuntuacion\b/i,
  /\branking\b/i,
  /\bpriorizacion\b/i,
  /\bmedical device class\b/i,
  /\bclass\s+(i|ii|iii|iia|iib)\b/i,
  /\bclase\s+(i|ii|iii|iia|iib)\b/i,
  /\bmdr classified\b/i,
  /\bclasificad[oa]\s+como\s+(producto sanitario|medical device)\b/i,
  /\b(producto sanitario|medical device)\s+clase\s+(i|ii|iii|iia|iib)\b/i,
  /\bno\s+es\s+(producto sanitario|medical device)\b/i,
  /\bclassified as a medical device\b/i,
  /\bnot a medical device\b/i,
  /\blegal opinion\b/i,
  /\bregulatory opinion\b/i,
];

export interface DataAiPrivacyGapStatusChange {
  gapId: string;
  gapStatus: 'in_progress' | 'resolved';
  resolvedByTurnId?: string;
}

export type DataAiPrivacyGuardrailInterventionReason =
  | 'forbidden_output_replaced'
  | 'vague_answer_reasked'
  | 'premature_completion_blocked'
  | 'missing_question_fallback'
  | 'repeated_question_rephrased';

export interface DataAiPrivacyGuardrailIntervention {
  applied: boolean;
  reasons: DataAiPrivacyGuardrailInterventionReason[];
  normalizedFields: string[];
  fallbackQuestionApplied: boolean;
  forcedAgentStatus?: DataAiPrivacyTurn['agent_status'];
  competentHumanReviewRequired: true;
  scope: 'hospital_clinic_v1_gap_question_framework';
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function hasEnoughText(value: string, minLength = MIN_FIELD_LENGTH): boolean {
  return value.trim().length >= minLength;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function normalizeForSensitiveSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function hasForbiddenOutput(value: string): boolean {
  const normalized = normalizeForSensitiveSearch(value);

  return FORBIDDEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function scrubForbiddenOutput(value: string): { value: string; changed: boolean } {
  const trimmed = value.trim();

  if (!hasForbiddenOutput(trimmed)) {
    return { value: trimmed, changed: false };
  }

  return { value: DATA_AI_PRIVACY_REVIEW_WARNING, changed: true };
}

function sanitizeStringArray(values: string[]): { values: string[]; changed: boolean } {
  let changed = false;
  const sanitized = values.map((value) => {
    const result = scrubForbiddenOutput(value);
    changed = changed || result.changed;
    return result.value;
  });

  return {
    values: dedupe(sanitized),
    changed,
  };
}

function sanitizeState(
  state: DataAiPrivacyState,
): { state: DataAiPrivacyState; changed: boolean; changedFields: string[] } {
  const assumptions = sanitizeStringArray(state.assumptions);
  const uncertainties = sanitizeStringArray(state.uncertainties);
  const fields = {
    personal_or_health_data: scrubForbiddenOutput(state.personal_or_health_data),
    data_sources: scrubForbiddenOutput(state.data_sources),
    ai_system_role: scrubForbiddenOutput(state.ai_system_role),
    validation_evidence: scrubForbiddenOutput(state.validation_evidence),
    privacy_governance: scrubForbiddenOutput(state.privacy_governance),
    cybersecurity_controls: scrubForbiddenOutput(state.cybersecurity_controls),
    regulatory_context: scrubForbiddenOutput(state.regulatory_context),
    human_review_plan: scrubForbiddenOutput(state.human_review_plan),
  };
  const changed =
    assumptions.changed ||
    uncertainties.changed ||
    Object.values(fields).some((field) => field.changed);
  const changedFields = [
    ...Object.entries(fields)
      .filter(([, field]) => field.changed)
      .map(([fieldName]) => fieldName),
    ...(assumptions.changed ? ['assumptions'] : []),
    ...(uncertainties.changed ? ['uncertainties'] : []),
  ];

  return {
    changed,
    changedFields,
    state: {
      personal_or_health_data: fields.personal_or_health_data.value,
      data_sources: fields.data_sources.value,
      ai_system_role: fields.ai_system_role.value,
      validation_evidence: fields.validation_evidence.value,
      privacy_governance: fields.privacy_governance.value,
      cybersecurity_controls: fields.cybersecurity_controls.value,
      regulatory_context: fields.regulatory_context.value,
      human_review_plan: fields.human_review_plan.value,
      assumptions: assumptions.values,
      uncertainties: uncertainties.values,
      requires_competent_human_review: true,
    },
  };
}

function hasResolvedDataAiPrivacyGapField(gap: AlphaGap, state: DataAiPrivacyState): boolean {
  return !computeDataAiPrivacyMissingInformation(state).includes(gap.field) &&
    DATA_AI_PRIVACY_FIELD_PRIORITY.includes(gap.field as (typeof DATA_AI_PRIVACY_FIELD_PRIORITY)[number]);
}

function sortDataAiPrivacyGaps(left: AlphaGap, right: AlphaGap): number {
  const leftPriority = DATA_AI_PRIVACY_FIELD_PRIORITY.indexOf(
    left.field as (typeof DATA_AI_PRIVACY_FIELD_PRIORITY)[number],
  );
  const rightPriority = DATA_AI_PRIVACY_FIELD_PRIORITY.indexOf(
    right.field as (typeof DATA_AI_PRIVACY_FIELD_PRIORITY)[number],
  );
  const normalizedLeft = leftPriority === -1 ? DATA_AI_PRIVACY_FIELD_PRIORITY.length : leftPriority;
  const normalizedRight = rightPriority === -1 ? DATA_AI_PRIVACY_FIELD_PRIORITY.length : rightPriority;

  if (normalizedLeft !== normalizedRight) {
    return normalizedLeft - normalizedRight;
  }

  return left.created_at.localeCompare(right.created_at) || left.gap_id.localeCompare(right.gap_id);
}

function isAllowedDataAiPrivacySource(source: ProposalSource): boolean {
  return source.source_kind === 'pasted_text' ||
    source.source_kind === 'uploaded_file' ||
    source.source_kind === 'extracted_text' ||
    source.source_kind === 'user_answer' ||
    source.source_kind === 'generated_section';
}

export function emptyDataAiPrivacyState(): DataAiPrivacyState {
  return {
    personal_or_health_data: '',
    data_sources: '',
    ai_system_role: '',
    validation_evidence: '',
    privacy_governance: '',
    cybersecurity_controls: '',
    regulatory_context: '',
    human_review_plan: '',
    assumptions: [],
    uncertainties: [],
    requires_competent_human_review: true,
  };
}

export function computeDataAiPrivacyMissingInformation(state: DataAiPrivacyState): string[] {
  const missing: string[] = [];

  for (const field of DATA_AI_PRIVACY_FIELD_PRIORITY) {
    if (field === 'assumptions') {
      if (state.assumptions.length === 0) {
        missing.push(field);
      }
      continue;
    }

    if (field === 'uncertainties') {
      if (state.uncertainties.length === 0) {
        missing.push(field);
      }
      continue;
    }

    if (isBlank(state[field])) {
      missing.push(field);
    }
  }

  if (!state.requires_competent_human_review) {
    missing.push('human_review_plan');
  }

  return Array.from(new Set(missing));
}

export function buildDataAiPrivacyFallbackQuestionCandidates(state: DataAiPrivacyState): string[] {
  const missing = computeDataAiPrivacyMissingInformation(state);

  if (missing.includes('personal_or_health_data')) {
    return [
      'Que datos personales o de salud trataria la propuesta y quien los aportaria?',
      'Que tipo de datos sensibles entrarian en juego y quien los genera o custodia?',
      'Que informacion personal o clinica usaria la propuesta en la practica?',
    ];
  }

  if (missing.includes('data_sources')) {
    return [
      'De que fuentes vendrian los datos y que datos quedarian fuera del alcance inicial?',
      'De donde saldrian los datos en el piloto y que fuentes no se usarian al principio?',
      'Que origenes de datos estan previstos y cuales quedan excluidos?',
    ];
  }

  if (missing.includes('ai_system_role')) {
    return [
      'Que papel tendria la IA en el flujo y que decisiones seguirian bajo revision humana?',
      'Que haria la IA de forma automatica y que pasos seguirian dependiendo de una persona?',
      'En que punto del flujo interviene la IA y donde se mantiene supervision humana?',
    ];
  }

  if (missing.includes('validation_evidence')) {
    return [
      'Que evidencia o validacion existe hoy sobre datos, IA o funcionamiento previsto?',
      'Que pruebas, pilotos o referencias respaldan hoy el uso previsto de datos o IA?',
      'Que validacion concreta ya existe y que sigue pendiente?',
    ];
  }

  if (missing.includes('privacy_governance')) {
    return [
      'Que responsable o equipo revisaria privacidad, base de datos y uso secundario de la informacion?',
      'Quien responderia por privacidad y gobernanza de datos en este piloto?',
      'Que rol o comite revisaria el tratamiento y reutilizacion de la informacion?',
    ];
  }

  if (missing.includes('cybersecurity_controls')) {
    return [
      'Que controles de acceso, seguridad o trazabilidad estan previstos para esta primera version?',
      'Como se controlaria el acceso, la trazabilidad y la seguridad de los datos?',
      'Que medidas minimas de ciberseguridad estan contempladas al inicio?',
    ];
  }

  if (missing.includes('regulatory_context')) {
    return [
      'Que incertidumbre regulatoria concreta debe revisar una persona competente antes del piloto?',
      'Que duda regulatoria sigue abierta y requiere revision humana competente?',
      'Que punto normativo o de cumplimiento sigue sin aclarar para el piloto?',
    ];
  }

  if (missing.includes('human_review_plan')) {
    return [
      'Quien haria la revision humana competente y en que punto del flujo se activaria?',
      'Que persona o rol realizaria la supervision humana y cuando entraria en juego?',
      'En que momento del flujo una persona competente revisaria la salida?',
    ];
  }

  if (missing.includes('assumptions')) {
    return [
      'Que supuesto sensible sobre datos, IA o privacidad sigue sin validar?',
      'Que creéis verdad sobre datos o IA pero todavia no habeis comprobado?',
      'Que hipotesis sobre privacidad o uso de datos sigue abierta?',
    ];
  }

  if (missing.includes('uncertainties')) {
    return [
      'Que incertidumbre sensible queda abierta y requiere revision humana competente?',
      'Que duda sobre datos, IA o privacidad conviene cerrar antes del piloto?',
      'Que punto sensible sigue sin resolver para una revision humana competente?',
    ];
  }

  const firstUncertainty = state.uncertainties[0];

  if (firstUncertainty) {
    return [
      `Puedes concretar esta incertidumbre antes de revision humana competente: ${firstUncertainty}?`,
      `Que ejemplo concreto aclararia esta incertidumbre: ${firstUncertainty}?`,
      `Que detalle adicional cerraria este punto pendiente: ${firstUncertainty}?`,
    ];
  }

  return [
    'Que detalle falta para cerrar los gaps de datos, IA y privacidad sin emitir una decision definitiva?',
    'Que parte de datos, IA o privacidad sigue poco clara y conviene precisar ahora?',
    'Que ejemplo concreto ayudaria a cerrar los gaps de privacidad y datos?',
  ];
}

export function buildDataAiPrivacyFallbackQuestion(
  state: DataAiPrivacyState,
  recentQuestions: string[] = [],
): string {
  return selectNonRepeatedQuestion(
    buildDataAiPrivacyFallbackQuestionCandidates(state),
    recentQuestions,
  );
}

export function evaluateDataAiPrivacyCompletion(state: DataAiPrivacyState): boolean {
  return (
    hasEnoughText(state.personal_or_health_data) &&
    hasEnoughText(state.data_sources) &&
    hasEnoughText(state.ai_system_role) &&
    hasEnoughText(state.validation_evidence) &&
    hasEnoughText(state.privacy_governance) &&
    hasEnoughText(state.cybersecurity_controls) &&
    hasEnoughText(state.regulatory_context) &&
    hasEnoughText(state.human_review_plan) &&
    state.assumptions.length > 0 &&
    state.requires_competent_human_review &&
    state.uncertainties.length <= MAX_OPEN_UNCERTAINTIES_FOR_COMPLETION
  );
}

/**
 * Selects at most three unresolved data/AI/privacy gap refs for the next
 * persisted question, keeping the hospital_clinic_v1 gap lifecycle bounded and
 * auditable.
 */
export function selectDataAiPrivacyGapRefs(gaps: AlphaGap[], state: DataAiPrivacyState): string[] {
  const missing = computeDataAiPrivacyMissingInformation(state);

  return gaps
    .filter((gap) =>
      gap.module === 'data_ai_privacy' &&
      (gap.gap_status === 'open' || gap.gap_status === 'in_progress') &&
      !hasResolvedDataAiPrivacyGapField(gap, state) &&
      (
        missing.includes(gap.field) ||
        gap.gap_kind === 'needs_user_confirmation' ||
        gap.gap_kind === 'ambiguous_information'
      ),
    )
    .sort(sortDataAiPrivacyGaps)
    .slice(0, 3)
    .map((gap) => gap.gap_id);
}

/**
 * Classifies only bounded data/AI/privacy gap lifecycle transitions that can be
 * audited from persisted turns, without inferring compliance or final status.
 */
export function classifyDataAiPrivacyGapStatuses(
  gaps: AlphaGap[],
  state: DataAiPrivacyState,
  answeredTurnId?: string,
): DataAiPrivacyGapStatusChange[] {
  const candidateGapRefs = new Set(selectDataAiPrivacyGapRefs(gaps, state));
  const phaseComplete = evaluateDataAiPrivacyCompletion(state);
  const changes: DataAiPrivacyGapStatusChange[] = [];

  for (const gap of gaps.filter((item) => item.module === 'data_ai_privacy').sort(sortDataAiPrivacyGaps)) {
    if (gap.gap_status === 'resolved' || gap.gap_status === 'deferred' || gap.gap_status === 'not_applicable') {
      continue;
    }

    if (answeredTurnId && (hasResolvedDataAiPrivacyGapField(gap, state) || phaseComplete)) {
      changes.push({
        gapId: gap.gap_id,
        gapStatus: 'resolved',
        resolvedByTurnId: answeredTurnId,
      });
      continue;
    }

    if (candidateGapRefs.has(gap.gap_id) && gap.gap_status === 'open') {
      changes.push({
        gapId: gap.gap_id,
        gapStatus: 'in_progress',
      });
    }
  }

  return changes;
}

export function buildDataAiPrivacySectionSourceRefs(
  initialSources: ProposalSource[],
  userAnswerSources: ProposalSource[],
  problemSection?: GeneratedSection | null,
  solutionSection?: GeneratedSection | null,
): ProposalSource[] {
  const sourcesById = new Map<string, ProposalSource>();

  for (const source of [
    ...initialSources,
    ...userAnswerSources,
    ...(problemSection?.source_refs ?? []),
    ...(solutionSection?.source_refs ?? []),
  ]) {
    if (isAllowedDataAiPrivacySource(source)) {
      sourcesById.set(source.source_id, source);
    }
  }

  return Array.from(sourcesById.values());
}

/**
 * Deterministically renders the hospital_clinic_v1 data/AI/privacy gap section
 * after model output normalization. The section is a gap/question framework, not
 * a legal, regulatory, clinical or privacy dictamen, never states definitive
 * compliance/non-compliance, and always requires competent human review.
 */
export function renderDataAiPrivacySection(
  state: DataAiPrivacyState,
  params: { sourceCount: number; gapCount: number },
): { title: string; contentMarkdown: string; warnings: string[] } {
  const warnings = [DATA_AI_PRIVACY_REVIEW_WARNING];
  const assumptions = state.assumptions.length > 0
    ? state.assumptions.map((assumption) => `- ${assumption}`).join('\n')
    : '- No explicit sensitive assumptions persisted.';
  const uncertainties = state.uncertainties.length > 0
    ? state.uncertainties.map((uncertainty) => `- ${uncertainty}`).join('\n')
    : '- No open sensitive uncertainty persisted.';

  if (params.sourceCount === 0) {
    warnings.push('Data AI privacy section has no internal source references');
  }

  if (params.gapCount === 0) {
    warnings.push('Data AI privacy section has no resolved gap references');
  }

  return {
    title: 'Data, AI and privacy gaps',
    contentMarkdown: [
      '## Personal or health data',
      state.personal_or_health_data,
      '',
      '## Data sources',
      state.data_sources,
      '',
      '## AI system role',
      state.ai_system_role,
      '',
      '## Validation evidence',
      state.validation_evidence,
      '',
      '## Privacy governance',
      state.privacy_governance,
      '',
      '## Cybersecurity controls',
      state.cybersecurity_controls,
      '',
      '## Regulatory context',
      state.regulatory_context,
      '',
      '## Human review plan',
      state.human_review_plan,
      '',
      '## Assumptions',
      assumptions,
      '',
      '## Uncertainties',
      uncertainties,
      '',
      `## Review requirement\n${DATA_AI_PRIVACY_REVIEW_WARNING}`,
    ].join('\n'),
    warnings,
  };
}

export function containsForbiddenDataAiPrivacyOutput(value: unknown): boolean {
  return hasForbiddenOutput(JSON.stringify(value));
}

/**
 * Normalizes model output before persistence for the hospital_clinic_v1
 * data/AI/privacy gap/question framework. It prevents legal, regulatory,
 * clinical or privacy dictamen wording, definitive compliance/non-compliance,
 * and completion without competent-human-review framing.
 */
export function enforceDataAiPrivacyTurnGuardrails(
  turn: DataAiPrivacyTurn,
  latestAnswer?: string,
  options: { recentQuestions?: string[] } = {},
): {
  turn: DataAiPrivacyTurn;
  warnings: string[];
  updatedDataAiPrivacy: DataAiPrivacyState;
  detectedGaps: string[];
  latestAnswerWasVague: boolean;
  intervention: DataAiPrivacyGuardrailIntervention;
} {
  const warnings: string[] = [];
  const recentQuestions = options.recentQuestions ?? [];
  const interventionReasons: DataAiPrivacyGuardrailInterventionReason[] = [];
  const normalizedFields = new Set<string>();
  let fallbackQuestionApplied = false;
  const latestAnswerIsVague = latestAnswer ? isVagueAnswer(latestAnswer) : false;
  const sanitizedState = sanitizeState(turn.updated_data_ai_privacy);
  const sanitizedDiagnosisResult = sanitizeStringArray(turn.diagnosis);
  const sanitizedDiagnosis = sanitizedDiagnosisResult.values.slice(0, 3);
  const sanitizedQuestion = scrubForbiddenOutput(enforceSingleQuestion(turn.next_question));
  const normalizedTurn: DataAiPrivacyTurn = {
    ...turn,
    diagnosis: sanitizedDiagnosis,
    next_question: sanitizedQuestion.value,
    updated_data_ai_privacy: sanitizedState.state,
  };

  if (sanitizedState.changed || sanitizedQuestion.changed || sanitizedDiagnosisResult.changed) {
    warnings.push('Sensitive definitive wording was replaced before persistence');
    interventionReasons.push('forbidden_output_replaced');
    sanitizedState.changedFields.forEach((field) => normalizedFields.add(`updated_data_ai_privacy.${field}`));
    if (sanitizedDiagnosisResult.changed) {
      normalizedFields.add('diagnosis');
    }
    if (sanitizedQuestion.changed) {
      normalizedFields.add('next_question');
    }
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildDataAiPrivacyFallbackQuestion(
      normalizedTurn.updated_data_ai_privacy,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  if (latestAnswerIsVague) {
    warnings.push('Latest data AI privacy answer was vague; clarification was narrowed');
    interventionReasons.push('vague_answer_reasked');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildDataAiPrivacyFallbackQuestion(
      normalizedTurn.updated_data_ai_privacy,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  const isComplete = evaluateDataAiPrivacyCompletion(normalizedTurn.updated_data_ai_privacy);

  if (normalizedTurn.agent_status === 'done' && !isComplete) {
    warnings.push('Model marked data AI privacy lane as done before completion criteria were met');
    interventionReasons.push('premature_completion_blocked');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildDataAiPrivacyFallbackQuestion(
      normalizedTurn.updated_data_ai_privacy,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  if (normalizedTurn.agent_status !== 'done' && !normalizedTurn.next_question) {
    warnings.push('Model did not produce a usable data AI privacy question; fallback question generated');
    interventionReasons.push('missing_question_fallback');
    normalizedTurn.next_question = buildDataAiPrivacyFallbackQuestion(
      normalizedTurn.updated_data_ai_privacy,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  if (normalizedTurn.agent_status === 'done') {
    normalizedTurn.next_question = '';
    normalizedTurn.completion_reason =
      normalizedTurn.completion_reason || 'data AI privacy gaps sufficiently clarified for human review';
  }

  if (normalizedTurn.agent_status !== 'done' && normalizedTurn.next_question) {
    const distinctQuestion = ensureDistinctNextQuestion({
      nextQuestion: normalizedTurn.next_question,
      recentQuestions,
      fallbackCandidates: buildDataAiPrivacyFallbackQuestionCandidates(
        normalizedTurn.updated_data_ai_privacy,
      ),
    });

    if (distinctQuestion.wasRephrased) {
      warnings.push('Next question repeated a previous turn; question was rephrased');
      interventionReasons.push('repeated_question_rephrased');
      normalizedTurn.next_question = distinctQuestion.question;
      fallbackQuestionApplied = true;
    }
  }

  return {
    turn: normalizedTurn,
    warnings: Array.from(new Set([...warnings, DATA_AI_PRIVACY_REVIEW_WARNING])),
    updatedDataAiPrivacy: normalizedTurn.updated_data_ai_privacy,
    detectedGaps: computeDataAiPrivacyMissingInformation(normalizedTurn.updated_data_ai_privacy),
    latestAnswerWasVague: latestAnswerIsVague,
    intervention: {
      applied: interventionReasons.length > 0,
      reasons: Array.from(new Set(interventionReasons)),
      normalizedFields: Array.from(normalizedFields).sort(),
      fallbackQuestionApplied,
      forcedAgentStatus: interventionReasons.length > 0 ? normalizedTurn.agent_status : undefined,
      competentHumanReviewRequired: true,
      scope: 'hospital_clinic_v1_gap_question_framework',
    },
  };
}
