import crypto from 'node:crypto';

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { loadConfig, type AppConfig } from './config/env';
import {
  assertBasicAlphaReport,
  assertBasicReportComposeRequest,
  assertDataAiPrivacyReplyResponse,
  assertDataAiPrivacyStartResponse,
  assertErrorResponse,
  assertMedicalDeviceTriageReplyResponse,
  assertMedicalDeviceTriageStartResponse,
  assertProposalReplyResponse,
  assertProposalStartResponse,
  assertRequestExecutionResponse,
  assertResourcesPilotViabilityReplyResponse,
  assertResourcesPilotViabilityStartResponse,
  assertSolutionReplyResponse,
  assertSolutionStartRequest,
  assertSolutionStartResponse,
} from './contracts/schema-registry';
import { Database } from './repositories/database';
import { AlphaStore } from './repositories/alpha-store';
import { SessionStore } from './repositories/session-store';
import type { AiProviderPort } from './services/ai-provider';
import { createAiProvider } from './services/ai-provider-factory';
import { BasicReportService } from './services/basic-report-service';
import { DataAiPrivacyService } from './services/data-ai-privacy-service';
import { GapAnalysisService } from './services/gap-analysis-service';
import { LlmOrchestrator } from './services/llm-orchestrator';
import { MedicalDeviceTriageService } from './services/medical-device-triage-service';
import { ProblemDefinitionService } from './services/problem-definition-service';
import { ProposalReplyService } from './services/proposal-reply-service';
import { ProposalStartService } from './services/proposal-start-service';
import { ResourcesPilotViabilityService } from './services/resources-pilot-viability-service';
import { SolutionDefinitionService } from './services/solution-definition-service';
import { SolutionReplyService } from './services/solution-reply-service';
import { AppError } from './utils/errors';
import { JsonLogger, type Logger } from './utils/logger';

export interface BuildAppOptions {
  config?: AppConfig;
  logger?: Logger;
  database?: Database;
  aiProvider?: AiProviderPort;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? new JsonLogger(config.logLevel);
  const database = options.database ?? new Database(config);
  const aiProvider = options.aiProvider ?? createAiProvider(config);
  const sessionStore = new SessionStore(database);
  const alphaStore = new AlphaStore(database);
  const llmOrchestrator = new LlmOrchestrator(config, aiProvider);
  const gapAnalysisService = new GapAnalysisService(logger, alphaStore);
  const basicReportService = new BasicReportService(logger, alphaStore);
  const proposalStartService = new ProposalStartService(
    config,
    logger,
    sessionStore,
    llmOrchestrator,
    alphaStore,
    gapAnalysisService,
  );
  const proposalReplyService = new ProposalReplyService(config, logger, sessionStore);
  const problemDefinitionService = new ProblemDefinitionService(
    config,
    logger,
    sessionStore,
    alphaStore,
    llmOrchestrator,
  );
  const solutionReplyService = new SolutionReplyService(config, logger, sessionStore, alphaStore);
  const solutionDefinitionService = new SolutionDefinitionService(
    config,
    logger,
    sessionStore,
    alphaStore,
    llmOrchestrator,
  );
  const dataAiPrivacyService = new DataAiPrivacyService(
    config,
    logger,
    sessionStore,
    alphaStore,
    llmOrchestrator,
  );
  const medicalDeviceTriageService = new MedicalDeviceTriageService(
    config,
    logger,
    sessionStore,
    alphaStore,
    llmOrchestrator,
  );
  const resourcesPilotViabilityService = new ResourcesPilotViabilityService(
    config,
    logger,
    sessionStore,
    alphaStore,
    llmOrchestrator,
  );

  const app = Fastify({
    logger: false,
  });

  app.decorate('services', {
    config,
    logger,
    database,
    sessionStore,
    alphaStore,
    aiProvider,
    llmOrchestrator,
    gapAnalysisService,
    basicReportService,
    proposalStartService,
    proposalReplyService,
    problemDefinitionService,
    solutionReplyService,
    solutionDefinitionService,
    dataAiPrivacyService,
    medicalDeviceTriageService,
    resourcesPilotViabilityService,
  });

