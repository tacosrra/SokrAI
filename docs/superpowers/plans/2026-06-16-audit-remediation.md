# Audit Remediation Implementation Plan

> **For implementer:** Required sub-skill: `superpowers:executing-plans`.

**Goal:** Fix the confirmed audit findings that can break the MVP flow: reply idempotency, retry/failure semantics, request-status visibility, schema drift, frontend phase/report state, and Docker beta isolation.

**Architecture:** Keep the current API/web split and the declared contract schemas as source of truth. Fix behavior at the boundary where state transitions are persisted instead of papering over symptoms in UI or tests.

**Tech Stack:** Fastify, TypeScript, PostgreSQL migrations, React, Vitest, Docker Compose, n8n import scripts.

---

## Phase 1: Backend Regression Tests

Create failing tests before implementation for the high-risk backend paths:

- `tests/unit/session-retry.test.ts`
  - Assert non-retryable reply failures are not eligible for user retry.
  - Keep terminal `maximum_turns_reached` behavior covered.
- `tests/integration/problem-definition-error-paths.test.ts`
  - Duplicate append reply while a turn is `processing` returns `409` and does not overwrite the original answer/request id.
  - Retryable reply failure still resolves through `GET /api/v1/requests/:requestId` after the turn is reopened for user retry.
  - Maximum-turn blocked sessions reject fresh replies with `409 session_blocked`.
  - Invalid internal agent `trigger` returns `400 invalid_agent_run_request`.
- `tests/integration/proposal-flow.test.ts`
  - Internal start/reply routes honor `payload.request_id` when top-level `request_id` is absent, preserving idempotency.

Run targeted tests and confirm they fail for the expected reasons.

## Phase 2: Backend Fixes

Implement the minimal state-machine fixes:

- In `session-retry`, require `error.retryable === true` before reopening reply failures, while still blocking terminal failure codes.
- In `session-store.appendUserAnswer`, accept answers only for `awaiting_user` turns. Return `409 reply_already_processing` if a turn is already `processing`.
- In `session-store.tryUnblockSessionForUserRetry`, refuse to reopen sessions whose latest failed run has a terminal code such as `maximum_turns_reached`.
- In `session-store.getRequestExecutionStatus`, fall back to the latest `problem_definition` agent run for proposal replies whose turn has been reopened and no longer has `answer_request_id`.
- In `problem-definition-service.persistFailure`, update the session head only when `revertTurnForUserRetry` actually reverted the turn, preventing stale failure handlers from downgrading completed state.
- In `app.ts`, validate internal agent run bodies and reject invalid `trigger`; extract request ids from validated payloads for start/reply routes.

Run the backend targeted tests again, then full integration.

## Phase 3: Frontend Regression Tests And Fixes

Add focused tests in `apps/web/src/lib/session-view.test.ts`:

- `pdf_export` keeps `download_pdf` as primary action after a successful download when the report is still ready.
- Duplicate presentation gaps prefer an active gap over a resolved duplicate.

Implement UI fixes:

- Keep PDF download action available after success.
- Include the current phase id in selectable phases, even if it has no conversation history yet.
- Do not clear the active report when loading another session fails.
- Prefer active duplicate gaps in presentation dedupe.

Run focused web tests, then the full web test suite.

## Phase 4: Contract And Migration Drift

Fix declared contracts and persistence repair:

- Set `basic-alpha-report.schema.json#/properties/schema_version` to `const: "basic-alpha-report.v1"`.
- Update alpha report fixtures to match the runtime version.
- Update root `pnpm test` to run both API and web unit suites.
- Extend migration `010_repair_session_state_versions.sql` so repaired sessions also point `latest_snapshot_id` at the latest snapshot by sequence.

Run contract tests and migration-related tests.

## Phase 5: Docker, Beta, And Workflow Scripts

Fix operational drift:

- Parameterize host ports in `docker-compose.yml`, including an Ollama host port for host-run API workflows.
- Remove beta `container_name` values so multiple compose projects do not collide.
- Generate beta env files with non-default host ports and URLs derived from those ports.
- Pull the actual AI model used by the API when it differs from `OLLAMA_MODEL`.
- Replace static n8n import markers with a hash of workflow files.
- Fix duplicate workflow cleanup SQL generation in bash scripts.
- Mirror bash changes in PowerShell scripts where the same beta behavior exists.

Run `docker compose config --quiet` for base and beta configurations.

## Phase 6: Final Verification

Run:

```bash
pnpm lint
pnpm test:contracts
pnpm test:unit
pnpm test:web
pnpm test:integration
pnpm build
docker compose config --quiet
docker compose -f docker-compose.yml -f docker-compose.beta.yml --env-file .env.beta config --quiet
graphify update .
```

If a full suite is too slow or blocked by local dependencies, record the exact command and failure.
