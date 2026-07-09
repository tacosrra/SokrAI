import type {
  AlphaGap,
  GeneratedSection,
  ProposalSource,
  ResourcesPilotViabilityState,
  ResourcesPilotViabilityTurn,
} from '../contracts/types';
import { enforceSingleQuestion, isVagueAnswer } from './problem-definition';
import {
  ensureDistinctNextQuestion,
  selectNonRepeatedQuestion,
} from './conversation-question';

export const RESOURCES_PILOT_VIABILITY_WARNING =
  'This section is not a viability score, approval decision, ranking, or financial model.';

const RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY = [
  'human_resources',
  'technical_resources',
  'pilot_environment',
  'dependencies',
  'indicators_metrics',
  'constraints',
  'operational_risks',
  'assumptions',
  'uncertainties',
] as const;

const MIN_FIELD_LENGTH = 8;
const MAX_OPEN_UNCERTAINTIES_FOR_COMPLETION = 3;

const FORBIDDEN_OUTPUT_PATTERNS = [
  /\bapproved\b/i,
  /\brejected\b/i,
  /\bapproval\b/i,
  /\brejection\b/i,
  /\baprobado\b/i,
  /\baprobada\b/i,
  /\brechazado\b/i,
  /\brechazada\b/i,
  /\bgo[-\s]?no[-\s]?go\b/i,
  /\bscore\b/i,
  /\bscoring\b/i,
  /\bviability\s+score\b/i,
  /\breadiness\s+score\b/i,
  /\bpuntuacion\b/i,
  /\branking\b/i,
  /\bprioritization\b/i,
  /\bprioritisation\b/i,
  /\bpriorizacion\b/i,
  /\bfinancial\s+model\b/i,
  /\bmodelo\s+financier[oa]\b/i,
  /\broi\b/i,
  /\brevenue\b/i,
  /\bingresos\b/i,
  /\bprofitability\b/i,
  /\brentabilidad\b/i,
  /\bbudget\s+approval\b/i,
  /\baprobacion\s+presupuestaria\b/i,
  /\bcost[-\s]?benefit\b/i,
  /\bapproval\s+decision\b/i,
  /\bdecision\s+de\s+aprobacion\b/i,
];

export interface ResourcesPilotViabilityGapStatusChange {
  gapId: string;
  gapStatus: 'in_progress' | 'resolved';
  resolvedByTurnId?: string;
}

export type ResourcesPilotViabilityGuardrailInterventionReason =
  | 'forbidden_output_replaced'
  | 'vague_answer_reasked'
  | 'premature_completion_blocked'
  | 'completion_criteria_met'
  | 'missing_question_fallback'
  | 'repeated_question_rephrased';

