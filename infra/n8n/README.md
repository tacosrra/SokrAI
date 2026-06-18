# n8n workflows

The canonical v1 workflows live in `infra/n8n/workflows`.

## Import

1. Start the stack with `docker compose up -d postgres n8n api ollama`.
2. Open `http://localhost:5678`.
3. Import the fifteen workflow JSON files from this folder.
4. Set the environment variable `INTERNAL_SHARED_SECRET` in the n8n container to match the API.

## Entry webhooks

- `POST /webhook/proposal-start-v1`
- `POST /webhook/proposal-reply-v1`
- `POST /webhook/solution-start-v1`
- `POST /webhook/solution-reply-v1`
- `POST /webhook/data-ai-privacy-start-v1`
- `POST /webhook/data-ai-privacy-reply-v1`
- `POST /webhook/medical-device-triage-start-v1`
- `POST /webhook/medical-device-triage-reply-v1`
- `POST /webhook/resources-pilot-viability-start-v1`
- `POST /webhook/resources-pilot-viability-reply-v1`

## Internal workflow webhook

- `POST /webhook/agent-problem-definition-v1`
- `POST /webhook/agent-solution-definition-v1`
- `POST /webhook/agent-data-ai-privacy-gap-v1`
- `POST /webhook/agent-medical-device-triage-v1`
- `POST /webhook/agent-resources-pilot-viability-v1`

`agent_problem_definition_v1`, `agent_solution_definition_v1`, and
`agent_data_ai_privacy_gap_v1`, `agent_medical_device_triage_v1`, and
`agent_resources_pilot_viability_v1` exist as
reusable workflow surfaces, but the canonical public exports do not call back
into `n8n` through those webhooks anymore.

They invoke the internal API endpoints directly with `x-internal-shared-secret`:

- `proposal_start_v1` and `proposal_reply_v1` call `/internal/agents/problem-definition/run`
- `solution_start_v1` calls `/internal/sessions/solution-start`
- `solution_reply_v1` calls `/internal/sessions/solution-reply` and then `/internal/agents/solution-definition/run`
- `data_ai_privacy_start_v1` calls `/internal/sessions/data-ai-privacy-start`
- `data_ai_privacy_reply_v1` calls `/internal/sessions/data-ai-privacy-reply`
- `medical_device_triage_start_v1` calls `/internal/sessions/medical-device-triage-start`
- `medical_device_triage_reply_v1` calls `/internal/sessions/medical-device-triage-reply`
- `resources_pilot_viability_start_v1` calls `/internal/sessions/resources-pilot-viability-start`
- `resources_pilot_viability_reply_v1` calls `/internal/sessions/resources-pilot-viability-reply`

Reason:

- calling `http://n8n:5678/webhook/agent-problem-definition-v1` from another synchronous
  n8n webhook execution can stall the request path and make the frontend look like a
  network failure
- the API already owns the contracts, guardrails and persistence for this lane

## Background phase prefetch

After an internal agent/start route returns `agent_status = "done"`, the API
enqueues a bounded background prefetch for the next proposal phase. n8n does not
own this orchestration. The API creates the next `module_chats` row with
`chat_status = "preparing"`, runs the next phase start in-process, and keeps
chaining while a phase can complete without user input. The chain stops when a
phase opens a clarification question, blocks, fails, finds an existing
incomplete chat, or reaches the configured step limit.
`PHASE_PREFETCH_ENABLED` controls the behavior and defaults to `true`.

The frontend maps `chat_status = "preparing"` to a phase skeleton instead of a
global loading screen. This lets the user see that the phase is being prepared
while keeping phase starts explicit and auditable.

If you imported an older version of the workflows, reimport the files under
`infra/n8n/workflows` or update the direct API call nodes in place.

The current exports also keep the upstream API status code and JSON body when
`/internal/sessions/start-context`, `/internal/sessions/append-reply`,
`/internal/sessions/solution-start`, `/internal/sessions/solution-reply`, or
`/internal/sessions/data-ai-privacy-start`,
`/internal/sessions/data-ai-privacy-reply`,
`/internal/sessions/medical-device-triage-start`,
`/internal/sessions/medical-device-triage-reply`,
`/internal/sessions/resources-pilot-viability-start`,
`/internal/sessions/resources-pilot-viability-reply`, or the internal agent routes
fail. This applies to the problem, solution, data/AI/privacy, and
medical-device triage, and resources/pilot workflows, and avoids n8n wrapping a controlled API error
such as `ollama_timeout` into an unexpected webhook payload.

The medical-device triage workflows are thin wrappers only. They do not contain
activation rules, prompts, legal/regulatory text, MDR material, scoring, or
classification logic. The API owns the conditional activation and keeps the
output limited to gaps/questions/uncertainty and `requires competent human
review`.

The resources/pilot/viability workflows are also thin wrappers only. They do
not contain scoring, approval, ranking, financial modelling, RAG, PDF/export, or
pilot decision logic. The API owns operational guardrails, persistence, replay,
and section rendering for `resources_pilot_viability`.
