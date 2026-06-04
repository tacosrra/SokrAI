# SokrAI MVP Alpha local demo guide

## 1. Purpose

This guide lets a developer run and manually test the current SokrAI MVP Alpha end to end from the local repository. It is based on the current `package.json` scripts, Docker Compose files, `.env.example`, n8n workflow exports, Ollama adapter, API routes, frontend behavior, and test suite.

Use it when you need to prove the PR8 / Basic Structured Alpha Report path manually, then exercise the PR9 browser extension for data/AI/privacy gaps and the PR10 conditional medical-device triage flow:

1. Create a proposal.
2. Add or paste documentation.
3. Generate a structured brief.
4. Generate initial gaps.
5. Complete the problem chat.
6. Generate the problem section.
7. Complete the solution chat.
8. Generate the solution section.
9. Compose and view the Basic Alpha Report in the app.
10. Start and complete the PR9 data/AI/privacy browser flow after the solution section exists.
11. Start PR10 medical-device triage after the PR9 section exists.
12. Verify applicable/uncertain cases ask bounded questions and no-signal cases are recorded as `not_applicable`.
13. Reload or resume the session and verify state persists.

## 2. Current Scope

This guide covers MVP Alpha plus the PR9 and PR10 Clinic Pilot extensions:

- local proposal intake
- pasted text and optional text-extractable PDF intake
- deterministic normalization and persistence
- `structured_brief` generation through Ollama
- initial deterministic Alpha gap analysis
- `problem_definition_agent`
- `solution_definition_agent`
- generated `problem` and `solution` sections
- persisted audit and resume behavior
- Basic Alpha Report composition and app display
- PR9 `hospital_clinic_v1` data/AI/privacy gap flow after solution completion
- PR10 conditional `medical_device_triage` flow after data/AI/privacy completion
- PR10 generated section limited to gaps/questions/uncertainty and competent human review

The canonical contracts live in `contracts/schemas`. The relevant public app surfaces are:

- web UI: `http://localhost:3000`
- API health: `http://localhost:3001/healthz`
- session audit: `GET http://localhost:3001/api/v1/sessions/:sessionId`
- Basic Alpha Report: `GET http://localhost:3001/api/v1/sessions/:sessionId/report`
- n8n editor: `http://localhost:5678`

## 3. Intentionally Out of Scope

Do not test or present these as implemented MVP Alpha, PR9, or PR10 capabilities:

- Clinic Pilot modules beyond `data_ai_privacy_gap_agent` and `medical_device_triage`
- definitive medical device determination
- MDR class or product classification
- legal, regulatory, clinical, privacy, or medical-device dictamen
- compliance, non-compliance, approval, rejection, scoring, or ranking
- resources/pilot/viability modules
- PDF export
- RAG
- remote or VPS AI provider
- enterprise auth
- real patient data processing

The Alpha report is not an approval, rejection, ranking, legal decision, clinical decision, regulatory decision, or committee decision.

PR10 medical-device triage is conditional and non-definitive. It activates only
when medical-device signals or uncertainty are present in persisted proposal
material, or records `not_applicable` for the current material when no such
signals are found. Its output must stay limited to gaps/questions/uncertainty
and must use `requires competent human review` when human review is required.

## 4. Prerequisites

### Host development tools

- Node.js `24+` for host development. The API and web Dockerfiles use `node:24-alpine`, and `docs/INICIALIZACION_V1.md` documents Node.js 24+ for host development.
- pnpm `10.28.0`. The root `package.json` declares `"packageManager": "pnpm@10.28.0"`.
- Docker with `docker compose`.
- `curl` for health checks and smoke calls.
- `bash` on macOS, Linux, or WSL for the shell snippets below.
- PowerShell equivalents exist for beta scripts, but this guide uses the explicit manual path.

Check versions:

```bash
node -v
pnpm -v
docker --version
docker compose version
curl --version
```

### Docker Desktop and WSL notes

On Windows with WSL, use Docker Desktop with WSL Integration enabled for the distro where this repo is checked out. If `docker ps` fails inside WSL:

1. Start Docker Desktop on Windows.
2. Enable `Settings > Resources > WSL Integration` for your distro.
3. Run this inside WSL:

```bash
docker context use default
docker ps
docker compose ps
```

If you use a Linux Docker daemon inside WSL instead of Docker Desktop, start it first:

```bash
sudo service docker start
docker context use default
docker ps
```

### Ollama requirements

The recommended manual path runs Ollama in Docker through `docker-compose.yml`. The Ollama service is not published to the host in the current compose file; the API reaches it as `http://ollama:11434` on the Docker network.

The default model in `.env.example` and `apps/api/src/config/env.ts` is:

```text
qwen2.5:3b-instruct
```

You must pull the model into the Docker Ollama container before running the full flow.

### n8n requirements

The recommended manual path runs n8n in Docker through `docker-compose.yml`. n8n persists state in the Docker volume `n8n_data` and imports workflow files from the repo bind mount:

