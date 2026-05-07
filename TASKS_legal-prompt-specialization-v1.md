# Implementation Tasks: Legal Orchestrator Specialization
**Change ID:** `legal-prompt-specialization-v1`

---

## Expected Behavior

The system must allow the front end to select which agent specialization to use per session, without changing the existing v1 flow when no selection is provided.

- The new proposal form exposes a Specialty selector with two options: Default (project planning / problem definition) and Legal (legal clarification).
- When a new session is started, the chosen `specialty` is sent in the proposal start payload as an optional field with values `default` or `legal`.
- The UI may allow switching specialty mid-session; if so, the switch keeps the same `session_id` but triggers a context reset for the model.
- If `specialty` is omitted, the system behaves exactly as today: same prompt, same schema, same persistence, no retrieval.
- The session stores the selected `specialty` at creation time and reuses it for all subsequent turns; reply payloads must not override it.
- On specialty switch, the session updates `current_specialty` and records a reset marker (`context_reset_seq` or `context_reset_at`) to delimit model history.
- Model inputs always include the stable app context (e.g., `structured_brief`, `project_title`, `goal`, and other session metadata), even after a reset.
- Model inputs include only turns after the reset marker and only turns that match the current specialty, preventing cross-agent leakage.
- The orchestrator chooses the prompt based on the session specialty:
  - `default` -> `problem-definition-agent.md`
  - `legal` -> `problem-definition-agent-legal.md`
- The output schema and validation remain unchanged for all specialties; one-question-per-turn and problem-definition-only rules remain enforced.
- For `legal`, the orchestrator must attach retrieval context from the legal RAG corpus only.
  - If retrieval returns no relevant material, the assistant should ask for the missing information rather than inventing facts.
  - The legal prompt explicitly forbids legal advice and focuses on clarification, risk identification, and bounded questioning.
- For `default`, retrieval is disabled and the current non-RAG behavior is preserved.
- Each agent run records `agent_runs.specialty` for audit; `prompt_name` and `prompt_version` reflect the actual prompt used.
- The n8n start workflow forwards `specialty` once at session creation; the reply workflow uses the stored session specialty from the API/session, not the incoming payload.

---

## Phase 1: Foundation (Data Layer)

- [ ] 1.1 Add `specialty` column (`text`, nullable, default `null`) to `proposal_sessions` and `agent_runs` — migration `db/migrations/XXXX_add_specialty_columns.sql`
- [ ] 1.2 (Optional) Add `specialty` to `session_snapshots` for audit continuity
- [ ] 1.3 Add optional `specialty` field to the proposal start request schema in `contracts/schemas` (enum: `"default" | "legal"`, optional) and update TypeScript types to match
- [ ] 1.4 Update persistence to store `specialty` on session creation and reuse it for all subsequent agent runs
- [ ] 1.5 Add a migration test or smoke check that verifies the new column(s) accept `null`, `"default"`, and `"legal"`

**Quality Gate:**
- [ ] `pnpm test:contracts` passes with the updated schema
- [ ] Migration runs cleanly against a fresh DB (`pnpm migrate`)

---

## Phase 2: Business Logic (Domain / Orchestrator)

- [ ] 2.1 Create `prompts/v1/problem-definition-agent-legal.md` — focused on clarification and risk identification, explicitly scoped to problem definition (no legal advice), one-question-per-turn rule preserved, with a clear disclaimer header
- [ ] 2.2 Extend `loadPrompt` in `prompt-service.ts` to accept an optional `specialty` argument and resolve the correct file:
  - `specialty = default` -> `problem-definition-agent.md`
  - `specialty = legal` -> `problem-definition-agent-legal.md`
- [ ] 2.3 Add `specialty?: 'default' | 'legal'` param to `LlmOrchestrator.runProblemDefinition()` and thread it through to `loadPrompt`, keeping default behavior identical when omitted
- [ ] 2.4 Add a legal retrieval adapter hook into the orchestrator for the `legal` path only.
  - `specialty = legal` should enable RAG/retrieval context and restrict answers to legal-relevant corpus data
  - `specialty = default` should preserve the current non-retrieval problem-definition behavior
- [ ] 2.5 Use existing `prompt_name` / `prompt_version` fields for prompt audit; store only the specialty string in `agent_runs.specialty`
- [ ] 2.6 Add tests at the service layer (e.g., `ProblemDefinitionService`) to ensure:
	- legal specialty selects the legal prompt and retrieval flow
	- schema validation and guardrails are unchanged
	- `agent_runs.specialty` is persisted as `legal`

**Quality Gate:**
- [ ] `pnpm test:unit` passes
- [ ] Default path (no specialty) is verified to be byte-identical in behavior to pre-change baseline
- [ ] Legal prompt selection is covered by at least one happy-path and one JSON-repair-path test

---

## Phase 3: API & n8n Surface

- [ ] 3.1 Update `/internal/sessions/start-context` (and `ProposalStartService`) to accept `specialty` from the payload and persist it on the session
- [ ] 3.1b Ensure request validation and TypeScript DTOs are aligned with the new `specialty` field
- [ ] 3.1c Ensure `ProblemDefinitionService` reads the session specialty for both `start` and `reply` triggers
- [ ] 3.2 Update the n8n workflow `infra/n8n/workflows/proposal_start_v1.json` to forward `specialty` from the webhook payload to the API call (optional field, ignored if absent)
- [ ] 3.3 Update `infra/n8n/workflows/proposal_reply_v1.json` if needed so the reply path continues using the stored session specialty, not the payload
- [ ] 3.4 Update `apps/web` demo UI to expose a "Specialty" selector (`Default` / `Legal`) on the new-proposal form and to persist the selected value through the session
- [ ] 3.5 Add a smoke test asserting that sending `specialty: "legal"` returns a valid `next_question` and logs `specialty = "legal"` in `agent_runs`

**Quality Gate:**
- [ ] `pnpm test:web` passes
- [ ] `pnpm test:smoke` passes end-to-end with `specialty = "legal"` payload

---

## Phase 4: Integration & Polish

- [ ] 4.1 If the UI change is implemented, follow existing i18n patterns (if any)
- [ ] 4.2 Run full integration suite with the legal specialty active: `TEST_DATABASE_URL=... pnpm test:integration`
- [ ] 4.3 Confirm the default path remains unchanged (same prompt, same schema validation, no new warnings)
- [ ] 4.4 Update `README.md` — add `legal` to the specialty opt-in note under **Decisiones importantes de v1**
- [ ] 4.5 Update `README_ORCHESTRATOR_LEGAL.md` status from *Draft* to *Implemented*, recording the prompt file name, the input param name, the audit field location

**Quality Gate:**
- [ ] All test suites pass (`contracts`, `unit`, `web`, `integration`, `smoke`)
- [ ] Code analysis clean (no new lint errors)
- [ ] Both READMEs reflect the implemented state

---

## Completion Checklist

- [ ] All phases complete
- [ ] All quality gates passed
- [ ] `agent_runs.specialty` is populated and queryable for audit
- [ ] Default (`problem_definition_agent`) path is provably unchanged
- [ ] Legal prompt content reviewed for scope drift (no legal advice, clarification only)
- [ ] RAG is only enabled for the `legal` path and is scoped to legal questions
- [ ] Documentation synced
- [ ] Ready for `/openspec-archive` (if applicable)
