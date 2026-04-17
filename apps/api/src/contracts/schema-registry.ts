import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';

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

interface JsonSchema {
  $id: string;
  [key: string]: unknown;
}

function loadSchemaFile(fileName: string): JsonSchema {
  const searchPaths = [
    path.resolve(process.cwd(), 'contracts', 'schemas', fileName),
    path.resolve(__dirname, '../../../../contracts/schemas', fileName),
    path.resolve(__dirname, '../../../../../contracts/schemas', fileName),
  ];

  for (const filePath of searchPaths) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonSchema;
    }
  }

  throw new Error(`Schema file not found: ${fileName}`);
}

const errorResponseSchema = loadSchemaFile('error-response.schema.json');
const problemDefinitionTurnSchema = loadSchemaFile('problem-definition-turn.schema.json');
const proposalReplyRequestSchema = loadSchemaFile('proposal-reply.request.schema.json');
const proposalReplyResponseSchema = loadSchemaFile('proposal-reply.response.schema.json');
const proposalStartRequestSchema = loadSchemaFile('proposal-start.request.schema.json');
const proposalStartResponseSchema = loadSchemaFile('proposal-start.response.schema.json');
const structuredBriefSchema = loadSchemaFile('structured-brief.schema.json');

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
} as const;

const schemaById: Record<string, JsonSchema> = {
  [schemaIds.errorResponse]: errorResponseSchema,
  [schemaIds.problemDefinitionTurn]: problemDefinitionTurnSchema,
  [schemaIds.proposalReplyRequest]: proposalReplyRequestSchema,
  [schemaIds.proposalReplyResponse]: proposalReplyResponseSchema,
  [schemaIds.proposalStartRequest]: proposalStartRequestSchema,
  [schemaIds.proposalStartResponse]: proposalStartResponseSchema,
  [schemaIds.structuredBrief]: structuredBriefSchema,
};

export function getSchemaDefinition(schemaId: string): JsonSchema {
  const schema = schemaById[schemaId];

  if (!schema) {
    throw new Error(`Schema not registered: ${schemaId}`);
  }

  return schema;
}

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
