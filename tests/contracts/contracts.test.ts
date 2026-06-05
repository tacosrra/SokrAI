import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertAlphaGap,
  assertAlphaProposal,
  assertBasicAlphaReport,
  assertBasicReportComposeRequest,
  assertChatTurn,
  assertDataAiPrivacyReplyRequest,
  assertDataAiPrivacyReplyResponse,
  assertDataAiPrivacyStartRequest,
  assertDataAiPrivacyStartResponse,
  assertDataAiPrivacyTurn,
  assertGeneratedSection,
  assertMedicalDeviceTriageReplyRequest,
  assertMedicalDeviceTriageReplyResponse,
  assertMedicalDeviceTriageStartRequest,
  assertMedicalDeviceTriageStartResponse,
  assertMedicalDeviceTriageTurn,
  assertModuleChat,
  assertProblemDefinitionTurn,
  assertProposalDocument,
  assertProposalReplyRequest,
  assertProposalReplyResponse,
  assertProposalSource,
  assertProposalStartRequest,
  assertProposalStartResponse,
  assertRequestExecutionResponse,
  assertResourcesPilotViabilityReplyRequest,
  assertResourcesPilotViabilityReplyResponse,
  assertResourcesPilotViabilityStartRequest,
  assertResourcesPilotViabilityStartResponse,
  assertResourcesPilotViabilityTurn,
  assertRegulatoryProfile,
  assertSchema,
  assertSolutionDefinitionTurn,
  assertSolutionReplyRequest,
  assertSolutionReplyResponse,
  assertSolutionStartRequest,
  assertSolutionStartResponse,
  assertStructuredBrief,
  schemaDocuments,
  schemaIds,
} from '../../apps/api/src/contracts/schema-registry.ts';
import { AppError } from '../../apps/api/src/utils/errors.ts';
import { readFixture } from '../helpers/test-environment';

function fromRepoRoot(...segments: string[]): string {
  const cwd = process.cwd();
  const repoRoot = path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'apps'
    ? path.resolve(cwd, '../..')
    : cwd;

  return path.join(repoRoot, ...segments);
}

