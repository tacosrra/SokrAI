# Clinic local demo full manual testing guide

## Purpose and scope

Use this guide to prepare and manually test the current local SokrAI Clinic demo.
It covers only the implemented MVP/Clinic path:

- proposal intake from pasted text and optional document/PDF text
- structured brief generation
- deterministic initial gaps
- problem chat and generated problem section
- solution chat and generated solution section
- Basic Alpha Report and local PDF export
- data/AI/privacy lane
- conditional medical-device triage lane
- resources/pilot/viability lane
- resume/reload and public audit redaction

This is local demo guidance only. Do not use real patient data. Human review is
required for every output. The app does not provide legal, clinical,
regulatory, privacy, medical-device, scoring, approval, rejection, ranking, or
go/no-go decisions. Medical-device triage is not a definitive classification.

Do not present this demo as RAG, enterprise auth, remote AI, hospital
integration, production deployment, or committee automation.

## Prerequisites

Install or verify:

- Node.js 24+
- pnpm 10.28.0
- Docker with `docker compose`
- Bash, curl, and PowerShell if testing Windows scripts
- PostgreSQL through Docker Compose service `postgres`
- n8n through Docker Compose service `n8n`
- Ollama through Docker Compose service `ollama`
- Ollama model `qwen2.5:3b-instruct`, unless `.env` intentionally sets another
  already-pulled local model

Version checks:

```bash
node -v
pnpm -v
docker --version
docker compose version
curl --version
```

Windows/WSL notes:

- Start Docker Desktop before running WSL commands.
- Enable Docker Desktop WSL integration for the distro containing the repo.
- If `docker ps` fails in WSL, run `docker context use default`, then retry.
- If using a Linux Docker daemon inside WSL, start it with
  `sudo service docker start`.

## Environment

Create a local env file and keep it uncommitted:

```bash
cp .env.example .env
```

Use `.env.example` as the source of truth. For the local demo, verify these
values:

```dotenv
APP_ENV=local
APP_PORT=3001
APP_BASE_URL=http://localhost:3001
FRONTEND_PORT=3000

DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
OLLAMA_TIMEOUT_MS=420000
BRIEF_EXTRACTION_MAX_CHARS=10000

INTERNAL_SHARED_SECRET=replace-with-a-random-32-char-secret
ALLOW_SENSITIVE_HEALTH_DATA=false

N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=admin
N8N_ENCRYPTION_KEY=replace-with-a-random-32-char-secret

EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=none
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=24
```

Replace `INTERNAL_SHARED_SECRET`, `N8N_ENCRYPTION_KEY`, and
`N8N_BASIC_AUTH_PASSWORD` with local-only values. Keep internal secrets
server-side. Never put secrets in `VITE_*` variables, because Vite exposes those
values to browser code.

Host commands use `localhost:5433`. Docker containers use `postgres:5432`.
`docker-compose.yml` overrides the API container `DATABASE_URL` accordingly.

Only `AI_PROVIDER=ollama` is supported in this MVP. `AI_MODEL` is optional; when
unset, the API uses `OLLAMA_MODEL`.

## Services setup

Install dependencies:

```bash
pnpm install --store-dir ./.pnpm-store
```

Recommended no-edit local stack:

```bash
docker compose up -d postgres ollama api n8n web
docker compose ps
```

Verify PostgreSQL:

```bash
docker compose exec postgres pg_isready -U postgres
docker compose exec postgres psql -U postgres -d sokrai_app -c "select current_database();"
```

Pull and verify the Ollama model:

```bash
docker compose exec ollama ollama pull qwen2.5:3b-instruct
docker compose exec ollama ollama list
```

Run migrations:

```bash
docker compose exec api pnpm migrate
```

If running API/web on the host instead of Docker:

```bash
docker compose up -d postgres ollama n8n
pnpm run migrate
pnpm --filter @sokrai/api dev
pnpm --filter @sokrai/web dev
```

The committed n8n workflows call `http://api:3001/internal/...`, so the no-edit
path is API in Docker. If API runs on the host, edit the n8n HTTP Request nodes
to an address reachable from the n8n container.

Service URLs:

- web: `http://localhost:3000`
- API health: `http://localhost:3001/healthz`
- n8n: `http://localhost:5678`

## Database setup

Apply migrations:

```bash
pnpm run migrate
# or inside Docker:
docker compose exec api pnpm migrate
```

Verify tables:

```bash
docker compose exec postgres psql -U postgres -d sokrai_app -c "\dt"
```

Stop without deleting data:

```bash
docker compose down
```

Destructive local reset:

```bash
docker compose down -v
```

Use a private browser window or clear local storage for `http://localhost:3000`
if recent demo sessions remain visible after a reset.

## n8n setup

Import all workflow files from `infra/n8n/workflows`:

