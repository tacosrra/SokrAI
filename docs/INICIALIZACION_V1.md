# Inicializacion y Prueba de SokrAI v1

Esta guia explica, paso a paso y sin asumir conocimiento previo del repo, como levantar y probar la v1 que ya esta implementada.

El objetivo de esta guia es que puedas:

1. preparar el entorno,
2. levantar `PostgreSQL + Ollama + API + n8n`,
3. aplicar migraciones,
4. importar los workflows,
5. lanzar una propuesta inicial,
6. responder turnos posteriores,
7. inspeccionar lo que se persistio,
8. ejecutar la bateria de validacion automatizada.

## 1. Que levanta esta v1

La v1 implementa dos carriles operativos Alpha y los primeros modulos Clinic Pilot:

- `problem_definition_agent`
- `solution_definition_agent`
- `data_ai_privacy_gap_agent` con perfil fijo `hospital_clinic_v1`
- `medical_device_triage_agent` condicional y no definitivo con perfil fijo `hospital_clinic_v1`

Y un flujo end-to-end con estos componentes:

- `PostgreSQL`
  - persistencia de sesiones, documentos, fuentes internas, turnos, snapshots, runs y eventos
- `Ollama`
  - inferencia local del modelo
- `API Fastify`
  - contratos, validacion, logica de negocio, persistencia y llamadas a Ollama
- `n8n`
  - orquestacion y exposicion de webhooks
- `Frontend React + Vite`
  - interfaz de demo local para crear, responder y retomar sesiones sin curl

La entrada puede incluir texto de propuesta, texto de apoyo pegado y un PDF con texto extraible. Cada entrada se persiste como `proposal_documents` y `proposal_sources` para auditoria posterior. Esta v1 no hace OCR ni procesa PDFs escaneados.

No uses datos reales de pacientes en MVP Alpha. Si `ALLOW_SENSITIVE_HEALTH_DATA=false`, la API y la UI muestran el aviso de usar datos ficticios o anonimizados.

## 2. Requisitos previos

Necesitas instalado localmente:

- `Docker`
- `Docker Compose` via `docker compose`
- `Node.js 24+` para desarrollo en host
- `pnpm` para desarrollo en host

## 2.b Ruta rapida para beta testers

Si quieres evitar casi todo el setup manual y mantener el flujo de desarrollo intacto, usa la ruta beta:

```bash
./scripts/bootstrap-beta.sh
```

En Windows nativo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-beta.ps1
```

Este bootstrap:

- crea `.env.beta` si no existe
- genera secretos locales si siguen en placeholder
- arranca `Docker Desktop` si ya esta instalado pero no esta corriendo
- levanta el stack beta con contenedores fijos `postgres`, `ollama`, `api`, `n8n` y `web`
- usa volumenes Docker nombrados para evitar problemas de permisos en `postgres` y `ollama`
- espera a que `postgres`, `ollama`, `api`, `n8n` y `web` esten listos
- hace `ollama pull` del modelo configurado con reintentos; si ya esta cacheado, lo reutiliza
- ejecuta migraciones
- importa y publica los workflows versionados de `n8n`
- abre la UI principal en el navegador al terminar

Despues del primer setup:

```bash
./scripts/start-beta.sh
./scripts/stop-beta.sh
```

En Windows nativo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-beta.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\stop-beta.ps1
```

Notas de esta ruta:

- usa `.env.beta`, no `.env`
- no modifica el flujo manual/documentado de desarrollo
- esta pensada para macOS, Linux y WSL con `bash`
- en Windows nativo usa `PowerShell`
- no requiere `Node.js` ni `pnpm` en host

Si el pull del modelo falla por DNS o conectividad:

- reintenta `./scripts/bootstrap-beta.sh`;
- si el modelo ya existe en el volumen de `ollama`, usa `SOKRAI_BETA_SKIP_OLLAMA_PULL=1 ./scripts/bootstrap-beta.sh`;
- si tu red necesita otro resolver, cambia `BETA_OLLAMA_DNS_PRIMARY` y `BETA_OLLAMA_DNS_SECONDARY` en `.env.beta`.

Si necesitas el flujo manual o quieres inspeccionar cada paso, continua con la guia normal de abajo.

Comprobaciones rapidas:

```bash
node -v
pnpm -v
docker --version
docker compose version
```

## 3. Estructura relevante del repo

Estos son los paths importantes para arrancar y probar la v1:

- `docker-compose.yml`
- `.env.example`
- `apps/web/`
- `db/migrations/001_initial.sql`
- `db/migrations/002_alpha_data_model.sql`
- `db/migrations/003_documents_sources.sql`
- `db/migrations/004_alpha_gap_analysis.sql`
- `infra/n8n/workflows/proposal_start_v1.json`
- `infra/n8n/workflows/proposal_reply_v1.json`
- `infra/n8n/workflows/agent_problem_definition_v1.json`
- `infra/n8n/workflows/solution_start_v1.json`
- `infra/n8n/workflows/solution_reply_v1.json`
- `infra/n8n/workflows/agent_solution_definition_v1.json`
- `infra/n8n/workflows/data_ai_privacy_start_v1.json`
- `infra/n8n/workflows/data_ai_privacy_reply_v1.json`
- `infra/n8n/workflows/agent_data_ai_privacy_gap_v1.json`
- `infra/n8n/workflows/medical_device_triage_start_v1.json`
- `infra/n8n/workflows/medical_device_triage_reply_v1.json`
- `infra/n8n/workflows/agent_medical_device_triage_v1.json`
- `contracts/schemas/`
- `prompts/v1/`
- `examples/proposal-start.payload.json`
- `examples/proposal-reply.payload.json`

## 4. Modo recomendado de arranque

El modo recomendado para que todo funcione sin tocar los workflows exportados es:

- `postgres` en Docker
- `ollama` en Docker
- `api` en Docker
- `n8n` en Docker
- `web` en Docker o `pnpm dev:web` en host

Motivo:

