import { describe, expect, it } from 'vitest';

import { schemaDocuments } from '../../apps/api/src/contracts/schema-registry.ts';
import { LlmOrchestrator } from '../../apps/api/src/services/llm-orchestrator.ts';
import type { AppConfig } from '../../apps/api/src/config/env.ts';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client.ts';

function createConfig(): AppConfig {
  return {
    appEnv: 'test',
    appPort: 3001,
    logLevel: 'error',
    databaseUrl: 'postgresql://sokrai_app:localpass@localhost:5432/sokrai_app',
    databasePoolMax: 5,
    databaseStatementTimeoutMs: 5000,
    aiProvider: 'ollama',
    aiModel: 'fake-model',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'fake-model',
    ollamaTimeoutMs: 1000,
    ollamaKeepAlive: '30m',
    ollamaNumCtx: 4096,
    briefExtractionMaxChars: 10000,
    jsonRepairMaxAttempts: 1,
    maxProposalChars: 30000,
    maxReplyChars: 4000,
    maxTurnsPerSession: 12,
    maxDiagnosisItems: 3,
    allowSensitiveHealthData: false,
    internalSharedSecret: 'test-secret',
  };
}

describe('LlmOrchestrator', () => {
  it('passes the structured brief schema to the language model', async () => {
    const client = new QueueLanguageModelClient([
      JSON.stringify({
        project_title: 'Proyecto',
        goal: 'Aclarar el problema',
        target_user: 'Urgencias',
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: 'Esperas frecuentes',
        current_alternatives: 'Proceso manual',
        scope: 'Urgencias hospitalarias',
        constraints_known: ['presupuesto limitado'],
        assumptions: ['la demanda es variable'],
        ambiguities: ['causa principal del retraso'],
        missing_information: ['metricas de base'],
      }),
    ]);

    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.extractStructuredBrief({
      projectTitle: 'Proyecto',
      goal: 'Aclarar el problema',
      normalizedText: 'Texto normalizado',
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].responseSchema).toBeDefined();
    expect(client.calls[0].responseSchema).toMatchObject({
      $id: schemaDocuments.structuredBrief.$id,
      title: schemaDocuments.structuredBrief.title,
    });
  });

  it('reuses the problem-definition schema during repair attempts', async () => {
    const client = new QueueLanguageModelClient([
      'esto no es json',
      JSON.stringify({
        agent_status: 'continue',
        diagnosis: ['falta una metrica base'],
        updated_problem_definition: {
          problem_owner: 'Direccion medica',
          problem_statement: 'El triaje se retrasa en horas punta',
          evidence_of_problem: 'Esperas de 20 a 35 minutos',
          scope: 'Urgencias hospitalarias',
          current_alternatives: 'Proceso manual de clasificacion',
          assumptions: ['la recogida inicial consume demasiado tiempo'],
          ambiguities_remaining: ['peso relativo de admision frente a priorizacion'],
        },
        next_question: 'Cual es hoy la metrica principal con la que evaluais el retraso?',
        completion_reason: '',
      }),
    ]);

    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.runProblemDefinition({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar el problema',
        target_user: 'Urgencias',
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: 'Esperas frecuentes',
        current_alternatives: 'Proceso manual',
        scope: 'Urgencias hospitalarias',
        constraints_known: ['presupuesto limitado'],
        assumptions: ['la demanda es variable'],
        ambiguities: ['causa principal del retraso'],
        missing_information: ['metricas de base'],
      },
      recentTurns: [],
    });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[0].responseSchema).toMatchObject({
      $id: schemaDocuments.problemDefinitionTurn.$id,
      title: schemaDocuments.problemDefinitionTurn.title,
    });
    expect(client.calls[1].responseSchema).toMatchObject({
      $id: schemaDocuments.problemDefinitionTurn.$id,
      title: schemaDocuments.problemDefinitionTurn.title,
    });
  });

  it('uses AI_MODEL for initial and repair provider calls', async () => {
    const config = {
      ...createConfig(),
      aiModel: 'configured-ai-model',
      ollamaModel: 'legacy-ollama-model',
    };
    const client = new QueueLanguageModelClient([
      'esto no es json',
      JSON.stringify({
        agent_status: 'continue',
        diagnosis: ['falta una metrica base'],
        updated_problem_definition: {
          problem_owner: 'Direccion medica',
          problem_statement: 'El triaje se retrasa en horas punta',
          evidence_of_problem: 'Esperas de 20 a 35 minutos',
          scope: 'Urgencias hospitalarias',
          current_alternatives: 'Proceso manual de clasificacion',
          assumptions: ['la recogida inicial consume demasiado tiempo'],
          ambiguities_remaining: ['peso relativo de admision frente a priorizacion'],
        },
        next_question: 'Cual es hoy la metrica principal con la que evaluais el retraso?',
        completion_reason: '',
      }),
    ]);

    const orchestrator = new LlmOrchestrator(config, client);

    await orchestrator.runProblemDefinition({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar el problema',
        target_user: 'Urgencias',
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: 'Esperas frecuentes',
        current_alternatives: 'Proceso manual',
        scope: 'Urgencias hospitalarias',
        constraints_known: ['presupuesto limitado'],
        assumptions: ['la demanda es variable'],
        ambiguities: ['causa principal del retraso'],
        missing_information: ['metricas de base'],
      },
      recentTurns: [],
    });

    expect(client.calls.map((call) => call.model)).toEqual([
      'configured-ai-model',
      'configured-ai-model',
    ]);
  });

  it('keeps schema validation failures distinct from malformed JSON failures', async () => {
    const config = {
      ...createConfig(),
      jsonRepairMaxAttempts: 0,
    };
    const client = new QueueLanguageModelClient([JSON.stringify({ agent_status: 'continue' })]);
    const orchestrator = new LlmOrchestrator(config, client);

    await expect(
      orchestrator.runProblemDefinition({
        structuredBrief: {
          project_title: 'Proyecto',
          goal: 'Aclarar el problema',
          target_user: 'Urgencias',
          problem_owner: 'Direccion medica',
          problem_statement: 'El triaje se retrasa',
          evidence_of_problem: 'Esperas frecuentes',
          current_alternatives: 'Proceso manual',
          scope: 'Urgencias hospitalarias',
          constraints_known: ['presupuesto limitado'],
          assumptions: ['la demanda es variable'],
          ambiguities: ['causa principal del retraso'],
          missing_information: ['metricas de base'],
        },
        recentTurns: [],
      }),
    ).rejects.toMatchObject({
      name: 'ModelOutputError',
      errorCode: 'invalid_problem_definition_turn',
      repairAttempted: false,
    });
    expect(client.calls).toHaveLength(1);
  });

  it('reports schema-invalid repaired output with the schema error code', async () => {
    const client = new QueueLanguageModelClient([
      'esto no es json',
      JSON.stringify({ agent_status: 'continue' }),
    ]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await expect(
      orchestrator.runProblemDefinition({
        structuredBrief: {
          project_title: 'Proyecto',
          goal: 'Aclarar el problema',
          target_user: 'Urgencias',
          problem_owner: 'Direccion medica',
          problem_statement: 'El triaje se retrasa',
          evidence_of_problem: 'Esperas frecuentes',
          current_alternatives: 'Proceso manual',
          scope: 'Urgencias hospitalarias',
          constraints_known: ['presupuesto limitado'],
          assumptions: ['la demanda es variable'],
          ambiguities: ['causa principal del retraso'],
          missing_information: ['metricas de base'],
        },
        recentTurns: [],
      }),
    ).rejects.toMatchObject({
      name: 'ModelOutputError',
      errorCode: 'invalid_problem_definition_turn',
      repairAttempted: true,
    });
    expect(client.calls).toHaveLength(2);
  });

  it('passes the solution-definition schema to the language model', async () => {
    const client = new QueueLanguageModelClient([
      JSON.stringify({
        agent_status: 'continue',
        diagnosis: ['solution workflow needs detail'],
        updated_solution_definition: {
          solution_summary: 'A guided intake assistant prepares structured triage context.',
          target_user: 'Admission nursing staff',
          how_it_works: '',
          workflow_change: '',
          current_solutions: 'Manual notes and protocol sheets.',
          value_differential: '',
          scope_limits: '',
          assumptions: [],
          ambiguities_remaining: ['workflow change is unclear'],
        },
        next_question: 'How does the assistant change the current intake workflow?',
        completion_reason: '',
      }),
    ]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.runSolutionDefinition({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar la solucion',
        target_user: 'Urgencias',
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: 'Esperas frecuentes',
        current_alternatives: 'Proceso manual',
        scope: 'Urgencias hospitalarias',
        constraints_known: [],
        assumptions: [],
        ambiguities: [],
        missing_information: [],
      },
      problemSection: {
        title: 'Problem definition',
        content_markdown: 'El triaje se retrasa en horas punta.',
        source_refs: [],
      },
      recentTurns: [],
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].responseSchema).toMatchObject({
      $id: schemaDocuments.solutionDefinitionTurn.$id,
      title: schemaDocuments.solutionDefinitionTurn.title,
    });
  });

  it('repairs malformed solution-definition JSON once', async () => {
    const client = new QueueLanguageModelClient([
      'not json',
      JSON.stringify({
        agent_status: 'done',
        diagnosis: ['solution is sufficiently defined'],
        updated_solution_definition: {
          solution_summary: 'A guided intake assistant prepares structured triage handoff notes.',
          target_user: 'Admission nursing staff',
          how_it_works: 'The assistant asks bounded questions and creates a structured intake summary.',
          workflow_change: 'Nurses review a structured summary before continuing the normal triage protocol.',
          current_solutions: 'Current work relies on manual notes and static protocol sheets.',
          value_differential: 'The solution makes intake notes more consistent without replacing judgement.',
          scope_limits: 'The first version covers adult emergency intake and excludes diagnosis.',
          assumptions: ['Nursing staff can answer guided questions during intake.'],
          ambiguities_remaining: [],
        },
        next_question: '',
        completion_reason: 'solution sufficiently defined',
      }),
    ]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    const result = await orchestrator.runSolutionDefinition({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar la solucion',
        target_user: 'Urgencias',
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: 'Esperas frecuentes',
        current_alternatives: 'Proceso manual',
        scope: 'Urgencias hospitalarias',
        constraints_known: [],
        assumptions: [],
        ambiguities: [],
        missing_information: [],
      },
      problemSection: {
        title: 'Problem definition',
        content_markdown: 'El triaje se retrasa en horas punta.',
        source_refs: [],
      },
      recentTurns: [],
    });

    expect(result.repairAttempted).toBe(true);
    expect(client.calls).toHaveLength(2);
  });

  it('reports schema-invalid repaired solution output with the schema error code', async () => {
    const client = new QueueLanguageModelClient(['not json', JSON.stringify({ agent_status: 'continue' })]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await expect(
      orchestrator.runSolutionDefinition({
        structuredBrief: {
          project_title: 'Proyecto',
          goal: 'Aclarar la solucion',
          target_user: 'Urgencias',
          problem_owner: 'Direccion medica',
          problem_statement: 'El triaje se retrasa',
          evidence_of_problem: 'Esperas frecuentes',
          current_alternatives: 'Proceso manual',
          scope: 'Urgencias hospitalarias',
          constraints_known: [],
          assumptions: [],
          ambiguities: [],
          missing_information: [],
        },
        problemSection: {
          title: 'Problem definition',
          content_markdown: 'El triaje se retrasa en horas punta.',
          source_refs: [],
        },
        recentTurns: [],
      }),
    ).rejects.toMatchObject({
      name: 'ModelOutputError',
      errorCode: 'invalid_solution_definition_turn',
      repairAttempted: true,
    });
  });

  it('uses the data AI privacy schema and includes profile and prior sections in the prompt', async () => {
    const client = new QueueLanguageModelClient([
      JSON.stringify({
        agent_status: 'continue',
        diagnosis: ['data sources and governance need detail'],
        updated_data_ai_privacy: {
          personal_or_health_data: 'The pilot may process intake data and symptom descriptions.',
          data_sources: '',
          ai_system_role: 'The AI prepares a draft handoff for staff review.',
          validation_evidence: '',
          privacy_governance: '',
          cybersecurity_controls: '',
          regulatory_context: 'Regulatory relevance requires competent human review.',
          human_review_plan: '',
          assumptions: ['Staff review every generated output before use.'],
          uncertainties: ['Exact data minimization path is unresolved.'],
          requires_competent_human_review: true,
        },
        next_question: 'Which source systems provide the intake data for the pilot?',
        completion_reason: '',
      }),
    ]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.runDataAiPrivacyGap({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar datos e IA',
        target_user: 'Urgencias',
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: 'Esperas frecuentes',
        current_alternatives: 'Proceso manual',
        scope: 'Urgencias hospitalarias',
        constraints_known: [],
        assumptions: [],
        ambiguities: [],
        missing_information: [],
      },
      problemSection: {
        title: 'Problem definition',
        content_markdown: 'El triaje se retrasa en horas punta.',
        source_refs: [
          {
            source_id: 'source-problem',
            source_kind: 'generated_section',
            label: 'Problem section',
            created_at: '2026-06-04T10:00:00.000Z',
          },
        ],
      },
      solutionSection: {
        title: 'Solution definition',
        content_markdown: 'Un asistente prepara resumenes de triaje.',
        source_refs: [
          {
            source_id: 'source-solution',
            source_kind: 'generated_section',
            label: 'Solution section',
            created_at: '2026-06-04T10:00:00.000Z',
          },
        ],
      },
      regulatoryProfile: {
        profile_id: 'hospital_clinic_v1',
        profile_version: 'v1',
        display_name: 'Hospital clinic v1',
        families: [
          {
            family_id: 'gdpr_lopdgdd',
            label: 'GDPR/LOPDGDD',
            scope_note: 'Privacy review scope',
          },
        ],
        allowed_outputs: ['gaps', 'questions', 'uncertainty', 'requires competent human review'],
        forbidden_outputs: ['approval', 'rejection'],
        review_statement: 'requires competent human review',
      },
      recentTurns: [],
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].responseSchema).toMatchObject({
      $id: schemaDocuments.dataAiPrivacyTurn.$id,
      title: schemaDocuments.dataAiPrivacyTurn.title,
    });
    expect(client.calls[0].userPrompt).toContain('"profile_id": "hospital_clinic_v1"');
    expect(client.calls[0].userPrompt).toContain('"problem_section"');
    expect(client.calls[0].userPrompt).toContain('"solution_section"');
    expect(client.calls[0].userPrompt).toContain('source-problem');
    expect(client.calls[0].userPrompt).toContain('source-solution');
  });

  it('uses the medical-device triage schema and includes activation and prior sections in the prompt', async () => {
    const client = new QueueLanguageModelClient([
      JSON.stringify({
        agent_status: 'continue',
        diagnosis: ['intended use needs clarification'],
        updated_medical_device_triage: {
          triage_status: 'uncertain',
          activation_signals: ['clinical decision support'],
          uncertainties: ['Intended-use boundary requires competent human review.'],
          intended_use_claims: [],
          clinical_decision_role: '',
          evidence_needed: ['Clarify whether the assistant influences clinical triage.'],
          human_review_plan: 'requires competent human review',
          needs_human_review: true,
          requires_competent_human_review: true,
        },
        next_question: 'What intended use should be reviewed by a competent human?',
        completion_reason: '',
      }),
    ]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.runMedicalDeviceTriage({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar medical-device uncertainty',
        target_user: 'Urgencias',
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: 'Esperas frecuentes',
        current_alternatives: 'Proceso manual',
        scope: 'Urgencias hospitalarias',
        constraints_known: [],
        assumptions: [],
        ambiguities: [],
        missing_information: [],
      },
      problemSection: {
        title: 'Problem definition',
        content_markdown: 'El triaje se retrasa en horas punta.',
        source_refs: [
          {
            source_id: 'source-problem',
            source_kind: 'generated_section',
            label: 'Problem section',
            created_at: '2026-06-04T10:00:00.000Z',
          },
        ],
      },
      solutionSection: {
        title: 'Solution definition',
        content_markdown: 'Un asistente prepara resumenes de triaje.',
        source_refs: [
          {
            source_id: 'source-solution',
            source_kind: 'generated_section',
            label: 'Solution section',
            created_at: '2026-06-04T10:00:00.000Z',
          },
        ],
      },
      dataAiPrivacySection: {
        title: 'Data, AI and privacy gaps',
        content_markdown: 'Data and privacy uncertainty requires competent human review.',
        source_refs: [
          {
            source_id: 'source-data',
            source_kind: 'generated_section',
            label: 'Data AI privacy section',
            created_at: '2026-06-04T10:00:00.000Z',
          },
        ],
      },
      regulatoryProfile: {
        profile_id: 'hospital_clinic_v1',
        profile_version: 'v1',
        display_name: 'Hospital clinic v1',
        families: [
          {
            family_id: 'mdr',
            label: 'MDR',
            scope_note: 'Medical-device uncertainty context.',
          },
        ],
        allowed_outputs: ['gaps', 'questions', 'uncertainty', 'requires competent human review'],
        forbidden_outputs: ['definitive medical device classification'],
        review_statement: 'requires competent human review',
      },
      activationResult: {
        triage_status: 'uncertain',
        activation_signals: ['clinical decision support'],
        uncertainties: ['Intended-use boundary requires competent human review.'],
        needs_human_review: true,
        requires_competent_human_review: true,
      },
      recentTurns: [],
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].systemPrompt).toContain('Prompt: medical-device-triage-agent@v1');
    expect(client.calls[0].responseSchema).toMatchObject({
      $id: schemaDocuments.medicalDeviceTriageTurn.$id,
      title: schemaDocuments.medicalDeviceTriageTurn.title,
    });
    expect(client.calls[0].userPrompt).toContain('"activation_result"');
    expect(client.calls[0].userPrompt).toContain('"triage_status": "uncertain"');
    expect(client.calls[0].userPrompt).toContain('source-data');
    expect(client.calls[0].userPrompt).not.toContain('legal corpus');
    expect(client.calls[0].userPrompt).not.toContain('RAG');
  });
});