```bash
for workflow in \
  proposal_start_v1.json \
  proposal_reply_v1.json \
  agent_problem_definition_v1.json \
  solution_start_v1.json \
  solution_reply_v1.json \
  agent_solution_definition_v1.json \
  data_ai_privacy_start_v1.json \
  data_ai_privacy_reply_v1.json \
  agent_data_ai_privacy_gap_v1.json \
  medical_device_triage_start_v1.json \
  medical_device_triage_reply_v1.json \
  agent_medical_device_triage_v1.json \
  resources_pilot_viability_start_v1.json \
  resources_pilot_viability_reply_v1.json \
  agent_resources_pilot_viability_v1.json; do
  docker compose exec -T -u node n8n n8n import:workflow --input="/workflows/${workflow}"
done
```

Publish the imported workflows:

```bash
for workflow_path in infra/n8n/workflows/*.json; do
  workflow_id="$(node -e 'const fs=require("fs"); const workflow=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(workflow.id);' "$workflow_path")"
  docker compose exec -T -u node n8n n8n publish:workflow --id="$workflow_id"
done
docker compose restart n8n
```

Expected public webhooks:

- `/webhook/proposal-start-v1`
- `/webhook/proposal-reply-v1`
- `/webhook/solution-start-v1`
- `/webhook/solution-reply-v1`
- `/webhook/data-ai-privacy-start-v1`
- `/webhook/data-ai-privacy-reply-v1`
- `/webhook/medical-device-triage-start-v1`
- `/webhook/medical-device-triage-reply-v1`
- `/webhook/resources-pilot-viability-start-v1`
- `/webhook/resources-pilot-viability-reply-v1`

Verify webhooks with smoke tests after API, n8n, PostgreSQL, Ollama, the model,
migrations, and published workflows are ready.

Common n8n errors:

- Webhook not found: workflows are not published or n8n needs restart.
- 401/403 internal route: `INTERNAL_SHARED_SECRET` differs between n8n and API.
- Env access denied: verify `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in Compose.
- HTML response in UI: n8n returned editor/error HTML instead of the webhook JSON.

## Validation commands

Run focused checks first:

```bash
pnpm run type-check
pnpm run lint
pnpm run format:check
pnpm run build
pnpm test:contracts
pnpm test:unit
pnpm test:web
```

Run integration checks when PostgreSQL is available:

```bash
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app pnpm test:integration
```

Run broader checks when services are available:

```bash
pnpm test
pnpm verify
bash scripts/smoke-core.sh
bash scripts/smoke-clinic-demo.sh
```

PowerShell smoke equivalents:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-core.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-clinic-demo.ps1
```

The smoke scripts use fake data and safe summaries. They validate contracts,
states, redaction, and PDF bytes; they do not assert exact model wording.

## Manual browser test flow

Open `http://localhost:3000`.

Expected safety behavior throughout:

- "Demo local controlada" warning is visible on start/resume/workspace/module/PDF
  surfaces.
- The warning says not to enter real patient data.
- No screen presents a legal, clinical, regulatory, privacy, medical-device, or
  approval decision.

### 1. Create proposal

Choose "Nueva propuesta". Use the fake proposal below. The UI should submit to
`proposal-start-v1`, show loading state, then open a workspace with a
`session_id`.

Expected result:

- structured brief appears in persisted state
- first problem question appears
- progress/status cards are populated
- initial gaps are visible in audit/state surfaces

### 2. Paste or upload documentation

Paste supporting fake documentation, or upload only a text-extractable fake PDF.

Expected result:

- pasted/uploaded source is persisted as document/source metadata
- no raw PDF/base64 content appears in UI or public audit
- empty/scanned PDFs return controlled text-based-PDF-only feedback

### 3. Structured brief and initial gaps

Review the structured brief and detected gaps.

Expected result:

- brief fields are typed and bounded
- initial gaps are absence-backed or source-confirmation gaps
- out-of-scope gap candidates are filtered and audit-visible only as bounded
  filtered metadata

### 4. Problem chat and problem section

Answer the problem question with fake details about owner, evidence, scope,
current alternatives, assumptions, and remaining ambiguity.

Expected result:

- one primary question per turn
- at most three diagnosis items per turn
- when complete, a `problem` generated section appears
- no legal/cost/scoring drift is presented as a decision

### 5. Solution chat and solution section

Start the solution lane. Answer with fake details about what the solution does,
who uses it, workflow change, current solutions, value differential, and scope
limits.

Expected result:

- solution section is generated after sufficient clarification
- warnings remain bounded and review-oriented
- no automatic transition into unrelated future agents

### 6. Basic Alpha Report

When problem and solution sections exist, compose/view the Basic Alpha Report.

Expected result:

- report shows brief, current gaps, problem section, solution section, sources,
  audit refs, schema version, and fixed no-decision warnings
- report does not include raw model output, prompts, model params, scoring,
  ranking, or approval/rejection

### 7. Data/AI/privacy

Start the data/AI/privacy lane after the solution section exists. Answer with
fake details about data categories, sources, AI role, validation evidence,
privacy governance, cybersecurity controls, regulatory context, and human
review.

Expected result:

- output is a gap/question/review artifact
- `requires competent human review` warning is present where applicable
- no compliance/non-compliance or privacy dictamen is emitted

### 8. Medical-device triage

Start medical-device triage after data/AI/privacy completion.

Expected result:

- if signals or uncertainty exist, the lane asks bounded intended-use/evidence
  questions
