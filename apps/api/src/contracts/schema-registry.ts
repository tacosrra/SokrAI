import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import auditRefSchema from '../../../../contracts/schemas/audit-ref.schema.json';
import alphaGapSchema from '../../../../contracts/schemas/alpha-gap.schema.json';
import alphaProposalSchema from '../../../../contracts/schemas/alpha-proposal.schema.json';
import basicAlphaReportSchema from '../../../../contracts/schemas/basic-alpha-report.schema.json';
import basicReportComposeRequestSchema from '../../../../contracts/schemas/basic-report-compose.request.schema.json';
import chatTurnSchema from '../../../../contracts/schemas/chat-turn.schema.json';
import errorResponseSchema from '../../../../contracts/schemas/error-response.schema.json';
import generatedSectionSchema from '../../../../contracts/schemas/generated-section.schema.json';
import moduleChatSchema from '../../../../contracts/schemas/module-chat.schema.json';
import problemDefinitionTurnSchema from '../../../../contracts/schemas/problem-definition-turn.schema.json';
import proposalDocumentSchema from '../../../../contracts/schemas/proposal-document.schema.json';
import proposalReplyRequestSchema from '../../../../contracts/schemas/proposal-reply.request.schema.json';
import proposalReplyResponseSchema from '../../../../contracts/schemas/proposal-reply.response.schema.json';
import proposalSourceSchema from '../../../../contracts/schemas/proposal-source.schema.json';
import proposalStartRequestSchema from '../../../../contracts/schemas/proposal-start.request.schema.json';
import proposalStartResponseSchema from '../../../../contracts/schemas/proposal-start.response.schema.json';
import requestExecutionResponseSchema from '../../../../contracts/schemas/request-execution.response.schema.json';
import solutionDefinitionTurnSchema from '../../../../contracts/schemas/solution-definition-turn.schema.json';
import solutionReplyRequestSchema from '../../../../contracts/schemas/solution-reply.request.schema.json';
import solutionReplyResponseSchema from '../../../../contracts/schemas/solution-reply.response.schema.json';
import solutionStartRequestSchema from '../../../../contracts/schemas/solution-start.request.schema.json';
import solutionStartResponseSchema from '../../../../contracts/schemas/solution-start.response.schema.json';
import structuredBriefSchema from '../../../../contracts/schemas/structured-brief.schema.json';
import type {
  AlphaGap,
  AlphaProposal,
  BasicAlphaReport,
  BasicReportComposeRequest,
  ChatTurn,
  ErrorResponse,
  GeneratedSection,
  ModuleChat,
  ProblemDefinitionTurn,
  ProposalDocument,
  ProposalReplyRequest,
  ProposalReplyResponse,
  ProposalSource,
  ProposalStartRequest,
  ProposalStartResponse,
  RequestExecutionResponse,
  SolutionDefinitionTurn,
  SolutionReplyRequest,
  SolutionReplyResponse,
  SolutionStartRequest,
  SolutionStartResponse,
  StructuredBrief,
} from './types';
import { AppError } from '../utils/errors';

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

addFormats(ajv);

ajv.addSchema(structuredBriefSchema, structuredBriefSchema.$id);
ajv.addSchema(proposalSourceSchema, proposalSourceSchema.$id);
ajv.addSchema(auditRefSchema, auditRefSchema.$id);
ajv.addSchema(proposalDocumentSchema, proposalDocumentSchema.$id);
ajv.addSchema(alphaGapSchema, alphaGapSchema.$id);
ajv.addSchema(chatTurnSchema, chatTurnSchema.$id);
ajv.addSchema(moduleChatSchema, moduleChatSchema.$id);
ajv.addSchema(generatedSectionSchema, generatedSectionSchema.$id);
ajv.addSchema(alphaProposalSchema, alphaProposalSchema.$id);
ajv.addSchema(basicAlphaReportSchema, basicAlphaReportSchema.$id);
ajv.addSchema(basicReportComposeRequestSchema, basicReportComposeRequestSchema.$id);
ajv.addSchema(problemDefinitionTurnSchema, problemDefinitionTurnSchema.$id);
ajv.addSchema(solutionDefinitionTurnSchema, solutionDefinitionTurnSchema.$id);
ajv.addSchema(proposalStartRequestSchema, proposalStartRequestSchema.$id);
ajv.addSchema(proposalStartResponseSchema, proposalStartResponseSchema.$id);
ajv.addSchema(proposalReplyRequestSchema, proposalReplyRequestSchema.$id);
ajv.addSchema(proposalReplyResponseSchema, proposalReplyResponseSchema.$id);
ajv.addSchema(solutionStartRequestSchema, solutionStartRequestSchema.$id);
ajv.addSchema(solutionStartResponseSchema, solutionStartResponseSchema.$id);
ajv.addSchema(solutionReplyRequestSchema, solutionReplyRequestSchema.$id);
ajv.addSchema(solutionReplyResponseSchema, solutionReplyResponseSchema.$id);
ajv.addSchema(requestExecutionResponseSchema, requestExecutionResponseSchema.$id);
ajv.addSchema(errorResponseSchema, errorResponseSchema.$id);

function formatErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

export function assertSchema<T>(schemaId: string, payload: unknown, errorCode = 'schema_validation_error'): T {
  const validate = ajv.getSchema(schemaId);

  if (!validate) {
    throw new AppError(500, 'schema_not_registered', `Schema not registered: ${schemaId}`, false, undefined, {
      schemaId,
    });
  }

  const valid = validate(payload);

  if (!valid) {
    throw new AppError(400, errorCode, `Payload does not match schema ${schemaId}`, false, undefined, {
      schemaId,
      errors: formatErrors(validate),
    });
  }

  return payload as T;
}

export const schemaIds = {
  auditRef: auditRefSchema.$id,
  alphaGap: alphaGapSchema.$id,
  alphaProposal: alphaProposalSchema.$id,
  basicAlphaReport: basicAlphaReportSchema.$id,
  basicReportComposeRequest: basicReportComposeRequestSchema.$id,
  chatTurn: chatTurnSchema.$id,
  errorResponse: errorResponseSchema.$id,
  generatedSection: generatedSectionSchema.$id,
  moduleChat: moduleChatSchema.$id,
  problemDefinitionTurn: problemDefinitionTurnSchema.$id,
  proposalDocument: proposalDocumentSchema.$id,
  proposalReplyRequest: proposalReplyRequestSchema.$id,
  proposalReplyResponse: proposalReplyResponseSchema.$id,
  proposalSource: proposalSourceSchema.$id,
  proposalStartRequest: proposalStartRequestSchema.$id,
  proposalStartResponse: proposalStartResponseSchema.$id,
  requestExecutionResponse: requestExecutionResponseSchema.$id,
  solutionDefinitionTurn: solutionDefinitionTurnSchema.$id,
  solutionReplyRequest: solutionReplyRequestSchema.$id,
  solutionReplyResponse: solutionReplyResponseSchema.$id,
  solutionStartRequest: solutionStartRequestSchema.$id,
  solutionStartResponse: solutionStartResponseSchema.$id,
  structuredBrief: structuredBriefSchema.$id,
} as const;

export const schemaDocuments = {
  auditRef: auditRefSchema,
  alphaGap: alphaGapSchema,
  alphaProposal: alphaProposalSchema,
  basicAlphaReport: basicAlphaReportSchema,
  basicReportComposeRequest: basicReportComposeRequestSchema,
  chatTurn: chatTurnSchema,
  errorResponse: errorResponseSchema,
  generatedSection: generatedSectionSchema,
  moduleChat: moduleChatSchema,
  problemDefinitionTurn: problemDefinitionTurnSchema,
  proposalDocument: proposalDocumentSchema,
  proposalReplyRequest: proposalReplyRequestSchema,
  proposalReplyResponse: proposalReplyResponseSchema,
  proposalSource: proposalSourceSchema,
  proposalStartRequest: proposalStartRequestSchema,
  proposalStartResponse: proposalStartResponseSchema,
  requestExecutionResponse: requestExecutionResponseSchema,
  solutionDefinitionTurn: solutionDefinitionTurnSchema,
  solutionReplyRequest: solutionReplyRequestSchema,
  solutionReplyResponse: solutionReplyResponseSchema,
  solutionStartRequest: solutionStartRequestSchema,
  solutionStartResponse: solutionStartResponseSchema,
  structuredBrief: structuredBriefSchema,
} as const;

export function assertProposalStartRequest(payload: unknown): ProposalStartRequest {
  return assertSchema<ProposalStartRequest>(schemaIds.proposalStartRequest, payload, 'invalid_start_request');
}

