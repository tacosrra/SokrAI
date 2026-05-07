# Implementation Tasks: Legal Orchestrator Specialization
**Change ID:** `legal-prompt-specialization-v1`

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
- [ ] 2.2 Extend `loadPrompt` in `prompt-service.ts` to accept an optional `specialty` argument and resolve the correct file (`problem-definition-agent` vs `problem-definition-agent-legal`)
- [ ] 2.3 Add `specialty?: 'default' | 'legal'` param to `LlmOrchestrator.runProblemDefinition()` and thread it through to `loadPrompt`, keeping default behavior identical when omitted
- [ ] 2.4 Use existing `prompt_name` / `prompt_version` fields for prompt audit; store only the specialty string in `agent_runs.specialty`
- [ ] 2.5 Add tests at the service layer (e.g., `ProblemDefinitionService`) to ensure:
	- legal specialty selects the legal prompt
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
- [ ] 3.3 (Optional) Update `apps/web` demo UI to expose a "Specialty" selector (`Default` / `Legal`) on the new-proposal form
- [ ] 3.4 Add a smoke test asserting that sending `specialty: "legal"` returns a valid `next_question` and logs `specialty = "legal"` in `agent_runs`

**Quality Gate:**
- [ ] `pnpm test:web` passes
- [ ] `pnpm test:smoke` passes end-to-end with `specialty = "legal"` payload

---

## Phase 4: Integration & Polish

- [ ] 4.1 If the UI change is implemented, follow existing i18n patterns (if any)
- [ ] 4.2 Run full integration suite with the legal specialty active: `TEST_DATABASE_URL=... pnpm test:integration`
- [ ] 4.3 Confirm the default path remains unchanged (same prompt, same schema validation, no new warnings)
- [ ] 4.4 Update `README.md` — add `legal` to the specialty opt-in note under **Decisiones importantes de v1**
- [ ] 4.5 Update `README_ORCHESTRATOR_LEGAL.md` status from *Draft* to *Implemented*, recording the prompt file name, the input param name, and the audit field location

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
- [ ] Documentation synced
- [ ] Ready for `/openspec-archive` (if applicable)