  app.addHook('onClose', async () => {
    await database.close();
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = getRequestId(request);

    if (error instanceof AppError) {
      const payload = assertErrorResponse({
        error_code: error.errorCode,
        safe_message: error.safeMessage,
        request_id: requestId,
        session_id: error.sessionId,
        retryable: error.retryable,
      });

      const logPayload = {
        request_id: requestId,
        error_code: error.errorCode,
        status_code: error.statusCode,
        path: request.url,
        session_id: error.sessionId,
      };

      if (error.statusCode >= 500) {
        logger.error('request_failed', logPayload);
      } else {
        logger.warn('request_failed', logPayload);
      }

      reply.status(error.statusCode).send(payload);
      return;
    }

    logger.error('request_failed_unexpected', {
      request_id: requestId,
      path: request.url,
      error_message: error instanceof Error ? error.message : 'unknown',
    });

    const payload = assertErrorResponse({
      error_code: 'internal_error',
      safe_message: 'An unexpected error occurred',
      request_id: requestId,
      retryable: false,
    });

    reply.status(500).send(payload);
  });

  app.get('/healthz', async () => ({
    status: 'ok',
  }));

  app.get('/api/v1/sessions/:sessionId', async (request) => {
    const params = request.params as { sessionId: string };
    return sessionStore.getAuditView(params.sessionId);
  });

  app.get('/api/v1/sessions/:sessionId/report', async (request, reply) => {
    const params = request.params as { sessionId: string };
    const report = await assertBasicAlphaReportResponse(
      () => basicReportService.getForSession(params.sessionId),
      params.sessionId,
    );

    return reply.send(report);
  });

  app.get('/api/v1/requests/:requestId', async (request, reply) => {
    const params = request.params as { requestId: string };
    const status = await sessionStore.getRequestExecutionStatus(params.requestId);
    return reply.send(assertRequestExecutionResponse(status));
  });

  app.post('/api/v1/requests/:requestId/recover', async (request, reply) => {
    const params = request.params as { requestId: string };
    const status = await recoverRequestExecution({
      requestId: params.requestId,
      problemDefinitionService,
      solutionDefinitionService,
      dataAiPrivacyService,
      medicalDeviceTriageService,
      resourcesPilotViabilityService,
      sessionStore,
    });

    return reply.send(assertRequestExecutionResponse(status));
  });