export function assertProposalStartResponse(payload: unknown): ProposalStartResponse {
  return assertSchema<ProposalStartResponse>(schemaIds.proposalStartResponse, payload, 'invalid_start_response');
}

export function assertProposalReplyRequest(payload: unknown): ProposalReplyRequest {
  return assertSchema<ProposalReplyRequest>(schemaIds.proposalReplyRequest, payload, 'invalid_reply_request');
}

export function assertProposalReplyResponse(payload: unknown): ProposalReplyResponse {
  return assertSchema<ProposalReplyResponse>(schemaIds.proposalReplyResponse, payload, 'invalid_reply_response');
}

export function assertSolutionStartRequest(payload: unknown): SolutionStartRequest {
  return assertSchema<SolutionStartRequest>(schemaIds.solutionStartRequest, payload, 'invalid_solution_start_request');
}

export function assertSolutionStartResponse(payload: unknown): SolutionStartResponse {
  return assertSchema<SolutionStartResponse>(schemaIds.solutionStartResponse, payload, 'invalid_solution_start_response');
}

export function assertSolutionReplyRequest(payload: unknown): SolutionReplyRequest {
  return assertSchema<SolutionReplyRequest>(schemaIds.solutionReplyRequest, payload, 'invalid_solution_reply_request');
}

export function assertSolutionReplyResponse(payload: unknown): SolutionReplyResponse {
  return assertSchema<SolutionReplyResponse>(schemaIds.solutionReplyResponse, payload, 'invalid_solution_reply_response');
}

export function assertStructuredBrief(payload: unknown): StructuredBrief {
  return assertSchema<StructuredBrief>(schemaIds.structuredBrief, payload, 'invalid_structured_brief');
}

export function assertProposalSource(payload: unknown): ProposalSource {
  return assertSchema<ProposalSource>(schemaIds.proposalSource, payload, 'invalid_proposal_source');
}

export function assertProposalDocument(payload: unknown): ProposalDocument {
  return assertSchema<ProposalDocument>(schemaIds.proposalDocument, payload, 'invalid_proposal_document');
}

export function assertAlphaGap(payload: unknown): AlphaGap {
  return assertSchema<AlphaGap>(schemaIds.alphaGap, payload, 'invalid_alpha_gap');
}

export function assertChatTurn(payload: unknown): ChatTurn {
  return assertSchema<ChatTurn>(schemaIds.chatTurn, payload, 'invalid_chat_turn');
}

export function assertModuleChat(payload: unknown): ModuleChat {
  return assertSchema<ModuleChat>(schemaIds.moduleChat, payload, 'invalid_module_chat');
}

export function assertGeneratedSection(payload: unknown): GeneratedSection {
  return assertSchema<GeneratedSection>(schemaIds.generatedSection, payload, 'invalid_generated_section');
}

export function assertAlphaProposal(payload: unknown): AlphaProposal {
  return assertSchema<AlphaProposal>(schemaIds.alphaProposal, payload, 'invalid_alpha_proposal');
}

export function assertBasicAlphaReport(payload: unknown): BasicAlphaReport {
  return assertSchema<BasicAlphaReport>(schemaIds.basicAlphaReport, payload, 'invalid_basic_alpha_report');
}

export function assertBasicReportComposeRequest(payload: unknown): BasicReportComposeRequest {
  return assertSchema<BasicReportComposeRequest>(
    schemaIds.basicReportComposeRequest,
    payload,
    'invalid_basic_report_compose_request',
  );
}

export function assertProblemDefinitionTurn(payload: unknown): ProblemDefinitionTurn {
  return assertSchema<ProblemDefinitionTurn>(schemaIds.problemDefinitionTurn, payload, 'invalid_problem_definition_turn');
}

export function assertSolutionDefinitionTurn(payload: unknown): SolutionDefinitionTurn {
  return assertSchema<SolutionDefinitionTurn>(
    schemaIds.solutionDefinitionTurn,
    payload,
    'invalid_solution_definition_turn',
  );
}

export function assertErrorResponse(payload: unknown): ErrorResponse {
  return assertSchema<ErrorResponse>(schemaIds.errorResponse, payload, 'invalid_error_response');
}

export function assertRequestExecutionResponse(payload: unknown): RequestExecutionResponse {
  return assertSchema<RequestExecutionResponse>(
    schemaIds.requestExecutionResponse,
    payload,
    'invalid_request_execution_response',
  );
}
