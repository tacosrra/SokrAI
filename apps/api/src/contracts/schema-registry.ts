import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import errorResponseSchema from '../../../../contracts/schemas/error-response.schema.json';
import problemDefinitionTurnSchema from '../../../../contracts/schemas/problem-definition-turn.schema.json';
import proposalReplyRequestSchema from '../../../../contracts/schemas/proposal-reply.request.schema.json';
import proposalReplyResponseSchema from '../../../../contracts/schemas/proposal-reply.response.schema.json';
import proposalStartRequestSchema from '../../../../contracts/schemas/proposal-start.request.schema.json';
import proposalStartResponseSchema from '../../../../contracts/schemas/proposal-start.response.schema.json';
import ragPacksResponseSchema from '../../../../contracts/schemas/rag-packs-response.schema.json';
import ragSearchRequestSchema from '../../../../contracts/schemas/rag-search-request.schema.json';
import ragSearchResponseSchema from '../../../../contracts/schemas/rag-search-response.schema.json';
import structuredBriefSchema from '../../../../contracts/schemas/structured-brief.schema.json';
import type {
  ErrorResponse,
  ProblemDefinitionTurn,
  ProposalReplyRequest,
  ProposalReplyResponse,
  ProposalStartRequest,
  ProposalStartResponse,
  StructuredBrief,
} from './types';
import { AppError } from '../utils/errors';

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

addFormats(ajv);

ajv.addSchema(structuredBriefSchema, structuredBriefSchema.$id);
ajv.addSchema(problemDefinitionTurnSchema, problemDefinitionTurnSchema.$id);
ajv.addSchema(proposalStartRequestSchema, proposalStartRequestSchema.$id);
ajv.addSchema(proposalStartResponseSchema, proposalStartResponseSchema.$id);
ajv.addSchema(proposalReplyRequestSchema, proposalReplyRequestSchema.$id);
ajv.addSchema(proposalReplyResponseSchema, proposalReplyResponseSchema.$id);
ajv.addSchema(errorResponseSchema, errorResponseSchema.$id);
ajv.addSchema(ragSearchRequestSchema, ragSearchRequestSchema.$id);
ajv.addSchema(ragSearchResponseSchema, ragSearchResponseSchema.$id);
ajv.addSchema(ragPacksResponseSchema, ragPacksResponseSchema.$id);

function formatErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

export function assertSchema<T>(schemaId: string, payload: unknown, errorCode = 'schema_validation_error'): T {
  const validate = ajv.getSchema(schemaId);

  if (!validate) {
    throw new Error(`Schema not registered: ${schemaId}`);
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
  errorResponse: errorResponseSchema.$id,
  problemDefinitionTurn: problemDefinitionTurnSchema.$id,
  proposalReplyRequest: proposalReplyRequestSchema.$id,
  proposalReplyResponse: proposalReplyResponseSchema.$id,
  proposalStartRequest: proposalStartRequestSchema.$id,
  proposalStartResponse: proposalStartResponseSchema.$id,
  structuredBrief: structuredBriefSchema.$id,
  ragSearchRequest: ragSearchRequestSchema.$id,
  ragSearchResponse: ragSearchResponseSchema.$id,
  ragPacksResponse: ragPacksResponseSchema.$id,
} as const;

export const schemaDocuments = {
  errorResponse: errorResponseSchema,
  problemDefinitionTurn: problemDefinitionTurnSchema,
  proposalReplyRequest: proposalReplyRequestSchema,
  proposalReplyResponse: proposalReplyResponseSchema,
  proposalStartRequest: proposalStartRequestSchema,
  proposalStartResponse: proposalStartResponseSchema,
  structuredBrief: structuredBriefSchema,
  ragSearchRequest: ragSearchRequestSchema,
  ragSearchResponse: ragSearchResponseSchema,
  ragPacksResponse: ragPacksResponseSchema,
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

export function assertStructuredBrief(payload: unknown): StructuredBrief {
  return assertSchema<StructuredBrief>(schemaIds.structuredBrief, payload, 'invalid_structured_brief');
}

export function assertProblemDefinitionTurn(payload: unknown): ProblemDefinitionTurn {
  return assertSchema<ProblemDefinitionTurn>(schemaIds.problemDefinitionTurn, payload, 'invalid_problem_definition_turn');
}

export function assertErrorResponse(payload: unknown): ErrorResponse {
  return assertSchema<ErrorResponse>(schemaIds.errorResponse, payload, 'invalid_error_response');
}

export interface RagSearchRequestPayload {
  query: string;
  packs: string[];
  top_k?: number;
  language?: string;
}

export function assertRagSearchRequest(payload: unknown): RagSearchRequestPayload {
  return assertSchema<RagSearchRequestPayload>(
    schemaIds.ragSearchRequest,
    payload,
    'invalid_rag_search_request',
  );
}

export function assertRagSearchResponse<T>(payload: T): T {
  return assertSchema<T>(schemaIds.ragSearchResponse, payload, 'invalid_rag_search_response');
}

export function assertRagPacksResponse<T>(payload: T): T {
  return assertSchema<T>(schemaIds.ragPacksResponse, payload, 'invalid_rag_packs_response');
}