```text
infra/n8n/workflows:/workflows
```

n8n basic auth is enabled by environment variables. The Vite web proxy also reads these credentials and adds Basic Auth when calling `/webhook/*`.

## 5. Required Services

The full local demo needs these services:

| Service | How it runs in the recommended path | URL or port |
| --- | --- | --- |
| PostgreSQL | Docker Compose service `postgres` | host `localhost:5433`, container `postgres:5432` |
| API | Docker Compose service `api` | `http://localhost:3001` |
| web | Docker Compose service `web` or `pnpm dev:web` | `http://localhost:3000` |
| n8n | Docker Compose service `n8n` | `http://localhost:5678` |
| Ollama | Docker Compose service `ollama` | container network `http://ollama:11434` |

The exported n8n workflows call API URLs like `http://api:3001/internal/...`, so the no-edit path is to run API and n8n together in Docker Compose.

## 6. Environment Setup

Create a local env file:

```bash
cp .env.example .env
```

Use `.env.example` as the source of truth for variables. For the manual local demo, the important values are:

```dotenv
APP_ENV=local
LOG_LEVEL=info
APP_PORT=3001
APP_BASE_URL=http://localhost:3001
FRONTEND_PORT=3000

DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
DATABASE_POOL_MAX=10
DATABASE_STATEMENT_TIMEOUT_MS=5000

AI_PROVIDER=ollama
# AI_MODEL=qwen2.5:3b-instruct
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
OLLAMA_TIMEOUT_MS=420000
OLLAMA_KEEP_ALIVE=30m
OLLAMA_NUM_CTX=4096
BRIEF_EXTRACTION_MAX_CHARS=10000

INTERNAL_SHARED_SECRET=replace-with-a-random-32-char-secret
JSON_REPAIR_MAX_ATTEMPTS=1
MAX_PROPOSAL_CHARS=30000
MAX_REPLY_CHARS=4000
MAX_TURNS_PER_SESSION=12
MAX_DIAGNOSIS_ITEMS=3
ALLOW_SENSITIVE_HEALTH_DATA=false

N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=admin
N8N_ENCRYPTION_KEY=replace-with-a-random-32-char-secret

API_PROXY_TARGET=http://localhost:3001
WEBHOOK_PROXY_TARGET=http://localhost:5678

VITE_API_BASE_URL=
VITE_WEBHOOK_BASE_URL=
VITE_START_SESSION_TIMEOUT_MS=960000
VITE_REPLY_SESSION_TIMEOUT_MS=540000
VITE_SESSION_AUDIT_TIMEOUT_MS=10000
VITE_REQUEST_STATUS_TIMEOUT_MS=10000
VITE_REQUEST_RECOVERY_TIMEOUT_MS=960000
VITE_ACTIVE_RECOVERY_AFTER_MS=60000
```

Change at least these placeholders in `.env`:

- `INTERNAL_SHARED_SECRET`
- `N8N_ENCRYPTION_KEY`

Keep `INTERNAL_SHARED_SECRET` server-side only. It is used by n8n HTTP Request nodes as the `x-internal-shared-secret` header when calling API internal routes. Do not put it in any `VITE_*` variable and do not send it from browser code.

### Host vs Docker database URLs

The same PostgreSQL server has two addresses:

- Host commands use `localhost:5433` because Compose publishes Postgres as `127.0.0.1:5433:5432`.
- Docker services use `postgres:5432` on the Compose network.

Keep host-side `.env` values like this:

```dotenv
DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
```

`docker-compose.yml` overrides the API container with:

```text
DATABASE_URL=postgresql://sokrai_app:localpass@postgres:5432/sokrai_app
```

Do not change the host `.env` to `postgres:5432` unless you are running the command from inside a container.

### AI provider variables