- los workflows n8n ya estan exportados apuntando a `http://api:3001/...`
- eso presupone que `n8n` y `api` viven en la misma red de Docker Compose
- `ollama` no necesita exponerse al host; la API lo consume por red interna y asi evitamos conflictos tipicos con el puerto `11434`
- `n8n` persiste su estado en un volumen Docker gestionado por Compose para evitar errores de permisos sobre `/home/node/.n8n` en WSL
- `n8n` necesita `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` en esta v1 porque los workflows usan `{{$env.INTERNAL_SHARED_SECRET}}` en nodos `HTTP Request`
- el frontend usa proxy de Vite hacia `n8n` y la API para evitar problemas de CORS durante la demo local

Si quisieras correr la API fuera de Docker, tendrias que editar manualmente las URLs HTTP internas en n8n. Para probar la v1 rapidamente, no lo recomiendo.

## 5. Preparar variables de entorno

### 5.1 Crear `.env`

```bash
cp .env.example .env
```

### 5.2 Editar `.env`

Abre `.env` y cambia como minimo estos valores:

- `INTERNAL_SHARED_SECRET`
- `N8N_ENCRYPTION_KEY`
- opcionalmente `N8N_BASIC_AUTH_USER`
- opcionalmente `N8N_BASIC_AUTH_PASSWORD`
- `AI_PROVIDER=ollama` debe mantenerse como unico proveedor soportado en esta v1
- opcionalmente `AI_MODEL` como alias del modelo usado por la orquestacion; si no se define, se usa `OLLAMA_MODEL`
- opcionalmente `OLLAMA_MODEL` si no quieres usar `qwen2.5:3b-instruct`
- opcionalmente `BETA_OLLAMA_DNS_PRIMARY` y `BETA_OLLAMA_DNS_SECONDARY` si tu Docker necesita DNS explicito para descargar modelos

Ejemplo razonable:

```dotenv
APP_ENV=local
LOG_LEVEL=info
APP_PORT=3001
APP_BASE_URL=http://localhost:3001

# Host-side commands use the Compose-published Postgres port.
DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app
DATABASE_POOL_MAX=10
DATABASE_STATEMENT_TIMEOUT_MS=5000

AI_PROVIDER=ollama
# Optional model alias for orchestration. If unset, OLLAMA_MODEL is used.
# AI_MODEL=qwen2.5:3b-instruct
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
OLLAMA_TIMEOUT_MS=420000
OLLAMA_KEEP_ALIVE=30m
OLLAMA_NUM_CTX=4096
BRIEF_EXTRACTION_MAX_CHARS=10000
BETA_OLLAMA_DNS_PRIMARY=1.1.1.1
BETA_OLLAMA_DNS_SECONDARY=8.8.8.8

INTERNAL_SHARED_SECRET=change-this-to-a-long-random-secret
JSON_REPAIR_MAX_ATTEMPTS=1
MAX_PROPOSAL_CHARS=30000
MAX_REPLY_CHARS=4000
MAX_TURNS_PER_SESSION=12
MAX_DIAGNOSIS_ITEMS=3
ALLOW_SENSITIVE_HEALTH_DATA=false

N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=admin
N8N_ENCRYPTION_KEY=change-this-to-another-long-random-secret

VITE_START_SESSION_TIMEOUT_MS=960000
VITE_REPLY_SESSION_TIMEOUT_MS=540000
VITE_SESSION_AUDIT_TIMEOUT_MS=10000
VITE_REQUEST_STATUS_TIMEOUT_MS=10000
VITE_REQUEST_RECOVERY_TIMEOUT_MS=960000
VITE_ACTIVE_RECOVERY_AFTER_MS=60000
```

### 5.3 URLs de Postgres: host vs Docker

Hay dos formas validas de apuntar a Postgres:

- desde el host, `pnpm migrate`, `pnpm test:integration` y `pnpm verify` usan `localhost:5433`;
- dentro de Docker Compose, los servicios se conectan por red interna a `postgres:5432`.

`docker-compose.yml` sobreescribe `DATABASE_URL` para el contenedor `api` con `postgres:5432`, asi que no cambies el `.env` host-side a `postgres:5432` salvo que tambien ejecutes el comando dentro de un contenedor.

### 5.4 Que valores dejar tal cual

Si vas a usar el modo recomendado con todo en Docker, puedes dejar tal cual:

- `OLLAMA_BASE_URL`

Porque los servicios se comunican entre si por nombre de servicio de Compose:

- `postgres`
- `ollama`
- `api`
- `n8n`

## 6. Instalar dependencias del repo

Aunque la API vaya a correr en Docker, instala dependencias locales igualmente porque:

- podras ejecutar `pnpm verify`
- podras correr tests
- tendras el workspace listo para cambios posteriores

```bash
pnpm install --store-dir ./.pnpm-store
```

## 7. Levantar el stack

### 7.0 Comprobacion previa en WSL

Si estas en WSL y `docker compose up ...` falla con:

- `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`

o con:

- `Is the docker daemon running?`

antes de seguir, comprueba el contexto actual:

```bash
docker context ls
```

Caso recomendado en este repo para WSL:

- usa Docker Desktop en Windows
- habilita `WSL Integration` para tu distro
- desde WSL trabaja con el contexto `default`

Haz esto en orden:

1. arranca Docker Desktop en Windows
2. espera a que el engine quede en estado `running`
3. valida o cambia al contexto adecuado:

```bash
docker context use default
docker ps
docker compose ps
```

4. si `docker ps` sigue sin conectar:

- abre `Settings > Resources > WSL Integration`
- activa tu distro
- aplica cambios
- en Windows ejecuta `wsl --shutdown`
- vuelve a abrir la terminal WSL
- repite:

```bash
docker context use default
docker ps
```

Si `desktop-linux` en tu entorno devuelve `Failed to initialize: protocol not available`, no lo uses para esta v1.

Si no usas Docker Desktop y quieres un daemon Linux dentro de la distro, entonces el enfoque es otro:

```bash
sudo service docker start
docker context use default
docker ps
```