export interface ResourcesPilotViabilityGuardrailIntervention {
  applied: boolean;
  reasons: ResourcesPilotViabilityGuardrailInterventionReason[];
  normalizedFields: string[];
  fallbackQuestionApplied: boolean;
  forcedAgentStatus?: ResourcesPilotViabilityTurn['agent_status'];
  scope: 'resources_pilot_viability_operational_inputs';
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function hasEnoughText(value: string, minLength = MIN_FIELD_LENGTH): boolean {
  return value.trim().length >= minLength;
}

function hasArrayContent(values: string[]): boolean {
  return values.some((value) => hasEnoughText(value));
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

  return { value: RESOURCES_PILOT_VIABILITY_WARNING, changed: true };
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
  state: ResourcesPilotViabilityState,
): { state: ResourcesPilotViabilityState; changed: boolean; changedFields: string[] } {
  const dependencies = sanitizeStringArray(state.dependencies);
  const indicatorsMetrics = sanitizeStringArray(state.indicators_metrics);
  const constraints = sanitizeStringArray(state.constraints);
  const operationalRisks = sanitizeStringArray(state.operational_risks);
  const assumptions = sanitizeStringArray(state.assumptions);
  const uncertainties = sanitizeStringArray(state.uncertainties);
  const fields = {
    human_resources: scrubForbiddenOutput(state.human_resources),
    technical_resources: scrubForbiddenOutput(state.technical_resources),
    pilot_environment: scrubForbiddenOutput(state.pilot_environment),
  };
  const changed =
    dependencies.changed ||
    indicatorsMetrics.changed ||
    constraints.changed ||
    operationalRisks.changed ||
    assumptions.changed ||
    uncertainties.changed ||
    Object.values(fields).some((field) => field.changed);
  const changedFields = [
    ...Object.entries(fields)
      .filter(([, field]) => field.changed)
      .map(([fieldName]) => fieldName),
    ...(dependencies.changed ? ['dependencies'] : []),
    ...(indicatorsMetrics.changed ? ['indicators_metrics'] : []),
    ...(constraints.changed ? ['constraints'] : []),
    ...(operationalRisks.changed ? ['operational_risks'] : []),
    ...(assumptions.changed ? ['assumptions'] : []),
    ...(uncertainties.changed ? ['uncertainties'] : []),
  ];

  return {
    changed,
    changedFields,
    state: {
      human_resources: fields.human_resources.value,
      technical_resources: fields.technical_resources.value,
      pilot_environment: fields.pilot_environment.value,
      dependencies: dependencies.values,
      indicators_metrics: indicatorsMetrics.values,
      constraints: constraints.values,
      operational_risks: operationalRisks.values,
      assumptions: assumptions.values,
      uncertainties: uncertainties.values,
    },
  };
}

function hasResolvedResourcesPilotViabilityGapField(
  gap: AlphaGap,
  state: ResourcesPilotViabilityState,
): boolean {
  return !computeResourcesPilotViabilityMissingInformation(state).includes(gap.field) &&
    RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY.includes(
      gap.field as (typeof RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY)[number],
    );
}

function sortResourcesPilotViabilityGaps(left: AlphaGap, right: AlphaGap): number {
  const leftPriority = RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY.indexOf(
    left.field as (typeof RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY)[number],
  );
  const rightPriority = RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY.indexOf(
    right.field as (typeof RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY)[number],
  );
  const normalizedLeft = leftPriority === -1 ? RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY.length : leftPriority;
  const normalizedRight = rightPriority === -1 ? RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY.length : rightPriority;

  if (normalizedLeft !== normalizedRight) {
    return normalizedLeft - normalizedRight;
  }

  return left.created_at.localeCompare(right.created_at) || left.gap_id.localeCompare(right.gap_id);
}

function isAllowedResourcesPilotViabilitySource(source: ProposalSource): boolean {
  return source.source_kind === 'pasted_text' ||
    source.source_kind === 'uploaded_file' ||
    source.source_kind === 'extracted_text' ||
    source.source_kind === 'user_answer' ||
    source.source_kind === 'generated_section';
}

export function emptyResourcesPilotViabilityState(): ResourcesPilotViabilityState {
  return {
    human_resources: '',
    technical_resources: '',
    pilot_environment: '',
    dependencies: [],
    indicators_metrics: [],
    constraints: [],
    operational_risks: [],
    assumptions: [],
    uncertainties: [],
  };
}

export function computeResourcesPilotViabilityMissingInformation(state: ResourcesPilotViabilityState): string[] {
  const missing: string[] = [];

  for (const field of RESOURCES_PILOT_VIABILITY_FIELD_PRIORITY) {
    if (field === 'dependencies') {
      if (!hasArrayContent(state.dependencies)) {
        missing.push(field);
      }
      continue;
    }

    if (field === 'indicators_metrics') {
      if (!hasArrayContent(state.indicators_metrics)) {
        missing.push(field);
      }
      continue;
    }

    if (field === 'constraints') {
      if (!hasArrayContent(state.constraints)) {
        missing.push(field);
      }
      continue;
    }

    if (field === 'operational_risks') {
      if (!hasArrayContent(state.operational_risks)) {
        missing.push(field);
      }
      continue;
    }

    if (field === 'assumptions') {
      if (state.assumptions.length === 0) {
        missing.push(field);
      }
      continue;
    }

    if (field === 'uncertainties') {
      continue;
    }

    if (isBlank(state[field])) {
      missing.push(field);
    }
  }

  return Array.from(new Set(missing));
}

export function buildResourcesPilotViabilityFallbackQuestionCandidates(
  state: ResourcesPilotViabilityState,
): string[] {
  const missing = computeResourcesPilotViabilityMissingInformation(state);

  if (missing.includes('human_resources')) {
    return [
      'Who will run the pilot day to day, and what roles or availability are already committed?',
      'Which people or roles would operate the pilot each day, and what capacity is already secured?',
      'Who is expected to run the pilot in practice, and what staffing is already in place?',
    ];
  }

  if (missing.includes('technical_resources')) {
    return [
      'What technical resources are needed for the pilot and which of them are already available?',
      'Which systems, tools, or infrastructure does the pilot need, and what is already ready?',
      'What technical setup is required, and which parts are already available today?',
    ];
  }

  if (missing.includes('pilot_environment')) {
    return [
      'Where would the pilot run, and what access, workflow, or setting constraints define that environment?',
      'In which setting would the pilot take place, and what access or workflow limits apply there?',
      'What environment is planned for the pilot, and what practical constraints shape it?',
    ];
  }

  if (missing.includes('dependencies')) {
    return [
      'What operational dependencies must be ready before the pilot can start, including any explicit non-blocking dependencies?',
      'Which dependencies need to be in place before launch, and which ones are nice-to-have rather than blocking?',
      'What must be ready operationally before the pilot starts, including dependencies that are not strictly blocking?',
    ];
  }

  if (missing.includes('indicators_metrics')) {
    return [
      'Which operational indicators or metrics would show whether the pilot is working as intended?',
      'What signals or metrics would tell you early whether the pilot is succeeding operationally?',
      'How would the team know in practice whether the pilot is working?',
    ];
  }

  if (missing.includes('constraints')) {
    return [
      'What practical constraints could limit pilot execution, such as time, staffing, systems, sites, or access?',
      'Which time, staffing, system, site, or access limits could restrict the pilot?',
      'What real-world limits might slow down or constrain the pilot?',
    ];
  }

  if (missing.includes('operational_risks')) {
    return [
      'What operational risks could interrupt the pilot, and how would the team notice them early?',
      'Which operational risks could stop or derail the pilot, and what early warning signs would you watch for?',
      'What could go wrong operationally during the pilot, and how would the team spot it quickly?',
    ];
  }

  if (missing.includes('assumptions')) {
    return [
      'What operational assumption still needs to be checked before the pilot plan is reliable?',
      'Which assumption about people, systems, or workflow still needs validation?',
      'What are you assuming about the pilot that has not been confirmed yet?',
    ];
  }

  if (missing.includes('uncertainties')) {
    return [
      'What remaining operational uncertainty should be clarified before this pilot input section is complete?',
      'Which operational detail is still unclear and should be nailed down before moving on?',
      'What open operational question still needs a concrete answer?',
    ];
  }

  const firstUncertainty = state.uncertainties[0];

  if (firstUncertainty) {
    return [
      `Can you make this operational uncertainty more concrete: ${firstUncertainty}?`,
      `What concrete example would clarify this operational uncertainty: ${firstUncertainty}?`,
      `What extra detail would close this open operational point: ${firstUncertainty}?`,
    ];
  }

  return [
    'What operational detail is still missing from the resources, pilot environment, dependencies, metrics, constraints, or risks?',
    'Which operational input still needs more detail before this section is complete?',
    'What practical example would help complete the pilot readiness picture?',
  ];
}

export function buildResourcesPilotViabilityFallbackQuestion(
  state: ResourcesPilotViabilityState,
  recentQuestions: string[] = [],
): string {
  return selectNonRepeatedQuestion(
    buildResourcesPilotViabilityFallbackQuestionCandidates(state),
    recentQuestions,
  );
}

export function evaluateResourcesPilotViabilityCompletion(state: ResourcesPilotViabilityState): boolean {
  return (
    hasEnoughText(state.human_resources) &&
    hasEnoughText(state.technical_resources) &&
    hasEnoughText(state.pilot_environment) &&
    hasArrayContent(state.dependencies) &&
    hasArrayContent(state.indicators_metrics) &&
    hasArrayContent(state.constraints) &&
    hasArrayContent(state.operational_risks) &&
    state.assumptions.length > 0 &&
    state.uncertainties.length <= MAX_OPEN_UNCERTAINTIES_FOR_COMPLETION
  );
}

export function selectResourcesPilotViabilityGapRefs(
  gaps: AlphaGap[],
  state: ResourcesPilotViabilityState,
): string[] {
  const missing = computeResourcesPilotViabilityMissingInformation(state);

  return gaps
    .filter((gap) =>
      gap.module === 'resources_pilot_viability' &&
      (gap.gap_status === 'open' || gap.gap_status === 'in_progress') &&
      !hasResolvedResourcesPilotViabilityGapField(gap, state) &&
      (
        missing.includes(gap.field) ||
        gap.gap_kind === 'needs_user_confirmation' ||
        gap.gap_kind === 'ambiguous_information'
      ),
    )
    .sort(sortResourcesPilotViabilityGaps)
    .slice(0, 3)
    .map((gap) => gap.gap_id);
}

export function classifyResourcesPilotViabilityGapStatuses(
  gaps: AlphaGap[],
  state: ResourcesPilotViabilityState,
  answeredTurnId?: string,
): ResourcesPilotViabilityGapStatusChange[] {
  const candidateGapRefs = new Set(selectResourcesPilotViabilityGapRefs(gaps, state));
  const phaseComplete = evaluateResourcesPilotViabilityCompletion(state);
  const changes: ResourcesPilotViabilityGapStatusChange[] = [];

  for (const gap of gaps.filter((item) => item.module === 'resources_pilot_viability')
    .sort(sortResourcesPilotViabilityGaps)) {
    if (gap.gap_status === 'resolved' || gap.gap_status === 'deferred' || gap.gap_status === 'not_applicable') {
      continue;
    }

    if (answeredTurnId && (hasResolvedResourcesPilotViabilityGapField(gap, state) || phaseComplete)) {
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

export function buildResourcesPilotViabilitySectionSourceRefs(
  initialSources: ProposalSource[],
  userAnswerSources: ProposalSource[],
  problemSection?: GeneratedSection | null,
  solutionSection?: GeneratedSection | null,
  dataAiPrivacySection?: GeneratedSection | null,
  medicalDeviceTriageSection?: GeneratedSection | null,
): ProposalSource[] {
  const sourcesById = new Map<string, ProposalSource>();

  for (const source of [
    ...initialSources,
    ...userAnswerSources,
    ...(problemSection?.source_refs ?? []),
    ...(solutionSection?.source_refs ?? []),
    ...(dataAiPrivacySection?.source_refs ?? []),
    ...(medicalDeviceTriageSection?.source_refs ?? []),
  ]) {
    if (isAllowedResourcesPilotViabilitySource(source)) {
      sourcesById.set(source.source_id, source);
    }
  }

  return Array.from(sourcesById.values());
}

export function renderResourcesPilotViabilitySection(
  state: ResourcesPilotViabilityState,
  params: { sourceCount: number; gapCount: number },
): { title: string; contentMarkdown: string; warnings: string[] } {
  const warnings = [RESOURCES_PILOT_VIABILITY_WARNING];
  const listOrEmpty = (items: string[], emptyText: string) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${emptyText}`;

  if (params.sourceCount === 0) {
    warnings.push('Resources pilot viability section has no internal source references');
  }

  if (params.gapCount === 0) {
    warnings.push('Resources pilot viability section has no resolved gap references');
  }

  return {
    title: 'Resources, pilot and viability readiness inputs',
    contentMarkdown: [
      '## Human resources',
      state.human_resources,
      '',
      '## Technical resources',
      state.technical_resources,
      '',
      '## Pilot environment',
      state.pilot_environment,
      '',
      '## Dependencies',
      listOrEmpty(state.dependencies, 'No explicit operational dependency persisted.'),
      '',
      '## Indicators and metrics',
      listOrEmpty(state.indicators_metrics, 'No operational indicator or metric persisted.'),
      '',
      '## Constraints',
      listOrEmpty(state.constraints, 'No operational constraint persisted.'),
      '',
      '## Operational risks',
      listOrEmpty(state.operational_risks, 'No operational risk persisted.'),
      '',
      '## Assumptions',
      listOrEmpty(state.assumptions, 'No explicit operational assumption persisted.'),
      '',
      '## Uncertainties',
      listOrEmpty(state.uncertainties, 'No open operational uncertainty persisted.'),
      '',
      `## Boundary\n${RESOURCES_PILOT_VIABILITY_WARNING}`,
    ].join('\n'),
    warnings,
  };
}

export function containsForbiddenResourcesPilotViabilityOutput(value: unknown): boolean {
  return hasForbiddenOutput(JSON.stringify(value).replaceAll(RESOURCES_PILOT_VIABILITY_WARNING, ''));
}

export function enforceResourcesPilotViabilityTurnGuardrails(
  turn: ResourcesPilotViabilityTurn,
  latestAnswer?: string,
  options: { recentQuestions?: string[] } = {},
): {
  turn: ResourcesPilotViabilityTurn;
  warnings: string[];
  updatedResourcesPilotViability: ResourcesPilotViabilityState;
  detectedGaps: string[];
  latestAnswerWasVague: boolean;
  intervention: ResourcesPilotViabilityGuardrailIntervention;
} {
  const warnings: string[] = [];
  const recentQuestions = options.recentQuestions ?? [];
  const interventionReasons: ResourcesPilotViabilityGuardrailInterventionReason[] = [];
  const normalizedFields = new Set<string>();
  let fallbackQuestionApplied = false;
  const latestAnswerIsVague = latestAnswer ? isVagueAnswer(latestAnswer) : false;
  const sanitizedState = sanitizeState(turn.updated_resources_pilot_viability);
  const sanitizedDiagnosisResult = sanitizeStringArray(turn.diagnosis);
  const sanitizedDiagnosis = sanitizedDiagnosisResult.values.slice(0, 3);
  const sanitizedQuestion = scrubForbiddenOutput(enforceSingleQuestion(turn.next_question));
  const normalizedTurn: ResourcesPilotViabilityTurn = {
    ...turn,
    diagnosis: sanitizedDiagnosis,
    next_question: sanitizedQuestion.value,
    updated_resources_pilot_viability: sanitizedState.state,
  };

  if (sanitizedState.changed || sanitizedQuestion.changed || sanitizedDiagnosisResult.changed) {
    warnings.push('Decision, score, ranking, or financial model wording was replaced before persistence');
    interventionReasons.push('forbidden_output_replaced');
    sanitizedState.changedFields.forEach((field) =>
      normalizedFields.add(`updated_resources_pilot_viability.${field}`),
    );
    if (sanitizedDiagnosisResult.changed) {
      normalizedFields.add('diagnosis');
    }
    if (sanitizedQuestion.changed) {
      normalizedFields.add('next_question');
    }
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildResourcesPilotViabilityFallbackQuestion(
      normalizedTurn.updated_resources_pilot_viability,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  if (latestAnswerIsVague) {
    warnings.push('Latest resources pilot viability answer was vague; clarification was narrowed');
    interventionReasons.push('vague_answer_reasked');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildResourcesPilotViabilityFallbackQuestion(
      normalizedTurn.updated_resources_pilot_viability,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  const isComplete = evaluateResourcesPilotViabilityCompletion(normalizedTurn.updated_resources_pilot_viability);

  if (normalizedTurn.agent_status === 'done' && !isComplete) {
    warnings.push('Model marked resources pilot viability lane as done before completion criteria were met');
    interventionReasons.push('premature_completion_blocked');
    normalizedTurn.agent_status = 'continue';
    normalizedTurn.completion_reason = '';
    normalizedTurn.next_question = buildResourcesPilotViabilityFallbackQuestion(
      normalizedTurn.updated_resources_pilot_viability,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  const requiresClarifyingIntervention =
    interventionReasons.includes('forbidden_output_replaced') ||
    interventionReasons.includes('vague_answer_reasked');

  if (normalizedTurn.agent_status !== 'done' && isComplete && !requiresClarifyingIntervention) {
    interventionReasons.push('completion_criteria_met');
    normalizedTurn.agent_status = 'done';
    normalizedTurn.next_question = '';
    normalizedTurn.completion_reason =
      normalizedTurn.completion_reason || 'resources pilot viability inputs sufficiently clarified';
  }

  if (normalizedTurn.agent_status !== 'done' && !normalizedTurn.next_question) {
    warnings.push('Model did not produce a usable resources pilot viability question; fallback question generated');
    interventionReasons.push('missing_question_fallback');
    normalizedTurn.next_question = buildResourcesPilotViabilityFallbackQuestion(
      normalizedTurn.updated_resources_pilot_viability,
      recentQuestions,
    );
    fallbackQuestionApplied = true;
  }

  if (normalizedTurn.agent_status === 'done') {
    normalizedTurn.next_question = '';
    normalizedTurn.completion_reason =
      normalizedTurn.completion_reason || 'resources pilot viability inputs sufficiently clarified';
  }

  if (normalizedTurn.agent_status !== 'done' && normalizedTurn.next_question) {
    const distinctQuestion = ensureDistinctNextQuestion({
      nextQuestion: normalizedTurn.next_question,
      recentQuestions,
      fallbackCandidates: buildResourcesPilotViabilityFallbackQuestionCandidates(
        normalizedTurn.updated_resources_pilot_viability,
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
    warnings: Array.from(new Set([...warnings, RESOURCES_PILOT_VIABILITY_WARNING])),
    updatedResourcesPilotViability: normalizedTurn.updated_resources_pilot_viability,
    detectedGaps: computeResourcesPilotViabilityMissingInformation(
      normalizedTurn.updated_resources_pilot_viability,
    ),
    latestAnswerWasVague: latestAnswerIsVague,
    intervention: {
      applied: interventionReasons.length > 0,
      reasons: Array.from(new Set(interventionReasons)),
      normalizedFields: Array.from(normalizedFields).sort(),
      fallbackQuestionApplied,
      forcedAgentStatus: interventionReasons.length > 0 ? normalizedTurn.agent_status : undefined,
      scope: 'resources_pilot_viability_operational_inputs',
    },
  };
}
