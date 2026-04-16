import { describe, expect, it } from 'vitest';

import {
  assertProblemDefinitionTurn,
  assertProposalReplyRequest,
  assertProposalReplyResponse,
  assertProposalStartRequest,
  assertProposalStartResponse,
  assertStructuredBrief,
} from '../../apps/api/src/contracts/schema-registry.ts';
import { AppError } from '../../apps/api/src/utils/errors.ts';
import { readFixture } from '../helpers/test-environment';

describe('contract schemas', () => {
  it('accepts a valid proposal start request fixture', async () => {
    const fixture = await readFixture('start', 'strong-proposal.json');
    expect(assertProposalStartRequest(fixture)).toBeTruthy();
  });

  it('rejects an empty proposal submission fixture', async () => {
    const fixture = await readFixture('start', 'empty-submission.json');
    expect(() => assertProposalStartRequest(fixture)).toThrow(AppError);
  });

  it('accepts the strong structured brief fixture', async () => {
    const fixture = await readFixture('expected', 'structured-brief.strong.json');
    expect(assertStructuredBrief(fixture)).toBeTruthy();
  });

  it('accepts the done problem-definition turn fixture', async () => {
    const fixture = await readFixture('expected', 'problem-definition.done.json');
    expect(assertProblemDefinitionTurn(fixture)).toBeTruthy();
  });

  it('accepts canonical response envelopes', async () => {
    const startResponse = assertProposalStartResponse({
      session_id: 'session-1',
      stage: 'problem_definition',
      structured_brief: await readFixture('expected', 'structured-brief.strong.json'),
      detected_gaps: ['problem_owner'],
      next_question: '¿Qué equipo responde hoy por este problema?',
      agent_status: 'continue',
      warnings: [],
    });

    const replyResponse = assertProposalReplyResponse({
      session_id: 'session-1',
      stage: 'problem_definition',
      agent_status: 'done',
      updated_problem_definition: (await readFixture('expected', 'problem-definition.done.json')).updated_problem_definition,
      diagnosis: ['El problema ya esta suficientemente definido'],
      next_question: '',
      completion_reason: 'problem sufficiently defined',
      warnings: [],
    });

    expect(startResponse.stage).toBe('problem_definition');
    expect(replyResponse.agent_status).toBe('done');
  });

  it('accepts a valid proposal reply request fixture', async () => {
    const fixture = await readFixture('reply', 'unknown-session.json');
    expect(assertProposalReplyRequest(fixture)).toBeTruthy();
  });
});
