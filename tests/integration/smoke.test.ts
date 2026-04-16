import { describe, expect, it } from 'vitest';

import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp, readFixture, readTextFixture } from '../helpers/test-environment';

describe('smoke checks', () => {
  it('covers start, vague, repair and validation smoke scenarios', async () => {
    const structuredBrief = await readFixture('expected', 'structured-brief.strong.json');
    const repairedTurn = await readFixture('model-output', 'turn.repaired.json');
    const invalidTurn = await readTextFixture('model-output', 'turn.invalid.json.txt');

    const { app } = await buildTestApp(
      new QueueLanguageModelClient([
        JSON.stringify(structuredBrief),
        invalidTurn,
        JSON.stringify(repairedTurn),
      ]),
    );

    try {
      const strongProposal = await readFixture('start', 'strong-proposal.json');

      const startContext = await app.inject({
        method: 'POST',
        url: '/internal/sessions/start-context',
        headers: {
          'x-internal-shared-secret': 'test-secret',
        },
        payload: {
          request_id: 'smoke-start',
          workflow_version: 'proposal_start_v1',
          payload: strongProposal,
        },
      });

      expect(startContext.statusCode).toBe(200);

      const startAgent = await app.inject({
        method: 'POST',
        url: '/internal/agents/problem-definition/run',
        headers: {
          'x-internal-shared-secret': 'test-secret',
        },
        payload: {
          request_id: 'smoke-agent',
          workflow_version: 'agent_problem_definition_v1',
          session_id: startContext.json().session_id,
          trigger: 'start',
        },
      });

      expect(startAgent.statusCode).toBe(200);

      const emptyStart = await app.inject({
        method: 'POST',
        url: '/internal/sessions/start-context',
        headers: {
          'x-internal-shared-secret': 'test-secret',
        },
        payload: {
          request_id: 'smoke-empty',
          workflow_version: 'proposal_start_v1',
          payload: await readFixture('start', 'empty-submission.json'),
        },
      });

      expect(emptyStart.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
