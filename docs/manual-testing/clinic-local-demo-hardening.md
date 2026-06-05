# Clinic local demo hardening

## Purpose

This guide is for a controlled local Hospital Clinic demo of the current SokrAI
Clinic Pilot. It hardens only the local demo path that already exists:
proposal intake, problem definition, solution definition, Basic Alpha Report/PDF,
data/AI/privacy, medical-device triage, and resources/pilot/viability.

It is not production guidance. Do not use this setup with real patient data.

## Controlled-use rules

- Use fake or anonymized examples only.
- Keep `ALLOW_SENSITIVE_HEALTH_DATA=false`.
- Treat `session_id` as a local-demo token, not as authentication.
- Do not claim legal, clinical, regulatory, privacy, medical-device, scoring,
  approval, rejection, ranking, or go/no-go decisions.
- Keep the demo local: no remote AI provider, VPS deployment, hospital system
  integration, RAG pipeline, SSO, RBAC, or enterprise auth is added by this path.

## Secrets

Create local env files from the example and never commit them:

```bash
cp .env.example .env
```

Generate local-only values for:

- `INTERNAL_SHARED_SECRET`
- `N8N_ENCRYPTION_KEY`
- `N8N_BASIC_AUTH_PASSWORD`

Keep these server-side. Never put secrets in `VITE_*` variables. Vite exposes
`VITE_*` values to browser code, so only non-secret browser configuration belongs
there.

`docker-compose.yml` intentionally keeps `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
because the committed workflows read `{{$env.INTERNAL_SHARED_SECRET}}` when
calling API internal routes.

## n8n retention

The local Compose default avoids saving execution payloads:

```dotenv
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=none
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=24
```

n8n still receives webhook bodies during execution. These settings reduce
persistent execution payload history; they do not remove in-memory processing.
If you temporarily enable execution-data inspection, use fake data only and
restore the defaults before a demo.

## Audit and logs

The database still persists `agent_runs.raw_model_output` and
`agent_runs.validated_output_json` for backend audit/recovery. The public session
audit endpoint redacts them by default:

```text
GET /api/v1/sessions/:sessionId
```

In public `runs`, `raw_model_output` and `validated_output_json` are `null`.
Operational metadata such as request id, session id, prompt version/hash,
provider/model name, status, and section ids remains available.

API console logs redact prompt, payload, answer, raw output, document text,
base64 content, and known secret keys before printing. Smoke scripts also print
bounded summaries instead of full response bodies when an assertion fails.

## Visible warnings

The web UI shows the local-demo warning at:

- new proposal intake
- start/resume shell
- active workspace
- Clinic module actions
- reply composer
- Basic Alpha Report/PDF surface

These warnings are informational. They do not replace production access control.

## Run the stack

Recommended no-edit local path:

```bash
pnpm install
docker compose up -d postgres ollama api n8n web
docker compose exec ollama ollama pull qwen2.5:3b-instruct
docker compose exec api pnpm migrate
```

Import and publish all fifteen workflows listed in the README, then restart n8n:

```bash
docker compose restart n8n
```

Run live smokes with fake data:

```bash
bash scripts/smoke-core.sh
bash scripts/smoke-clinic-demo.sh
```

Windows equivalents:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-core.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-clinic-demo.ps1
```

`smoke-clinic-demo.sh` exercises problem, solution, report/PDF,
data/AI/privacy, medical-device triage, and resources/pilot/viability. It checks
contract shape and redaction, not exact LLM text.

## Reset and cleanup

Stop the stack before deleting data:

```bash
docker compose down
```

Destructive local reset:

```bash
docker compose down -v
rm -rf postgres_data ollama_data
```

Beta stack destructive reset:

```bash
./scripts/stop-beta.sh
docker compose -p sokrai-beta -f docker-compose.yml -f docker-compose.beta.yml down -v
```

Clear browser state for the local UI if recent sessions remain visible:

- clear `localStorage` for `http://localhost:3000`
- or use a private window
- or use a different browser profile

## Final validation

Before presenting the demo path:

```bash
pnpm install
pnpm build
pnpm test
pnpm verify
bash scripts/smoke-core.sh
bash scripts/smoke-clinic-demo.sh
```

If the live smoke fails because local Ollama cannot finish all modules, keep the
bounded diagnostic. It should identify the blocked stage/request without dumping
payload bodies.
