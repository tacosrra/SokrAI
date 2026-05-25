import { assertBasicAlphaReport } from '../contracts/schema-registry';
import type { AlphaProposal, BasicAlphaReport, GeneratedSection } from '../contracts/types';
import {
  BASIC_ALPHA_REPORT_SCHEMA_VERSION,
  BASIC_ALPHA_REPORT_WARNINGS,
  buildBasicReportAuditRefs,
  collectBasicReportSources,
  determineBasicReportStatus,
} from '../domain/basic-report';
import type { AlphaStore } from '../repositories/alpha-store';
import type { SqlExecutor } from '../repositories/database';
import { AppError } from '../utils/errors';
import type { Logger } from '../utils/logger';
import type { BasicReportResponse, ComposeBasicReportCommand } from './service-types';

export class BasicReportService {
  constructor(
    private readonly logger: Logger,
    private readonly alphaStore: AlphaStore,
  ) {}

  async composeForSession(command: ComposeBasicReportCommand): Promise<BasicReportResponse> {
    try {
      return await this.alphaStore.getDatabase().withTransaction(async (client) => {
        const proposal = await this.getProposalForSession(command.sessionId, client);
        const existingReport = await this.alphaStore.findBasicReport(proposal.proposal_id, client);

        if (existingReport) {
          return assertBasicAlphaReport(existingReport);
        }

        const problemSection = await this.requireCurrentSection(proposal.proposal_id, 'problem', client);
        const solutionSection = await this.requireCurrentSection(proposal.proposal_id, 'solution', client);
        const currentGaps = await this.alphaStore.listGaps(proposal.proposal_id, client);
        const proposalSources = await this.alphaStore.listSources(proposal.proposal_id, client);
        const auditEvents = await this.alphaStore.listAuditEvents(proposal.proposal_id, client);
        const internalSources = collectBasicReportSources({
          proposalSources,
          problemSection,
          solutionSection,
        });
        const auditRefs = buildBasicReportAuditRefs({
          problemSection,
          solutionSection,
          auditEventIds: auditEvents.map((event) => event.id),
        });
        const report = await this.alphaStore.createBasicReport(client, {
          proposalId: proposal.proposal_id,
          reportStatus: determineBasicReportStatus(currentGaps),
          schemaVersion: BASIC_ALPHA_REPORT_SCHEMA_VERSION,
          structuredBrief: proposal.structured_brief,
          currentGaps,
          problemSectionId: problemSection.section_id,
          solutionSectionId: solutionSection.section_id,
          internalSources,
          auditRefs,
          warnings: BASIC_ALPHA_REPORT_WARNINGS,
        });

        await this.alphaStore.appendAuditEvent(client, {
          proposalId: proposal.proposal_id,
          sessionId: command.sessionId,
          eventType: 'basic_report_composed',
          actorType: 'system',
          requestId: command.context.requestId,
          payloadJson: {
            report_id: report.report_id,
            problem_section_id: problemSection.section_id,
            problem_section_version: problemSection.section_version,
            solution_section_id: solutionSection.section_id,
            solution_section_version: solutionSection.section_version,
            source_count: internalSources.length,
            gap_count: currentGaps.length,
          },
        });

        this.logger.info('basic_alpha_report_composed', {
          request_id: command.context.requestId,
          session_id: command.sessionId,
          proposal_id: proposal.proposal_id,
          report_id: report.report_id,
          source_count: internalSources.length,
          gap_count: currentGaps.length,
        });

        return assertBasicAlphaReport(report);
      });
    } catch (error) {
      if (error instanceof AppError && error.errorCode === 'basic_report_already_exists') {
        return this.getForSession(command.sessionId);
      }

      throw error;
    }
  }

  async getForSession(sessionId: string): Promise<BasicAlphaReport> {
    const proposal = await this.getProposalForSession(sessionId);
    const report = await this.alphaStore.getBasicReport(proposal.proposal_id);

    return assertBasicAlphaReport(report);
  }

  private async getProposalForSession(sessionId: string, executor?: SqlExecutor): Promise<AlphaProposal> {
    const proposal = await this.alphaStore.findProposalBySessionId(sessionId, executor);

    if (proposal) {
      return proposal;
    }

    return this.alphaStore.getProposal(sessionId, executor);
  }

  private async requireCurrentSection(
    proposalId: string,
    sectionKind: 'problem' | 'solution',
    executor?: SqlExecutor,
  ): Promise<GeneratedSection> {
    const section = await this.alphaStore.findCurrentGeneratedSection(proposalId, sectionKind, executor);

    if (!section) {
      throw new AppError(
        409,
        `${sectionKind}_section_required_for_report`,
        `A generated ${sectionKind} section is required before composing the Basic Alpha report`,
        false,
        proposalId,
      );
    }

    return section;
  }
}
