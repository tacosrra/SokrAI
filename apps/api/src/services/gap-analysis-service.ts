import { assertAlphaGap } from '../contracts/schema-registry';
import type { AlphaGap, ProposalSource, StructuredBrief } from '../contracts/types';
import { analyzeInitialGapCandidates } from '../domain/gap-analysis';
import type { AlphaStore } from '../repositories/alpha-store';
import type { SqlExecutor } from '../repositories/database';
import type { Logger } from '../utils/logger';

export interface CreateInitialGapsParams {
  proposalId: string;
  sessionId: string;
  requestId?: string;
  structuredBrief: StructuredBrief;
  sources: ProposalSource[];
}

export class GapAnalysisService {
  constructor(
    private readonly logger: Logger,
    private readonly alphaStore: AlphaStore,
  ) {}

  async createInitialGaps(executor: SqlExecutor, params: CreateInitialGapsParams): Promise<AlphaGap[]> {
    const analysis = analyzeInitialGapCandidates({
      structuredBrief: params.structuredBrief,
      sources: params.sources,
    });
    const candidates = analysis.candidates;
    const persistedGaps: AlphaGap[] = [];

    if (analysis.filtered.length > 0) {
      await this.alphaStore.appendAuditEvent(executor, {
        proposalId: params.proposalId,
        sessionId: params.sessionId,
        eventType: 'gap_candidates_filtered',
        actorType: 'system',
        requestId: params.requestId,
        payloadJson: {
          filter_reason: 'forbidden_scope',
          filtered_count: analysis.filtered.length,
          filtered_candidates: analysis.filtered,
        },
      });
    }

    for (const candidate of candidates) {
      const gap = assertAlphaGap(
        await this.alphaStore.createGap(executor, {
          proposalId: params.proposalId,
          module: candidate.module,
          gapKind: candidate.gap_kind,
          gapStatus: candidate.gap_status,
          origin: candidate.origin,
          field: candidate.field,
          description: candidate.description,
          absence: candidate.absence,
          questionHint: candidate.question_hint,
          sourceRefs: candidate.source_refs,
          auditRefs: candidate.audit_refs,
          warnings: candidate.warnings,
        }),
      );

      await this.alphaStore.appendAuditEvent(executor, {
        proposalId: params.proposalId,
        sessionId: params.sessionId,
        eventType: 'gap_detected',
        actorType: 'system',
        requestId: params.requestId,
        payloadJson: {
          gap_id: gap.gap_id,
          origin: gap.origin,
          field: gap.field,
          gap_kind: gap.gap_kind,
        },
      });

      persistedGaps.push(gap);
    }

    this.logger.info('alpha_initial_gaps_created', {
      request_id: params.requestId,
      session_id: params.sessionId,
      proposal_id: params.proposalId,
      gap_count: persistedGaps.length,
      filtered_gap_candidate_count: analysis.filtered.length,
    });

    return persistedGaps;
  }
}