  app.post('/internal/sessions/start-context', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await proposalStartService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'proposal_start_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(result);
  });

  app.post('/internal/sessions/append-reply', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await proposalReplyService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'proposal_reply_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(result);
  });

  app.post('/internal/agents/problem-definition/run', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      session_id: string;
      trigger: 'start' | 'reply';
    };

    const result = await problemDefinitionService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'agent_problem_definition_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      sessionId: body.session_id,
      trigger: body.trigger,
    });

    const response = body.trigger === 'start'
      ? assertProposalStartResponse({
          session_id: result.session_id,
          stage: 'problem_definition',
          structured_brief: result.structured_brief,
          detected_gaps: result.detected_gaps,
          next_question: result.next_question,
          agent_status: result.agent_status,
          warnings: result.warnings,
        })
      : assertProposalReplyResponse({
          session_id: result.session_id,
          stage: 'problem_definition',
          agent_status: result.agent_status,
          updated_problem_definition: result.updated_problem_definition,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        });

    return reply.send(response);
  });

  app.post('/internal/sessions/solution-start', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };
    const payload = assertSolutionStartRequest(body.payload);

    const result = await solutionDefinitionService.execute({
      context: {
        requestId: body.request_id ?? payload.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'solution_start_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      sessionId: payload.session_id,
      trigger: 'start',
    });

    return reply.send(assertSolutionStartResponse({
      session_id: result.session_id,
      stage: 'solution_definition',
      agent_status: result.agent_status,
      updated_solution_definition: result.updated_solution_definition,
      diagnosis: result.diagnosis,
      next_question: result.next_question,
      completion_reason: result.completion_reason,
      warnings: result.warnings,
    }));
  });

  app.post('/internal/sessions/solution-reply', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await solutionReplyService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'solution_reply_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(result);
  });

  app.post('/internal/agents/solution-definition/run', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      session_id: string;
      trigger: 'start' | 'reply';
    };

    const result = await solutionDefinitionService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'agent_solution_definition_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      sessionId: body.session_id,
      trigger: body.trigger,
    });

    const response = body.trigger === 'start'
      ? assertSolutionStartResponse({
          session_id: result.session_id,
          stage: 'solution_definition',
          agent_status: result.agent_status,
          updated_solution_definition: result.updated_solution_definition,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        })
      : assertSolutionReplyResponse({
          session_id: result.session_id,
          stage: 'solution_definition',
          agent_status: result.agent_status,
          updated_solution_definition: result.updated_solution_definition,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        });

    return reply.send(response);
  });

  app.post('/internal/sessions/data-ai-privacy-start', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await dataAiPrivacyService.start({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'data_ai_privacy_start_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(assertDataAiPrivacyStartResponse({
      session_id: result.session_id,
      stage: 'data_ai_privacy',
      profile_id: result.profile_id,
      agent_status: result.agent_status,
      updated_data_ai_privacy: result.updated_data_ai_privacy,
      diagnosis: result.diagnosis,
      next_question: result.next_question,
      completion_reason: result.completion_reason,
      warnings: result.warnings,
    }));
  });

  app.post('/internal/sessions/data-ai-privacy-reply', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await dataAiPrivacyService.reply({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'data_ai_privacy_reply_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(assertDataAiPrivacyReplyResponse({
      session_id: result.session_id,
      stage: 'data_ai_privacy',
      profile_id: result.profile_id,
      agent_status: result.agent_status,
      updated_data_ai_privacy: result.updated_data_ai_privacy,
      diagnosis: result.diagnosis,
      next_question: result.next_question,
      completion_reason: result.completion_reason,
      warnings: result.warnings,
    }));
  });

  app.post('/internal/agents/data-ai-privacy/run', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      session_id: string;
      trigger: 'start' | 'reply';
    };

    const result = await dataAiPrivacyService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'agent_data_ai_privacy_gap_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      sessionId: body.session_id,
      trigger: body.trigger,
    });

    const response = body.trigger === 'start'
      ? assertDataAiPrivacyStartResponse({
          session_id: result.session_id,
          stage: 'data_ai_privacy',
          profile_id: result.profile_id,
          agent_status: result.agent_status,
          updated_data_ai_privacy: result.updated_data_ai_privacy,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        })
      : assertDataAiPrivacyReplyResponse({
          session_id: result.session_id,
          stage: 'data_ai_privacy',
          profile_id: result.profile_id,
          agent_status: result.agent_status,
          updated_data_ai_privacy: result.updated_data_ai_privacy,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        });

    return reply.send(response);
  });

  app.post('/internal/sessions/medical-device-triage-start', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await medicalDeviceTriageService.start({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'medical_device_triage_start_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(assertMedicalDeviceTriageStartResponse({
      session_id: result.session_id,
      stage: 'medical_device_triage',
      profile_id: result.profile_id,
      activation_result: result.activation_result,
      agent_status: result.agent_status,
      updated_medical_device_triage: result.updated_medical_device_triage,
      diagnosis: result.diagnosis,
      next_question: result.next_question,
      completion_reason: result.completion_reason,
      warnings: result.warnings,
    }));
  });

  app.post('/internal/sessions/medical-device-triage-reply', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await medicalDeviceTriageService.reply({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'medical_device_triage_reply_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(assertMedicalDeviceTriageReplyResponse({
      session_id: result.session_id,
      stage: 'medical_device_triage',
      profile_id: result.profile_id,
      activation_result: result.activation_result,
      agent_status: result.agent_status,
      updated_medical_device_triage: result.updated_medical_device_triage,
      diagnosis: result.diagnosis,
      next_question: result.next_question,
      completion_reason: result.completion_reason,
      warnings: result.warnings,
    }));
  });

  app.post('/internal/agents/medical-device-triage/run', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      session_id: string;
      trigger: 'start' | 'reply';
    };

    const result = await medicalDeviceTriageService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'agent_medical_device_triage_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      sessionId: body.session_id,
      trigger: body.trigger,
    });

    const response = body.trigger === 'start'
      ? assertMedicalDeviceTriageStartResponse({
          session_id: result.session_id,
          stage: 'medical_device_triage',
          profile_id: result.profile_id,
          activation_result: result.activation_result,
          agent_status: result.agent_status,
          updated_medical_device_triage: result.updated_medical_device_triage,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        })
      : assertMedicalDeviceTriageReplyResponse({
          session_id: result.session_id,
          stage: 'medical_device_triage',
          profile_id: result.profile_id,
          activation_result: result.activation_result,
          agent_status: result.agent_status,
          updated_medical_device_triage: result.updated_medical_device_triage,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        });

    return reply.send(response);
  });

  app.post('/internal/sessions/resources-pilot-viability-start', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await resourcesPilotViabilityService.start({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'resources_pilot_viability_start_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(assertResourcesPilotViabilityStartResponse({
      session_id: result.session_id,
      stage: 'resources_pilot_viability',
      agent_status: result.agent_status,
      updated_resources_pilot_viability: result.updated_resources_pilot_viability,
      diagnosis: result.diagnosis,
      next_question: result.next_question,
      completion_reason: result.completion_reason,
      warnings: result.warnings,
    }));
  });

  app.post('/internal/sessions/resources-pilot-viability-reply', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      payload: unknown;
    };

    const result = await resourcesPilotViabilityService.reply({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'resources_pilot_viability_reply_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      payload: body.payload as never,
    });

    return reply.send(assertResourcesPilotViabilityReplyResponse({
      session_id: result.session_id,
      stage: 'resources_pilot_viability',
      agent_status: result.agent_status,
      updated_resources_pilot_viability: result.updated_resources_pilot_viability,
      diagnosis: result.diagnosis,
      next_question: result.next_question,
      completion_reason: result.completion_reason,
      warnings: result.warnings,
    }));
  });

  app.post('/internal/agents/resources-pilot-viability/run', async (request, reply) => {
    assertInternalSecret(request);

    const body = request.body as {
      request_id?: string;
      workflow_version?: string;
      workflow_execution_id?: string;
      session_id: string;
      trigger: 'start' | 'reply';
    };

    const result = await resourcesPilotViabilityService.execute({
      context: {
        requestId: body.request_id ?? getRequestId(request),
        workflowVersion: body.workflow_version ?? 'agent_resources_pilot_viability_v1',
        workflowExecutionId: body.workflow_execution_id,
      },
      sessionId: body.session_id,
      trigger: body.trigger,
    });

    const response = body.trigger === 'start'
      ? assertResourcesPilotViabilityStartResponse({
          session_id: result.session_id,
          stage: 'resources_pilot_viability',
          agent_status: result.agent_status,
          updated_resources_pilot_viability: result.updated_resources_pilot_viability,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        })
      : assertResourcesPilotViabilityReplyResponse({
          session_id: result.session_id,
          stage: 'resources_pilot_viability',
          agent_status: result.agent_status,
          updated_resources_pilot_viability: result.updated_resources_pilot_viability,
          diagnosis: result.diagnosis,
          next_question: result.next_question,
          completion_reason: result.completion_reason,
          warnings: result.warnings,
        });

    return reply.send(response);
  });

  app.post('/internal/reports/basic-alpha/compose', async (request, reply) => {
    assertInternalSecret(request);

    const body = assertBasicReportComposeRequest(request.body);

    const result = await assertBasicAlphaReportResponse(
      () => basicReportService.composeForSession({
        context: {
          requestId: body.request_id ?? getRequestId(request),
          workflowVersion: body.workflow_version ?? 'basic_alpha_report_v1',
          workflowExecutionId: body.workflow_execution_id,
        },
        sessionId: body.session_id,
      }),
      body.session_id,
    );

    return reply.send(result);
  });

  return app;
}

