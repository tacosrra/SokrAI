import { assertProposalStartRequest } from '../contracts/schema-registry';
import { AppError, ensure } from '../utils/errors';
import { sha256 } from '../utils/hash';
import type { Logger } from '../utils/logger';
import type { AppConfig } from '../config/env';
import {
  deriveDetectedGaps,
  prepareBriefExtractionInput,
  toProblemDefinitionState,
} from '../domain/intake';
import {
  mergePreparedSources,
  prepareInputSources,
  type PreparedProposalDocument,
  type PreparedProposalSource,
} from '../domain/document-sources';
import { schemaIds } from '../contracts/schema-registry';
import type { StructuredBrief } from '../contracts/types';
import type { AlphaStore } from '../repositories/alpha-store';
import type { SessionStore } from '../repositories/session-store';
import type { LlmOrchestrator } from './llm-orchestrator';
import { PdfExtractionService } from './pdf-extraction-service';
import type { StartContextCommand, StartContextResponse } from './service-types';

export class ProposalStartService {
  private readonly pdfExtractionService = new PdfExtractionService();

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly sessionStore: SessionStore,
    private readonly llmOrchestrator: LlmOrchestrator,
    private readonly alphaStore: AlphaStore,
  ) {}

  async execute(command: StartContextCommand): Promise<StartContextResponse> {
    const payload = assertProposalStartRequest(command.payload);
    const requestId = command.context.requestId;

    if (requestId) {
      const existingSession = await this.sessionStore.findSessionByStartRequestId(requestId);

      if (existingSession) {
        const warnings = await this.rehydrateStartWarnings(existingSession.id);

        return {
          session_id: existingSession.id,
          stage: 'problem_definition',
          structured_brief: existingSession.latest_structured_brief_json,
          detected_gaps: deriveDetectedGaps(existingSession.latest_structured_brief_json),
          warnings,
        };
      }
    }

    ensure(
      !payload.proposal_text || payload.proposal_text.trim().length <= this.config.maxProposalChars,
      new AppError(400, 'proposal_too_large', 'The proposal text exceeds the maximum supported length'),
    );

    let pdfExtraction:
      | Awaited<ReturnType<PdfExtractionService['extractDocument']>>
      | undefined;

    if (payload.file) {
      pdfExtraction = await this.pdfExtractionService.extractDocument(
        payload.file.file_name,
        payload.file.content_base64,
      );
    }

    const preparedSources = prepareInputSources({
      proposalText: payload.proposal_text,
      documentText: payload.document_text,
      uploadedPdf: payload.file && pdfExtraction
        ? {
            fileName: payload.file.file_name,
            mimeType: payload.file.mime_type,
            extraction: pdfExtraction,
          }
        : undefined,
      allowSensitiveHealthData: this.config.allowSensitiveHealthData,
    });
    const sourceText = mergePreparedSources(preparedSources, this.config.maxProposalChars);

    ensure(
      sourceText.normalizedText.length > 0,
      new AppError(400, 'empty_submission', 'The submission must include proposal text or a PDF with extractable text'),
    );

    const briefExtractionInput = prepareBriefExtractionInput(
      sourceText.normalizedText,
      this.config.briefExtractionMaxChars,
    );
    const documentWarnings = sourceText.documents.flatMap((document) => document.warnings);
    const workflowWarnings = Array.from(
      new Set([...sourceText.warnings, ...documentWarnings, ...briefExtractionInput.warnings]),
    );

    const briefResult = await this.llmOrchestrator.extractStructuredBrief({
      projectTitle: payload.project_title,
      goal: payload.goal,
      normalizedText: briefExtractionInput.text,
    });

    const detectedGaps = deriveDetectedGaps(briefResult.output);
    const initialProblemDefinition = toProblemDefinitionState(briefResult.output);

    const session = await this.sessionStore
      .getDatabase()
      .withTransaction(async (client) => {
        const createdSession = await this.sessionStore.createSession(client, {
          startRequestId: requestId,
          userId: payload.user_id,
          projectTitle: payload.project_title,
          goal: payload.goal,
          rawInputText: sourceText.rawText,
          rawInputFileName: payload.file?.file_name,
          rawInputFileSha256: pdfExtraction?.sha256,
          normalizedText: sourceText.normalizedText,
          metadata: payload.metadata ?? {},
          structuredBrief: briefResult.output,
          initialProblemDefinition,
        });

        await this.createInitialAlphaRecords(client, {
          sessionId: createdSession.id,
          userId: payload.user_id,
          requestId,
          workflowVersion: command.context.workflowVersion,
          projectTitle: payload.project_title,
          goal: payload.goal,
          structuredBrief: briefResult.output,
          documents: sourceText.documents,
          sources: sourceText.sources,
          warnings: workflowWarnings,
        });

        await this.sessionStore.insertEvent(client, {
          sessionId: createdSession.id,
          eventType: 'session_created',
          actorType: 'workflow',
          requestId,
          payloadJson: {
            workflow_version: command.context.workflowVersion,
          },
        });

        const extractionRun = await this.sessionStore.recordAgentRun(client, {
          sessionId: createdSession.id,
          requestId,
          runPurpose: 'brief_extraction',
          agentName: 'initial_brief_extractor',
          workflowName: 'proposal_start_v1',
          workflowVersion: command.context.workflowVersion,
          workflowExecutionId: command.context.workflowExecutionId,
          promptName: briefResult.prompt.name,
          promptVersion: briefResult.prompt.version,
          promptSha256: briefResult.prompt.hash,
          modelProvider: briefResult.providerName,
          modelName: briefResult.modelName,
          modelParamsJson: briefResult.modelParams,
          inputContractName: 'proposal-start.request',
          inputContractVersion: 'v1',
          outputContractName: 'structured-brief',
          outputContractVersion: 'v1',
          inputPayloadJson: {
            request_id: payload.request_id,
            user_id: payload.user_id,
            project_title: payload.project_title,
            goal: payload.goal,
            proposal_text: payload.proposal_text,
            document_text: payload.document_text,
            file: payload.file
              ? {
                  file_name: payload.file.file_name,
                  mime_type: payload.file.mime_type,
                  sha256: pdfExtraction?.sha256,
                }
              : undefined,
            metadata: payload.metadata,
            source_summary: {
              document_count: sourceText.documents.length,
              source_count: sourceText.sources.length,
              documents: sourceText.documents.map((document) => ({
                key: document.key,
                source_kind: document.sourceKind,
                document_status: document.documentStatus,
                file_name: document.fileName,
                sha256: document.sha256,
                warnings: document.warnings,
              })),
              sources: sourceText.sources.map((source) => ({
                key: source.key,
                source_kind: source.sourceKind,
                label: source.label,
                span: source.span,
              })),
            },
          },
          rawModelOutput: briefResult.rawOutput,
          validatedOutputJson: briefResult.output as unknown as Record<string, unknown>,
          status: 'completed',
          repairAttempted: briefResult.repairAttempted,
          metricsJson: briefResult.metrics,
        });

        await this.sessionStore.insertEvent(client, {
          sessionId: createdSession.id,
          runId: extractionRun.id,
          eventType: 'brief_extracted',
          actorType: 'agent',
          requestId,
          payloadJson: {
            run_id: extractionRun.id,
          },
        });

        const initialSnapshot = await this.sessionStore.createSnapshot(client, {
          sessionId: createdSession.id,
          stateVersion: 0,
          sourceRunId: extractionRun.id,
          snapshotKind: 'session_started',
          sessionStatus: 'active',
          structuredBrief: briefResult.output,
          currentProblemDefinition: initialProblemDefinition,
          detectedGaps,
          agentStatus: 'continue',
          warnings: workflowWarnings,
          snapshotHash: sha256(
            JSON.stringify({
              structured_brief: briefResult.output,
              problem_definition: initialProblemDefinition,
              detected_gaps: detectedGaps,
            }),
          ),
        });

        await this.sessionStore.insertEvent(client, {
          sessionId: createdSession.id,
          runId: extractionRun.id,
          eventType: 'snapshot_created',
          actorType: 'system',
          requestId,
          payloadJson: {
            snapshot_id: initialSnapshot.id,
            snapshot_seq: initialSnapshot.snapshot_seq,
          },
        });

        return this.sessionStore.updateSessionHead(client, {
          sessionId: createdSession.id,
          status: 'active',
          currentTurnSeq: 0,
          stateVersion: 0,
          latestStructuredBrief: briefResult.output,
          latestProblemDefinition: initialProblemDefinition,
          latestSnapshotId: initialSnapshot.id,
          latestSuccessfulRunId: extractionRun.id,
        });
      });

    this.logger.info('proposal_start_context_created', {
      request_id: requestId,
      session_id: session.id,
      schema: schemaIds.proposalStartRequest,
    });

    this.logger.info('proposal_sources_created', {
      request_id: requestId,
      session_id: session.id,
      document_count: sourceText.documents.length,
      source_count: sourceText.sources.length,
    });

    return {
      session_id: session.id,
      stage: 'problem_definition',
      structured_brief: briefResult.output,
      detected_gaps: detectedGaps,
      warnings: workflowWarnings,
    };
  }

  private async createInitialAlphaRecords(
    client: Parameters<SessionStore['insertEvent']>[0],
    params: {
      sessionId: string;
      userId?: string;
      requestId?: string;
      workflowVersion: string;
      projectTitle: string;
      goal: string;
      structuredBrief: StructuredBrief;
      documents: PreparedProposalDocument[];
      sources: PreparedProposalSource[];
      warnings: string[];
    },
  ): Promise<void> {
    await this.alphaStore.createProposal(client, {
      proposalId: params.sessionId,
      sessionId: params.sessionId,
      userId: params.userId,
      proposalStatus: 'active',
      projectTitle: params.projectTitle,
      goal: params.goal,
      structuredBrief: params.structuredBrief,
      schemaVersion: 'alpha-model.v1',
      warnings: params.warnings,
      metadata: {
        workflow_version: params.workflowVersion,
        source: 'proposal_start_v1',
      },
    });

    const documentIds = new Map<string, string>();

    for (const sourceDocument of params.documents) {
      const document = await this.alphaStore.createDocument(client, {
        proposalId: params.sessionId,
        sourceKind: sourceDocument.sourceKind,
        documentStatus: sourceDocument.documentStatus,
        fileName: sourceDocument.fileName,
        mimeType: sourceDocument.mimeType,
        sha256: sourceDocument.sha256,
        pastedText: sourceDocument.pastedText,
        normalizedText: sourceDocument.normalizedText,
        warnings: sourceDocument.warnings,
        metadata: sourceDocument.metadata,
      });
      documentIds.set(sourceDocument.key, document.document_id);

      await this.sessionStore.insertEvent(client, {
        sessionId: params.sessionId,
        eventType:
          sourceDocument.sourceKind === 'extracted_text'
            ? 'document_extracted'
            : 'document_received',
        actorType: 'system',
        requestId: params.requestId,
        payloadJson: {
          document_id: document.document_id,
          source_kind: sourceDocument.sourceKind,
          document_status: sourceDocument.documentStatus,
          file_name: sourceDocument.fileName,
          sha256: sourceDocument.sha256,
        },
      });
    }

    for (const source of params.sources) {
      // These initial Alpha source rows use merged normalized-session spans.
      // Document-local spans, when added for richer extraction metadata, must
      // stay separate because the two coordinate systems are not interchangeable.
      await this.alphaStore.createSource(client, {
        proposalId: params.sessionId,
        sourceKind: source.sourceKind,
        label: source.label,
        documentId: documentIds.get(source.documentKey),
        span: source.span,
        metadata: source.metadata,
      });
    }

    await this.alphaStore.createModuleChat(client, {
      proposalId: params.sessionId,
      module: 'problem',
      chatStatus: 'active',
      warnings: [],
    });

    await this.alphaStore.appendAuditEvent(client, {
      proposalId: params.sessionId,
      sessionId: params.sessionId,
      eventType: 'proposal_created',
      actorType: 'workflow',
      requestId: params.requestId,
      payloadJson: {
        schema_version: 'alpha-model.v1',
        workflow_version: params.workflowVersion,
      },
    });
  }

  private async rehydrateStartWarnings(sessionId: string): Promise<string[]> {
    const [latestSnapshot, documents] = await Promise.all([
      this.sessionStore.findLatestSnapshot(sessionId),
      this.sessionStore.listProposalDocuments(sessionId),
    ]);

    return Array.from(
      new Set([
        ...(latestSnapshot?.warnings_json ?? []),
        ...documents.flatMap((document) => document.warnings),
      ]),
    );
  }
}