### 7.1 Arranque base

```bash
docker compose up -d postgres ollama api n8n web
```

### 7.2 Comprobar que los contenedores estan arriba

```bash
docker compose ps
```

Deberias ver al menos:

- `postgres`
- `ollama`
- `api`
- `n8n`
- `web`

### 7.3 Si es la primera vez, esperar a Postgres

La inicializacion crea dos bases de datos:

- `sokrai_app`
- `sokrai_n8n`

Y dos usuarios:

- `sokrai_app`
- `sokrai_n8n`

Puedes validar que Postgres esta listo asi:

```bash
docker compose exec postgres pg_isready -U postgres
```

## 8. Descargar el modelo en Ollama

La API no descargara el modelo por ti. Debes hacerlo manualmente.

### 8.1 Ver el nombre del contenedor de Ollama

```bash
docker compose ps ollama
```

### 8.2 Descargar el modelo configurado

```bash
docker compose exec ollama ollama pull qwen2.5:3b-instruct
```

Si en `.env` pusiste otro modelo, sustituye ese nombre.

### 8.3 Verificar que el modelo existe

```bash
docker compose exec ollama ollama list
```

## 9. Aplicar migraciones

```bash
pnpm migrate
```

## Frontend y superficies

### API

- `http://localhost:3001/healthz`
- `http://localhost:3001/api/v1/sessions/:sessionId`

### n8n

- `http://localhost:5678`

### Frontend

- `http://localhost:3000`

Desde la UI puedes:

1. crear una nueva propuesta con `project_title`, `goal`, `proposal_text`, `document_text` o PDF,
2. ver el `structured_brief` generado,
3. inspeccionar gaps, warnings y trazabilidad,
4. responder la pregunta socratica actual,
5. iniciar y responder el modulo de datos/IA/privacidad tras cerrar solucion,
6. retomar sesiones anteriores con `session_id` o desde `localStorage`.

### Frontend fuera de Docker

Si prefieres correr la UI desde el host en lugar del contenedor `web`:

```bash
pnpm dev:web
```

Con la configuracion por defecto del repo, Vite proxya:

- `/api/*` -> `http://localhost:3001`
- `/webhook/*` -> `http://localhost:5678`

### Flujo recomendado de demo

1. abre `http://localhost:3000`
2. lanza una propuesta nueva
3. espera el `session_id`, el brief y la primera pregunta
4. responde desde el panel de sesion activa
5. recarga o pega el `session_id` en el carril de continuacion para demostrar persistencia

Las migraciones de la v1 estan en:

- `db/migrations/001_initial.sql`
- `db/migrations/002_alpha_data_model.sql`
- `db/migrations/003_documents_sources.sql`
- `db/migrations/004_alpha_gap_analysis.sql`

### 9.1 Ejecutarlas desde el contenedor `api`

```bash
docker compose exec api pnpm migrate
```

Si prefieres lanzar un contenedor efimero:

```bash
docker compose run --rm api pnpm migrate
```

### 9.2 Que deberia crear

Tablas legacy de sesion y replay:

- `proposal_sessions`
- `conversation_turns`
- `agent_runs`
- `session_snapshots`
- `session_events`

Tablas Alpha de propuesta, fuentes, conversacion de problema, reportes y auditoria:

- `proposals`
- `proposal_documents`
- `proposal_sources`
- `alpha_gaps`
- `module_chats`
- `chat_turns`
- `generated_sections`
- `basic_reports`
- `audit_events`

### 9.3 Verificacion opcional en Postgres

```bash
docker compose exec postgres psql -U postgres -d sokrai_app -c "\dt"
```

## 10. Verificar salud de la API

La API publica un healthcheck simple:

```bash
curl -i http://localhost:3001/healthz
```

Respuesta esperada:

```json
{"status":"ok"}
```

## 11. Importar workflows en n8n

### 11.1 Abrir n8n

Abre:

- `http://localhost:5678`

Usa las credenciales:

- usuario: valor de `N8N_BASIC_AUTH_USER`
- password: valor de `N8N_BASIC_AUTH_PASSWORD`

### 11.2 Importar los doce workflows

Importa estos archivos:

- `infra/n8n/workflows/proposal_start_v1.json`
- `infra/n8n/workflows/proposal_reply_v1.json`
- `infra/n8n/workflows/agent_problem_definition_v1.json`
- `infra/n8n/workflows/solution_start_v1.json`
- `infra/n8n/workflows/solution_reply_v1.json`
- `infra/n8n/workflows/agent_solution_definition_v1.json`
- `infra/n8n/workflows/data_ai_privacy_start_v1.json`
- `infra/n8n/workflows/data_ai_privacy_reply_v1.json`
- `infra/n8n/workflows/agent_data_ai_privacy_gap_v1.json`
- `infra/n8n/workflows/medical_device_triage_start_v1.json`
- `infra/n8n/workflows/medical_device_triage_reply_v1.json`
- `infra/n8n/workflows/agent_medical_device_triage_v1.json`

### 11.3 Que hace cada workflow

- `proposal_start_v1`
  - recibe la propuesta inicial
  - llama a la API para crear contexto y brief
  - llama directamente a la API interna del agente para evitar auto-llamadas bloqueantes en n8n
  - devuelve `session_id + next_question`

- `proposal_reply_v1`
  - recibe `session_id + answer`
  - persiste el turno de usuario
  - vuelve a invocar la API interna del agente
  - devuelve el nuevo estado del carril

- `agent_problem_definition_v1`
  - ejecuta un turno del agente
  - valida y persiste el resultado

- `solution_start_v1`
  - recibe `session_id` cuando el problema ya esta cerrado
  - llama a la API interna del agente de solucion
  - devuelve la primera pregunta del carril de solucion o el cierre si ya queda definido

- `solution_reply_v1`
  - recibe `session_id + answer`
  - persiste la respuesta del usuario en el chat Alpha de solucion
  - invoca la API interna del agente de solucion
  - devuelve el nuevo estado del carril