function getRequestId(request: FastifyRequest): string {
  const headerValue = request.headers['x-request-id'];

  if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  return crypto.randomUUID();
}

function assertInternalSecret(request: FastifyRequest): void {
  const headerValue = request.headers['x-internal-shared-secret'];
  const secret = request.server.services.config.internalSharedSecret;

  if (headerValue !== secret) {
    throw new AppError(401, 'unauthorized_internal_request', 'Missing or invalid internal shared secret');
  }
}

async function assertBasicAlphaReportResponse(
  loadReport: () => Promise<unknown>,
  sessionId: string,
) {
  try {
    return assertBasicAlphaReport(await loadReport());
  } catch (error) {
    if (error instanceof AppError && error.errorCode === 'invalid_basic_alpha_report') {
      throw new AppError(
        500,
        'invalid_response_contract',
        'The server produced a Basic Alpha report that does not match the response contract',
        false,
        sessionId,
        error.details,
      );
    }

    throw error;
  }
}

async function recoverRequestExecution(params: {
  requestId: string;
  sessionStore: SessionStore;
  problemDefinitionService: ProblemDefinitionService;
  solutionDefinitionService: SolutionDefinitionService;
  dataAiPrivacyService: DataAiPrivacyService;
  medicalDeviceTriageService: MedicalDeviceTriageService;
  resourcesPilotViabilityService: ResourcesPilotViabilityService;
}) {
  const currentStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

  if (currentStatus.status !== 'pending') {
    return currentStatus;
  }

  const startSession = await params.sessionStore.findSessionByStartRequestId(params.requestId);

  if (startSession) {
    try {
      await params.problemDefinitionService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: startSession.id,
        trigger: 'start',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (error.errorCode === 'start_already_initialized' || error.errorCode === 'session_completed')
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  const replyTurn = await params.sessionStore.findTurnByAnswerRequestId(params.requestId);

  if (replyTurn) {
    try {
      await params.problemDefinitionService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: replyTurn.session_id,
        trigger: 'reply',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (error.errorCode === 'reply_not_ready_for_agent' || error.errorCode === 'session_completed')
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  if (currentStatus.request_kind === 'solution_reply' && currentStatus.session_id) {
    try {
      await params.solutionDefinitionService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: currentStatus.session_id,
        trigger: 'reply',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (
          error.errorCode === 'solution_reply_not_ready_for_agent' ||
          error.errorCode === 'solution_start_already_completed'
        )
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  if (currentStatus.request_kind === 'data_ai_privacy_reply' && currentStatus.session_id) {
    try {
      await params.dataAiPrivacyService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: currentStatus.session_id,
        trigger: 'reply',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (
          error.errorCode === 'data_ai_privacy_reply_not_ready_for_agent' ||
          error.errorCode === 'data_ai_privacy_start_already_completed'
        )
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  if (currentStatus.request_kind === 'data_ai_privacy_start' && currentStatus.session_id) {
    try {
      await params.dataAiPrivacyService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: currentStatus.session_id,
        trigger: 'start',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (
          error.errorCode === 'data_ai_privacy_start_already_initialized' ||
          error.errorCode === 'data_ai_privacy_start_already_completed'
        )
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  if (currentStatus.request_kind === 'medical_device_triage_reply' && currentStatus.session_id) {
    try {
      await params.medicalDeviceTriageService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: currentStatus.session_id,
        trigger: 'reply',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (
          error.errorCode === 'medical_device_triage_reply_not_ready_for_agent' ||
          error.errorCode === 'medical_device_triage_start_already_completed'
        )
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  if (currentStatus.request_kind === 'medical_device_triage_start' && currentStatus.session_id) {
    try {
      await params.medicalDeviceTriageService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: currentStatus.session_id,
        trigger: 'start',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (
          error.errorCode === 'medical_device_triage_start_already_initialized' ||
          error.errorCode === 'medical_device_triage_start_already_completed'
        )
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  if (currentStatus.request_kind === 'resources_pilot_viability_reply' && currentStatus.session_id) {
    try {
      await params.resourcesPilotViabilityService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: currentStatus.session_id,
        trigger: 'reply',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (
          error.errorCode === 'resources_pilot_viability_reply_not_ready_for_agent' ||
          error.errorCode === 'resources_pilot_viability_start_already_completed'
        )
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  if (currentStatus.request_kind === 'resources_pilot_viability_start' && currentStatus.session_id) {
    try {
      await params.resourcesPilotViabilityService.execute({
        context: {
          requestId: params.requestId,
          workflowVersion: 'request_recovery_v1',
        },
        sessionId: currentStatus.session_id,
        trigger: 'start',
      });
    } catch (error) {
      const refreshedStatus = await params.sessionStore.getRequestExecutionStatus(params.requestId);

      if (refreshedStatus.status !== 'pending') {
        return refreshedStatus;
      }

      if (
        error instanceof AppError &&
        (
          error.errorCode === 'resources_pilot_viability_start_already_initialized' ||
          error.errorCode === 'resources_pilot_viability_start_already_completed'
        )
      ) {
        return refreshedStatus;
      }

      throw error;
    }

    return params.sessionStore.getRequestExecutionStatus(params.requestId);
  }

  return currentStatus;
}
