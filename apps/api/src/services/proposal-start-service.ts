import { assertProposalStartRequest } from '../contracts/schema-registry';
import { AppError, ensure } from '../utils/errors';
import { sha256 } from '../utils/hash';
import type { Logger } from '../utils/logger';
import type { AppConfig } from '../config/env';
import {
  deriveDetectedGaps,
  mergeSourceText,
  prepareBriefExtractionInput,
  toProblemDefinitionState,
} from '../domain/intake';
import { schemaIds } from '../contracts/schema-registry';
import type { ProposalDocumentSourceKind, ProposalStartRequest, StructuredBrief } from '../contracts/types';
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
        return {
          session_id: existingSession.id,
          stage: 'problem_definition',
          structured_brief: existingSession.latest_structured_brief_json,
          detected_gaps: deriveDetectedGaps(existingSession.latest_structured_brief_json),
          warnings: [],
        };
      }
    }

    ensure(
      !payload.proposal_text || payload.proposal_text.trim().length <= this.config.maxProposalChars,
      new AppError(400, 'proposal_too_large', 'The proposal text exceeds the maximum supported length'),
    );

    let extractedDocumentText = payload.document_text?.trim() ?? '';
    let fileName: string | undefined;
    let fileHash: string | undefined;

    if (payload.file) {
      fileName = payload.file.file_name;
      fileHash = sha256(payload.file.content_base64);
      extractedDocumentText = await this.pdfExtractionService.extractText(
        payload.file.file_name,
        payload.file.content_base64,
      );
    }

    const sourceText = mergeSourceText(
      payload.proposal_text,
      extractedDocumentText,
      this.config.maxProposalChars,
    );

    ensure(
      sourceText.normalizedText.length > 0,
      new AppError(400, 'empty_submission', 'The submission must include proposal text or a PDF with extractable text'),
    );

    const briefExtractionInput = prepareBriefExtractionInput(
      sourceText.normalizedText,
      this.config.briefExtractionMaxChars,
    );
    const workflowWarnings = Array.from(
      new Set([...sourceText.warnings, ...briefExtractionInput.warnings]),
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
          rawInputFileName: fileName,
          rawInputFileSha256: fileHash,
          normalizedText: sourceText.normalizedText,
          metadata: payload.metadata ?? {},
          structuredBrief: briefResult.output,
          initialProblemDefinition,
        });

        await this.createInitialAlphaRecords(client, {
          payload,
          sessionId: createdSession.id,
          userId: payload.user_id,
          requestId,
          workflowVersion: command.context.workflowVersion,
          projectTitle: payload.project_title,
          goal: payload.goal,
          structuredBrief: briefResult.output,
          rawProposalText: payload.proposal_text?.trim(),
          extractedDocumentText,
          fileName,
          fileHash,
          normalizedText: sourceText.normalizedText,
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

        const extractionRun = await this.sessionStore.insertAgentRun(client, {
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
          modelName: briefResult.modelName,
          inputContractName: 'proposal-start.request',
          inputContractVersion: 'v1',
          outputContractName: 'structured-brief',
          outputContractVersion: 'v1',
          inputPayloadJson: {
            ...payload,
            document_text: extractedDocumentText || undefined,
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

    return {
      session_id: session.id,
      stage: 'problem_definition',
      structured_brief: briefResult.output,
      detected_gaps: detectedGaps,
      warnings: workflowWarnings,
    };
  }

  private async createInitialAlphaRecords(
    client: Parameters<AlphaStore['createProposal']>[0],
    params: {
      payload: ProposalStartRequest;
      sessionId: string;
      userId?: string;
      requestId?: string;
      workflowVersion: string;
      projectTitle: string;
      goal: string;
      structuredBrief: StructuredBrief;
      rawProposalText?: string;
      extractedDocumentText: string;
      fileName?: string;
      fileHash?: string;
      normalizedText: string;
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

    const sourceDocuments = this.buildInitialAlphaDocuments(params);

    for (const sourceDocument of sourceDocuments) {
      const document = await this.alphaStore.createDocument(client, {
        proposalId: params.sessionId,
        sourceKind: sourceDocument.sourceKind,
        documentStatus: 'normalized',
        fileName: sourceDocument.fileName,
        mimeType: sourceDocument.mimeType,
        sha256: sourceDocument.sha256,
        pastedText: sourceDocument.pastedText,
        normalizedText: sourceDocument.normalizedText,
        warnings: params.warnings,
      });

      await this.alphaStore.createSource(client, {
        proposalId: params.sessionId,
        sourceKind: sourceDocument.sourceKind,
        label: sourceDocument.label,
        documentId: document.document_id,
        span: {
          start_char: 0,
          end_char: sourceDocument.normalizedText.length,
        },
        metadata: {
          workflow_version: params.workflowVersion,
        },
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

  private buildInitialAlphaDocuments(params: {
    payload: ProposalStartRequest;
    rawProposalText?: string;
    extractedDocumentText: string;
    fileName?: string;
    fileHash?: string;
    normalizedText: string;
  }): Array<{
    sourceKind: ProposalDocumentSourceKind;
    label: string;
    fileName?: string;
    mimeType?: string;
    sha256?: string;
    pastedText?: string;
    normalizedText: string;
  }> {
    const documents: Array<{
      sourceKind: ProposalDocumentSourceKind;
      label: string;
      fileName?: string;
      mimeType?: string;
      sha256?: string;
      pastedText?: string;
      normalizedText: string;
    }> = [];

    if (params.rawProposalText) {
      documents.push({
        sourceKind: 'pasted_text',
        label: 'Initial proposal text',
        pastedText: params.rawProposalText,
        normalizedText: params.rawProposalText,
      });
    }

    if (params.payload.file && params.extractedDocumentText) {
      documents.push({
        sourceKind: 'uploaded_file',
        label: params.fileName ?? 'Uploaded proposal file',
        fileName: params.fileName,
        mimeType: params.payload.file.mime_type,
        sha256: params.fileHash,
        normalizedText: params.extractedDocumentText,
      });
    } else if (params.payload.document_text?.trim()) {
      documents.push({
        sourceKind: 'extracted_text',
        label: 'Extracted proposal text',
        normalizedText: params.payload.document_text.trim(),
      });
    }

    if (documents.length === 0) {
      documents.push({
        sourceKind: 'pasted_text',
        label: 'Initial proposal text',
        pastedText: params.normalizedText,
        normalizedText: params.normalizedText,
      });
    }

    return documents;
  }
}