- `agent_solution_definition_v1`
  - ejecuta un turno del agente de solucion
  - valida y persiste el resultado
  - al completar, genera la seccion `solution` de forma deterministica

- `data_ai_privacy_start_v1`
  - recibe `session_id` cuando ya existen las secciones `problem` y `solution`
  - usa el perfil regulatorio `hospital_clinic_v1`
  - llama a la API interna del modulo de datos/IA/privacidad
  - devuelve la primera pregunta del modulo o el cierre si ya queda suficientemente aclarado

- `data_ai_privacy_reply_v1`
  - recibe `session_id + answer`
  - persiste la respuesta de usuario en el chat Alpha `data_ai_privacy`
  - invoca la API interna del agente de gaps de datos/IA/privacidad
  - devuelve el nuevo estado del modulo

- `agent_data_ai_privacy_gap_v1`
  - ejecuta un turno del agente de gaps de datos/IA/privacidad
  - valida y persiste el resultado
  - aplica las reglas de no dictamen antes de persistir salida sensible
  - al completar, genera la seccion `data_ai_privacy` de forma deterministica

- `medical_device_triage_start_v1`
  - recibe `session_id` cuando ya existen las secciones `problem`, `solution` y `data_ai_privacy`
  - usa el perfil regulatorio `hospital_clinic_v1`
  - llama a la API interna del modulo medical-device triage
  - devuelve `applicable`, `uncertain` o `not_applicable` sin clasificacion definitiva

- `medical_device_triage_reply_v1`
  - recibe `session_id + answer`
  - persiste la respuesta de usuario en el chat Alpha `medical_device_triage`
  - invoca la API interna del agente medical-device triage
  - devuelve el nuevo estado del modulo

- `agent_medical_device_triage_v1`
  - ejecuta un turno del agente medical-device triage
  - valida y persiste el resultado
  - aplica guardrails de no dictamen ni clasificacion MDR antes de persistir salida sensible
  - al completar, genera la seccion `medical_device_triage` de forma deterministica

### 11.4 Publicar workflows

Despues de importarlos, publicalos en n8n.

Si no estan publicados, el webhook no respondera como esperas.

## 12. Comprobar rutas reales expuestas

### Webhooks publicos de n8n

- `POST http://localhost:5678/webhook/proposal-start-v1`
- `POST http://localhost:5678/webhook/proposal-reply-v1`
- `POST http://localhost:5678/webhook/solution-start-v1`
- `POST http://localhost:5678/webhook/solution-reply-v1`
- `POST http://localhost:5678/webhook/data-ai-privacy-start-v1`
- `POST http://localhost:5678/webhook/data-ai-privacy-reply-v1`

### API de inspeccion

- `GET http://localhost:3001/api/v1/sessions/:sessionId`
- `GET http://localhost:3001/api/v1/sessions/:sessionId/report`

### API interna

Estas rutas existen, pero normalmente las usa n8n:

- `POST /internal/sessions/start-context`
- `POST /internal/sessions/append-reply`
- `POST /internal/agents/problem-definition/run`
- `POST /internal/sessions/solution-start`
- `POST /internal/sessions/solution-reply`
- `POST /internal/agents/solution-definition/run`
- `POST /internal/sessions/data-ai-privacy-start`
- `POST /internal/sessions/data-ai-privacy-reply`
- `POST /internal/reports/basic-alpha/compose`
- `GET /api/v1/requests/:requestId`
- `POST /api/v1/requests/:requestId/recover`

### Webhooks internos reutilizables de n8n

- `POST http://localhost:5678/webhook/agent-problem-definition-v1`
- `POST http://localhost:5678/webhook/agent-solution-definition-v1`
- `POST http://localhost:5678/webhook/agent-data-ai-privacy-gap-v1`

Todas las rutas internas exigen:

- header `x-internal-shared-secret`

## 13. Probar el flujo completo de v1

### 13.1 Propuesta inicial

Puedes usar el payload de ejemplo ya preparado:

- `examples/proposal-start.payload.json`

Llamada:

```bash
curl -sS \
  -X POST \
  http://localhost:5678/webhook/proposal-start-v1 \
  -H 'Content-Type: application/json' \
  --data @examples/proposal-start.payload.json
```

Respuesta esperada, con valores variables:

```json
{
  "session_id": "uuid",
  "stage": "problem_definition",
  "structured_brief": {
    "...": "..."
  },
  "detected_gaps": [
    "..."
  ],
  "next_question": "¿...?",
  "agent_status": "continue",
  "warnings": []
}
```

Guarda el `session_id`.

### 13.2 Responder el siguiente turno

Edita:

- `examples/proposal-reply.payload.json`

Y sustituye:

- `replace-with-session-id`

por el `session_id` real que devolvio el paso anterior.

Llamada:

```bash
curl -sS \
  -X POST \
  http://localhost:5678/webhook/proposal-reply-v1 \
  -H 'Content-Type: application/json' \
  --data @examples/proposal-reply.payload.json
```

Respuesta esperada:

```json
{
  "session_id": "uuid",
  "stage": "problem_definition",
  "agent_status": "continue|done|blocked",
  "updated_problem_definition": {
    "...": "..."
  },
  "diagnosis": [
    "..."
  ],
  "next_question": "¿...?",
  "completion_reason": "",
  "warnings": []
}
```

### 13.3 Repetir hasta `done`

Repite llamadas al webhook de reply con:

- el mismo `session_id`
- una nueva `answer`

Cuando el problema este suficientemente definido, el sistema devolvera:

- `agent_status = "done"`
- `next_question = ""`

### 13.4 Iniciar el carril de solucion

Cuando `proposal_reply_v1` devuelva `agent_status = "done"` para el problema,
llama a `solution-start-v1` con el mismo `session_id`.

```bash
curl -sS \
  -X POST \
  http://localhost:5678/webhook/solution-start-v1 \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"replace-with-session-id"}'
```

Respuesta esperada:

