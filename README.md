# SokrAI v1 — Estado del proyecto (2026-04-29)

Middleware de maduracion de propuestas antes de comite, enfocado en demostrar una sola capacidad solida en v1: digerir una propuesta inicial, construir un `structured_brief` y conducir una conversacion socratica resumible para clarificar el problema.

Guia detallada de arranque y prueba:

- `docs/INICIALIZACION_V1.md`

## Estado actual (resumen)

- La v1 esta implementada y es ejecutable localmente con Docker Compose.
- El unico carril funcional es `problem_definition_agent`.
- El flujo end-to-end incluye intake, extraccion de brief, turnos socraticos, persistencia completa y reanudacion por `session_id`.
- Hay workflows n8n versionados en el repo y prompts versionados en archivos.
- Se incluyen contratos JSON, migracion inicial y una UI de demo para operar el flujo sin curl.

## Alcance de esta v1

- Orquestacion principal con `n8n`.
- Inferencia local con `Ollama`.
- Persistencia en `PostgreSQL`.
- Interfaz operativa en `apps/web` para demo local y uso humano.
- Una pregunta principal por turno.
- Persistencia de sesiones, turnos, snapshots, agent runs y eventos.
- Reanudacion por `session_id`.
- Contratos JSON versionados y validados.

## Fuera de alcance (deliberado)

- Lane legal.
- Lane de costes.
- Scoring o priorizacion de comite.
- RAG complejo.
- OCR para PDFs escaneados.
- BI/dashboard amplio o superficies multi-lane fuera del carril `problem_definition`.

## Stack tecnico

Backend y orquestacion:

- Node.js 24+, TypeScript.
- Fastify + Ajv para contratos JSON.
- PostgreSQL con `pg`.
- `n8n` para orquestacion y webhooks.
- Ollama local para inferencia.

Frontend:

- React 19 + Vite.

Infra y tooling:

- Docker + Docker Compose.
- pnpm (workspace).
- Vitest para tests.

## Arquitectura (v1)

Componentes y responsabilidades:

- `apps/api`: API Fastify con validacion de contratos, persistencia, prompts, dominio y ejecucion de agentes.
- `apps/web`: UI de demo para crear, responder y reanudar sesiones.
- `infra/n8n/workflows`: exports versionados de los workflows n8n.
- `db/migrations`: migraciones SQL versionadas.
- `contracts/schemas`: source of truth de request/response y artefactos internos.
- `prompts/v1`: prompts versionados del agente.

Flujo principal (alto nivel):

1. `proposal_start_v1` recibe la propuesta (texto o PDF base64).
2. n8n llama a la API para preparar el contexto y ejecutar el agente.
3. La API normaliza, valida, persiste y llama a Ollama.
4. Se guarda `structured_brief`, se crea el primer turno y se responde con una pregunta.
5. `proposal_reply_v1` agrega respuestas del usuario y repite el ciclo hasta `agent_status = "done"`.

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

## Persistencia (modelo actual)

Tablas principales:

- `proposal_sessions`
- `conversation_turns`
- `agent_runs`
- `session_snapshots`
- `session_events`

Patron:

- `proposal_sessions` es el head mutable.
- `session_snapshots` y `session_events` son historial append-only.
- `agent_runs` guarda prompt/model/schema/raw output por ejecucion.
- `conversation_turns` modela la conversacion de una pregunta por turno.

## Workflows n8n (versionados)

- `infra/n8n/workflows/proposal_start_v1.json`
- `infra/n8n/workflows/proposal_reply_v1.json`
- `infra/n8n/workflows/agent_problem_definition_v1.json`

Entrypoints:

- `POST /webhook/proposal-start-v1`
- `POST /webhook/proposal-reply-v1`

## UI operativa

La UI en `apps/web` permite:

- crear una nueva propuesta,
- pegar `document_text` o subir PDF base64,
- responder turnos,
- reanudar por `session_id`,
- inspeccionar brief, gaps, warnings y trazabilidad.

## Arranque local (resumen)

Ruta rapida para beta testers:

```bash
./scripts/bootstrap-beta.sh
```

En Windows nativo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-beta.ps1
```

Ruta manual resumida:

```bash
cp .env.example .env
pnpm install --store-dir ./.pnpm-store
docker compose up -d postgres ollama api n8n web
pnpm migrate
```

Luego importa los workflows y abre:

- UI: `http://localhost:3000`
- API: `http://localhost:3001/healthz`
- n8n: `http://localhost:5678`

## Tests disponibles

Los tests de **integración** abren Postgres. Si lanzas Vitest desde el host y usas Docker Compose tal como viene el proyecto, Postgres escucha en **127.0.0.1:5433**, no en `5432`; el valor por defecto del helper de tests apunta a `localhost:5432`, así que verás errores tipo `ECONNREFUSED` (p. ej. en `smoke.test.ts` al llegar a `buildTestApp`).

**Opciones:**

```bash
# A) Una sola vez: copiar el ejemplo de URL para el puerto correcto del host
cp .env.test.example .env.test   # PowerShell: Copy-Item .env.test.example .env.test
# Luego revisa/edita TEST_DATABASE_URL si hace falta.

pnpm test:contracts
pnpm test:unit
pnpm test:web
pnpm test:integration
pnpm test:smoke
```

```bash
# B) Sin archivo .env.test: exportar la variable en la sesión
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@127.0.0.1:5433/sokrai_app pnpm test:integration
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@127.0.0.1:5433/sokrai_app pnpm test:smoke
```

*(Si tu `.env` ya tiene un `DATABASE_URL` válido **desde el host** para el mismo usuario y base de datos, Vitest también lo usará tras cargar `.env`.)*

## Decisiones importantes de v1

- `n8n` orquesta, pero no contiene reglas criticas de negocio.
- La API valida todo contra schemas antes de aceptar o persistir.
- El modelo nunca es la unica barrera de validacion.
- Si el modelo devuelve JSON invalido, se intenta reparar una sola vez.
- Si la reparacion falla, se devuelve error controlado y se persiste `raw_model_output`.
- La reanudacion y trazabilidad salen de SQL, no de estado en memoria.

## Modulo RAG (v1.5)

A partir de esta version la API incluye un modulo lateral de RAG basado en
`pgvector` y `bge-m3` via Ollama. Permite indexar documentos por dominio
(legal, costes, glosarios) y buscarlos por similitud semantica en
castellano, catalan e ingles.

- Ingesta por CLI: `pnpm rag:ingest --pack <pack_name>`
- Busqueda por CLI: `pnpm rag:search --pack <pack_name> --query "..."`
- Inspeccion HTTP: `GET /api/v1/rag/packs`, `GET /api/v1/rag/search`

El modulo es **independiente** del lane `problem_definition_agent`. No
modifica prompts, contratos, schemas, workflows ni frontend de la v1
existente.

Guia detallada: [docs/RAG.md](docs/RAG.md).

## Limitaciones conocidas

- El soporte PDF es para documentos con texto extraible, no OCR.
- Los workflows n8n se importan manualmente.
- Esta v1 no debe usarse con PHI real si `ALLOW_SENSITIVE_HEALTH_DATA=false`.