describe('contract schemas', () => {
  it('accepts a valid proposal start request fixture', async () => {
    const fixture = await readFixture('start', 'strong-proposal.json');
    expect(assertProposalStartRequest(fixture)).toBeTruthy();
  });

  it('rejects an empty proposal submission fixture', async () => {
    const fixture = await readFixture('start', 'empty-submission.json');
    expect(() => assertProposalStartRequest(fixture)).toThrow(AppError);
  });

  it('accepts the strong structured brief fixture', async () => {
    const fixture = await readFixture('expected', 'structured-brief.strong.json');
    expect(assertStructuredBrief(fixture)).toBeTruthy();
  });

  it('accepts the done problem-definition turn fixture', async () => {
    const fixture = await readFixture('expected', 'problem-definition.done.json');
    expect(assertProblemDefinitionTurn(fixture)).toBeTruthy();
  });

  it('accepts solution-definition turn fixtures', async () => {
    expect(assertSolutionDefinitionTurn(await readFixture('expected', 'solution-definition.done.json'))).toBeTruthy();
    expect(assertSolutionDefinitionTurn(await readFixture('expected', 'solution-definition.continue.json'))).toBeTruthy();
  });

  it('accepts data AI privacy profile, turn, request, and response contracts', async () => {
    const turn = await readFixture('expected', 'data-ai-privacy.done.json');

    expect(assertRegulatoryProfile({
      profile_id: 'hospital_clinic_v1',
      profile_version: 'v1',
      display_name: 'Hospital Clinic v1',
      families: [
        { family_id: 'gdpr', label: 'RGPD / GDPR', scope_note: 'Data protection context.' },
        { family_id: 'cybersecurity_act', label: 'Cybersecurity Act', scope_note: 'Cybersecurity context.' },
        { family_id: 'ehds', label: 'EEDS / EHDS', scope_note: 'Health data context.' },
        { family_id: 'mdr', label: 'MDR', scope_note: 'Medical device uncertainty context.' },
        { family_id: 'eu_ai_act', label: 'EU AI Act', scope_note: 'AI governance context.' },
        { family_id: 'htar', label: 'HTAR', scope_note: 'Health technology assessment context.' },
      ],
      allowed_outputs: ['gaps', 'questions', 'uncertainty', 'requires competent human review'],
      forbidden_outputs: [
        'legal/regulatory/clinical/privacy/medical-device dictamen',
        'definitive compliance or non-compliance',
        'approval or rejection',
        'ranking, scoring, or prioritization',
        'definitive medical device classification',
        'replacement for competent human review',
      ],
      review_statement: 'requires competent human review',
    })).toBeTruthy();
    expect(assertDataAiPrivacyTurn(turn)).toBeTruthy();
    expect(assertDataAiPrivacyStartRequest({
      request_id: 'data-start-1',
      session_id: 'session-1',
      profile_id: 'hospital_clinic_v1',
    })).toBeTruthy();
    expect(assertDataAiPrivacyReplyRequest({
      request_id: 'data-reply-1',
      session_id: 'session-1',
      answer: 'Data comes from patient intake forms.',
    })).toBeTruthy();
    expect(assertDataAiPrivacyStartResponse({
      session_id: 'session-1',
      stage: 'data_ai_privacy',
      profile_id: 'hospital_clinic_v1',
      agent_status: 'continue',
      updated_data_ai_privacy: turn.updated_data_ai_privacy,
      diagnosis: turn.diagnosis,
      next_question: 'What data sources are in scope?',
      completion_reason: '',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertDataAiPrivacyReplyResponse({
      session_id: 'session-1',
      stage: 'data_ai_privacy',
      profile_id: 'hospital_clinic_v1',
      agent_status: 'done',
      updated_data_ai_privacy: turn.updated_data_ai_privacy,
      diagnosis: turn.diagnosis,
      next_question: '',
      completion_reason: turn.completion_reason,
      warnings: ['requires competent human review'],
    })).toBeTruthy();
  });

  it('accepts canonical response envelopes', async () => {
    const startResponse = assertProposalStartResponse({
      session_id: 'session-1',
      stage: 'problem_definition',
      structured_brief: await readFixture('expected', 'structured-brief.strong.json'),
      detected_gaps: ['problem_owner'],
      next_question: '¿Qué equipo responde hoy por este problema?',
      agent_status: 'continue',
      warnings: [],
    });

    const replyResponse = assertProposalReplyResponse({
      session_id: 'session-1',
      stage: 'problem_definition',
      agent_status: 'done',
      updated_problem_definition: (await readFixture('expected', 'problem-definition.done.json')).updated_problem_definition,
      diagnosis: ['El problema ya esta suficientemente definido'],
      next_question: '',
      completion_reason: 'problem sufficiently defined',
      warnings: [],
    });

    expect(startResponse.stage).toBe('problem_definition');
    expect(replyResponse.agent_status).toBe('done');
  });

  it('accepts canonical solution request and response envelopes', async () => {
    const solutionDefinition = (await readFixture('expected', 'solution-definition.done.json')).updated_solution_definition;

    expect(assertSolutionStartRequest({
      request_id: 'solution-start-1',
      session_id: 'session-1',
    })).toBeTruthy();
    expect(assertSolutionReplyRequest(await readFixture('reply', 'solution-workflow-change.json'))).toBeTruthy();

    const startResponse = assertSolutionStartResponse({
      session_id: 'session-1',
      stage: 'solution_definition',
      agent_status: 'continue',
      updated_solution_definition: solutionDefinition,
      diagnosis: ['Solution lane started'],
      next_question: 'What does the solution do?',
      completion_reason: '',
      warnings: [],
    });
    const replyResponse = assertSolutionReplyResponse({
      session_id: 'session-1',
      stage: 'solution_definition',
      agent_status: 'done',
      updated_solution_definition: solutionDefinition,
      diagnosis: ['Solution is clear'],
      next_question: '',
      completion_reason: 'solution sufficiently defined',
      warnings: [],
    });

    expect(startResponse.stage).toBe('solution_definition');
    expect(replyResponse.agent_status).toBe('done');
  });

  it('accepts canonical request recovery envelopes', () => {
    const recovered = assertRequestExecutionResponse({
      request_id: 'web-start-1',
      request_kind: 'solution_reply',
      status: 'completed',
      session_id: 'session-1',
    });

    expect(recovered.status).toBe('completed');
    expect(recovered.request_kind).toBe('solution_reply');
    expect(assertRequestExecutionResponse({
      request_id: 'web-data-reply-1',
      request_kind: 'data_ai_privacy_reply',
      status: 'pending',
      session_id: 'session-1',
    })).toBeTruthy();
    expect(assertRequestExecutionResponse({
      request_id: 'web-medical-device-start-1',
      request_kind: 'medical_device_triage_start',
      status: 'completed',
      session_id: 'session-1',
    })).toBeTruthy();
  });

  it('accepts data AI privacy as a widened Alpha module and section kind', async () => {
    const gap = await readFixture('alpha-model', 'alpha-gap.valid.json');
    const chat = await readFixture('alpha-model', 'module-chat.valid.json');
    const turn = await readFixture('alpha-model', 'chat-turn.valid.json');
    const section = await readFixture('alpha-model', 'generated-section.valid.json');

    expect(assertAlphaGap({
      ...gap,
      module: 'data_ai_privacy',
      field: 'privacy_governance',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertModuleChat({
      ...chat,
      module: 'data_ai_privacy',
      turns: [],
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertChatTurn({
      ...turn,
      module: 'data_ai_privacy',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertGeneratedSection({
      ...section,
      section_kind: 'data_ai_privacy',
      title: 'Data, AI and privacy gaps',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
  });

  it('accepts medical-device triage turn, request, and response contracts', async () => {
    const applicable = await readFixture('expected', 'medical-device-triage.applicable.json');
    const notApplicable = await readFixture('expected', 'medical-device-triage.not-applicable.json');
    const uncertain = await readFixture('expected', 'medical-device-triage.uncertain.json');

    expect(assertMedicalDeviceTriageTurn(applicable)).toBeTruthy();
    expect(assertMedicalDeviceTriageTurn(notApplicable)).toBeTruthy();
    expect(assertMedicalDeviceTriageTurn(uncertain)).toBeTruthy();
    expect(assertMedicalDeviceTriageStartRequest({
      request_id: 'medical-device-start-1',
      session_id: 'session-1',
      profile_id: 'hospital_clinic_v1',
    })).toBeTruthy();
    expect(assertMedicalDeviceTriageReplyRequest({
      request_id: 'medical-device-reply-1',
      session_id: 'session-1',
      answer: 'The proposal drafts a triage recommendation for staff review.',
    })).toBeTruthy();
    expect(assertMedicalDeviceTriageStartResponse({
      session_id: 'session-1',
      stage: 'medical_device_triage',
      profile_id: 'hospital_clinic_v1',
      activation_result: 'not_applicable',
      agent_status: 'done',
      updated_medical_device_triage: notApplicable.updated_medical_device_triage,
      diagnosis: notApplicable.diagnosis,
      next_question: '',
      completion_reason: notApplicable.completion_reason,
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertMedicalDeviceTriageReplyResponse({
      session_id: 'session-1',
      stage: 'medical_device_triage',
      profile_id: 'hospital_clinic_v1',
      activation_result: 'applicable',
      agent_status: 'continue',
      updated_medical_device_triage: applicable.updated_medical_device_triage,
      diagnosis: applicable.diagnosis,
      next_question: applicable.next_question,
      completion_reason: '',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
  });

  it('accepts resources pilot viability turn, request, and response contracts', async () => {
    const done = await readFixture('expected', 'resources-pilot-viability.done.json');
    const continueTurn = await readFixture('expected', 'resources-pilot-viability.continue.json');

    expect(assertResourcesPilotViabilityTurn(done)).toBeTruthy();
    expect(assertResourcesPilotViabilityTurn(continueTurn)).toBeTruthy();
    expect(assertResourcesPilotViabilityStartRequest({
      request_id: 'resources-pilot-start-1',
      session_id: 'session-1',
    })).toBeTruthy();
    expect(assertResourcesPilotViabilityReplyRequest({
      request_id: 'resources-pilot-reply-1',
      session_id: 'session-1',
      answer: 'The pilot uses two nurses, a coordinator, SSO, and weekly completion metrics.',
    })).toBeTruthy();
    expect(assertResourcesPilotViabilityStartResponse({
      session_id: 'session-1',
      stage: 'resources_pilot_viability',
      agent_status: 'continue',
      updated_resources_pilot_viability: continueTurn.updated_resources_pilot_viability,
      diagnosis: continueTurn.diagnosis,
      next_question: continueTurn.next_question,
      completion_reason: '',
      warnings: ['This section is not a viability score, approval decision, ranking, or financial model.'],
    })).toBeTruthy();
    expect(assertResourcesPilotViabilityReplyResponse({
      session_id: 'session-1',
      stage: 'resources_pilot_viability',
      agent_status: 'done',
      updated_resources_pilot_viability: done.updated_resources_pilot_viability,
      diagnosis: done.diagnosis,
      next_question: '',
      completion_reason: done.completion_reason,
      warnings: ['This section is not a viability score, approval decision, ranking, or financial model.'],
    })).toBeTruthy();
  });

  it('accepts resources pilot viability as a widened Alpha module and section kind', async () => {
    const gap = await readFixture('alpha-model', 'alpha-gap.valid.json');
    const chat = await readFixture('alpha-model', 'module-chat.valid.json');
    const turn = await readFixture('alpha-model', 'chat-turn.valid.json');
    const section = await readFixture('alpha-model', 'generated-section.valid.json');
    const warning = 'This section is not a viability score, approval decision, ranking, or financial model.';

    expect(assertAlphaGap({
      ...gap,
      module: 'resources_pilot_viability',
      field: 'technical_resources',
      warnings: [warning],
    })).toBeTruthy();
    expect(assertModuleChat({
      ...chat,
      module: 'resources_pilot_viability',
      turns: [],
      warnings: [warning],
    })).toBeTruthy();
    expect(assertChatTurn({
      ...turn,
      module: 'resources_pilot_viability',
      warnings: [warning],
    })).toBeTruthy();
    expect(assertGeneratedSection({
      ...section,
      section_kind: 'resources_pilot_viability',
      title: 'Resources, pilot and viability readiness inputs',
      warnings: [warning],
    })).toBeTruthy();
  });

  it('accepts medical-device triage as a widened Alpha module and section kind', async () => {
    const gap = await readFixture('alpha-model', 'alpha-gap.valid.json');
    const chat = await readFixture('alpha-model', 'module-chat.valid.json');
    const turn = await readFixture('alpha-model', 'chat-turn.valid.json');
    const section = await readFixture('alpha-model', 'generated-section.valid.json');

    expect(assertAlphaGap({
      ...gap,
      module: 'medical_device_triage',
      field: 'human_review_plan',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertModuleChat({
      ...chat,
      module: 'medical_device_triage',
      turns: [],
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertChatTurn({
      ...turn,
      module: 'medical_device_triage',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
    expect(assertGeneratedSection({
      ...section,
      section_kind: 'medical_device_triage',
      title: 'Medical-device triage gaps and uncertainty',
      warnings: ['requires competent human review'],
    })).toBeTruthy();
  });

  it('rejects invalid medical-device triage status labels', async () => {
    const applicable = await readFixture('expected', 'medical-device-triage.applicable.json');
    const invalid = structuredClone(applicable) as {
      updated_medical_device_triage: Record<string, unknown>;
    };

    invalid.updated_medical_device_triage.triage_status = 'Class IIa';
    expect(() => assertMedicalDeviceTriageTurn(invalid)).toThrow(AppError);
  });

  it('accepts a valid proposal reply request fixture', async () => {
    const fixture = await readFixture('reply', 'unknown-session.json');
    expect(assertProposalReplyRequest(fixture)).toBeTruthy();
  });

  it('accepts valid Alpha model component fixtures', async () => {
    expect(assertProposalSource(await readFixture('alpha-model', 'proposal-source.valid.json'))).toBeTruthy();
    expect(assertProposalDocument(await readFixture('alpha-model', 'proposal-document.valid.json'))).toBeTruthy();
    expect(assertAlphaGap(await readFixture('alpha-model', 'alpha-gap.valid.json'))).toBeTruthy();
    expect(assertChatTurn(await readFixture('alpha-model', 'chat-turn.valid.json'))).toBeTruthy();
    expect(assertModuleChat(await readFixture('alpha-model', 'module-chat.valid.json'))).toBeTruthy();
    expect(assertGeneratedSection(await readFixture('alpha-model', 'generated-section.valid.json'))).toBeTruthy();
  });

  it('requires generated sections to carry an explicit section version', async () => {
    const section = await readFixture('alpha-model', 'generated-section.valid.json');
    const withoutVersion = structuredClone(section) as Record<string, unknown>;

    delete withoutVersion.section_version;

    expect(() => assertGeneratedSection(withoutVersion)).toThrow(AppError);
  });

  it('exposes AuditRef as a shared contract schema', () => {
    expect(schemaIds.auditRef).toBe('https://sokrai.local/contracts/schemas/audit-ref.schema.json');
    expect(schemaDocuments.auditRef.$id).toBe(schemaIds.auditRef);
    expect(assertSchema(schemaIds.auditRef, { kind: 'audit_event', id: 'audit-1' })).toBeTruthy();
  });

  it('accepts valid Alpha aggregate and report fixtures', async () => {
    expect(assertAlphaProposal(await readFixture('alpha-model', 'alpha-proposal.valid.json'))).toBeTruthy();
    expect(assertBasicAlphaReport(await readFixture('alpha-model', 'basic-alpha-report.valid.json'))).toBeTruthy();
  });

  it('validates Basic Alpha report compose requests at the contract boundary', () => {
    expect(
      assertBasicReportComposeRequest({
        request_id: 'req-report-compose',
        workflow_version: 'basic_alpha_report_v1',
        workflow_execution_id: 'workflow-run-1',
        session_id: 'session-1',
      }),
    ).toBeTruthy();
    expect(() => assertBasicReportComposeRequest({ request_id: 'req-report-compose' })).toThrow(AppError);
    expect(() =>
      assertBasicReportComposeRequest({
        request_id: 'req-report-compose',
        session_id: 'session-1',
        payload: {},
      }),
    ).toThrow(AppError);
  });

  it('rejects invalid nested Alpha aggregate children through schema refs', async () => {
    const proposal = await readFixture('alpha-model', 'alpha-proposal.valid.json');
    const invalidProposal = structuredClone(proposal) as { documents: Array<Record<string, unknown>> };

    invalidProposal.documents[0].source_kind = 'generated_section';
    expect(() => assertAlphaProposal(invalidProposal)).toThrow(AppError);

    const report = await readFixture('alpha-model', 'basic-alpha-report.valid.json');
    const invalidReport = structuredClone(report) as { problem_section: Record<string, unknown> };

    invalidReport.problem_section.section_kind = 'regulatory';
    expect(() => assertBasicAlphaReport(invalidReport)).toThrow(AppError);
  });

  it('rejects Alpha model payloads that violate required fields, enums, or closed objects', async () => {
    const missingSource = await readFixture('alpha-model', 'proposal-source.missing-id.invalid.json');
    const invalidDocumentStatus = await readFixture('alpha-model', 'proposal-document.invalid-status.invalid.json');
    const clinicGap = await readFixture('alpha-model', 'alpha-gap.clinic-module.invalid.json');
    const missingAbsenceGap = await readFixture('alpha-model', 'alpha-gap.missing-absence.invalid.json');
    const extraProposalField = await readFixture('alpha-model', 'alpha-proposal.extra-property.invalid.json');

    expect(() => assertProposalSource(missingSource)).toThrow(AppError);
    expect(() => assertProposalDocument(invalidDocumentStatus)).toThrow(AppError);
    expect(() => assertAlphaGap(clinicGap)).toThrow(AppError);
    expect(() => assertAlphaGap(missingAbsenceGap)).toThrow(AppError);
    expect(() => assertAlphaProposal(extraProposalField)).toThrow(AppError);
  });

  it('requires proposal source references to match their source kind', async () => {
    const source = (await readFixture('alpha-model', 'proposal-source.valid.json')) as Record<string, unknown>;
    const sourceWithoutDocument = { ...source };
    delete sourceWithoutDocument.document_id;

    expect(() => assertProposalSource({ ...sourceWithoutDocument, source_kind: 'generated_section' })).toThrow(AppError);
    expect(() => assertProposalSource({ ...source, source_kind: 'user_answer', turn_id: 'turn-1' })).toThrow(AppError);
    expect(
      assertProposalSource({
        ...sourceWithoutDocument,
        source_kind: 'generated_section',
        section_id: 'section-1',
      }),
    ).toBeTruthy();
  });

  it('returns a typed error for unregistered schema lookups', () => {
    expect(() => assertSchema('https://sokrai.local/contracts/schemas/missing.schema.json', {})).toThrow(
      expect.objectContaining({
        errorCode: 'schema_not_registered',
        statusCode: 500,
      }),
    );
  });

  it('rejects Alpha chat/report payloads that exceed guardrails or export scope', async () => {
    const tooManyDiagnosis = await readFixture('alpha-model', 'chat-turn.too-many-diagnosis.invalid.json');
    const reportWithPdfUrl = await readFixture('alpha-model', 'basic-alpha-report.pdf-url.invalid.json');
    const validReport = await readFixture('alpha-model', 'basic-alpha-report.valid.json');
    const reportWithRawOutput = structuredClone(validReport) as Record<string, unknown>;
    const reportWithNestedRawOutput = structuredClone(validReport) as {
      problem_section: Record<string, unknown>;
      solution_section: Record<string, unknown>;
    };

    reportWithRawOutput.raw_model_output = '{"agent_status":"done"}';
    reportWithNestedRawOutput.problem_section.raw_model_output = '{"section":"raw"}';
    reportWithNestedRawOutput.solution_section.validated_output_json = { agent_status: 'done' };

    expect(() => assertChatTurn(tooManyDiagnosis)).toThrow(AppError);
    expect(() => assertBasicAlphaReport(reportWithPdfUrl)).toThrow(AppError);
    expect(() => assertBasicAlphaReport(reportWithRawOutput)).toThrow(AppError);
    expect(() => assertBasicAlphaReport(reportWithNestedRawOutput)).toThrow(AppError);
  });

  it('keeps n8n workflow assets importable by requiring top-level workflow ids', async () => {
    const workflowsDir = fromRepoRoot('infra', 'n8n', 'workflows');
    const files = (await readdir(workflowsDir)).filter((file) => file.endsWith('.json')).sort();

    expect(files.length).toBeGreaterThan(0);

    const workflowIds = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(path.join(workflowsDir, file), 'utf8');
        const workflow = JSON.parse(raw) as { id?: unknown };

        expect(workflow.id, `${file} is missing a top-level workflow id`).toEqual(expect.any(String));
        expect((workflow.id as string).trim(), `${file} has an empty top-level workflow id`).not.toBe('');

        return workflow.id as string;
      }),
    );

    expect(new Set(workflowIds).size).toBe(workflowIds.length);
  });

  it('preserves caller request ids in n8n workflow payload setup', async () => {
    const workflowsDir = fromRepoRoot('infra', 'n8n', 'workflows');
    const workflowExpectations = [
      ['proposal_start_v1.json', 'Webhook_StartProposal'],
      ['proposal_reply_v1.json', 'Webhook_ProposalReply'],
      ['agent_problem_definition_v1.json', 'Webhook_AgentProblemDefinition'],
      ['solution_start_v1.json', 'Webhook_SolutionStart'],
      ['solution_reply_v1.json', 'Webhook_SolutionReply'],
      ['agent_solution_definition_v1.json', 'Webhook_AgentSolutionDefinition'],
      ['data_ai_privacy_start_v1.json', 'Webhook_DataAiPrivacyStart'],
      ['data_ai_privacy_reply_v1.json', 'Webhook_DataAiPrivacyReply'],
      ['agent_data_ai_privacy_gap_v1.json', 'Webhook_AgentDataAiPrivacyGap'],
    ];

    for (const [file, webhookNodeName] of workflowExpectations) {
      const workflow = await readFile(path.join(workflowsDir, file), 'utf8');

      expect(workflow).toContain(
        `$node[\\"${webhookNodeName}\\"].json.headers?.[\\"x-request-id\\"] || $node[\\"${webhookNodeName}\\"].json.body?.request_id || $execution.id`,
      );
      expect(workflow).not.toContain('$json.body.request_id || $execution.id');
    }
  });

  it('bootstraps n8n workflows with supported per-workflow publish commands', async () => {
    const bashScriptPath = fromRepoRoot('scripts', 'common-beta.sh');
    const powershellScriptPath = fromRepoRoot('scripts', 'common-beta.ps1');
    const [bashScript, powershellScript] = await Promise.all([
      readFile(bashScriptPath, 'utf8'),
      readFile(powershellScriptPath, 'utf8'),
    ]);

    expect(bashScript).toContain('n8n publish:workflow --id="$workflow_id"');
    expect(bashScript).not.toContain('n8n update:workflow --all --active=true');
    expect(powershellScript).toContain('n8n publish:workflow "--id=$workflowId"');
    expect(powershellScript).not.toContain('n8n update:workflow --all --active=true');
  });

  it('keeps Clinic smoke scripts fake-data only and redaction-focused', async () => {
    const bashScriptPath = fromRepoRoot('scripts', 'smoke-clinic-demo.sh');
    const powershellScriptPath = fromRepoRoot('scripts', 'smoke-clinic-demo.ps1');
    const [bashScript, powershellScript] = await Promise.all([
      readFile(bashScriptPath, 'utf8'),
      readFile(powershellScriptPath, 'utf8'),
    ]);

    for (const script of [bashScript, powershellScript]) {
      expect(script).toContain('fake');
      expect(script).toContain('raw_model_output');
      expect(script).toContain('validated_output_json');
      expect(script).toContain('content_base64');
      expect(script).toContain('INTERNAL_SHARED_SECRET');
      expect(script).toContain('report.pdf');
    }

    expect(bashScript).toContain('MAX_CLINIC_TURNS');
    expect(bashScript).toContain('json_summary');
    expect(bashScript).not.toContain('cat "$output"');

    expect(powershellScript).toContain('$MaxClinicTurns');
    expect(powershellScript).toContain('ConvertTo-SafeSummary');
    expect(powershellScript).not.toContain('ConvertTo-Json -Depth 100');
  });

  it('requires completed request execution statuses in core smoke scripts', async () => {
    const bashScriptPath = fromRepoRoot('scripts', 'smoke-core.sh');
    const powershellScriptPath = fromRepoRoot('scripts', 'smoke-core.ps1');
    const [bashScript, powershellScript] = await Promise.all([
      readFile(bashScriptPath, 'utf8'),
      readFile(powershellScriptPath, 'utf8'),
    ]);

    expect(bashScript).toContain('data.status === "completed"');
    expect(bashScript).toContain('recovery response missing session_id');
    expect(bashScript).not.toContain('data.status === "completed" || data.status === "failed"');
    expect(bashScript).not.toContain('data.status !== "pending" && data.status !== "not_found"');

    expect(powershellScript).toContain("$startStatus.status -eq 'completed'");
    expect(powershellScript).toContain("$replyStatus.status -eq 'completed'");
    expect(powershellScript).toContain("$recoveryStatus.status -eq 'completed'");
    expect(powershellScript).not.toContain("@('completed', 'failed') -contains");
    expect(powershellScript).not.toContain("$recoveryStatus.status -ne 'pending'");
  });
});