```json
{
  "session_id": "uuid",
  "stage": "solution_definition",
  "agent_status": "continue|done|blocked",
  "updated_solution_definition": {
    "...": "..."
  },
  "diagnosis": [
    "..."
  ],
  "next_question": "¿...?",
  "completion_reason": "",
  "warnings": []
}
```

### 13.5 Responder turnos de solucion

Llama a `solution-reply-v1` con:

```bash
curl -sS \
  -X POST \
  http://localhost:5678/webhook/solution-reply-v1 \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"replace-with-session-id","answer":"La solucion prepara un resumen estructurado para el triaje y cambia el flujo de admision antes de derivar al profesional responsable."}'
```

Repite hasta `agent_status = "done"`. Al completar, `GET /api/v1/sessions/:sessionId`
debe incluir una fila en `generated_sections` con `section_kind = "solution"`.

### 13.6 Iniciar el modulo datos/IA/privacidad PR9

Cuando existan las secciones `problem` y `solution`, inicia el modulo Clinic
Pilot de datos/IA/privacidad con el perfil fijo `hospital_clinic_v1`:

```bash
curl -sS \
  -X POST \
  http://localhost:5678/webhook/data-ai-privacy-start-v1 \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"replace-with-session-id","profile_id":"hospital_clinic_v1"}'
```

Respuesta esperada:

```json
{
  "session_id": "uuid",
  "stage": "data_ai_privacy",
  "profile_id": "hospital_clinic_v1",
  "agent_status": "continue|done|blocked",
  "updated_data_ai_privacy": {
    "...": "..."
  },
  "diagnosis": [
    "..."
  ],
  "next_question": "¿...?",
  "completion_reason": "",
  "warnings": [
    "requires competent human review"
  ]
}
```

### 13.7 Responder turnos de datos/IA/privacidad

Llama a `data-ai-privacy-reply-v1` con:

```bash
curl -sS \
  -X POST \
  http://localhost:5678/webhook/data-ai-privacy-reply-v1 \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"replace-with-session-id","answer":"Los datos vienen de admision y notas de triaje; privacidad, ciberseguridad y regulatorio revisan antes del piloto."}'
```

Repite hasta `agent_status = "done"`. Al completar, `GET
/api/v1/sessions/:sessionId` debe incluir:

- una fila en `generated_sections` con `section_kind = "data_ai_privacy"`
- `profile_id = "hospital_clinic_v1"` en las respuestas del modulo
- warnings con `requires competent human review`
- ningun dictamen, aprobacion/rechazo, cumplimiento definitivo ni
  clasificacion definitiva de producto sanitario en la seccion generada

### 13.8 Componer y leer el reporte basico Alpha

Cuando existan las secciones `problem` y `solution`, compón el reporte con la
API interna:

```bash
curl -sS \
  -X POST \
  http://localhost:3001/internal/reports/basic-alpha/compose \
  -H 'Content-Type: application/json' \
  -H "x-internal-shared-secret: $INTERNAL_SHARED_SECRET" \
  --data '{"session_id":"replace-with-session-id","workflow_version":"basic_alpha_report_v1"}'
```

Después, léelo desde la API pública de inspección:

```bash
curl -sS http://localhost:3001/api/v1/sessions/replace-with-session-id/report
```

La respuesta es un `BasicAlphaReport` con brief, gaps actuales, secciones
generadas, fuentes internas, referencias de auditoria, `schema_version` y
advertencias de no dictamen, no aprobacion/rechazo y no decision
legal/clinica/regulatoria. No incluye PDF, scoring, decision de comité,
`raw_model_output`, prompts ni parametros crudos del modelo.

## 14. Probar con PDF

La v1 soporta PDF a traves del campo `file`.

Formato esperado:

```json
{
  "project_title": "Titulo",
  "goal": "Objetivo",
  "file": {
    "file_name": "propuesta.pdf",
    "mime_type": "application/pdf",
    "content_base64": "JVBERi0xLjcK..."
  }
}
```

### 14.1 Generar base64 del PDF

Linux/WSL:

```bash
base64 -w 0 propuesta.pdf > propuesta.base64.txt
```

### 14.2 Construir payload

Inserta el contenido del fichero base64 en `content_base64`.

### 14.3 Limitacion importante

La v1 solo soporta PDFs con texto extraible.

No hace OCR.

Si el PDF es una imagen escaneada, lo normal es que falle o extraiga poco texto.

## 15. Inspeccionar lo que se ha persistido

Una vez tengas un `session_id`, puedes ver todo el estado persistido.

### 15.1 Via endpoint de inspeccion

```bash
curl -sS http://localhost:3001/api/v1/sessions/<SESSION_ID>
```

Este endpoint devuelve:

- `session`
- `turns`
- `runs`
- `snapshots`
- `events`

Es la forma mas rapida de auditar la trazabilidad de una sesion.

### 15.2 Via SQL directo

#### Sesiones

```bash
docker compose exec postgres \
  psql -U postgres -d sokrai_app \
  -c "select id, status, current_turn_seq, state_version, updated_at from proposal_sessions order by created_at desc;"
```

#### Turnos

```bash
docker compose exec postgres \
  psql -U postgres -d sokrai_app \
  -c "select session_id, turn_seq, status, question_text, answer_text from conversation_turns order by created_at;"
```

#### Runs del agente

```bash
docker compose exec postgres \
  psql -U postgres -d sokrai_app \
  -c "select session_id, run_purpose, status, prompt_version, model_provider, model_name, repair_attempted from agent_runs order by started_at;"
```

#### Snapshots

```bash
docker compose exec postgres \
  psql -U postgres -d sokrai_app \
  -c "select session_id, snapshot_seq, state_version, agent_status, created_at from session_snapshots order by created_at;"
```

## 16. Ejecutar la bateria automatizada

La suite automatizada cubre:

- contratos
- dominio
- integracion con Postgres real
- smoke

### 16.1 Requisito previo

Debe estar corriendo al menos Postgres en `127.0.0.1:5433`.

La forma mas sencilla es:

