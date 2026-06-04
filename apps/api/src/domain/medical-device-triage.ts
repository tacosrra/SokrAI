import type {
  AlphaGap,
  GeneratedSection,
  MedicalDeviceTriageState,
  MedicalDeviceTriageStatus,
  MedicalDeviceTriageTurn,
  ProposalSource,
  StructuredBrief,
} from '../contracts/types';
import { enforceSingleQuestion, isVagueAnswer } from './problem-definition';

export const MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING = 'requires competent human review';

const MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY = [
  'intended_use_claims',
  'clinical_decision_role',
  'evidence_needed',
  'human_review_plan',
  'uncertainties',
] as const;

const EXPLICIT_SIGNAL_TERMS = [
  'medical device',
  'producto sanitario',
  'software as a medical device',
  'samd',
  'mdr',
  'diagnostic tool',
  'diagnosis support',
  'clinical decision support',
  'decision support',
  'treatment recommendation',
  'patient monitoring',
  'risk stratification',
  'clinical triage',
  'medical recommendation',
  'therapeutic decision',
  'diagnostico',
  'diagnostica',
  'decision clinica',
  'recomendacion terapeutica',
  'monitorizacion de pacientes',
  'estratificacion de riesgo',
  'triaje clinico',
];

const UNCERTAINTY_TERMS = [
  'uncertain',
  'uncertainty',
  'ambiguous',
  'ambiguity',
  'unclear',
  'not clear',
  'needs review',
  'requires review',
  'no esta claro',
  'incertidumbre',
  'ambiguo',
  'ambigua',
  'requiere revision',
  'necesita revision',
];

const CLINICAL_CONTEXT_TERMS = [
  'clinical',
  'clinico',
  'clinica',
  'patient',
  'paciente',
  'hospital',
  'health',
  'salud',
  'symptom',
  'sintoma',
  'triage',
  'triaje',
  'diagnosis',
  'diagnostico',
];

const FORBIDDEN_OUTPUT_PATTERNS = [
  /\bdictamen\b/i,
  /\blegal opinion\b/i,
  /\bregulatory opinion\b/i,
  /\bmedical[-\s]?device opinion\b/i,
  /\bproducto sanitario\b.*\b(clase|clasificacion|decision)\b/i,
  /\bmedical device class\b/i,
  /\bclass\s+(i|ii|iii|iia|iib)\b/i,
  /\bclase\s+(i|ii|iii|iia|iib)\b/i,
  /\bmdr classified\b/i,
  /\bmdr class\b/i,
  /\bclasificad[oa]\s+como\s+(producto sanitario|medical device)\b/i,
  /\b(producto sanitario|medical device)\s+clase\s+(i|ii|iii|iia|iib)\b/i,
  /\bno\s+es\s+(producto sanitario|medical device)\b/i,
  /\b(es|seria|seria probablemente|parece|podria ser|puede ser)\s+(un\s+|una\s+)?producto sanitario\b/i,
  /\bclassified as a medical device\b/i,
  /\bnot a medical device\b/i,
  /\bis a medical device\b/i,
  /\bis\s+(likely|probably|clearly|definitively)\s+a\s+medical device\b/i,
  /\b(would|could|may)\s+be\s+a\s+medical device\b/i,
  /\bcompliant\b/i,
  /\bnon[-\s]?compliant\b/i,
  /\bcumple\b/i,
  /\bincumple\b/i,
  /\bapproved\b/i,
  /\brejected\b/i,
  /\baprobado\b/i,
  /\baprobada\b/i,
  /\brechazado\b/i,
  /\brechazada\b/i,
  /\bscore\b/i,
  /\branking\b/i,
];

const MIN_FIELD_LENGTH = 8;

export interface MedicalDeviceActivationResult {
  triageStatus: MedicalDeviceTriageStatus;
  activationSignals: string[];
  uncertainties: string[];
  needsHumanReview: boolean;
  requiresCompetentHumanReview: boolean;
}

export interface MedicalDeviceTriageGapStatusChange {
  gapId: string;
  gapStatus: 'in_progress' | 'resolved';
  resolvedByTurnId?: string;
}

export type MedicalDeviceTriageGuardrailInterventionReason =
  | 'forbidden_output_replaced'
  | 'vague_answer_reasked'
  | 'premature_completion_blocked'
  | 'missing_question_fallback';

