import type { AppConfig } from '../config/env';
import type { Database } from '../repositories/database';
import type { AlphaStore } from '../repositories/alpha-store';
import type { SessionStore } from '../repositories/session-store';
import type { AiProviderPort } from '../services/ai-provider';
import type { BasicReportService } from '../services/basic-report-service';
import type { GapAnalysisService } from '../services/gap-analysis-service';
import type { LlmOrchestrator } from '../services/llm-orchestrator';
import type { ProblemDefinitionService } from '../services/problem-definition-service';
import type { ProposalReplyService } from '../services/proposal-reply-service';
import type { ProposalStartService } from '../services/proposal-start-service';
import type { SolutionDefinitionService } from '../services/solution-definition-service';
import type { SolutionReplyService } from '../services/solution-reply-service';
import type { Logger } from '../utils/logger';

declare module 'fastify' {
  interface FastifyInstance {
    services: {
      config: AppConfig;
      logger: Logger;
      database: Database;
      sessionStore: SessionStore;
      alphaStore: AlphaStore;
      aiProvider: AiProviderPort;
      llmOrchestrator: LlmOrchestrator;
      gapAnalysisService: GapAnalysisService;
      basicReportService: BasicReportService;
      proposalStartService: ProposalStartService;
      proposalReplyService: ProposalReplyService;
      problemDefinitionService: ProblemDefinitionService;
      solutionReplyService: SolutionReplyService;
      solutionDefinitionService: SolutionDefinitionService;
    };
  }
}
