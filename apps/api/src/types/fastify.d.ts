import type { AppConfig } from '../config/env';
import type { Database } from '../repositories/database';
import type { SessionStore } from '../repositories/session-store';
import type { LlmOrchestrator } from '../services/llm-orchestrator';
import type { LanguageModelClient } from '../services/ollama-client';
import type { ProblemDefinitionService } from '../services/problem-definition-service';
import type { ProposalReplyService } from '../services/proposal-reply-service';
import type { ProposalStartService } from '../services/proposal-start-service';
import type { Logger } from '../utils/logger';

declare module 'fastify' {
  interface FastifyInstance {
    services: {
      config: AppConfig;
      logger: Logger;
      database: Database;
      sessionStore: SessionStore;
      llmClient: LanguageModelClient;
      llmOrchestrator: LlmOrchestrator;
      proposalStartService: ProposalStartService;
      proposalReplyService: ProposalReplyService;
      problemDefinitionService: ProblemDefinitionService;
    };
  }
}
