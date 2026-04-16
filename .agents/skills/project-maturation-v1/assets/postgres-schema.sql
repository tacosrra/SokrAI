CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS proposal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    project_title TEXT NOT NULL,
    goal TEXT NOT NULL,
    raw_input_text TEXT,
    raw_input_file_name TEXT,
    normalized_text TEXT NOT NULL,
    current_stage TEXT NOT NULL DEFAULT 'problem_definition',
    current_agent TEXT NOT NULL DEFAULT 'problem_definition_agent',
    status TEXT NOT NULL DEFAULT 'active',
    structured_brief_json JSONB NOT NULL,
    prompt_version TEXT,
    model_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES proposal_sessions(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    speaker TEXT NOT NULL CHECK (speaker IN ('user', 'agent', 'system')),
    agent_name TEXT,
    message_text TEXT NOT NULL,
    message_json JSONB,
    prompt_version TEXT,
    model_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, turn_number)
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES proposal_sessions(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    input_snapshot_json JSONB NOT NULL,
    output_snapshot_json JSONB,
    raw_model_output TEXT,
    prompt_version TEXT,
    model_name TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_sessions_status
    ON proposal_sessions(status);

CREATE INDEX IF NOT EXISTS idx_proposal_sessions_stage
    ON proposal_sessions(current_stage);

CREATE INDEX IF NOT EXISTS idx_conversation_turns_session_turn
    ON conversation_turns(session_id, turn_number);

CREATE INDEX IF NOT EXISTS idx_agent_runs_session_created
    ON agent_runs(session_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_sessions_updated_at ON proposal_sessions;
CREATE TRIGGER trg_proposal_sessions_updated_at
BEFORE UPDATE ON proposal_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
