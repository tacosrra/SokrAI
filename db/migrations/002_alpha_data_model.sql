CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE REFERENCES proposal_sessions(id) ON DELETE CASCADE,
    user_id TEXT,
    proposal_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (proposal_status IN ('draft', 'active', 'completed', 'blocked', 'failed', 'archived')),
    project_title TEXT NOT NULL,
    goal TEXT NOT NULL,
    structured_brief_json JSONB NOT NULL
        CHECK (jsonb_typeof(structured_brief_json) = 'object'),
    audit_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(audit_refs_json) = 'array'),
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings_json) = 'array'),
    schema_version TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata_json) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL
        CHECK (source_kind IN ('pasted_text', 'uploaded_file', 'extracted_text')),
    document_status TEXT NOT NULL DEFAULT 'received'
        CHECK (document_status IN ('received', 'normalized', 'unsupported', 'failed')),
    file_name TEXT,
    mime_type TEXT,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    pasted_text TEXT,
    normalized_text TEXT,
    source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(source_refs_json) = 'array'),
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings_json) = 'array'),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata_json) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_proposal_documents_proposal_id_id UNIQUE (proposal_id, id)
);

CREATE TABLE IF NOT EXISTS module_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    module TEXT NOT NULL
        CHECK (module IN ('problem', 'solution')),
    chat_status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (
            chat_status IN (
                'not_started',
                'active',
                'waiting_for_user',
                'ready_to_generate',
                'completed',
                'blocked',
                'failed'
            )
        ),
    active_turn_id UUID,
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings_json) = 'array'),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (proposal_id, module),
    CONSTRAINT uq_module_chats_proposal_id_id UNIQUE (proposal_id, id)
);

CREATE TABLE IF NOT EXISTS chat_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES module_chats(id) ON DELETE CASCADE,
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    module TEXT NOT NULL
        CHECK (module IN ('problem', 'solution')),
    turn_seq INTEGER NOT NULL
        CHECK (turn_seq > 0),
    question_text TEXT NOT NULL,
    answer_text TEXT,
    turn_status TEXT NOT NULL
        CHECK (turn_status IN ('awaiting_user', 'processing', 'resolved', 'failed', 'skipped')),
    agent_status TEXT
        CHECK (agent_status IN ('continue', 'done', 'blocked')),
    diagnosis_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (
            jsonb_typeof(diagnosis_json) = 'array'
            AND jsonb_array_length(diagnosis_json) <= 3
        ),
    source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(source_refs_json) = 'array'),
    gap_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(gap_refs_json) = 'array'),
    audit_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(audit_refs_json) = 'array'),
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings_json) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chat_id, turn_seq),
    UNIQUE (proposal_id, id)
);

CREATE TABLE IF NOT EXISTS generated_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    section_kind TEXT NOT NULL
        CHECK (section_kind IN ('problem', 'solution')),
    section_status TEXT NOT NULL
        CHECK (section_status IN ('draft', 'generated', 'accepted', 'needs_revision', 'superseded')),
    title TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(source_refs_json) = 'array'),
    gap_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(gap_refs_json) = 'array'),
    generated_by_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    supersedes_section_id UUID REFERENCES generated_sections(id) ON DELETE SET NULL,
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings_json) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (proposal_id, id)
);

CREATE TABLE IF NOT EXISTS proposal_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL
        CHECK (source_kind IN ('pasted_text', 'uploaded_file', 'extracted_text', 'user_answer', 'generated_section')),
    label TEXT NOT NULL,
    document_id UUID REFERENCES proposal_documents(id) ON DELETE SET NULL,
    turn_id UUID REFERENCES chat_turns(id) ON DELETE SET NULL,
    section_id UUID REFERENCES generated_sections(id) ON DELETE SET NULL,
    span_json JSONB
        CHECK (
            span_json IS NULL
            OR (
                jsonb_typeof(span_json) = 'object'
                AND span_json ? 'start_char'
                AND span_json ? 'end_char'
                AND jsonb_typeof(span_json->'start_char') = 'number'
                AND jsonb_typeof(span_json->'end_char') = 'number'
            )
        ),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata_json) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_proposal_sources_kind_reference CHECK (
        (
            source_kind IN ('pasted_text', 'uploaded_file', 'extracted_text')
            AND document_id IS NOT NULL
            AND turn_id IS NULL
            AND section_id IS NULL
        )
        OR (
            source_kind = 'user_answer'
            AND document_id IS NULL
            AND turn_id IS NOT NULL
            AND section_id IS NULL
        )
        OR (
            source_kind = 'generated_section'
            AND document_id IS NULL
            AND turn_id IS NULL
            AND section_id IS NOT NULL
        )
    )
);

