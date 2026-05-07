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

  it('uses the default problem-definition prompt when no specialty is given', async () => {
    const doneTurn = {
      agent_status: 'continue',
      diagnosis: ['falta el responsable'],
      updated_problem_definition: {
        problem_owner: 'Direccion medica',
        problem_statement: 'El triaje se retrasa en horas punta',
        evidence_of_problem: 'Esperas de 20 a 35 minutos',
        scope: 'Urgencias hospitalarias',
        current_alternatives: 'Proceso manual de clasificacion',
        assumptions: ['la recogida inicial consume demasiado tiempo'],
        ambiguities_remaining: [],
      },
      next_question: '¿Cuál es la metrica principal?',
      completion_reason: '',
    };

    const client = new QueueLanguageModelClient([JSON.stringify(doneTurn)]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.runProblemDefinition({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar el problema',
        target_user: 'Urgencias',
        problem_owner: '',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: '',
        current_alternatives: '',
        scope: '',
        constraints_known: [],
        assumptions: [],
        ambiguities: [],
        missing_information: [],
      },
      recentTurns: [],
    });

    expect(client.calls[0].systemPrompt).toContain('problem-definition-agent@v1');
    expect(client.calls[0].systemPrompt).not.toContain('legal');
  });

  it('uses the legal prompt when specialty = legal', async () => {
    const doneTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta el marco regulatorio'],
      updated_problem_definition: {
        problem_owner: 'Departamento legal',
        problem_statement: 'No hay claridad sobre el marco regulatorio',
        evidence_of_problem: 'Sin dictamen previo',
        scope: 'Urgencias hospitalarias',
        current_alternatives: 'Consulta informal',
        assumptions: ['Se aplica RGPD'],
        ambiguities_remaining: [],
      },
      next_question: '¿Qué marco legal aplica?',
      completion_reason: '',
    };

    const client = new QueueLanguageModelClient([JSON.stringify(doneTurn)]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.runProblemDefinition({
      structuredBrief: {
        project_title: 'Proyecto Legal',
        goal: 'Aclarar marco regulatorio',
        target_user: 'Equipo de compliance',
        problem_owner: '',
        problem_statement: 'No hay claridad sobre el marco regulatorio',
        evidence_of_problem: '',
        current_alternatives: '',
        scope: '',
        constraints_known: [],
        assumptions: [],
        ambiguities: [],
        missing_information: [],
      },
      recentTurns: [],
      specialty: 'legal',
    });

    expect(client.calls[0].systemPrompt).toContain('problem-definition-agent-legal@v1');
    expect(client.calls[0].systemPrompt).toContain('DISCLAIMER');
  });

  it('appends retrieval context to the user prompt when provided', async () => {
    const doneTurn = {
      agent_status: 'continue',
      diagnosis: ['Falta el responsable'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: [],
      },
      next_question: '¿Quién responde por el problema?',
      completion_reason: '',
    };

    const client = new QueueLanguageModelClient([JSON.stringify(doneTurn)]);
    const orchestrator = new LlmOrchestrator(createConfig(), client);

    await orchestrator.runProblemDefinition({
      structuredBrief: {
        project_title: 'Proyecto',
        goal: 'Aclarar el problema',
        target_user: 'Urgencias',
        problem_owner: '',
        problem_statement: 'El triaje se retrasa',
        evidence_of_problem: '',
        current_alternatives: '',
        scope: '',
        constraints_known: [],
        assumptions: [],
        ambiguities: [],
        missing_information: [],
      },
      recentTurns: [],
      specialty: 'legal',
      retrievalContext: '## Sources\n\n[S1] RGPD Art. 5 — principios de tratamiento de datos.',
    });

    expect(client.calls[0].userPrompt).toContain('[S1]');
    expect(client.calls[0].userPrompt).toContain('RGPD');
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
});
