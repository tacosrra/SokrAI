# n8n workflows

The canonical v1 workflows live in `infra/n8n/workflows`.

## Import

1. Start the stack with `docker compose up -d postgres n8n api ollama`.
2. Open `http://localhost:5678`.
3. Import the three workflow JSON files from this folder.
4. Set the environment variable `INTERNAL_SHARED_SECRET` in the n8n container to match the API.

## Entry webhooks

- `POST /webhook/proposal-start-v1`
- `POST /webhook/proposal-reply-v1`

## Internal workflow webhook

- `POST /webhook/agent-problem-definition-v1`

`agent_problem_definition_v1` exists as a reusable workflow surface, but the canonical
`proposal_start_v1` and `proposal_reply_v1` exports do not call back into `n8n` through
this webhook anymore.

They invoke `http://api:3001/internal/agents/problem-definition/run` directly with
`x-internal-shared-secret`.

Reason:

- calling `http://n8n:5678/webhook/agent-problem-definition-v1` from another synchronous
  n8n webhook execution can stall the request path and make the frontend look like a
  network failure
- the API already owns the contracts, guardrails and persistence for this lane

If you imported an older version of the workflows, reimport `proposal_start_v1.json`
and `proposal_reply_v1.json` or update the `Invoke_AgentProblemDefinition` node in place.
