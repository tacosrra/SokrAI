import fs from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { fromRepoRoot } from '../../apps/api/src/utils/paths';
import { QueueLanguageModelClient } from '../helpers/fake-language-model-client';
import { buildTestApp } from '../helpers/test-environment';

describe('state version repair migration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('repairs previously concatenated snapshot and session state versions', async () => {
    ({ app } = await buildTestApp(new QueueLanguageModelClient([])));

    const session = await app.services.database.query<{ id: string }>(
      [
        'INSERT INTO proposal_sessions (',
        '  project_title, goal, normalized_text, latest_structured_brief_json, latest_problem_definition_json, current_turn_seq, state_version, status',
        ') VALUES (',
        '  \'State repair\', \'Repair corrupted state versions\', \'normalized\', \'{}\'::jsonb, \'{}\'::jsonb, 3, 111, \'waiting_for_user\'',
        ') RETURNING id',
      ].join(' '),
    );
    const sessionId = session.rows[0]!.id;

    const snapshots = await app.services.database.query<{ id: string; snapshot_seq: number }>(
      [
        'INSERT INTO session_snapshots (',
        '  session_id, snapshot_seq, state_version, snapshot_kind, current_stage, current_agent, session_status,',
        '  structured_brief_json, current_problem_definition_json, detected_gaps_json, agent_status, warnings_json, snapshot_hash',
        ') VALUES',
        '  ($1, 0, 0, \'session_started\', \'problem_definition\', \'problem_definition_agent\', \'active\', \'{}\'::jsonb, \'{}\'::jsonb, \'[]\'::jsonb, \'continue\', \'[]\'::jsonb, \'hash-0\'),',
        '  ($1, 1, 1, \'turn_resolved\', \'problem_definition\', \'problem_definition_agent\', \'waiting_for_user\', \'{}\'::jsonb, \'{}\'::jsonb, \'[]\'::jsonb, \'continue\', \'[]\'::jsonb, \'hash-1\'),',
        '  ($1, 2, 11, \'turn_resolved\', \'problem_definition\', \'problem_definition_agent\', \'waiting_for_user\', \'{}\'::jsonb, \'{}\'::jsonb, \'[]\'::jsonb, \'continue\', \'[]\'::jsonb, \'hash-2\'),',
        '  ($1, 3, 111, \'turn_resolved\', \'problem_definition\', \'problem_definition_agent\', \'waiting_for_user\', \'{}\'::jsonb, \'{}\'::jsonb, \'[]\'::jsonb, \'continue\', \'[]\'::jsonb, \'hash-3\')',
        'RETURNING id, snapshot_seq',
      ].join(' '),
      [sessionId],
    );
    const staleSnapshotId = snapshots.rows.find((snapshot) => snapshot.snapshot_seq === 1)!.id;
    await app.services.database.query('UPDATE proposal_sessions SET latest_snapshot_id = $2 WHERE id = $1', [
      sessionId,
      staleSnapshotId,
    ]);

    const migrationSql = await fs.readFile(fromRepoRoot('db', 'migrations', '010_repair_session_state_versions.sql'), 'utf8');
    await app.services.database.query(migrationSql);

    const repairedSnapshots = await app.services.database.query<{
      snapshot_seq: number;
      state_version: string;
    }>(
      [
        'SELECT snapshot_seq, state_version::text AS state_version',
        'FROM session_snapshots',
        'WHERE session_id = $1',
        'ORDER BY snapshot_seq ASC',
      ].join(' '),
      [sessionId],
    );
    const repairedSession = await app.services.database.query<{
      latest_snapshot_id: string | null;
      state_version: string;
    }>(
      'SELECT latest_snapshot_id, state_version::text AS state_version FROM proposal_sessions WHERE id = $1',
      [sessionId],
    );
    const repairedPointer = await app.services.database.query<{ snapshot_seq: number }>(
      'SELECT snapshot_seq FROM session_snapshots WHERE id = $1',
      [repairedSession.rows[0]?.latest_snapshot_id],
    );

    expect(repairedSnapshots.rows).toEqual([
      { snapshot_seq: 0, state_version: '0' },
      { snapshot_seq: 1, state_version: '1' },
      { snapshot_seq: 2, state_version: '2' },
      { snapshot_seq: 3, state_version: '3' },
    ]);
    expect(repairedSession.rows[0]?.state_version).toBe('3');
    expect(repairedPointer.rows[0]?.snapshot_seq).toBe(3);
  });
});