```bash
docker compose up -d postgres
```

### 16.2 Ejecutar verificaciones individuales

```bash
pnpm install --store-dir ./.pnpm-store
pnpm build
pnpm test:contracts
pnpm test:unit
pnpm test:integration
pnpm test:smoke
pnpm test:web
```

La configuracion de test usa `postgresql://sokrai_app:localpass@localhost:5433/sokrai_app` por defecto para alinearse con Docker Compose. Si usas otro Postgres, sobreescribe `TEST_DATABASE_URL`.

### 16.3 Ejecutar todo de una vez

```bash
pnpm verify
```

### 16.4 Smoke contra stack vivo

Con `postgres`, `ollama`, `api` y `n8n` arriba, y los workflows importados/publicados:

```bash
bash scripts/smoke-core.sh
```

En Windows nativo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-core.ps1
```

## 17. Orden exacto recomendado para una primera prueba limpia

Si quieres un recorrido sin desviarte, sigue exactamente esto:

```bash
cp .env.example .env
pnpm install --store-dir ./.pnpm-store
docker compose up -d postgres ollama api n8n
docker compose exec ollama ollama pull qwen2.5:3b-instruct
docker compose exec api pnpm migrate
curl -i http://localhost:3001/healthz
```

Luego:

1. abre `http://localhost:5678`
2. importa y publica los 12 workflows
3. abre `http://localhost:3000`
4. crea una propuesta nueva desde la UI
5. guarda `session_id`
6. responde el siguiente turno desde la UI o por webhook
7. cuando el problema quede completo, inicia y responde el carril de solucion
8. cuando la solucion quede completa, inicia y responde el modulo datos/IA/privacidad
9. consulta `GET /api/v1/sessions/:sessionId`
10. ejecuta `bash scripts/smoke-core.sh`

## 18. Prueba minima esperada de negocio

Una prueba manual minima satisfactoria de la v1 es:

1. envias una propuesta inicial relativamente vaga
2. el sistema devuelve:
   - `session_id`
   - `structured_brief`
   - `detected_gaps`
   - una sola pregunta principal
   - En la respuesta inicial, `detected_gaps` es el resumen de compatibilidad.
     Para auditar `origin`, `absence`, `source_refs` y `question_hint`, consulta
     `GET /api/v1/sessions/:sessionId` y revisa el array `gaps`.
3. respondes con mas detalle
4. el sistema actualiza:
   - `updated_problem_definition`
   - `diagnosis`
   - `next_question`
5. tras uno o varios turnos, el carril llega a:
   - `agent_status = "done"`
   - `next_question = ""`
6. inicias y completas `solution_definition_agent`
7. inicias `data_ai_privacy_gap_agent` con `hospital_clinic_v1`
8. inicias `medical_device_triage_agent` cuando exista la seccion de datos/IA/privacidad
9. confirmas que las secciones `data_ai_privacy` y `medical_device_triage` conservan warnings de revision
   humana competente y no contienen dictamen, aprobacion/rechazo, cumplimiento
   definitivo ni clasificacion definitiva de producto sanitario

## 19. Pruebas de depuracion utiles

### 19.1 Probar solo la API interna de arranque

Esto sirve para aislar si el problema es n8n o la API.

```bash
curl -sS \
  -X POST \
  http://localhost:3001/internal/sessions/start-context \
  -H 'Content-Type: application/json' \
  -H "x-internal-shared-secret: $(grep '^INTERNAL_SHARED_SECRET=' .env | cut -d '=' -f2-)" \
  -d '{
    "request_id": "debug-start-1",
    "workflow_version": "proposal_start_v1",
    "payload": {
      "project_title": "Debug",
      "goal": "Comprobar el arranque",
      "proposal_text": "El personal de urgencias sufre retrasos en el triaje inicial."
    }
  }'
```

### 19.2 Probar solo el run del agente

Primero necesitas un `session_id` ya creado.

```bash
curl -sS \
  -X POST \
  http://localhost:3001/internal/agents/problem-definition/run \
  -H 'Content-Type: application/json' \
  -H "x-internal-shared-secret: $(grep '^INTERNAL_SHARED_SECRET=' .env | cut -d '=' -f2-)" \
  -d '{
    "request_id": "debug-agent-1",
    "workflow_version": "agent_problem_definition_v1",
    "session_id": "REEMPLAZAR",
    "trigger": "start"
  }'
```

### 19.3 Ver logs

#### API

```bash
docker compose logs -f api
```

#### n8n

```bash
docker compose logs -f n8n
```

#### Ollama

```bash
docker compose logs -f ollama
```

#### Postgres

```bash
docker compose logs -f postgres
```

## 20. Problemas frecuentes y como resolverlos

### 20.0 `Cannot connect to the Docker daemon`

Si ves algo como:

- `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`
- `Is the docker daemon running?`

haz estas comprobaciones en este orden:

#### A. Ver el contexto actual

```bash
docker context ls
```

Si el activo es `default` en WSL, probablemente estas apuntando a un socket Linux que no tiene daemon detras.

#### B. Si usas Docker Desktop

1. abre Docker Desktop en Windows
2. espera a que termine de arrancar
3. vuelve a WSL
4. usa el contexto `default`:

```bash
docker context use default
```

5. valida:

```bash
docker ps
docker compose ps
```

6. vuelve a intentar:

```bash
docker compose up -d postgres ollama api n8n
```

#### C. Si usas daemon Linux dentro de WSL

```bash
sudo service docker start
docker context use default
docker ps
```

#### D. Si sigue fallando

Revisa:

- que Docker Desktop tenga WSL integration habilitada para tu distro
- que el daemon este realmente `running`
- que `docker ps` funcione en `default`
- que no estes forzando `desktop-linux` si en tu WSL responde `protocol not available`

### 20.0.1 `ports are not available` al arrancar Compose

Si ves algo como:

- `ports are not available`
- `exposing port TCP 127.0.0.1:11434`
- `exposing port TCP 127.0.0.1:5433`

