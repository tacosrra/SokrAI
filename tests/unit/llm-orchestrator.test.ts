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
});
