CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS proposal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_request_id TEXT UNIQUE,
    user_id TEXT,
    project_title TEXT NOT NULL,
    goal TEXT NOT NULL,
    raw_input_text TEXT,
    raw_input_file_name TEXT,
    raw_input_file_sha256 TEXT,
    normalized_text TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    current_stage TEXT NOT NULL DEFAULT 'problem_definition'
        CHECK (current_stage = 'problem_definition'),
    current_agent TEXT NOT NULL DEFAULT 'problem_definition_agent'
        CHECK (current_agent = 'problem_definition_agent'),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'waiting_for_user', 'completed', 'blocked', 'failed')),
    current_turn_seq INTEGER NOT NULL DEFAULT 0
        CHECK (current_turn_seq >= 0),
    state_version BIGINT NOT NULL DEFAULT 0,
    latest_structured_brief_json JSONB NOT NULL
        CHECK (jsonb_typeof(latest_structured_brief_json) = 'object'),
    latest_problem_definition_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(latest_problem_definition_json) = 'object'),
    latest_snapshot_id UUID,
    latest_successful_run_id UUID,
    completion_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES proposal_sessions(id) ON DELETE CASCADE,
    turn_seq INTEGER CHECK (turn_seq >= 1),
    parent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    request_id TEXT UNIQUE,
    run_purpose TEXT NOT NULL
        CHECK (run_purpose IN ('brief_extraction', 'problem_definition', 'json_repair')),
    agent_name TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    workflow_version TEXT NOT NULL,
    workflow_execution_id TEXT,
    attempt_no INTEGER NOT NULL DEFAULT 1
        CHECK (attempt_no > 0),
    prompt_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    prompt_sha256 TEXT NOT NULL,
    model_provider TEXT NOT NULL DEFAULT 'ollama',
    model_name TEXT NOT NULL,
    model_params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    input_contract_name TEXT NOT NULL,
    input_contract_version TEXT NOT NULL,
    output_contract_name TEXT NOT NULL,
    output_contract_version TEXT NOT NULL,
    input_payload_json JSONB NOT NULL,
    raw_model_output TEXT,
    validated_output_json JSONB,
    status TEXT NOT NULL
        CHECK (status IN ('completed', 'validation_failed', 'repair_failed', 'model_failed', 'controlled_error')),
    error_code TEXT,
    error_message TEXT,
    repair_attempted BOOLEAN NOT NULL DEFAULT FALSE,
    metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS conversation_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES proposal_sessions(id) ON DELETE CASCADE,
    turn_seq INTEGER NOT NULL
        CHECK (turn_seq > 0),
    question_text TEXT NOT NULL,
    answer_text TEXT,
    answer_request_id TEXT,
    status TEXT NOT NULL
        CHECK (status IN ('awaiting_user', 'processing', 'resolved', 'failed')),
    agent_status TEXT
        CHECK (agent_status IN ('continue', 'done', 'blocked')),
    diagnosis_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (
            jsonb_typeof(diagnosis_json) = 'array'
            AND jsonb_array_length(diagnosis_json) <= 3
        ),
    updated_problem_definition_json JSONB
        CHECK (
            updated_problem_definition_json IS NULL
            OR jsonb_typeof(updated_problem_definition_json) = 'object'
        ),
    completion_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answer_received_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    UNIQUE (session_id, turn_seq)
);

CREATE TABLE IF NOT EXISTS session_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES proposal_sessions(id) ON DELETE CASCADE,
    snapshot_seq INTEGER NOT NULL
        CHECK (snapshot_seq >= 0),
    state_version BIGINT NOT NULL
        CHECK (state_version >= 0),
    based_on_snapshot_id UUID REFERENCES session_snapshots(id) ON DELETE SET NULL,
    source_turn_seq INTEGER CHECK (source_turn_seq >= 0),
    source_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    snapshot_kind TEXT NOT NULL
        CHECK (snapshot_kind IN ('session_started', 'turn_resolved', 'manual_recovery')),
    current_stage TEXT NOT NULL
        CHECK (current_stage = 'problem_definition'),
    current_agent TEXT NOT NULL
        CHECK (current_agent = 'problem_definition_agent'),
    session_status TEXT NOT NULL
        CHECK (session_status IN ('active', 'waiting_for_user', 'completed', 'blocked', 'failed')),
    structured_brief_json JSONB NOT NULL
        CHECK (jsonb_typeof(structured_brief_json) = 'object'),
    current_problem_definition_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(current_problem_definition_json) = 'object'),
    detected_gaps_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(detected_gaps_json) = 'array'),
    next_question_text TEXT,
    agent_status TEXT NOT NULL
        CHECK (agent_status IN ('continue', 'done', 'blocked')),
    completion_reason TEXT,
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings_json) = 'array'),
    snapshot_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, snapshot_seq),
    UNIQUE (session_id, state_version)
);

CREATE TABLE IF NOT EXISTS session_events (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES proposal_sessions(id) ON DELETE CASCADE,
    turn_seq INTEGER CHECK (turn_seq >= 0),
    run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    event_seq BIGINT NOT NULL,
    event_type TEXT NOT NULL
        CHECK (
            event_type IN (
                'session_created',
                'brief_extracted',
                'turn_opened',
                'answer_received',
                'run_started',
                'run_completed',
                'run_failed',
                'snapshot_created',
                'session_completed',
                'session_blocked'
            )
        ),
    actor_type TEXT NOT NULL
        CHECK (actor_type IN ('user', 'workflow', 'agent', 'system')),
    request_id TEXT,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, event_seq)
);

ALTER TABLE proposal_sessions
    ADD CONSTRAINT fk_proposal_sessions_latest_snapshot
    FOREIGN KEY (latest_snapshot_id)
    REFERENCES session_snapshots(id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE proposal_sessions
    ADD CONSTRAINT fk_proposal_sessions_latest_successful_run
    FOREIGN KEY (latest_successful_run_id)
    REFERENCES agent_runs(id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_proposal_sessions_resume
    ON proposal_sessions(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_sessions_user_created
    ON proposal_sessions(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_turns_open_turn
    ON conversation_turns(session_id)
    WHERE status IN ('awaiting_user', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_turns_answer_request
    ON conversation_turns(answer_request_id)
    WHERE answer_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_turns_session_turn_seq
    ON conversation_turns(session_id, turn_seq DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_session_started
    ON agent_runs(session_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_session_turn_attempt
    ON agent_runs(session_id, turn_seq, attempt_no DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_failed
    ON agent_runs(status, started_at DESC)
    WHERE status <> 'completed';

CREATE INDEX IF NOT EXISTS idx_session_snapshots_session_seq
    ON session_snapshots(session_id, snapshot_seq DESC);

CREATE INDEX IF NOT EXISTS idx_session_events_session_seq
    ON session_events(session_id, event_seq);

DROP TRIGGER IF EXISTS trg_proposal_sessions_updated_at ON proposal_sessions;
CREATE TRIGGER trg_proposal_sessions_updated_at
BEFORE UPDATE ON proposal_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
