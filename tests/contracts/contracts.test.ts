import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertProblemDefinitionTurn,
  assertRequestExecutionResponse,
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

  it('accepts canonical request recovery envelopes', () => {
    const recovered = assertRequestExecutionResponse({
      request_id: 'web-start-1',
      request_kind: 'proposal_start',
      status: 'completed',
      session_id: 'session-1',
    });

    expect(recovered.status).toBe('completed');
  });

  it('accepts a valid proposal reply request fixture', async () => {
    const fixture = await readFixture('reply', 'unknown-session.json');
    expect(assertProposalReplyRequest(fixture)).toBeTruthy();
  });

  it('keeps n8n workflow assets importable by requiring top-level workflow ids', async () => {
    const workflowsDir = path.resolve(process.cwd(), '../../infra/n8n/workflows');
    const files = (await readdir(workflowsDir)).filter((file) => file.endsWith('.json')).sort();

    expect(files.length).toBeGreaterThan(0);

    const workflowIds = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(path.join(workflowsDir, file), 'utf8');
        const workflow = JSON.parse(raw) as { id?: unknown };

        expect(workflow.id, `${file} is missing a top-level workflow id`).toEqual(expect.any(String));
        expect((workflow.id as string).trim(), `${file} has an empty top-level workflow id`).not.toBe('');

        return workflow.id as string;
      }),
    );

    expect(new Set(workflowIds).size).toBe(workflowIds.length);
  });

  it('bootstraps n8n workflows with supported per-workflow publish commands', async () => {
    const scriptPath = path.resolve(process.cwd(), '../../scripts/common-beta.sh');
    const script = await readFile(scriptPath, 'utf8');

    expect(script).toContain('n8n publish:workflow --id="$workflow_id"');
    expect(script).not.toContain('n8n update:workflow --all --active=true');
  });
});
