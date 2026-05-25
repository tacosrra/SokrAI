ALTER TABLE generated_sections
    ADD COLUMN IF NOT EXISTS section_version INTEGER NOT NULL DEFAULT 1;

WITH numbered_sections AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY proposal_id, section_kind
            ORDER BY created_at ASC, id ASC
        ) AS next_section_version
    FROM generated_sections
)
UPDATE generated_sections
SET section_version = numbered_sections.next_section_version
FROM numbered_sections
WHERE generated_sections.id = numbered_sections.id
  AND generated_sections.section_version <> numbered_sections.next_section_version;

ALTER TABLE generated_sections
    DROP CONSTRAINT IF EXISTS generated_sections_section_version_check;

ALTER TABLE generated_sections
    ADD CONSTRAINT generated_sections_section_version_check
    CHECK (section_version > 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_sections_proposal_kind_version
    ON generated_sections(proposal_id, section_kind, section_version);

CREATE INDEX IF NOT EXISTS idx_generated_sections_current_lookup
    ON generated_sections(proposal_id, section_kind, section_status, section_version DESC);
