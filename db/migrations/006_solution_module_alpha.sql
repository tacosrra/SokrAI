ALTER TABLE agent_runs
    DROP CONSTRAINT IF EXISTS agent_runs_run_purpose_check;

ALTER TABLE agent_runs
    ADD CONSTRAINT agent_runs_run_purpose_check
    CHECK (run_purpose IN (
        'brief_extraction',
        'problem_definition',
        'solution_definition',
        'basic_report_compose',
        'data_ai_privacy_gap',
        'medical_device_triage',
        'json_repair'
    ));

ALTER TABLE chat_turns
    ADD COLUMN IF NOT EXISTS answer_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_turns_answer_request
    ON chat_turns(answer_request_id)
    WHERE answer_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_turns_answer_request_lookup
    ON chat_turns(answer_request_id)
    WHERE answer_request_id IS NOT NULL;
