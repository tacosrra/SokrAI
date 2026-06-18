DROP TABLE IF EXISTS pg_temp.tmp_session_state_version_repair;

CREATE TEMP TABLE tmp_session_state_version_repair AS
SELECT id, session_id, snapshot_seq
FROM session_snapshots
WHERE state_version <> snapshot_seq;

WITH session_offsets AS (
    SELECT
        session_id,
        MAX(state_version) + MAX(snapshot_seq) + 1 AS state_version_offset
    FROM session_snapshots
    WHERE session_id IN (
        SELECT DISTINCT session_id
        FROM tmp_session_state_version_repair
    )
    GROUP BY session_id
)
UPDATE session_snapshots AS snapshot
SET state_version = session_offsets.state_version_offset + repair.snapshot_seq
FROM tmp_session_state_version_repair AS repair
JOIN session_offsets
  ON session_offsets.session_id = repair.session_id
WHERE snapshot.id = repair.id;

UPDATE session_snapshots AS snapshot
SET state_version = repair.snapshot_seq
FROM tmp_session_state_version_repair AS repair
WHERE snapshot.id = repair.id;

WITH session_head_versions AS (
    SELECT
        session.id AS session_id,
        latest_by_seq.id AS latest_snapshot_id,
        COALESCE(latest_by_seq.state_version, session.state_version) AS state_version
    FROM proposal_sessions AS session
    LEFT JOIN LATERAL (
        SELECT id, state_version
        FROM session_snapshots
        WHERE session_id = session.id
        ORDER BY snapshot_seq DESC
        LIMIT 1
    ) AS latest_by_seq ON true
)
UPDATE proposal_sessions AS session
SET state_version = session_head_versions.state_version,
    latest_snapshot_id = COALESCE(session_head_versions.latest_snapshot_id, session.latest_snapshot_id)
FROM session_head_versions
WHERE session.id = session_head_versions.session_id
  AND (
    session.state_version <> session_head_versions.state_version
    OR (
      session_head_versions.latest_snapshot_id IS NOT NULL
      AND session.latest_snapshot_id IS DISTINCT FROM session_head_versions.latest_snapshot_id
    )
  );

DROP TABLE IF EXISTS pg_temp.tmp_session_state_version_repair;