export interface MedicalDeviceTriageGuardrailIntervention {
  applied: boolean;
  reasons: MedicalDeviceTriageGuardrailInterventionReason[];
  normalizedFields: string[];
  fallbackQuestionApplied: boolean;
  forcedAgentStatus?: MedicalDeviceTriageTurn['agent_status'];
  competentHumanReviewRequired: true;
  scope: 'medical_device_triage_gap_question_framework';
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

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function containsAny(value: string, terms: string[]): boolean {
  const normalized = normalizeForSearch(value);
  return terms.some((term) => normalized.includes(normalizeForSearch(term)));
}

function sectionEvidenceText(section?: GeneratedSection | null): string {
  if (!section) {
    return '';
  }

  return section.content_markdown
    .split('\n')
    .filter((line) => {
      const normalized = normalizeForSearch(line.trim());

      return (
        normalized.length > 0 &&
        !normalized.startsWith('##') &&
        normalized !== MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING &&
        normalized !== 'requires competent human review' &&
        normalized !== 'no open sensitive uncertainty persisted.'
      );
    })
    .join('\n');
}

function hasForbiddenOutput(value: string): boolean {
  const normalized = normalizeForSearch(value);
  return FORBIDDEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function scrubForbiddenOutput(value: string): { value: string; changed: boolean } {
  const trimmed = value.trim();

  if (!hasForbiddenOutput(trimmed)) {
    return { value: trimmed, changed: false };
  }

  return { value: MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING, changed: true };
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

function collectContextText(params: {
  structuredBrief: StructuredBrief;
  problemSection?: GeneratedSection | null;
  solutionSection?: GeneratedSection | null;
  dataAiPrivacySection?: GeneratedSection | null;
  sources?: ProposalSource[];
}): string {
  return [
    params.structuredBrief.project_title,
    params.structuredBrief.goal,
    params.structuredBrief.target_user,
    params.structuredBrief.problem_owner,
    params.structuredBrief.problem_statement,
    params.structuredBrief.evidence_of_problem,
    params.structuredBrief.current_alternatives,
    params.structuredBrief.scope,
    ...params.structuredBrief.constraints_known,
    ...params.structuredBrief.assumptions,
    ...params.structuredBrief.ambiguities,
    ...params.structuredBrief.missing_information,
    params.problemSection?.title ?? '',
    sectionEvidenceText(params.problemSection),
    params.solutionSection?.title ?? '',
    sectionEvidenceText(params.solutionSection),
    params.dataAiPrivacySection?.title ?? '',
    sectionEvidenceText(params.dataAiPrivacySection),
    ...(params.sources ?? []).map((source) => [
      source.label,
      JSON.stringify(source.metadata ?? {}),
    ].join(' ')),
  ].join('\n');
}

function findMatchingTerms(value: string, terms: string[]): string[] {
  const normalized = normalizeForSearch(value);
  return dedupe(terms.filter((term) => normalized.includes(normalizeForSearch(term))));
}

function sanitizeState(
  state: MedicalDeviceTriageState,
): { state: MedicalDeviceTriageState; changed: boolean; changedFields: string[] } {
  const activationSignals = sanitizeStringArray(state.activation_signals);
  const uncertainties = sanitizeStringArray(state.uncertainties);
  const intendedUseClaims = sanitizeStringArray(state.intended_use_claims);
  const evidenceNeeded = sanitizeStringArray(state.evidence_needed);
  const clinicalDecisionRole = scrubForbiddenOutput(state.clinical_decision_role);
  const humanReviewPlan = scrubForbiddenOutput(state.human_review_plan);
  const changed =
    activationSignals.changed ||
    uncertainties.changed ||
    intendedUseClaims.changed ||
    evidenceNeeded.changed ||
    clinicalDecisionRole.changed ||
    humanReviewPlan.changed ||
    state.needs_human_review !== true ||
    state.requires_competent_human_review !== true;
  const changedFields = [
    ...(activationSignals.changed ? ['activation_signals'] : []),
    ...(uncertainties.changed ? ['uncertainties'] : []),
    ...(intendedUseClaims.changed ? ['intended_use_claims'] : []),
    ...(evidenceNeeded.changed ? ['evidence_needed'] : []),
    ...(clinicalDecisionRole.changed ? ['clinical_decision_role'] : []),
    ...(humanReviewPlan.changed ? ['human_review_plan'] : []),
    ...(state.needs_human_review !== true ? ['needs_human_review'] : []),
    ...(state.requires_competent_human_review !== true ? ['requires_competent_human_review'] : []),
  ];

  return {
    changed,
    changedFields,
    state: {
      triage_status: state.triage_status,
      activation_signals: activationSignals.values,
      uncertainties: uncertainties.values,
      intended_use_claims: intendedUseClaims.values,
      clinical_decision_role: clinicalDecisionRole.value,
      evidence_needed: evidenceNeeded.values,
      human_review_plan: humanReviewPlan.value,
      needs_human_review: true,
      requires_competent_human_review: true,
    },
  };
}

function hasResolvedMedicalDeviceGapField(gap: AlphaGap, state: MedicalDeviceTriageState): boolean {
  return !computeMedicalDeviceMissingInformation(state).includes(gap.field) &&
    MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY.includes(
      gap.field as (typeof MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY)[number],
    );
}

function sortMedicalDeviceGaps(left: AlphaGap, right: AlphaGap): number {
  const leftPriority = MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY.indexOf(
    left.field as (typeof MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY)[number],
  );
  const rightPriority = MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY.indexOf(
    right.field as (typeof MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY)[number],
  );
  const normalizedLeft = leftPriority === -1 ? MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY.length : leftPriority;
  const normalizedRight = rightPriority === -1 ? MEDICAL_DEVICE_TRIAGE_FIELD_PRIORITY.length : rightPriority;

  if (normalizedLeft !== normalizedRight) {
    return normalizedLeft - normalizedRight;
  }

  return left.created_at.localeCompare(right.created_at) || left.gap_id.localeCompare(right.gap_id);
}

function isAllowedMedicalDeviceSource(source: ProposalSource): boolean {
  return source.source_kind === 'pasted_text' ||
    source.source_kind === 'uploaded_file' ||
    source.source_kind === 'extracted_text' ||
    source.source_kind === 'user_answer' ||
    source.source_kind === 'generated_section';
}

export function emptyMedicalDeviceTriageState(
  triageStatus: MedicalDeviceTriageStatus = 'uncertain',
): MedicalDeviceTriageState {
  const reviewRequired = triageStatus !== 'not_applicable';

  return {
    triage_status: triageStatus,
    activation_signals: [],
    uncertainties: [],
    intended_use_claims: [],
    clinical_decision_role: '',
    evidence_needed: [],
    human_review_plan: reviewRequired ? MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING : '',
    needs_human_review: reviewRequired,
    requires_competent_human_review: reviewRequired,
  };
}

export function evaluateMedicalDeviceActivation(params: {
  structuredBrief: StructuredBrief;
  problemSection?: GeneratedSection | null;
  solutionSection?: GeneratedSection | null;
  dataAiPrivacySection?: GeneratedSection | null;
  sources?: ProposalSource[];
}): MedicalDeviceActivationResult {
  const context = collectContextText(params);
  const activationSignals = findMatchingTerms(context, EXPLICIT_SIGNAL_TERMS);
  const uncertainties = containsAny(context, CLINICAL_CONTEXT_TERMS)
    ? findMatchingTerms(context, UNCERTAINTY_TERMS)
    : [];
  const triageStatus: MedicalDeviceTriageStatus = activationSignals.length > 0
    ? 'applicable'
    : uncertainties.length > 0
      ? 'uncertain'
      : 'not_applicable';
  const needsHumanReview = triageStatus !== 'not_applicable';

  return {
    triageStatus,
    activationSignals,
    uncertainties,
    needsHumanReview,
    requiresCompetentHumanReview: needsHumanReview,
  };
}

export function medicalDeviceStateFromActivation(
  activation: MedicalDeviceActivationResult,
): MedicalDeviceTriageState {
  return {
    ...emptyMedicalDeviceTriageState(activation.triageStatus),
    activation_signals: activation.activationSignals,
    uncertainties: activation.uncertainties,
    human_review_plan: activation.needsHumanReview ? MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING : '',
    needs_human_review: activation.needsHumanReview,
    requires_competent_human_review: activation.requiresCompetentHumanReview,
  };
}

export function computeMedicalDeviceMissingInformation(state: MedicalDeviceTriageState): string[] {
  if (state.triage_status === 'not_applicable') {
    return [];
  }

  const missing: string[] = [];

  if (state.intended_use_claims.length === 0) {
    missing.push('intended_use_claims');
  }

  if (!hasEnoughText(state.clinical_decision_role)) {
    missing.push('clinical_decision_role');
  }

  if (state.evidence_needed.length === 0) {
    missing.push('evidence_needed');
  }

  if (!hasEnoughText(state.human_review_plan)) {
    missing.push('human_review_plan');
  }

  if (state.uncertainties.length === 0 && state.triage_status === 'uncertain') {
    missing.push('uncertainties');
  }

  if (!state.needs_human_review || !state.requires_competent_human_review) {
    missing.push('human_review_plan');
  }

  return Array.from(new Set(missing));
}

export function buildMedicalDeviceFallbackQuestion(state: MedicalDeviceTriageState): string {
  const missing = computeMedicalDeviceMissingInformation(state);

  if (missing.includes('intended_use_claims')) {
    return 'Que uso previsto o afirmaciones funcionales deberia revisar una persona competente?';
  }

  if (missing.includes('clinical_decision_role')) {
    return 'Que papel tendria la propuesta en decisiones clinicas, triaje, diagnostico, seguimiento o recomendacion?';
  }

  if (missing.includes('evidence_needed')) {
    return 'Que evidencia falta para aclarar las senales o incertidumbre sin emitir una clasificacion?';
  }

  if (missing.includes('human_review_plan')) {
    return 'Quien realizaria la revision humana competente y cuando se activaria?';
  }

  if (missing.includes('uncertainties')) {
    return 'Que incertidumbre concreta sobre el uso previsto queda pendiente para revision humana competente?';
  }

  const firstUncertainty = state.uncertainties[0];

  if (firstUncertainty) {
    return `Puedes concretar esta incertidumbre para revision humana competente: ${firstUncertainty}?`;
  }

  return 'Que gap o pregunta queda abierta sobre las senales o incertidumbre de medical-device triage?';
}

export function evaluateMedicalDeviceCompletion(state: MedicalDeviceTriageState): boolean {
  if (state.triage_status === 'not_applicable') {
    return true;
  }

  return (
    computeMedicalDeviceMissingInformation(state).length === 0 &&
    state.needs_human_review &&
    state.requires_competent_human_review
  );
}

/**
 * Selects at most three active medical-device gaps for the next turn.
 * This is a bounded question framework for competent human review, not
 * a legal, regulatory, clinical, MDR, or product-status classification.
 */
export function selectMedicalDeviceGapRefs(gaps: AlphaGap[], state: MedicalDeviceTriageState): string[] {
  const missing = computeMedicalDeviceMissingInformation(state);

  return gaps
    .filter((gap) =>
      gap.module === 'medical_device_triage' &&
      (gap.gap_status === 'open' || gap.gap_status === 'in_progress') &&
      !hasResolvedMedicalDeviceGapField(gap, state) &&
      (
        missing.includes(gap.field) ||
        gap.gap_kind === 'needs_user_confirmation' ||
        gap.gap_kind === 'ambiguous_information'
      ),
    )
    .sort(sortMedicalDeviceGaps)
    .slice(0, 3)
    .map((gap) => gap.gap_id);
}

/**
 * Moves medical-device gaps through the minimal open -> in_progress -> resolved
 * lifecycle when user-provided information satisfies the deterministic missing
 * information policy. It does not infer compliance or device status.
 */
export function classifyMedicalDeviceGapStatuses(
  gaps: AlphaGap[],
  state: MedicalDeviceTriageState,
  answeredTurnId?: string,
): MedicalDeviceTriageGapStatusChange[] {
  const candidateGapRefs = new Set(selectMedicalDeviceGapRefs(gaps, state));
  const changes: MedicalDeviceTriageGapStatusChange[] = [];

  for (const gap of gaps.filter((item) => item.module === 'medical_device_triage').sort(sortMedicalDeviceGaps)) {
    if (gap.gap_status === 'resolved' || gap.gap_status === 'deferred' || gap.gap_status === 'not_applicable') {
      continue;
    }

    if (answeredTurnId && hasResolvedMedicalDeviceGapField(gap, state)) {
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

/**
 * Builds traceable source refs for a non-definitive medical-device section.
 * Only internal proposal/user/section sources are allowed; retrieval, legal
 * dictamen, regulatory classification, and clinical decision evidence are out
 * of scope for this PR10 boundary.
 */
export function buildMedicalDeviceSectionSourceRefs(
  initialSources: ProposalSource[],
  userAnswerSources: ProposalSource[],
  problemSection?: GeneratedSection | null,
  solutionSection?: GeneratedSection | null,
  dataAiPrivacySection?: GeneratedSection | null,
): ProposalSource[] {
  const sourcesById = new Map<string, ProposalSource>();

  for (const source of [
    ...initialSources,
    ...userAnswerSources,
    ...(problemSection?.source_refs ?? []),
    ...(solutionSection?.source_refs ?? []),
    ...(dataAiPrivacySection?.source_refs ?? []),
  ]) {
    if (isAllowedMedicalDeviceSource(source)) {
      sourcesById.set(source.source_id, source);
    }
  }

  return Array.from(sourcesById.values());
}

/**
 * Renders persisted gaps, questions, uncertainty, and the mandatory competent
 * human review warning. The section must never become a medical-device, MDR,
 * legal, regulatory, clinical, approval, rejection, or compliance decision.
 */
export function renderMedicalDeviceTriageSection(
  state: MedicalDeviceTriageState,
  params: { sourceCount: number; gapCount: number },
): { title: string; contentMarkdown: string; warnings: string[] } {
  const warnings = [MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING];
  const activationSignals = state.activation_signals.length > 0
    ? state.activation_signals.map((signal) => `- ${signal}`).join('\n')
    : '- No activation signal persisted.';
  const uncertainties = state.uncertainties.length > 0
    ? state.uncertainties.map((uncertainty) => `- ${uncertainty}`).join('\n')
    : '- No open uncertainty persisted.';
  const intendedUseClaims = state.intended_use_claims.length > 0
    ? state.intended_use_claims.map((claim) => `- ${claim}`).join('\n')
    : '- No intended-use claim persisted.';
  const evidenceNeeded = state.evidence_needed.length > 0
    ? state.evidence_needed.map((evidence) => `- ${evidence}`).join('\n')
    : '- No evidence gap persisted.';

  if (params.sourceCount === 0) {
    warnings.push('Medical-device triage section has no internal source references');
  }

  if (params.gapCount === 0 && state.triage_status !== 'not_applicable') {
    warnings.push('Medical-device triage section has no resolved gap references');
  }

  const statusLine = state.triage_status === 'not_applicable'
    ? 'No medical-device signals or uncertainty are present in persisted proposal material.'
    : 'Medical-device signals or uncertainty are present.';

  return {
    title: 'Medical-device triage gaps and uncertainty',
    contentMarkdown: [
      '## Triage status',
      state.triage_status,
      '',
      '## Activation basis',
      statusLine,
      '',
      '## Activation signals',
      activationSignals,
      '',
      '## Intended-use claims to clarify',
      intendedUseClaims,
      '',
      '## Clinical decision role',
      state.clinical_decision_role || 'No clinical decision role persisted.',
      '',
      '## Evidence needed',
      evidenceNeeded,
      '',
      '## Uncertainties',
      uncertainties,
      '',
      '## Human review plan',
      state.human_review_plan || 'No human review plan persisted.',
      '',
      `## Review requirement\n${MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING}`,
    ].join('\n'),
    warnings,
  };
}

/**
 * Public deterministic guardrail check used by tests and callers before
 * exposing model-shaped content. The boundary is phrase normalization and
 * replacement; prompts may guide tone, but code owns the no-dictamen rule.
 */
export function containsForbiddenMedicalDeviceOutput(value: unknown): boolean {
  return hasForbiddenOutput(JSON.stringify(value));
}

/**
 * Normalizes one model turn into the PR10 medical-device gap/question contract:
 * one bounded question, no definitive product-status wording, competent human
 * review required, and no trust in `agent_status = done` while missing-info
 * criteria are still incomplete.
 */
export function enforceMedicalDeviceTriageTurnGuardrails(
  turn: MedicalDeviceTriageTurn,
  latestAnswer?: string,
): {
  turn: MedicalDeviceTriageTurn;
  warnings: string[];
  updatedMedicalDeviceTriage: MedicalDeviceTriageState;
  detectedGaps: string[];
  latestAnswerWasVague: boolean;
  intervention: MedicalDeviceTriageGuardrailIntervention;
} {
  const warnings: string[] = [];
  const interventionReasons: MedicalDeviceTriageGuardrailInterventionReason[] = [];
  const normalizedFields = new Set<string>();
  let fallbackQuestionApplied = false;
  const latestAnswerIsVague = latestAnswer ? isVagueAnswer(latestAnswer) : false;
  const sanitizedState = sanitizeState(turn.updated_medical_device_triage);
  const sanitizedDiagnosisResult = sanitizeStringArray(turn.diagnosis);
  const sanitizedDiagnosis = sanitizedDiagnosisResult.values.slice(0, 3);
  const sanitizedQuestion = scrubForbiddenOutput(enforceSingleQuestion(turn.next_question));
  const normalizedTurn: MedicalDeviceTriageTurn = {
    ...turn,
    diagnosis: sanitizedDiagnosis,
    next_question: sanitizedQuestion.value,
    updated_medical_device_triage: sanitizedState.state,
  };

  if (sanitizedState.changed || sanitizedQuestion.changed || sanitizedDiagnosisResult.changed) {
    warnings.push('Definitive medical-device wording was replaced before persistence');
    interventionReasons.push('forbidden_output_replaced');
    sanitizedState.changedFields.forEach((field) => normalizedFields.add(`updated_medical_device_triage.${field}`));
    if (sanitizedDiagnosisResult.changed) {
      normalizedFields.add('diagnosis');
    }
    if (sanitizedQuestion.changed) {
      normalizedFields.add('next_question');
    }
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.updated_medical_device_triage.triage_status = 'uncertain';
    normalizedTurn.next_question = buildMedicalDeviceFallbackQuestion(normalizedTurn.updated_medical_device_triage);
    fallbackQuestionApplied = true;
  }

  if (latestAnswerIsVague) {
    warnings.push('Latest medical-device triage answer was vague; clarification was narrowed');
    interventionReasons.push('vague_answer_reasked');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildMedicalDeviceFallbackQuestion(normalizedTurn.updated_medical_device_triage);
    fallbackQuestionApplied = true;
  }

  const isComplete = evaluateMedicalDeviceCompletion(normalizedTurn.updated_medical_device_triage);

  if (normalizedTurn.agent_status === 'done' && !isComplete) {
    warnings.push('Model marked medical-device triage as done before completion criteria were met');
    interventionReasons.push('premature_completion_blocked');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildMedicalDeviceFallbackQuestion(normalizedTurn.updated_medical_device_triage);
    fallbackQuestionApplied = true;
  }

  if (normalizedTurn.agent_status !== 'done' && !normalizedTurn.next_question) {
    warnings.push('Model did not produce a usable medical-device triage question; fallback question generated');
    interventionReasons.push('missing_question_fallback');
    normalizedTurn.next_question = buildMedicalDeviceFallbackQuestion(normalizedTurn.updated_medical_device_triage);
    fallbackQuestionApplied = true;
  }

  if (normalizedTurn.agent_status === 'done') {
    normalizedTurn.next_question = '';
    normalizedTurn.completion_reason =
      normalizedTurn.completion_reason || 'medical-device triage gaps sufficiently clarified for human review';
  }

  return {
    turn: normalizedTurn,
    warnings: Array.from(new Set([...warnings, MEDICAL_DEVICE_TRIAGE_REVIEW_WARNING])),
    updatedMedicalDeviceTriage: normalizedTurn.updated_medical_device_triage,
    detectedGaps: computeMedicalDeviceMissingInformation(normalizedTurn.updated_medical_device_triage),
    latestAnswerWasVague: latestAnswerIsVague,
    intervention: {
      applied: interventionReasons.length > 0,
      reasons: Array.from(new Set(interventionReasons)),
      normalizedFields: Array.from(normalizedFields).sort(),
      fallbackQuestionApplied,
      forcedAgentStatus: interventionReasons.length > 0 ? normalizedTurn.agent_status : undefined,
      competentHumanReviewRequired: true,
      scope: 'medical_device_triage_gap_question_framework',
    },
  };
}