el problema es un conflicto de puertos en tu maquina, no del flujo de negocio.

En esta v1 actual:

- `Ollama` ya no se expone al host por defecto
- `api` usa `3001`
- `n8n` usa `5678`
- `postgres` usa `5433` en el host y `5432` dentro de la red Docker

Si el conflicto es de `11434`, actualiza el repo y vuelve a lanzar:

```bash
docker compose up -d postgres ollama api n8n
```

Si el conflicto es de `5433`, hay otro Postgres o contenedor usando ese puerto host. Compruebalo con:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'
```

Y luego:

- o paras el otro contenedor
- o cambias temporalmente el mapping de `postgres` en `docker-compose.yml`

### 20.1 `healthz` responde, pero el webhook falla

Revisa:

- que los workflows estan importados
- que estan publicados
- que n8n esta llamando a `http://api:3001`
- que `INTERNAL_SHARED_SECRET` coincide entre `.env`, `api` y `n8n`

Si en la ejecucion de n8n ves un error como:

- `access to env vars denied`

entonces falta permitir acceso a variables de entorno en expresiones de nodos.

En esta v1 debe existir en `docker-compose.yml`:

```yaml
N8N_BLOCK_ENV_ACCESS_IN_NODE: "false"
```

Despues reinicia `n8n`:

```bash
docker compose up -d --force-recreate n8n
```

### 20.1.1 `n8n` falla con `EACCES: permission denied, open '/home/node/.n8n/config'`

Ese error aparece cuando `n8n` intenta escribir en una carpeta bind-mounted del host sin permisos compatibles.

En esta v1 el `docker-compose.yml` ya usa un volumen Docker para `n8n`, que evita ese problema.

Si habias creado el contenedor con una version anterior del compose, recrealo asi:

```bash
docker compose rm -sf n8n
docker compose up -d n8n
```

Si ademas quieres limpiar la carpeta antigua que ya no se usa:

```bash
rm -rf n8n_data
```

### 20.1.2 `n8n` falla con `Mismatching encryption keys`

Ese error significa que el volumen persistido de `n8n` ya tiene una clave guardada en `/home/node/.n8n/config`, pero ahora el contenedor arranca con otro valor en `N8N_ENCRYPTION_KEY`.

Opciones:

1. si quieres conservar el estado actual de `n8n`, vuelve a poner en `.env` o `.env.beta` la clave antigua;
2. si es un entorno local de prueba y no necesitas conservar credenciales/workflows internos de `n8n`, elimina solo el volumen de `n8n` y deja que se regenere con la clave actual.

Ejemplo para el stack beta de este repo:

```bash
docker compose \
  --env-file .env.beta \
  -p sokrai-beta \
  -f docker-compose.yml \
  -f docker-compose.beta.yml \
  down

docker volume rm sokrai-beta_n8n_data

docker compose \
  --env-file .env.beta \
  -p sokrai-beta \
  -f docker-compose.yml \
  -f docker-compose.beta.yml \
  up -d n8n
```

Si usas el stack local por defecto en lugar del beta, el volumen suele llamarse `sokrai_n8n_data`.

Recomendacion:

- fija `N8N_ENCRYPTION_KEY` una vez;
- no la regeneres despues de que `n8n` haya arrancado por primera vez con ese volumen.

### 20.2 El webhook tarda mucho o falla en el primer turno

Normalmente significa:

- el modelo no se ha descargado aun
- Ollama esta frio
- el modelo elegido es demasiado pesado para tu maquina
- o antes habia un timeout desalineado entre UI, n8n y API

Comprueba:

```bash
docker compose exec ollama ollama list
docker compose logs -f ollama
```

Si la API devuelve un `502` con algo como:

- `ollama_request_failed`
- `ollama_invalid_response`
- `The local model did not return a successful response`

o un `504` con:

- `ollama_timeout`

y en los logs de `ollama` aparece algo como:

- `llama runner process has terminated`
- `Load failed`

entonces la integracion `n8n -> api` esta bien, pero el modelo local no consigue cargarse o responder.

La UI de esta version no elimina el timeout: lo deja alto y coherente para que el primer diagnostico pueda completarse, pero sigue fallando de forma controlada si el modelo se queda colgado.

Presupuestos por defecto:

- `OLLAMA_TIMEOUT_MS=420000` por llamada de modelo
- `VITE_START_SESSION_TIMEOUT_MS=960000` para el arranque completo
- `VITE_REPLY_SESSION_TIMEOUT_MS=540000` para respuestas de turno
- `VITE_REQUEST_STATUS_TIMEOUT_MS=10000` para la inspeccion de recuperacion
- `VITE_REQUEST_RECOVERY_TIMEOUT_MS=960000` para la ventana de recuperacion de la UI

Ademas, la API envia `keep_alive` a Ollama con `OLLAMA_KEEP_ALIVE=30m` para mantener el modelo cargado entre llamadas cercanas y reducir latencia de arranque.

La extraccion inicial del brief no envia necesariamente todo el texto persistido al modelo. Usa un excerpt acotado por `BRIEF_EXTRACTION_MAX_CHARS=10000`, con aviso trazable en la sesion, para mantener el primer turno viable en hardware local.

Ademas, los workflows exportados ya no reintentan automaticamente los nodos `HTTP Request`, para no ocultar fallos reales de la API detras de esperas adicionales.

La UI tambien envia un `request_id` por turno. Si la llamada principal vence en el navegador, intenta recuperar el resultado consultando `GET /api/v1/requests/:requestId` durante una ventana adicional. Si detecta que el workflow quedo a medias, puede forzar una recuperacion activa con `POST /api/v1/requests/:requestId/recover`.

La causa mas habitual en local es memoria insuficiente para el modelo actual o un `num_ctx` demasiado alto.

Prueba este ajuste minimo en tu `.env`:

```dotenv
OLLAMA_TIMEOUT_MS=420000
OLLAMA_KEEP_ALIVE=30m
OLLAMA_NUM_CTX=4096
BRIEF_EXTRACTION_MAX_CHARS=10000
```

