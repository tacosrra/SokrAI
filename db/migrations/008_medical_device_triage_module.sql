ALTER TABLE module_chats
    DROP CONSTRAINT IF EXISTS module_chats_module_check;

ALTER TABLE module_chats
    ADD CONSTRAINT module_chats_module_check
    CHECK (module IN ('problem', 'solution', 'data_ai_privacy', 'medical_device_triage'));

ALTER TABLE chat_turns
    DROP CONSTRAINT IF EXISTS chat_turns_module_check;

ALTER TABLE chat_turns
    ADD CONSTRAINT chat_turns_module_check
    CHECK (module IN ('problem', 'solution', 'data_ai_privacy', 'medical_device_triage'));

ALTER TABLE alpha_gaps
    DROP CONSTRAINT IF EXISTS alpha_gaps_module_check;

ALTER TABLE alpha_gaps
    ADD CONSTRAINT alpha_gaps_module_check
    CHECK (module IN ('problem', 'solution', 'data_ai_privacy', 'medical_device_triage'));

ALTER TABLE generated_sections
    DROP CONSTRAINT IF EXISTS generated_sections_section_kind_check;

ALTER TABLE generated_sections
    ADD CONSTRAINT generated_sections_section_kind_check
    CHECK (section_kind IN ('problem', 'solution', 'data_ai_privacy', 'medical_device_triage'));

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
