import crypto from 'node:crypto';

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { loadConfig, type AppConfig } from './config/env';
import {
  assertErrorResponse,
  assertProposalReplyResponse,
  assertProposalStartResponse,
  assertRequestExecutionResponse,
} from './contracts/schema-registry';
import { Database } from './repositories/database';
import { AlphaStore } from './repositories/alpha-store';
import { SessionStore } from './repositories/session-store';
import { LlmOrchestrator } from './services/llm-orchestrator';
import { OllamaClient, type LanguageModelClient } from './services/ollama-client';
import { ProblemDefinitionService } from './services/problem-definition-service';
import { ProposalReplyService } from './services/proposal-reply-service';
import { ProposalStartService } from './services/proposal-start-service';
import { AppError } from './utils/errors';
import { JsonLogger, type Logger } from './utils/logger';

export interface BuildAppOptions {
  config?: AppConfig;
  logger?: Logger;
  database?: Database;
  languageModelClient?: LanguageModelClient;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? new JsonLogger(config.logLevel);
  const database = options.database ?? new Database(config);
  const llmClient = options.languageModelClient ?? new OllamaClient(config);
  const sessionStore = new SessionStore(database);
  const alphaStore = new AlphaStore(database);
  const llmOrchestrator = new LlmOrchestrator(config, llmClient);
  const proposalStartService = new ProposalStartService(config, logger, sessionStore, llmOrchestrator, alphaStore);
  const proposalReplyService = new ProposalReplyService(config, logger, sessionStore);
  const problemDefinitionService = new ProblemDefinitionService(config, logger, sessionStore, llmOrchestrator);

  const app = Fastify({
    logger: false,
  });

  app.decorate('services', {
    config,
    logger,
    database,
    sessionStore,
    alphaStore,
    llmClient,
    llmOrchestrator,
    proposalStartService,
    proposalReplyService,
    problemDefinitionService,
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

      logger.warn('request_failed', {
        request_id: requestId,
        error_code: error.errorCode,
        status_code: error.statusCode,
        path: request.url,
        session_id: error.sessionId,
      });

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

async function recoverRequestExecution(params: {
  requestId: string;
  sessionStore: SessionStore;
  problemDefinitionService: ProblemDefinitionService;
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

  return currentStatus;
}
