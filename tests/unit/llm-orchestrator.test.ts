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
});
