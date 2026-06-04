# n8n workflows

The canonical v1 workflows live in `infra/n8n/workflows`.

## Import

1. Start the stack with `docker compose up -d postgres n8n api ollama`.
2. Open `http://localhost:5678`.
3. Import the nine workflow JSON files from this folder.
4. Set the environment variable `INTERNAL_SHARED_SECRET` in the n8n container to match the API.

## Entry webhooks

- `POST /webhook/proposal-start-v1`
- `POST /webhook/proposal-reply-v1`
- `POST /webhook/solution-start-v1`
- `POST /webhook/solution-reply-v1`
- `POST /webhook/data-ai-privacy-start-v1`
- `POST /webhook/data-ai-privacy-reply-v1`

## Internal workflow webhook

- `POST /webhook/agent-problem-definition-v1`
- `POST /webhook/agent-solution-definition-v1`
- `POST /webhook/agent-data-ai-privacy-gap-v1`

`agent_problem_definition_v1`, `agent_solution_definition_v1`, and
`agent_data_ai_privacy_gap_v1` exist as reusable workflow surfaces, but the
canonical public exports do not call back into `n8n` through those webhooks
anymore.

They invoke the internal API endpoints directly with `x-internal-shared-secret`:

- `proposal_start_v1` and `proposal_reply_v1` call `/internal/agents/problem-definition/run`
- `solution_start_v1` calls `/internal/sessions/solution-start`
- `solution_reply_v1` calls `/internal/sessions/solution-reply` and then `/internal/agents/solution-definition/run`
- `data_ai_privacy_start_v1` calls `/internal/sessions/data-ai-privacy-start`
- `data_ai_privacy_reply_v1` calls `/internal/sessions/data-ai-privacy-reply`

Reason:

- calling `http://n8n:5678/webhook/agent-problem-definition-v1` from another synchronous
  n8n webhook execution can stall the request path and make the frontend look like a
  network failure
- the API already owns the contracts, guardrails and persistence for this lane

If you imported an older version of the workflows, reimport the files under
`infra/n8n/workflows` or update the direct API call nodes in place.

The current exports also keep the upstream API status code and JSON body when
`/internal/sessions/start-context`, `/internal/sessions/append-reply`,
`/internal/sessions/solution-start`, `/internal/sessions/solution-reply`, or
`/internal/sessions/data-ai-privacy-start`,
`/internal/sessions/data-ai-privacy-reply`, or the internal agent routes fail.
This applies to the problem, solution, and data/AI/privacy workflows, and
avoids n8n wrapping a controlled API error such as `ollama_timeout` into an
unexpected webhook payload.
