# SokrAI v1

Middleware de maduracion de propuestas antes de comite, orientado a demostrar una sola capacidad de forma solida en v1:

> digerir una propuesta inicial, construir un `structured_brief` y conducir una conversacion socratica resumible para clarificar el problema.

## Alcance de esta v1

- Orquestacion principal con `n8n`
- Inferencia local con `Ollama`
- Persistencia en `PostgreSQL`
- Un unico lane operativo: `problem_definition_agent`
- Una pregunta principal por turno
- Persistencia de sesiones, turnos, snapshots, agent runs y eventos
- Reanudacion por `session_id`
- Contratos JSON versionados y validados

## Fuera de alcance

- Lane legal
- Lane de costes
- Scoring o priorizacion de comite
- RAG complejo
- UI rica
- OCR para PDFs escaneados

## Estructura

```text
apps/api                 Servicio Fastify con dominio, persistencia y adaptadores
contracts/schemas        Source of truth de request/response y artefactos internos
db/migrations            SQL versionado
infra/n8n/workflows      Exportes versionados de n8n
prompts/v1               Prompts versionados
tests                    Contratos, dominio, integracion y smoke
examples                 Payloads de ejemplo
PLAN.md                  Plan de implementacion de esta v1
```

## Contratos principales

### Inicio

Entrada:

- `project_title`
- `goal`
- `proposal_text` opcional
- `document_text` opcional
- `file` opcional con PDF en base64

Salida:

- `session_id`
- `stage = "problem_definition"`
- `structured_brief`
- `detected_gaps`
- `next_question`
- `agent_status`

### Reply

Entrada:

- `session_id`
- `answer`

Salida:

- `updated_problem_definition`
- `next_question`
- `agent_status`
- `completion_reason`

Los schemas canonicos viven en `contracts/schemas`.

## Modelo de persistencia

Tablas principales:

- `proposal_sessions`
- `conversation_turns`
- `agent_runs`
- `session_snapshots`
- `session_events`

Patron:

- `proposal_sessions` es el head mutable
- `session_snapshots` y `session_events` son historial append-only
- `agent_runs` guarda prompt/model/schema/raw output por ejecucion
- `conversation_turns` modela la conversacion de una pregunta por turno

## Arranque local

### 1. Preparar entorno

```bash
cp .env.example .env
pnpm install --store-dir ./.pnpm-store
```

### 2. Levantar dependencias

```bash
docker compose up -d postgres n8n ollama
```

### 3. Cargar un modelo en Ollama

```bash
docker exec -it $(docker ps -qf "ancestor=ollama/ollama:latest") ollama pull qwen2.5:7b-instruct
```

### 4. Aplicar migraciones

```bash
pnpm migrate
```

### 5. Levantar la API

```bash
pnpm dev
```

La API queda en `http://localhost:3001`.

### 6. Importar workflows n8n

Archivos:

- `infra/n8n/workflows/proposal_start_v1.json`
- `infra/n8n/workflows/proposal_reply_v1.json`
- `infra/n8n/workflows/agent_problem_definition_v1.json`

Abre `http://localhost:5678`, importa los tres workflows y asegúrate de que `INTERNAL_SHARED_SECRET` coincide entre `.env`, la API y `n8n`.

## Endpoints y workflows

### Webhooks n8n

- `POST /webhook/proposal-start-v1`
- `POST /webhook/proposal-reply-v1`

### Endpoint interno reutilizable

- `POST /webhook/agent-problem-definition-v1`

### API interna para n8n

- `POST /internal/sessions/start-context`
- `POST /internal/sessions/append-reply`
- `POST /internal/agents/problem-definition/run`

### API de inspeccion

- `GET /api/v1/sessions/:sessionId`
- `GET /healthz`

## Ejemplos

Payloads listos para prueba:

- `examples/proposal-start.payload.json`
- `examples/proposal-reply.payload.json`

El flujo normal es:

1. `proposal_start_v1`
2. guardar `session_id`
3. responder con `proposal_reply_v1`
4. repetir hasta `agent_status = "done"`

## Tests

```bash
pnpm test:contracts
pnpm test:unit
pnpm test:integration
pnpm test:smoke
```

## Decisiones importantes de v1

- `n8n` orquesta, pero no contiene reglas criticas de negocio.
- La API valida todo contra schemas antes de aceptar o persistir.
- El modelo nunca es la unica barrera de validacion.
- Si el modelo devuelve JSON invalido, se intenta reparar una sola vez.
- Si la reparacion falla, se devuelve error controlado y se persiste `raw_model_output`.
- La reanudacion y trazabilidad salen de SQL, no de estado en memoria.

## Limitaciones conocidas

- El soporte PDF es para documentos con texto extraible, no OCR.
- Los workflows n8n se importan manualmente.
- Esta v1 no debe usarse con PHI real si `ALLOW_SENSITIVE_HEALTH_DATA=false`.