CREATE TABLE IF NOT EXISTS alpha_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    module TEXT NOT NULL
        CHECK (module IN ('problem', 'solution')),
    gap_kind TEXT NOT NULL
        CHECK (
            gap_kind IN (
                'missing_information',
                'ambiguous_information',
                'unsupported_claim',
                'needs_user_confirmation'
            )
        ),
    gap_status TEXT NOT NULL
        CHECK (gap_status IN ('open', 'in_progress', 'resolved', 'deferred', 'not_applicable')),
    field TEXT NOT NULL,
    description TEXT NOT NULL,
    question_hint TEXT,
    source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(source_refs_json) = 'array'),
    resolved_by_turn_id UUID,
    audit_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(audit_refs_json) = 'array'),
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (
            jsonb_typeof(warnings_json) = 'array'
            AND jsonb_array_length(warnings_json) <= 3
        ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS basic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    report_status TEXT NOT NULL
        CHECK (report_status IN ('draft', 'ready', 'needs_revision')),
    schema_version TEXT NOT NULL,
    structured_brief_json JSONB NOT NULL
        CHECK (jsonb_typeof(structured_brief_json) = 'object'),
    current_gaps_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(current_gaps_json) = 'array'),
    problem_section_id UUID NOT NULL,
    solution_section_id UUID NOT NULL,
    internal_sources_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(internal_sources_json) = 'array'),
    audit_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(audit_refs_json) = 'array'),
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings_json) = 'array'),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (proposal_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    session_id UUID REFERENCES proposal_sessions(id) ON DELETE SET NULL,
    run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    turn_id UUID REFERENCES chat_turns(id) ON DELETE SET NULL,
    event_seq BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL
        CHECK (actor_type IN ('user', 'workflow', 'agent', 'system')),
    request_id TEXT,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(payload_json) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (proposal_id, event_seq)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_proposal_sources_kind_reference'
    ) THEN
        ALTER TABLE proposal_sources
            ADD CONSTRAINT ck_proposal_sources_kind_reference CHECK (
                (
                    source_kind IN ('pasted_text', 'uploaded_file', 'extracted_text')
                    AND document_id IS NOT NULL
                    AND turn_id IS NULL
                    AND section_id IS NULL
                )
                OR (
                    source_kind = 'user_answer'
                    AND document_id IS NULL
                    AND turn_id IS NOT NULL
                    AND section_id IS NULL
                )
                OR (
                    source_kind = 'generated_section'
                    AND document_id IS NULL
                    AND turn_id IS NULL
                    AND section_id IS NOT NULL
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_proposal_documents_proposal_id_id'
    ) THEN
        ALTER TABLE proposal_documents
            ADD CONSTRAINT uq_proposal_documents_proposal_id_id UNIQUE (proposal_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_module_chats_proposal_id_id'
    ) THEN
        ALTER TABLE module_chats
            ADD CONSTRAINT uq_module_chats_proposal_id_id UNIQUE (proposal_id, id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_chat_turns_chat'
    ) THEN
        ALTER TABLE chat_turns
            ADD CONSTRAINT fk_chat_turns_chat
            FOREIGN KEY (proposal_id, chat_id)
            REFERENCES module_chats(proposal_id, id)
            ON DELETE CASCADE
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_proposal_sources_document'
    ) THEN
        ALTER TABLE proposal_sources
            ADD CONSTRAINT fk_proposal_sources_document
            FOREIGN KEY (proposal_id, document_id)
            REFERENCES proposal_documents(proposal_id, id)
            ON DELETE SET NULL (document_id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_proposal_sources_turn'
    ) THEN
        ALTER TABLE proposal_sources
            ADD CONSTRAINT fk_proposal_sources_turn
            FOREIGN KEY (proposal_id, turn_id)
            REFERENCES chat_turns(proposal_id, id)
            ON DELETE SET NULL (turn_id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_proposal_sources_section'
    ) THEN
        ALTER TABLE proposal_sources
            ADD CONSTRAINT fk_proposal_sources_section
            FOREIGN KEY (proposal_id, section_id)
            REFERENCES generated_sections(proposal_id, id)
            ON DELETE SET NULL (section_id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_module_chats_active_turn'
    ) THEN
        ALTER TABLE module_chats
            ADD CONSTRAINT fk_module_chats_active_turn
            FOREIGN KEY (proposal_id, active_turn_id)
            REFERENCES chat_turns(proposal_id, id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_alpha_gaps_resolved_by_turn'
    ) THEN
        ALTER TABLE alpha_gaps
            ADD CONSTRAINT fk_alpha_gaps_resolved_by_turn
            FOREIGN KEY (proposal_id, resolved_by_turn_id)
            REFERENCES chat_turns(proposal_id, id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_basic_reports_problem_section'
    ) THEN
        ALTER TABLE basic_reports
            ADD CONSTRAINT fk_basic_reports_problem_section
            FOREIGN KEY (proposal_id, problem_section_id)
            REFERENCES generated_sections(proposal_id, id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_basic_reports_solution_section'
    ) THEN
        ALTER TABLE basic_reports
            ADD CONSTRAINT fk_basic_reports_solution_section
            FOREIGN KEY (proposal_id, solution_section_id)
            REFERENCES generated_sections(proposal_id, id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_prevent_update ON audit_events;
CREATE TRIGGER trg_audit_events_prevent_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_event_mutation();

DROP TRIGGER IF EXISTS trg_audit_events_prevent_delete ON audit_events;
CREATE TRIGGER trg_audit_events_prevent_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_event_mutation();

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON proposals;
CREATE TRIGGER trg_proposals_updated_at
BEFORE UPDATE ON proposals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_module_chats_updated_at ON module_chats;
CREATE TRIGGER trg_module_chats_updated_at
BEFORE UPDATE ON module_chats
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_turns_updated_at ON chat_turns;
CREATE TRIGGER trg_chat_turns_updated_at
BEFORE UPDATE ON chat_turns
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_generated_sections_updated_at ON generated_sections;
CREATE TRIGGER trg_generated_sections_updated_at
BEFORE UPDATE ON generated_sections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_alpha_gaps_updated_at ON alpha_gaps;
CREATE TRIGGER trg_alpha_gaps_updated_at
BEFORE UPDATE ON alpha_gaps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_basic_reports_updated_at ON basic_reports;
CREATE TRIGGER trg_basic_reports_updated_at
BEFORE UPDATE ON basic_reports
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_proposals_status_updated
    ON proposals(proposal_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_user_created
    ON proposals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_documents_proposal_created
    ON proposal_documents(proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_sources_proposal_created
    ON proposal_sources(proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_sources_document
    ON proposal_sources(document_id)
    WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alpha_gaps_proposal_module_status
    ON alpha_gaps(proposal_id, module, gap_status);

CREATE INDEX IF NOT EXISTS idx_module_chats_status
    ON module_chats(proposal_id, chat_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_turns_open_turn
    ON chat_turns(chat_id)
    WHERE turn_status IN ('awaiting_user', 'processing');

CREATE INDEX IF NOT EXISTS idx_chat_turns_chat_seq
    ON chat_turns(chat_id, turn_seq DESC);

CREATE INDEX IF NOT EXISTS idx_generated_sections_proposal_kind_status
    ON generated_sections(proposal_id, section_kind, section_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_sections_current
    ON generated_sections(proposal_id, section_kind)
    WHERE section_status IN ('draft', 'generated', 'accepted', 'needs_revision');

CREATE INDEX IF NOT EXISTS idx_audit_events_proposal_seq
    ON audit_events(proposal_id, event_seq);

CREATE INDEX IF NOT EXISTS idx_audit_events_request
    ON audit_events(request_id)
    WHERE request_id IS NOT NULL;
