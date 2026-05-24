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
                'document_failed'
            )
        );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_proposal_documents_sha256
    ON proposal_documents(sha256)
    WHERE sha256 IS NOT NULL;
