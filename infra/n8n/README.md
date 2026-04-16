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

This workflow is meant to be invoked from the other two workflows, not directly by end users.