- if no signals exist, the lane records `not_applicable` for current material
- output remains gaps/questions/uncertainty only
- no definitive medical-device classification or MDR class is emitted

### 9. Resources/pilot/viability

Start resources/pilot/viability after the solution section exists. Answer with
fake details about resources, pilot environment, dependencies, metrics,
constraints, and risks.

Expected result:

- output captures operational gaps and assumptions
- no viability score, approval, ranking, or financial model is emitted

### 10. PDF export

Click "Download PDF" in the Basic Alpha Report area.

Expected result:

- browser downloads a PDF
- response content type is `application/pdf`
- PDF includes report warnings, sections, audit refs, and export metadata
- PDF does not include raw model output or prompts

### 11. Resume/reload session

Copy the `session_id`, reload the page, and open the session through
"Continuar sesion" or the URL query.

Expected result:

- workspace reloads persisted session state
- turns, generated sections, report availability, and warnings remain visible
- no duplicate side effects are created by reloading

### 12. Audit view and redacted run outputs

Call the public audit endpoint:

```bash
curl -sS http://localhost:3001/api/v1/sessions/<session_id> | node -m json.tool
```

Expected result:

- `runs[].raw_model_output` is `null`
- `runs[].validated_output_json` is `null`
- operational metadata remains visible
- generated sections and audit events are present

## Fake healthcare proposal

Use only this fake example or similarly synthetic data:

```text
Titulo: Demo local de apoyo a admision en urgencias

Objetivo: Madurar una propuesta de asistente local que ayude al equipo de
admision a preparar un resumen operativo antes de la revision humana.

Texto:
Durante una semana simulada se observaron esperas medias ficticias de 27
minutos entre las 10:00 y las 14:00. El equipo cree que parte del retraso se
debe a informacion inicial incompleta, cambios de turno y dudas sobre cuando
escalar una incidencia. La alternativa actual es una hoja manual y llamadas
internas. La propuesta no diagnostica, no prioriza pacientes, no se integra con
sistemas hospitalarios y no envia respuestas automaticas. Se quiere probar solo
con datos sinteticos en un portatil local. No esta claro quien es el responsable
operativo final, que metricas bastan para evaluar el piloto, que datos minimos
deben recogerse, ni si algun cambio de alcance podria requerir revision
regulatoria o medical-device competente.

Documentacion adicional:
Datos ficticios: 120 admisiones simuladas, 34 esperas sobre 30 minutos y 11
quejas simuladas por demora. No hay nombres, historias clinicas, telefonos,
documentos identificativos ni datos reales de pacientes.
```

This text is intentionally ambiguous so the app should ask clarification
questions.

## Troubleshooting

Docker not running:

```bash
docker ps
docker compose ps
```

Start Docker Desktop or the WSL Docker daemon, then retry.

Postgres 5433 vs 5432:

- host commands use `localhost:5433`
- containers use `postgres:5432`
- verify with `docker compose exec postgres pg_isready -U postgres`

n8n workflows imported but not published:

- publish the workflows with the CLI loop above
- restart n8n
- rerun `bash scripts/smoke-core.sh`

Webhook not found:

- verify the workflow is active/published
- verify the URL path uses `/webhook/...`, not `/webhook-test/...`
- restart n8n after publishing

Ollama unavailable:

```bash
docker compose ps ollama
docker compose exec ollama ollama list
docker compose logs -f ollama api
```

Model not pulled:

```bash
docker compose exec ollama ollama pull qwen2.5:3b-instruct
```

JSON/schema validation error:

- check API logs for controlled `error_code`
- rerun focused contract/unit tests
- do not change schemas ad hoc; contracts are source of truth

curl/smoke failure:

- read the `smoke-core:` or `smoke-clinic-demo:` prefix
- use the safe summary to identify API vs n8n
- check `docker compose ps` and `docker compose logs -f api n8n`
- verify `INTERNAL_SHARED_SECRET` matches

PDF failure:

- use only text-based PDFs
- check API logs for sanitized `pdf_parser_failed`
- verify the report exists before downloading PDF

WSL-specific issues:

- keep the repo inside the WSL filesystem, not a slow Windows mount
- ensure Docker Desktop WSL integration is enabled
- use Bash scripts inside WSL and PowerShell scripts from Windows PowerShell

## Final acceptance checklist

- All required services are running: PostgreSQL, API, web, n8n, Ollama.
- Ollama lists the configured model.
- Migrations have run.
- n8n workflows are imported and published.
- Type check, lint, format, build, contract, unit, web, and integration checks
  pass or blockers are documented.
- `smoke-core` and `smoke-clinic-demo` pass when local services are available.
- Manual browser flow completed for proposal, document intake, brief, gaps,
  problem, solution, Basic Alpha Report, data/AI/privacy, medical-device triage,
  resources/pilot/viability, PDF export, resume/reload, audit, and warnings.
- PDF downloaded successfully.
- Safety warnings are visible.
- No real patient data was used.
- No legal/clinical/regulatory/privacy dictamen was presented.
- No definitive medical-device classification was presented.
- Public audit redaction verified for raw/validated agent run outputs.
