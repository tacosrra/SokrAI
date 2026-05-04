# SokrAI v1

Middleware de maduracion de propuestas antes de comite, orientado a demostrar una sola capacidad de forma solida en v1:

> digerir una propuesta inicial, construir un `structured_brief` y conducir una conversacion socratica resumible para clarificar el problema.

Guia detallada de arranque y prueba:

- [docs/INICIALIZACION_V1.md](/home/tacosrra/PAE/docs/INICIALIZACION_V1.md)

## Alcance de esta v1

- Orquestacion principal con `n8n`
- Inferencia local con `Ollama`
- Persistencia en `PostgreSQL`
- Interfaz operativa en `apps/web` para demo local y uso humano
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
- OCR para PDFs escaneados
- BI/dashboard amplio o superficies multi-lane fuera del carril `problem_definition`

## Estructura

```text
apps/api                 Servicio Fastify con dominio, persistencia y adaptadores
apps/web                 Frontend React + Vite para crear, responder y reanudar sesiones
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

### Ruta rapida para beta testers

Para reducir el setup manual sin tocar el flujo de desarrollo existente, esta v1 incluye un bootstrap aislado para beta:

```bash
./scripts/bootstrap-beta.sh
```

En Windows nativo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-beta.ps1
```

Que hace:

- crea `.env.beta` a partir de `.env.example`
- genera secretos locales si siguen en placeholder
- arranca `Docker Desktop` si ya esta instalado pero no esta corriendo
- levanta un proyecto Docker aislado llamado `sokrai-beta`
- usa volumenes Docker dedicados para `postgres`, `ollama` y `n8n`
- espera a que `PostgreSQL`, `Ollama`, `API`, `n8n` y `web` esten listos
- descarga el modelo configurado en `OLLAMA_MODEL`
- ejecuta migraciones
- importa y activa los workflows de `n8n`
- abre la UI principal en el navegador al terminar

Requisitos de esta ruta:

- `Docker Desktop` o un daemon Docker accesible
- `curl` y shell tipo `bash` en macOS, Linux o WSL
- `PowerShell` en Windows nativo

Para esta ruta beta no hace falta instalar `Node.js` ni `pnpm` en host.

Comandos posteriores:

```bash
./scripts/start-beta.sh
./scripts/stop-beta.sh
```

En Windows nativo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-beta.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\stop-beta.ps1
```

La ruta beta usa `.env.beta` y un proyecto Docker separado, asi que no pisa el flujo manual existente.

### 1. Preparar entorno

```bash
cp .env.example .env
pnpm install --store-dir ./.pnpm-store
```

### 2. Levantar dependencias

```bash
docker compose up -d postgres n8n ollama
```

`Ollama` no se expone al host por defecto en esta v1. La API le habla por la red interna de Docker Compose, lo que evita conflictos habituales con instalaciones locales de Ollama en `11434`.

`n8n` guarda su estado en un volumen gestionado por Docker, no en una carpeta bind-mounted del repo. Con eso evitamos errores de permisos frecuentes en WSL al escribir `/home/node/.n8n`.

Esta v1 usa `{{$env.INTERNAL_SHARED_SECRET}}` dentro de nodos `HTTP Request` de n8n. Por eso el `docker-compose.yml` fija `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`; si ese valor falta, los workflows fallan con `access to env vars denied`.

### 3. Cargar un modelo en Ollama

```bash
docker exec -it $(docker ps -qf "ancestor=ollama/ollama:latest") ollama pull qwen2.5:7b-instruct
```

Si tu maquina tiene poca RAM libre o estas en WSL con memoria ajustada, reduce `OLLAMA_NUM_CTX` a `4096` y considera usar un modelo mas pequeno. El error tipico en ese caso es `ollama_request_failed` porque el runner termina al cargar el modelo.

### 4. Aplicar migraciones

```bash
pnpm migrate
```

### 5. Levantar la API

```bash
pnpm dev
```

La API queda en `http://localhost:3001`.

### 5.b Levantar el frontend

Modo recomendado fuera de Docker:

```bash
pnpm dev:web
```

La UI queda en `http://localhost:3000`.

Usa el proxy de Vite para hablar con:

- `http://localhost:5678/webhook/*`
- `http://localhost:3001/api/*`

Si prefieres levantar toda la superficie de demo en Docker, añade `web` al `docker compose up`.

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

### UI operativa

- `http://localhost:3000`
- Crear nueva propuesta
- Pegar `document_text`
- Subir PDF en base64
- Reanudar por `session_id`
- Inspeccionar `brief`, `gaps`, `warnings`, timeline y trazabilidad

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