Only Ollama is supported by the current API config:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
```

`AI_MODEL` is optional. If it is unset, the API falls back to `OLLAMA_MODEL`.

## 7. Install Commands

Install workspace dependencies:

```bash
pnpm install --store-dir ./.pnpm-store
```

The workspace is declared in `pnpm-workspace.yaml` and includes `apps/*`.

## 8. Database Setup

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Verify it is reachable from inside Docker:

```bash
docker compose exec postgres pg_isready -U postgres
```

Verify it is reachable from the host through the published port:

```bash
docker compose exec postgres psql -U postgres -d sokrai_app -c "select current_database();"
```

Run migrations from the host:

```bash
pnpm run migrate
```

Or run migrations from the API container:

```bash
docker compose run --rm api pnpm --filter @sokrai/api migrate
```

The migration script is `apps/api/scripts/migrate.ts`. It applies every SQL file in `db/migrations` in sorted order:

- `db/migrations/001_initial.sql`
- `db/migrations/002_alpha_data_model.sql`
- `db/migrations/003_documents_sources.sql`
- `db/migrations/004_alpha_gap_analysis.sql`
- `db/migrations/005_problem_module_alpha.sql`
- `db/migrations/006_solution_module_alpha.sql`

Verify tables exist:

```bash
docker compose exec postgres psql -U postgres -d sokrai_app -c "\dt"
```

Expected core tables include `proposal_sessions`, `conversation_turns`, `agent_runs`, `session_snapshots`, `session_events`, `proposals`, `proposal_documents`, `proposal_sources`, `alpha_gaps`, `module_chats`, `chat_turns`, `generated_sections`, `basic_reports`, and `audit_events`.

## 9. n8n Setup

Start n8n with the stack:

```bash
docker compose up -d postgres api n8n
```

Open:

```text
http://localhost:5678
```

Use:

- username: `N8N_BASIC_AUTH_USER`
- password: `N8N_BASIC_AUTH_PASSWORD`

The current workflow exports are all inactive in JSON, so importing is not enough. Import and publish all nine workflows.

### Workflow files involved

- `infra/n8n/workflows/proposal_start_v1.json`
- `infra/n8n/workflows/proposal_reply_v1.json`
- `infra/n8n/workflows/agent_problem_definition_v1.json`
- `infra/n8n/workflows/solution_start_v1.json`
- `infra/n8n/workflows/solution_reply_v1.json`
- `infra/n8n/workflows/agent_solution_definition_v1.json`
- `infra/n8n/workflows/data_ai_privacy_start_v1.json`
- `infra/n8n/workflows/data_ai_privacy_reply_v1.json`
- `infra/n8n/workflows/agent_data_ai_privacy_gap_v1.json`

### CLI import and publish

Run this after `n8n` is up:

```bash
for workflow in proposal_start_v1.json proposal_reply_v1.json agent_problem_definition_v1.json solution_start_v1.json solution_reply_v1.json agent_solution_definition_v1.json data_ai_privacy_start_v1.json data_ai_privacy_reply_v1.json agent_data_ai_privacy_gap_v1.json; do
  docker compose exec -T -u node n8n n8n import:workflow --input="/workflows/${workflow}"
done
```

Publish the imported workflows by their committed workflow IDs:

```bash
for workflow_path in infra/n8n/workflows/proposal_start_v1.json infra/n8n/workflows/proposal_reply_v1.json infra/n8n/workflows/agent_problem_definition_v1.json infra/n8n/workflows/solution_start_v1.json infra/n8n/workflows/solution_reply_v1.json infra/n8n/workflows/agent_solution_definition_v1.json infra/n8n/workflows/data_ai_privacy_start_v1.json infra/n8n/workflows/data_ai_privacy_reply_v1.json infra/n8n/workflows/agent_data_ai_privacy_gap_v1.json; do
  workflow_id="$(awk -F'"' '/^[[:space:]]*"id":[[:space:]]*"/ { print $4; exit }' "$workflow_path")"
  docker compose exec -T -u node n8n n8n publish:workflow --id="$workflow_id"
done
```

Restart n8n so active workflow state is applied:

```bash
docker compose restart n8n
```

### Webhooks to verify

Public entry webhooks:

- `POST http://localhost:5678/webhook/proposal-start-v1`
- `POST http://localhost:5678/webhook/proposal-reply-v1`
- `POST http://localhost:5678/webhook/solution-start-v1`
- `POST http://localhost:5678/webhook/solution-reply-v1`
- `POST http://localhost:5678/webhook/data-ai-privacy-start-v1`
- `POST http://localhost:5678/webhook/data-ai-privacy-reply-v1`

Internal workflow webhooks also exist, but the current public workflows call the API internal agent routes directly:

- `POST http://localhost:5678/webhook/agent-problem-definition-v1`
- `POST http://localhost:5678/webhook/agent-solution-definition-v1`
- `POST http://localhost:5678/webhook/agent-data-ai-privacy-gap-v1`

The practical webhook verification is the stack smoke script after API, n8n, Postgres, and Ollama are running:

```bash
INTERNAL_SHARED_SECRET="$(awk -F= '$1=="INTERNAL_SHARED_SECRET"{print substr($0,index($0,"=")+1); exit}' .env)" bash scripts/smoke-core.sh
```

## 10. Ollama Setup

Start Ollama:

```bash
docker compose up -d ollama
```

Pull the required model:

```bash
docker compose exec ollama ollama pull qwen2.5:3b-instruct
```

Verify Ollama has the model:

```bash
docker compose exec ollama ollama list
```

Test a model response:

```bash
docker compose exec ollama ollama run qwen2.5:3b-instruct "Return the word ready."
```

Because the current Compose file does not publish Ollama port `11434` to the host, use `docker compose exec ollama ...` for local checks unless you deliberately expose the port yourself.

## 11. Start the App

### Recommended Docker path

Terminal 1:

```bash
docker compose up -d postgres ollama api n8n web
docker compose ps
```

Terminal 2:

```bash
docker compose logs -f api n8n web
```

Open:

- web UI: `http://localhost:3000`
- API health: `http://localhost:3001/healthz`
- n8n: `http://localhost:5678`

Health check:

```bash
curl -i http://localhost:3001/healthz
```

Expected body:

```json
{"status":"ok"}
```

### Host web development option

If you want to run only the frontend from the host:

Terminal 1:

```bash
docker compose up -d postgres ollama api n8n
```

Terminal 2:

```bash
pnpm run dev:web
```

Open:

```text
http://localhost:3000
```

The Vite config proxies:

- `/api/*` to `API_PROXY_TARGET`, default `http://localhost:3001`
- `/webhook/*` to `WEBHOOK_PROXY_TARGET`, default `http://localhost:5678`

## 12. Pre-flight Validation

Run the static checks:

```bash
pnpm run type-check
pnpm run format:check
pnpm run lint
pnpm run build
```

Run contract and unit tests:

```bash
pnpm run test:contracts
pnpm run test:unit
pnpm run test:web
```

Run integration tests when PostgreSQL is available:

```bash
docker compose up -d postgres
pnpm run migrate
pnpm run test:integration
```

Run the API smoke test suite when PostgreSQL is available:

```bash
pnpm run test:smoke
```

Run the full package verify command when PostgreSQL and services are ready:

```bash
pnpm run verify
```

Run the real local stack smoke script when API, n8n, Postgres, Ollama, model, migrations, and published workflows are all ready:

```bash
INTERNAL_SHARED_SECRET="$(awk -F= '$1=="INTERNAL_SHARED_SECRET"{print substr($0,index($0,"=")+1); exit}' .env)" bash scripts/smoke-core.sh
```

Note the difference:

- `pnpm run test:smoke` runs Vitest smoke tests with fake model responses.
- `bash scripts/smoke-core.sh` calls the live API and n8n webhooks.

## 13. Manual MVP Alpha Browser Test Script

Use fake information only. Do not paste real patient data.

### Step 1: Create a proposal

Open:

```text
http://localhost:3000
```

Select `Nueva propuesta`.

Fill:

- `Titulo del proyecto`: `Asistente de priorizacion para demanda administrativa en atencion primaria`
- `Objetivo`: `Madurar la definicion del problema y de una primera solucion antes de decidir si merece una evaluacion formal.`
- `Contexto de la propuesta`: use the fake proposal in section 14.
- `Texto de apoyo`: use the fake support document in section 14.
- `User ID opcional`: `demo-alpha-local`
- `Metadata JSON opcional`:

```json
{"demo":"mvp-alpha","site":"centro-salud-ficticio","contains_real_patient_data":false}
```

Click `Crear sesion de maduracion`.

Expected UI behavior:

- A banner says the proposal was sent and the structured brief is being prepared.
- The submit button changes to `Cargando primer diagnostico...`.
- After n8n, API, and Ollama finish, the app opens the workspace.
- The workspace shows a `Session ID`, project title, status badges, `Panel de estado`, internal sources, detected gaps, and one open question.

Expected system behavior:

- n8n receives `proposal-start-v1`.
- The API creates the session and persists proposal context.
- Ollama generates a `structured_brief`.
- Deterministic Alpha gaps are persisted.
- The problem agent opens one primary question.

### Step 2: Verify structured brief and initial gaps

In the right-side state panel, inspect:

- `Categorias clave`
- `Detected gaps`
- `Warnings`
- `Fuentes internas`

Expected behavior:

- The brief has project title, goal, target user, problem owner, problem statement, evidence, scope, alternatives, assumptions, and ambiguities where available.
- At least some gaps should remain open because the proposal is intentionally ambiguous.
- Internal sources should include the pasted proposal/support text.
- No legal, regulatory, cost, scoring, or committee decision should appear as a result.

### Step 3: Complete problem chat

Answer the current problem question with concrete problem information. If the question asks something different, adapt the answer while staying focused on problem definition.

Suggested first answer:

```text
El problem owner principal es la direccion de atencion primaria del area, porque responde por tiempos de respuesta, seguridad operacional y saturacion de agendas. El responsable operativo diario seria el equipo administrativo del centro de salud ficticio, que recibe llamadas y mensajes de pacientes simulados y decide si algo es administrativo, clinico no urgente o debe escalarse a enfermeria.
```

Click `Enviar respuesta`.

Expected behavior:

- The banner says the reply was sent and the state is updating.
- A new persisted turn appears in `Historial persistido`.
- The next question is different and still asks one primary problem clarification.
- Diagnosis chips can appear, but there should be at most three.

Continue with answers like these until the problem lane reaches `agent done` or no open problem question remains.

Problem answer 2:

```text
La evidencia ficticia es que, durante tres semanas simuladas, el 38% de las llamadas de primera hora fueron dudas administrativas repetidas sobre citas, justificantes o preparacion de visitas. El tiempo medio hasta clasificar la solicitud fue de 18 minutos en hora punta, y enfermeria recibio derivaciones que despues resultaron ser administrativas en 2 de cada 10 casos simulados.
```

Problem answer 3:

```text
El alcance inicial es solo la entrada administrativa digital y telefonica de adultos en un centro de salud ficticio. Quedan fuera urgencias reales, diagnostico, priorizacion clinica automatica, menores, imagenes, medicacion y decisiones sobre tratamiento. Hoy las alternativas son scripts telefonicos, mensajes manuales en el portal y derivacion a enfermeria cuando administracion duda.
```

Expected completion behavior:

- When the API accepts the lane as complete, the session can show `completed` for the problem path.
- A `Problem section` appears in the state panel.
- The workspace shows a `Carril de solucion` callout and an `Iniciar solucion` button.

### Step 4: Generate problem section

The problem section is generated by the API when the problem definition lane reaches completion. In the UI, verify:

- right panel has a card with the generated problem section title and `section_version`
- `GET /api/v1/sessions/:sessionId` includes `generated_sections` with `section_kind = "problem"`

Optional API check:

```bash
SESSION_ID="replace-with-session-id"
curl -sS "http://localhost:3001/api/v1/sessions/${SESSION_ID}"
```

### Step 5: Start solution chat

Click `Iniciar solucion`.

Expected behavior:

- The banner says the solution lane is starting.
- The workspace label changes to `Pregunta abierta de solucion` when a solution question is active.
- The answer placeholder asks for what the solution does, who uses it, how it works, and its limits.

### Step 6: Complete solution chat

Answer with operational solution details. Do not answer with budget, procurement, legal, regulatory, medical-device, PDF, RAG, scoring, approval, or committee-decision content.

Suggested solution answer 1:

```text
La solucion propuesta es un asistente interno que resume solicitudes administrativas ficticias antes de que el equipo las revise. Lo usaria el personal administrativo para ver una categoria sugerida, una explicacion corta y los datos que faltan. No decide prioridad clinica ni responde automaticamente al paciente simulado.
```

Suggested solution answer 2:

```text
Funcionaria leyendo el texto que el paciente ficticio escribe en el portal o que administracion transcribe desde una llamada. La herramienta extrae motivo, documentos mencionados, urgencia declarada por la persona y campos ausentes. Despues muestra una ficha para que administracion confirme o corrija antes de cerrar la clasificacion.
```

Suggested solution answer 3:

```text
El cambio de flujo seria revisar primero una ficha estructurada en vez de leer cada mensaje completo sin apoyo. Las soluciones actuales son scripts, plantillas y derivacion manual a enfermeria ante duda. La diferencia esperada es reducir reprocesos administrativos y derivaciones innecesarias, manteniendo a una persona responsable de la decision. La primera version excluye diagnostico, urgencias, menores, tratamiento, scoring clinico y automatizacion de respuestas.
```

Expected completion behavior:

- The solution lane eventually returns `agent done`.
- A generated solution section appears.
- `GET /api/v1/sessions/:sessionId` includes `generated_sections` with `section_kind = "solution"`.

### Step 7: Compose the Basic Alpha Report

The frontend displays a report that already exists, but it does not currently call the internal compose endpoint itself. After both `problem` and `solution` sections exist, compose the report from the terminal:

```bash
SESSION_ID="replace-with-session-id"
INTERNAL_SHARED_SECRET="$(awk -F= '$1=="INTERNAL_SHARED_SECRET"{print substr($0,index($0,"=")+1); exit}' .env)"

curl -sS \
  -X POST \
  http://localhost:3001/internal/reports/basic-alpha/compose \
  -H 'Content-Type: application/json' \
  -H "x-internal-shared-secret: ${INTERNAL_SHARED_SECRET}" \
  --data "{\"session_id\":\"${SESSION_ID}\",\"workflow_version\":\"basic_alpha_report_v1\"}"
```

Expected response:

- `report_id`
- `proposal_id`
- `report_status` of `ready`, `needs_revision`, or `draft`
- `schema_version`
- `structured_brief`
- `current_gaps`
- `problem_section`
- `solution_section`
- `internal_sources`
- `audit_refs`
- `warnings`
- `generated_at`

### Step 8: View Basic Alpha Report in the app

After composing the report, reload the browser tab or use `Abrir otra sesion` with the same `Session ID`.

Expected behavior:

- The workspace displays `Informe Alpha`.
- The report title is `Basic Alpha Report`.
- The report shows brief fields, open gaps, problem section, solution section, gap states, internal sources, and warnings.
- The report does not show raw model output, prompts, model parameters, or validated raw run payloads.

### Step 9: Run PR9 Data/AI/Privacy in the Browser

Keep using fake or anonymized information only. The PR9 browser path requires the same nine workflows imported and published in section 9, especially:

- `data_ai_privacy_start_v1`
- `data_ai_privacy_reply_v1`
- `agent_data_ai_privacy_gap_v1`

After the solution section exists, the workspace shows the `Carril datos/IA/privacidad` callout with the `Iniciar datos/IA/privacidad` button. Click it and answer the open data/AI/privacy question with bounded, fictitious project context, for example:

```text
Los datos serian solicitudes administrativas ficticias, notas internas simuladas y campos de admision sin datos reales de pacientes. La IA solo prepararia un resumen estructurado para que personal competente lo revise. Privacidad, gobierno clinico y regulatorio revisarian base de datos, trazabilidad, controles de acceso y limites antes de cualquier piloto.
```

Expected UI behavior:

- The open question label changes to `Pregunta abierta de datos/IA/privacidad`.
- The module can ask follow-up questions until `agent_status` is `done` or `blocked`.
- The workspace shows `requires competent human review` warnings.
- After completion, the workspace shows the generated `Data, AI and privacy gaps` section.
- The Basic Alpha Report remains Alpha-only and does not include the data/AI/privacy section.

Expected persisted artifacts from `GET /api/v1/sessions/:sessionId`:

- `module_chats` contains `module = "data_ai_privacy"`.
- `chat_turns` for the module contain the PR9 questions, answers, warnings and `agent_run` audit refs.
- `alpha_gaps` can contain `module = "data_ai_privacy"` gap rows.
- `generated_sections` contains `section_kind = "data_ai_privacy"` after completion.
- `audit_events` include data/AI/privacy lifecycle events, and guardrail intervention events when code normalizes unsafe model output.

## 14. Example Fake Proposal

Paste this into `Contexto de la propuesta`:

```text
Un centro de salud ficticio recibe muchas consultas administrativas por telefono y por portal digital. Algunas son simples, como cambiar una cita o pedir un justificante, pero otras mencionan sintomas de forma imprecisa. El equipo administrativo pierde tiempo leyendo cada mensaje y a veces deriva solicitudes a enfermeria solo porque no esta claro si son administrativas o clinicas.

La idea inicial es usar IA para ordenar estas solicitudes antes de que una persona las revise. Creemos que podria ahorrar tiempo y reducir interrupciones, pero aun no sabemos cual es exactamente el cuello de botella principal, quien debe ser el owner del problema, que evidencia minima necesitamos ni que parte del flujo deberia cambiar.

No se usaran datos reales de pacientes en esta demo. Todos los ejemplos son ficticios. La primera version se limitaria a un centro de salud inventado, adultos, mensajes administrativos y apoyo a personal interno. No debe diagnosticar, priorizar urgencias, responder automaticamente ni tomar decisiones clinicas.
```

Paste this into `Texto de apoyo`:

```text
Notas ficticias de descubrimiento:

- En una semana simulada se recibieron 240 solicitudes administrativas por el portal.
- Aproximadamente 90 solicitudes llegaron entre las 08:00 y las 10:00.
- El personal administrativo reporto que muchas solicitudes mezclan tramites, dudas sobre preparacion de una visita y frases vagas como "me encuentro peor".
- Enfermeria recibio derivaciones que despues fueron resueltas como cambios de cita o documentacion.
- No existe una metrica acordada para distinguir demora administrativa, riesgo clinico o reproceso.
- La direccion quiere saber si el problema es volumen, clasificacion, falta de datos, o ausencia de un flujo comun.
```

This proposal is intentionally ambiguous enough to trigger gaps but contains no real patient data.

## 15. Verify Persistence

### Browser checks

1. Copy the `Session ID` from the workspace.
2. Reload `http://localhost:3000`.
3. Choose `Continuar sesion`.
4. Paste the `Session ID`.
5. Click `Abrir sesion`.

Expected behavior:

- The app reloads session state from PostgreSQL through `GET /api/v1/sessions/:sessionId`.
- Previous turns, snapshots, runs, generated sections, documents, sources, gaps, and report display again.
- Recent sessions may also appear from browser `localStorage`, but PostgreSQL is the source of truth.

### API audit check

```bash
SESSION_ID="replace-with-session-id"
curl -sS "http://localhost:3001/api/v1/sessions/${SESSION_ID}"
```

Expected audit payload includes:

- `session`
- `turns`
- `runs`
- `snapshots`
- `events`
- `documents`
- `sources`
- `gaps`
- `module_chats`
- `generated_sections`

### Optional SQL checks

```bash
SESSION_ID="replace-with-session-id"

docker compose exec postgres psql -U postgres -d sokrai_app \
  -c "select id, status, current_stage, current_turn_seq, state_version, updated_at from proposal_sessions where id = '${SESSION_ID}';"
```

```bash
SESSION_ID="replace-with-session-id"

docker compose exec postgres psql -U postgres -d sokrai_app \
  -c "select turn_seq, status, left(question_text, 80) as question, left(answer_text, 80) as answer from conversation_turns where session_id = '${SESSION_ID}' order by turn_seq;"
```

```bash
SESSION_ID="replace-with-session-id"

docker compose exec postgres psql -U postgres -d sokrai_app \
  -c "select section_kind, section_status, section_version, title from generated_sections where proposal_id = '${SESSION_ID}' order by section_kind, section_version;"
```

```bash
SESSION_ID="replace-with-session-id"

docker compose exec postgres psql -U postgres -d sokrai_app \
  -c "select report_status, schema_version, generated_at from basic_reports where proposal_id = '${SESSION_ID}';"
```

## 16. Verify the Basic Alpha Report

Read the public report endpoint:

```bash
SESSION_ID="replace-with-session-id"
curl -sS "http://localhost:3001/api/v1/sessions/${SESSION_ID}/report"
```

Expected sections and fields:

- `schema_version` is present.
- `structured_brief` contains the normalized proposal brief.
- `current_gaps` contains current Alpha gaps.
- `problem_section` is the generated problem section.
- `solution_section` is the generated solution section.
- `internal_sources` contains traceable internal sources only.
- `audit_refs` references relevant agent runs and audit events.
- `warnings` includes no-dictamen and no-decision warnings.

Expected warnings include these meanings:

- the report is not a dictamen
- the report does not approve, reject, rank, or prioritize the proposal
- the report is not a legal, clinical, or regulatory decision

These fields must not appear in the public report response or app report panel:

- `raw_model_output`
- `validated_output_json`
- `prompt_name`
- `prompt_version`
- `prompt_sha256`
- `model_params_json`
- approval or rejection decision
- legal, clinical, or regulatory dictamen
- committee scoring or ranking
- PDF export URL

## 17. Troubleshooting

### Docker is not running

Symptom:

```text
Cannot connect to the Docker daemon
```

Fix:

```bash
docker ps
docker context use default
```

On Windows, start Docker Desktop and enable WSL Integration for your distro.

### PostgreSQL unavailable

Symptoms:

- `pnpm run migrate` cannot connect
- integration tests fail before running assertions

Checks:

```bash
docker compose up -d postgres
docker compose exec postgres pg_isready -U postgres
docker compose ps postgres
```

### Port 5433 vs 5432 confusion

Use `localhost:5433` from the host:

```dotenv
DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
```

Use `postgres:5432` only from Docker services. The API container override already does this.

### n8n webhook not found

Symptoms:

- browser reports a network or HTML response error
- `scripts/smoke-core.sh` fails at `proposal-start-v1`
- n8n returns webhook not registered

Fix:

1. Import all nine workflow files.
2. Publish all nine workflows.
3. Restart n8n.
4. Run the live smoke script.

```bash
docker compose restart n8n
INTERNAL_SHARED_SECRET="$(awk -F= '$1=="INTERNAL_SHARED_SECRET"{print substr($0,index($0,"=")+1); exit}' .env)" bash scripts/smoke-core.sh
```

### Workflows imported but not published

The committed workflow JSON files have `"active": false`. After import, publish them with:

```bash
for workflow_path in infra/n8n/workflows/proposal_start_v1.json infra/n8n/workflows/proposal_reply_v1.json infra/n8n/workflows/agent_problem_definition_v1.json infra/n8n/workflows/solution_start_v1.json infra/n8n/workflows/solution_reply_v1.json infra/n8n/workflows/agent_solution_definition_v1.json infra/n8n/workflows/data_ai_privacy_start_v1.json infra/n8n/workflows/data_ai_privacy_reply_v1.json infra/n8n/workflows/agent_data_ai_privacy_gap_v1.json; do
  workflow_id="$(awk -F'"' '/^[[:space:]]*"id":[[:space:]]*"/ { print $4; exit }' "$workflow_path")"
  docker compose exec -T -u node n8n n8n publish:workflow --id="$workflow_id"
done
```

### Ollama unavailable

Symptoms:

- API returns `ollama_unreachable`
- API logs show connection failure to `http://ollama:11434`

Checks:

```bash
docker compose up -d ollama
docker compose ps ollama
docker compose exec ollama ollama list
```

### Model not pulled

Symptoms:

- Ollama request fails because model is missing
- first proposal generation fails quickly or returns a provider error

Fix:

```bash
docker compose exec ollama ollama pull qwen2.5:3b-instruct
docker compose exec ollama ollama list
```

### JSON validation failure

Symptoms:

- API returns `invalid_response_contract`
- API logs mention validation or repair failure

Context:

- The API validates model output against contracts.
- `JSON_REPAIR_MAX_ATTEMPTS=1` allows one repair attempt.
- If repair fails, the API returns a controlled error and persists the run failure for audit.

Fix:

- Retry the same step once.
- If it repeats, inspect API logs and `agent_runs`.

```bash
docker compose logs -f api
```

### Timeout

Symptoms:

- browser says the request exceeded timeout
- API returns `ollama_timeout`

Fixes:

- Confirm the model is pulled and the machine has enough resources.
- Watch API and n8n logs.
- Keep the current high timeout values from `.env.example`.
- Try a smaller already-pulled model only if you intentionally change `OLLAMA_MODEL`.

```bash
docker compose logs -f api n8n ollama
```

### Smoke test failure

Checks:

```bash
curl -i http://localhost:3001/healthz
docker compose ps
docker compose exec ollama ollama list
docker compose exec postgres pg_isready -U postgres
```

Then re-run:

```bash
INTERNAL_SHARED_SECRET="$(awk -F= '$1=="INTERNAL_SHARED_SECRET"{print substr($0,index($0,"=")+1); exit}' .env)" bash scripts/smoke-core.sh
```

### WSL-specific issues

If bind-mounted data directories have permission problems, prefer the named-volume beta compose path for exploratory demos, or remove stale local Docker state only after confirming you do not need it.

For WSL Docker Desktop connection issues:

```bash
docker context use default
docker ps
```

If it still fails, enable Docker Desktop WSL Integration, run `wsl --shutdown` from Windows, reopen WSL, and retry.

## 18. Reset and Cleanup

Stop services but keep volumes/data:

```bash
docker compose stop
```

Stop and remove containers:

```bash
docker compose down
```

Reset the local application database volume and n8n volume only when you are sure you no longer need local sessions:

```bash
docker compose down -v
```

If you used the default compose file, local bind-mounted data may also exist in:

- `postgres_data`
- `ollama_data`

Clear browser state if the web UI keeps showing old recent sessions:

- clear `localStorage` for `http://localhost:3000`, or
- use a private browser window, or
- open a different browser profile.

## 19. Known Limitations

- Demo local only.
- No real patient data.
- No RAG.
- No PDF export.
- No enterprise auth.
- No OCR for scanned PDFs.
- No remote or VPS AI provider.
- No Clinic Pilot modules beyond the PR9 data/AI/privacy gap flow.
- Basic Alpha Report composition currently requires the internal compose API call after both generated sections exist; the app displays the report after it has been composed.

## 20. Final Checklist

### Commands to run

```bash
cp .env.example .env
pnpm install --store-dir ./.pnpm-store
docker compose up -d postgres ollama api n8n web
docker compose exec ollama ollama pull qwen2.5:3b-instruct
pnpm run migrate
```

```bash
for workflow in proposal_start_v1.json proposal_reply_v1.json agent_problem_definition_v1.json solution_start_v1.json solution_reply_v1.json agent_solution_definition_v1.json data_ai_privacy_start_v1.json data_ai_privacy_reply_v1.json agent_data_ai_privacy_gap_v1.json; do
  docker compose exec -T -u node n8n n8n import:workflow --input="/workflows/${workflow}"
done
```

```bash
for workflow_path in infra/n8n/workflows/proposal_start_v1.json infra/n8n/workflows/proposal_reply_v1.json infra/n8n/workflows/agent_problem_definition_v1.json infra/n8n/workflows/solution_start_v1.json infra/n8n/workflows/solution_reply_v1.json infra/n8n/workflows/agent_solution_definition_v1.json infra/n8n/workflows/data_ai_privacy_start_v1.json infra/n8n/workflows/data_ai_privacy_reply_v1.json infra/n8n/workflows/agent_data_ai_privacy_gap_v1.json; do
  workflow_id="$(awk -F'"' '/^[[:space:]]*"id":[[:space:]]*"/ { print $4; exit }' "$workflow_path")"
  docker compose exec -T -u node n8n n8n publish:workflow --id="$workflow_id"
done
docker compose restart n8n
```

```bash
pnpm run type-check
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test:contracts
pnpm run test:unit
pnpm run test:web
pnpm run test:integration
pnpm run test:smoke
INTERNAL_SHARED_SECRET="$(awk -F= '$1=="INTERNAL_SHARED_SECRET"{print substr($0,index($0,"=")+1); exit}' .env)" bash scripts/smoke-core.sh
```

### URLs to open

- `http://localhost:3000`
- `http://localhost:3001/healthz`
- `http://localhost:5678`
- `http://localhost:3001/api/v1/sessions/:sessionId`
- `http://localhost:3001/api/v1/sessions/:sessionId/report`

### Expected success signs

- API health returns `{"status":"ok"}`.
- n8n workflows are imported and published.
- Ollama lists `qwen2.5:3b-instruct`.
- A new proposal creates a `session_id`.
- The app shows a structured brief, gaps, sources, and one open problem question.
- Problem replies persist and eventually generate a problem section.
- Solution replies persist and eventually generate a solution section.
- The PR9 data/AI/privacy browser flow persists a module chat and generated data/AI/privacy section after solution completion.
- The internal compose endpoint creates a Basic Alpha Report.
- Reloading or reopening by `Session ID` restores persisted state.
- The app shows `Basic Alpha Report`.
- The report contains warnings and excludes raw model/prompt fields and any approval, rejection, or legal/clinical/regulatory dictamen.
