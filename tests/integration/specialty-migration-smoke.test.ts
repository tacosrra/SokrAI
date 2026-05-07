import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '../../apps/api/src/repositories/database.ts';
import { applyMigrations, createTestConfig, truncateAll } from '../helpers/test-environment.ts';

/**
 * Smoke tests that verify migration 003 applied correctly:
 * - the specialty columns exist on the right tables,
 * - the CHECK constraints accept null / 'default' / 'legal',
 * - the CHECK constraints reject unknown values.
 */
describe('specialty columns migration smoke', () => {
  let database: Database;

  beforeAll(async () => {
    database = new Database(createTestConfig());
    await applyMigrations(database);
    await truncateAll(database);
  });

  afterAll(async () => {
    await truncateAll(database);
    await database.close();
  });

  it('accepts specialty = NULL on proposal_sessions', async () => {
    const result = await database.query<{ specialty: string | null; current_specialty: string | null }>(
      `INSERT INTO proposal_sessions (
        project_title, goal, normalized_text, status,
        latest_structured_brief_json, latest_problem_definition_json,
        specialty, current_specialty
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
      RETURNING specialty, current_specialty`,
      [
        'Smoke Test Project',
        'Test goal',
        'Normalized text',
        'active',
        JSON.stringify({ project_title: 'x', goal: 'x', target_user: '', problem_owner: '', problem_statement: '', evidence_of_problem: '', current_alternatives: '', scope: '', constraints_known: [], assumptions: [], ambiguities: [], missing_information: [] }),
        JSON.stringify({}),
        null,
        null,
      ],
    );

    expect(result.rows[0].specialty).toBeNull();
    expect(result.rows[0].current_specialty).toBeNull();
  });

  it('accepts specialty = default on proposal_sessions', async () => {
    const result = await database.query<{ specialty: string | null; current_specialty: string | null }>(
      `INSERT INTO proposal_sessions (
        project_title, goal, normalized_text, status,
        latest_structured_brief_json, latest_problem_definition_json,
        specialty, current_specialty
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
      RETURNING specialty, current_specialty`,
      [
        'Smoke Test Default',
        'Test goal',
        'Normalized text',
        'active',
        JSON.stringify({ project_title: 'x', goal: 'x', target_user: '', problem_owner: '', problem_statement: '', evidence_of_problem: '', current_alternatives: '', scope: '', constraints_known: [], assumptions: [], ambiguities: [], missing_information: [] }),
        JSON.stringify({}),
        'default',
        'default',
      ],
    );

    expect(result.rows[0].specialty).toBe('default');
    expect(result.rows[0].current_specialty).toBe('default');
  });

  it('accepts specialty = legal on proposal_sessions', async () => {
    const result = await database.query<{ specialty: string | null; current_specialty: string | null }>(
      `INSERT INTO proposal_sessions (
        project_title, goal, normalized_text, status,
        latest_structured_brief_json, latest_problem_definition_json,
        specialty, current_specialty
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
      RETURNING specialty, current_specialty`,
      [
        'Smoke Test Legal',
        'Test goal',
        'Normalized text',
        'active',
        JSON.stringify({ project_title: 'x', goal: 'x', target_user: '', problem_owner: '', problem_statement: '', evidence_of_problem: '', current_alternatives: '', scope: '', constraints_known: [], assumptions: [], ambiguities: [], missing_information: [] }),
        JSON.stringify({}),
        'legal',
        'legal',
      ],
    );

    expect(result.rows[0].specialty).toBe('legal');
    expect(result.rows[0].current_specialty).toBe('legal');
  });

  it('rejects specialty = invalid on proposal_sessions (CHECK constraint)', async () => {
    await expect(
      database.query(
        `INSERT INTO proposal_sessions (
          project_title, goal, normalized_text, status,
          latest_structured_brief_json, latest_problem_definition_json,
          specialty
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
        [
          'Smoke Test Invalid',
          'Test goal',
          'Normalized text',
          'active',
          JSON.stringify({ project_title: 'x', goal: 'x', target_user: '', problem_owner: '', problem_statement: '', evidence_of_problem: '', current_alternatives: '', scope: '', constraints_known: [], assumptions: [], ambiguities: [], missing_information: [] }),
          JSON.stringify({}),
          'invalid',
        ],
      ),
    ).rejects.toThrow();
  });

  it('accepts specialty = legal on agent_runs', async () => {
    const sessionResult = await database.query<{ id: string }>(
      `INSERT INTO proposal_sessions (
        project_title, goal, normalized_text, status,
        latest_structured_brief_json, latest_problem_definition_json
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      RETURNING id`,
      [
        'Smoke Agent Run',
        'Test goal',
        'Normalized text',
        'active',
        JSON.stringify({ project_title: 'x', goal: 'x', target_user: '', problem_owner: '', problem_statement: '', evidence_of_problem: '', current_alternatives: '', scope: '', constraints_known: [], assumptions: [], ambiguities: [], missing_information: [] }),
        JSON.stringify({}),
      ],
    );

    const sessionId = sessionResult.rows[0].id;

    const runResult = await database.query<{ specialty: string | null }>(
      `INSERT INTO agent_runs (
        session_id, run_purpose, agent_name, workflow_name, workflow_version,
        prompt_name, prompt_version, prompt_sha256, model_name,
        input_contract_name, input_contract_version, output_contract_name, output_contract_version,
        input_payload_json, status, specialty
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16)
      RETURNING specialty`,
      [
        sessionId, 'problem_definition', 'problem_definition_agent',
        'agent_problem_definition_v1', 'v1',
        'problem-definition-agent-legal', 'v1', 'abc123', 'fake-model',
        'problem-definition-agent.input', 'v1', 'problem-definition-turn', 'v1',
        JSON.stringify({}), 'completed', 'legal',
      ],
    );

    expect(runResult.rows[0].specialty).toBe('legal');
  });

  it('accepts specialty = legal on session_snapshots', async () => {
    const sessionResult = await database.query<{ id: string }>(
      `INSERT INTO proposal_sessions (
        project_title, goal, normalized_text, status,
        latest_structured_brief_json, latest_problem_definition_json
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      RETURNING id`,
      [
        'Smoke Snapshot',
        'Test goal',
        'Normalized text',
        'active',
        JSON.stringify({ project_title: 'x', goal: 'x', target_user: '', problem_owner: '', problem_statement: '', evidence_of_problem: '', current_alternatives: '', scope: '', constraints_known: [], assumptions: [], ambiguities: [], missing_information: [] }),
        JSON.stringify({}),
      ],
    );

    const sessionId = sessionResult.rows[0].id;

    const snapResult = await database.query<{ specialty: string | null }>(
      `INSERT INTO session_snapshots (
        session_id, snapshot_seq, state_version, snapshot_kind,
        current_stage, current_agent, session_status,
        structured_brief_json, current_problem_definition_json, detected_gaps_json,
        agent_status, warnings_json, snapshot_hash, specialty
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13, $14)
      RETURNING specialty`,
      [
        sessionId, 0, 0, 'session_started',
        'problem_definition', 'problem_definition_agent', 'active',
        JSON.stringify({ project_title: 'x', goal: 'x', target_user: '', problem_owner: '', problem_statement: '', evidence_of_problem: '', current_alternatives: '', scope: '', constraints_known: [], assumptions: [], ambiguities: [], missing_information: [] }),
        JSON.stringify({}),
        JSON.stringify([]),
        'continue',
        JSON.stringify([]),
        'testhash123',
        'legal',
      ],
    );

    expect(snapResult.rows[0].specialty).toBe('legal');
  });
});
