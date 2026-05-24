ALTER TABLE alpha_gaps
    ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'system_rule',
    ADD COLUMN IF NOT EXISTS absence_json JSONB NOT NULL DEFAULT '{"is_absent":false,"checked_fields":[],"reason":""}'::jsonb;

UPDATE alpha_gaps
SET absence_json = jsonb_build_object(
    'is_absent', true,
    'checked_fields', jsonb_build_array(field),
    'reason', 'Required information was not found in the available structured brief.'
)
WHERE gap_kind = 'missing_information'
  AND (
      absence_json->>'is_absent' <> 'true'
      OR jsonb_array_length(absence_json->'checked_fields') = 0
      OR length(absence_json->>'reason') = 0
  );

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'alpha_gaps'::regclass
      AND pg_get_constraintdef(oid) LIKE '%origin%'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE alpha_gaps DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE alpha_gaps
        ADD CONSTRAINT alpha_gaps_origin_check
        CHECK (
            origin IN (
                'structured_brief_field',
                'structured_brief_missing_information',
                'structured_brief_ambiguity',
                'proposal_source',
                'system_rule'
            )
        );
END;
$$;

ALTER TABLE alpha_gaps
    DROP CONSTRAINT IF EXISTS alpha_gaps_absence_json_check;

ALTER TABLE alpha_gaps
    ADD CONSTRAINT alpha_gaps_absence_json_check
    CHECK (
        jsonb_typeof(absence_json) = 'object'
        AND absence_json ? 'is_absent'
        AND absence_json ? 'checked_fields'
        AND absence_json ? 'reason'
        AND jsonb_typeof(absence_json->'is_absent') = 'boolean'
        AND jsonb_typeof(absence_json->'checked_fields') = 'array'
        AND jsonb_typeof(absence_json->'reason') = 'string'
        AND (
            gap_kind <> 'missing_information'
            OR (
                absence_json->>'is_absent' = 'true'
                AND jsonb_array_length(absence_json->'checked_fields') > 0
                AND length(absence_json->>'reason') > 0
            )
        )
    );

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'session_events'::regclass
      AND pg_get_constraintdef(oid) LIKE '%event_type%'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE session_events DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE session_events
        ADD CONSTRAINT session_events_event_type_check
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
                'session_blocked',
                'document_received',
                'document_extracted',
                'document_failed',
                'gap_detected'
            )
        );
END;
$$;