Luego recrea la API:

```bash
docker compose up -d --force-recreate api
```

Si sigue fallando incluso con `qwen2.5:3b-instruct`, baja otro escalon en `.env`, por ejemplo a `qwen2.5:1.5b-instruct`, descarga ese modelo en `ollama` y vuelve a probar.

Si prefieres volver a `qwen2.5:7b-instruct`, revisa tambien la memoria disponible para Docker Desktop / WSL.

### 20.3 `proposal_start_v1` responde 500/502

Revisa en este orden:

1. `docker compose logs -f api`
2. `docker compose logs -f ollama`
3. que el modelo exista
4. que las migraciones esten aplicadas

### 20.4 El PDF no funciona

Comprueba:

- que `mime_type` sea exactamente `application/pdf`
- que `content_base64` sea valido
- que el PDF tenga texto extraible

### 20.5 `pnpm verify` falla por conexion a Postgres

Asegurate de que:

```bash
docker compose up -d postgres
```

Y que el puerto este expuesto en:

- `127.0.0.1:5433`

Y ejecuta la suite con:

```bash
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app pnpm verify
```

### 20.6 El frontend dice que no puede contactar con servicios locales al crear o responder una sesion

Si `http://localhost:3000` carga pero al enviar una propuesta o una respuesta aparece un error de red:

1. confirma que estan arriba `web`, `api`, `n8n`, `ollama` y `postgres`
2. revisa que hayas importado los workflows actuales del repo
3. si tenias workflows importados de una version anterior, reimporta:
   - `infra/n8n/workflows/proposal_start_v1.json`
   - `infra/n8n/workflows/proposal_reply_v1.json`
   - `infra/n8n/workflows/agent_problem_definition_v1.json`
   - `infra/n8n/workflows/solution_start_v1.json`
   - `infra/n8n/workflows/solution_reply_v1.json`
   - `infra/n8n/workflows/agent_solution_definition_v1.json`

Motivo:

- una version anterior hacia que `proposal_start_v1` y `proposal_reply_v1`
  llamaran a `http://n8n:5678/webhook/agent-problem-definition-v1`
- eso podia bloquear la ejecucion sincronica del webhook y el frontend lo percibia
  como fallo de red
- la version canonica actual llama directamente a
  `http://api:3001/internal/agents/problem-definition/run`
  con `x-internal-shared-secret`

### 20.7 WSL / Docker con problemas de credenciales

En algunos entornos WSL el cliente Docker intenta usar un credential helper que no existe.

Si ves errores parecidos a:

- `docker-credential-desktop.exe: executable file not found`

el problema es del entorno Docker local, no del repo.

La solucion suele pasar por:

- corregir la configuracion del cliente Docker
- revisar `~/.docker/config.json`
- o usar una configuracion temporal sin helper

## 21. Como parar y limpiar

### Parar servicios

```bash
docker compose down
```

### Parar y borrar volumenes/datos generados

Esto elimina estado local de Postgres, n8n y Ollama de esta v1:

```bash
docker compose down -v
rm -rf postgres_data ollama_data
```

Usalo solo si quieres resetear por completo el entorno.

## 22. Checklist final de funcionamiento correcto

Considera que la inicializacion esta bien hecha si puedes marcar todo esto:

- `docker compose ps` muestra `postgres`, `ollama`, `api` y `n8n` arriba
- `curl http://localhost:3001/healthz` devuelve `{"status":"ok"}`
- `docker compose exec ollama ollama list` muestra el modelo configurado
- `docker compose exec api pnpm migrate` termina sin error
- has importado y publicado los 12 workflows
- `POST /webhook/proposal-start-v1` devuelve `session_id`
- `POST /webhook/proposal-reply-v1` reutiliza ese `session_id`
- `POST /webhook/solution-start-v1` inicia el carril de solucion tras completar el problema
- `POST /webhook/solution-reply-v1` reutiliza ese `session_id`
- `POST /webhook/data-ai-privacy-start-v1` inicia el carril de datos/IA/privacidad tras completar la solucion
- `POST /webhook/data-ai-privacy-reply-v1` reutiliza ese `session_id`
- `POST /webhook/medical-device-triage-start-v1` inicia el triage medical-device condicional tras datos/IA/privacidad
- `POST /webhook/medical-device-triage-reply-v1` reutiliza ese `session_id`
- `GET /api/v1/sessions/:sessionId` devuelve session, documentos, fuentes, gaps, turnos, runs,
  snapshots, eventos, `module_chats` y `generated_sections`
- `POST /internal/reports/basic-alpha/compose` persiste un unico reporte por propuesta
- `GET /api/v1/sessions/:sessionId/report` devuelve el reporte sin salida cruda de modelo
- Al completar el modulo Alpha de problema, el artefacto esperado es:
  - `module_chats` contiene el chat `problem` en estado `completed` y sin turno activo
  - `generated_sections` contiene la seccion `problem` con `section_version >= 1`
  - los eventos de auditoria incluyen la generacion de la seccion con sus `source_refs` y `gap_refs`
- Al completar el modulo Alpha de solucion, el artefacto esperado es:
  - `module_chats` contiene el chat `solution` en estado `completed` y sin turno activo
  - `generated_sections` contiene la seccion `solution` con `section_version >= 1`
  - los eventos de auditoria incluyen la generacion de la seccion con sus `source_refs` y `gap_refs`
- Al componer el reporte basico Alpha, el artefacto esperado es:
  - `basic_reports` contiene una fila para la propuesta
  - el payload incluye problema, solucion, gaps, fuentes internas y advertencias
  - el payload no incluye `raw_model_output`, `validated_output_json`, prompts ni parametros de modelo
- `pnpm verify` pasa completo
- `bash scripts/smoke-core.sh` pasa contra el stack vivo

## 23. Documento complementario

Resumen corto del proyecto:

- [README.md](../README.md)

Plan de implementacion ejecutado:

- [PLAN.md](../PLAN.md)
