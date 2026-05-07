-- 003_add_specialty_columns.sql
-- Adds session-level and run-level specialty tracking for multi-agent prompt routing.
-- Strictly additive. No existing columns, constraints, or indexes are modified.

ALTER TABLE proposal_sessions
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT NULL
    CHECK (specialty IS NULL OR specialty IN ('default', 'legal'));

ALTER TABLE proposal_sessions
  ADD COLUMN IF NOT EXISTS current_specialty TEXT DEFAULT NULL
    CHECK (current_specialty IS NULL OR current_specialty IN ('default', 'legal'));

ALTER TABLE proposal_sessions
  ADD COLUMN IF NOT EXISTS context_reset_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT NULL
    CHECK (specialty IS NULL OR specialty IN ('default', 'legal'));

ALTER TABLE session_snapshots
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT NULL
    CHECK (specialty IS NULL OR specialty IN ('default', 'legal'));
