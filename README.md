# SokrAI v1

Middleware de maduracion de propuestas antes de comite, orientado a demostrar dos capacidades Alpha de forma solida en v1:

> digerir una propuesta inicial, construir un `structured_brief`, conducir una conversacion socratica resumible para clarificar el problema y continuar con la definicion de solucion.

Guia detallada de arranque y prueba:

- [docs/INICIALIZACION_V1.md](docs/INICIALIZACION_V1.md)

## Alcance de esta v1

- Orquestacion principal con `n8n`
- Inferencia local con `Ollama`
- Persistencia en `PostgreSQL`
- Interfaz operativa en `apps/web` para demo local y uso humano
- Carriles operativos Alpha: `problem_definition_agent` y `solution_definition_agent`
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
- BI/dashboard amplio o superficies multi-lane fuera de los carriles Alpha de problema y solucion

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

Sesion y replay:

- `proposal_sessions`
- `conversation_turns`
- `agent_runs`
- `session_snapshots`
- `session_events`

Alpha y fuentes internas:

- `proposals`
- `proposal_documents`
- `proposal_sources`
- `alpha_gaps`
- `module_chats`
- `chat_turns`
- `generated_sections`
- `basic_reports`
- `audit_events`

Patron:

- `proposal_sessions` es el head mutable
- `proposal_documents` guarda texto pegado, documentos subidos, estado de extraccion, hash SHA-256 y metadatos
- `proposal_sources` guarda las fuentes internas trazables con etiquetas y spans sobre el texto normalizado
- `alpha_gaps` guarda gaps iniciales deterministas con `origin`, `absence`, estado y pregunta candidata
- `session_snapshots` y `session_events` son historial append-only
- `agent_runs` guarda prompt/provider/model/schema/raw output por ejecucion
- `conversation_turns` modela la conversacion de una pregunta por turno
- `proposals` reutiliza el `session_id` como `proposal_id` en Alpha v1 para mantener compatibilidad de resume
- `audit_events` es append-only por trigger y audita los artefactos Alpha sin reemplazar `session_events`

## Analisis inicial de gaps Alpha

Durante `proposal_start_v1`, la API genera gaps iniciales de forma determinista desde el `structured_brief` validado y las fuentes internas persistidas. No se ejecuta un modelo adicional para esta fase.

Cada `AlphaGap` persistido incluye:

- `module`, limitado a `problem` o `solution`
- `gap_kind` y `gap_status`
- `origin`, para distinguir campo estructurado, `missing_information`, ambiguedad, fuente interna o regla del sistema
- `absence`, con campos revisados y razon cuando falta informacion
- `source_refs`, solo cuando existe una fuente interna real que se puede referenciar
- `question_hint`, como pregunta candidata para aclaracion posterior

Los gaps de ausencia no son conclusiones negativas ni scoring. Esta v1 no introduce ranking, aprobacion, dictamen legal, regulacion Clinic, medical device, costes, recursos, RAG avanzado ni PDF.

`GET /api/v1/sessions/:sessionId` devuelve `gaps` junto con documentos, fuentes, turns, runs, snapshots y eventos para replay y auditoria. `detected_gaps` se mantiene como resumen de compatibilidad en snapshots y respuestas internas.

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
- levanta el stack beta con contenedores fijos `postgres`, `ollama`, `api`, `n8n` y `web`
- usa volumenes Docker dedicados para `postgres`, `ollama` y `n8n`
- espera a que `PostgreSQL`, `Ollama`, `API`, `n8n` y `web` esten listos
- descarga el modelo configurado en `OLLAMA_MODEL` con reintentos; si ya esta cacheado, lo reutiliza
- ejecuta migraciones
- importa y publica los workflows de `n8n`
- abre la UI principal en el navegador al terminar

Requisitos de esta ruta:

- `Docker Desktop` o un daemon Docker accesible
- `curl` y shell tipo `bash` en macOS, Linux o WSL
- `PowerShell` en Windows nativo

Para esta ruta beta no hace falta instalar `Node.js` ni `pnpm` en host.

Si el pull de Ollama falla con `no such host`, el stack beta ya fuerza DNS publicos en el contenedor de `ollama`. Si aun asi tu red bloquea la descarga, puedes:

- reintentar el bootstrap;
- cambiar `OLLAMA_MODEL` a otro modelo que ya tengas cacheado;
- o lanzar `SOKRAI_BETA_SKIP_OLLAMA_PULL=1 ./scripts/bootstrap-beta.sh` si el modelo ya existe en el volumen de `ollama`.

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

### Ruta recomendada para validar workflows sin editar exports

Los workflows versionados llaman a la API como `http://api:3001`, que es el nombre del servicio dentro de Docker Compose. Para probar `n8n` con los exports sin cambios, levanta la API en Docker:

```bash
cp .env.example .env
pnpm install --store-dir ./.pnpm-store
docker compose up -d postgres ollama api n8n
docker compose exec ollama ollama pull qwen2.5:3b-instruct
docker compose exec api pnpm migrate
for workflow in proposal_start_v1.json proposal_reply_v1.json agent_problem_definition_v1.json solution_start_v1.json solution_reply_v1.json agent_solution_definition_v1.json; do
  docker compose exec -T -u node n8n n8n import:workflow --input="/workflows/${workflow}"
done
for workflow_path in infra/n8n/workflows/proposal_start_v1.json infra/n8n/workflows/proposal_reply_v1.json infra/n8n/workflows/agent_problem_definition_v1.json infra/n8n/workflows/solution_start_v1.json infra/n8n/workflows/solution_reply_v1.json infra/n8n/workflows/agent_solution_definition_v1.json; do
  workflow_id="$(awk -F'"' '/^[[:space:]]*"id":[[:space:]]*"/ { print $4; exit }' "$workflow_path")"
  docker compose exec -T -u node n8n n8n publish:workflow --id="$workflow_id"
done
docker compose restart n8n
bash scripts/smoke-core.sh
```

En Windows nativo, el smoke equivalente es:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-core.ps1
```

Si prefieres ejecutar la API en host con `pnpm dev`, edita manualmente en n8n los nodos `HTTP Request` que apuntan a `http://api:3001/...` para usar una URL alcanzable desde el contenedor de `n8n`.

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
docker exec -it $(docker ps -qf "ancestor=ollama/ollama:latest") ollama pull qwen2.5:3b-instruct
```

`qwen2.5:3b-instruct` es ahora el valor por defecto recomendado para esta v1 local. Si tu maquina tiene mas margen y quieres priorizar calidad sobre latencia, puedes volver a `qwen2.5:7b-instruct` manualmente en `.env`.

### 4. Aplicar migraciones

```bash
pnpm migrate
```

### 5. Levantar la API

```bash
pnpm dev
```

La API queda en `http://localhost:3001`.

Este modo host es util para desarrollo de API, pero los workflows exportados no podran llamar a `http://api:3001` salvo que ejecutes tambien la API en Docker o ajustes esas URLs en n8n.

### 5.b Levantar el frontend

Modo recomendado fuera de Docker:

```bash
pnpm dev:web
```

La UI queda en `http://localhost:3000`.

Usa el proxy de Vite para hablar con:

- `http://localhost:5678/webhook/*`
- `http://localhost:3001/api/*`

La UI tiene budgets de espera mas altos para el flujo real:

- `VITE_START_SESSION_TIMEOUT_MS=960000`
- `VITE_REPLY_SESSION_TIMEOUT_MS=540000`
- `VITE_SESSION_AUDIT_TIMEOUT_MS=10000`
- `VITE_REQUEST_STATUS_TIMEOUT_MS=10000`
- `VITE_REQUEST_RECOVERY_TIMEOUT_MS=960000`

No se recomienda quitar el timeout por completo. El primer diagnostico puede tardar mas porque encadena la extraccion del brief y la primera ejecucion del agente, pero si Ollama queda colgado la UI debe terminar mostrando un error controlado.

La API tambien deja `OLLAMA_KEEP_ALIVE=30m` por defecto para que el modelo permanezca cargado entre la extraccion inicial y la primera pregunta, reduciendo cargas frias repetidas.

La abstraccion de proveedor IA sigue apuntando solo a Ollama en v1. `AI_PROVIDER=ollama` es el unico valor soportado y `AI_MODEL` puede usarse como alias opcional; si no se define, se usa `OLLAMA_MODEL`.

Ademas, la extraccion inicial del brief usa un excerpt acotado por `BRIEF_EXTRACTION_MAX_CHARS=10000`. El texto completo se sigue persistiendo, pero no se manda entero al primer prompt de Ollama para evitar timeouts innecesarios en local.

Ademas, la UI envia un `request_id` por cada start/reply y, si el navegador agota la espera inicial, consulta `GET /api/v1/requests/:requestId` para intentar recuperar el resultado final del workflow. Si detecta que la ejecucion quedo a medias, tambien puede disparar `POST /api/v1/requests/:requestId/recover` para completar el turno directamente desde la API usando el estado persistido.

Si prefieres levantar toda la superficie de demo en Docker, añade `web` al `docker compose up`.

### 6. Importar workflows n8n

Archivos:

- `infra/n8n/workflows/proposal_start_v1.json`
- `infra/n8n/workflows/proposal_reply_v1.json`
- `infra/n8n/workflows/agent_problem_definition_v1.json`
- `infra/n8n/workflows/solution_start_v1.json`
- `infra/n8n/workflows/solution_reply_v1.json`
- `infra/n8n/workflows/agent_solution_definition_v1.json`

Abre `http://localhost:5678`, importa y publica los seis workflows, y asegúrate de que `INTERNAL_SHARED_SECRET` coincide entre `.env`, la API y `n8n`.

Los exports de workflow de esta version eliminan reintentos sincronos en nodos `HTTP Request` y propagan `statusCode + body` de la API al webhook para que un `ollama_timeout` o cualquier error controlado llegue a la UI como JSON consistente. Si reimportas los workflows, publica la nueva version exportada del repo.

Si ejecutas `web` o `api` en Docker Compose, recuerda reconstruir esas imagenes tras cambiar el codigo; si ejecutas con Vite/tsx en local, reinicia ambos procesos para que se carguen los nuevos budgets y la recuperacion por `request_id`.

No cambies `N8N_ENCRYPTION_KEY` una vez que `n8n` haya inicializado su volumen persistido. Si la clave del `.env` ya no coincide con la guardada en `/home/node/.n8n/config`, `n8n` no arrancara hasta que vuelvas a poner la clave original o resetees el volumen de `n8n`.

## Endpoints y workflows

### Webhooks n8n

- `POST /webhook/proposal-start-v1`
- `POST /webhook/proposal-reply-v1`
- `POST /webhook/solution-start-v1`
- `POST /webhook/solution-reply-v1`

### Endpoint interno reutilizable

- `POST /webhook/agent-problem-definition-v1`
- `POST /webhook/agent-solution-definition-v1`

### API interna para n8n

- `POST /internal/sessions/start-context`
- `POST /internal/sessions/append-reply`
- `POST /internal/agents/problem-definition/run`
- `POST /internal/sessions/solution-start`
- `POST /internal/sessions/solution-reply`
- `POST /internal/agents/solution-definition/run`
- `POST /internal/reports/basic-alpha/compose`

### API de inspeccion

- `GET /api/v1/sessions/:sessionId`
- `GET /api/v1/sessions/:sessionId/report`
- `GET /api/v1/requests/:requestId`
- `POST /api/v1/requests/:requestId/recover`
- `GET /healthz`

### UI operativa

- `http://localhost:3000`
- Crear nueva propuesta
- Pegar `document_text`
- Subir un PDF con texto extraible; no hay OCR ni documentos escaneados en esta v1
- Reanudar por `session_id`
- Inspeccionar `brief`, `gaps`, `warnings`, timeline, documentos y fuentes internas

La UI muestra un aviso operativo: no incluyas datos reales de pacientes. Para MVP Alpha usa datos ficticios o anonimizados.

## Ejemplos

Payloads listos para prueba:

- `examples/proposal-start.payload.json`
- `examples/proposal-reply.payload.json`
- `POST /webhook/solution-start-v1`
- `POST /webhook/solution-reply-v1`

El flujo normal es:

1. `proposal_start_v1`
2. guardar `session_id`
3. responder con `proposal_reply_v1`
4. repetir hasta `agent_status = "done"`
5. iniciar `solution_start_v1`
6. responder con `solution_reply_v1` hasta `agent_status = "done"`
7. componer el informe con `POST /internal/reports/basic-alpha/compose`
8. leerlo con `GET /api/v1/sessions/:sessionId/report`

Al cerrar el carril de problema, la API conserva la compatibilidad de resume con
`conversation_turns`, `session_snapshots` y `agent_runs`, y tambien escribe el
modelo Alpha trazable: `module_chats`, `chat_turns`, `alpha_gaps`,
`proposal_sources` de tipo `user_answer` y una fila `generated_sections` con
`section_kind = "problem"`, `section_status = "generated"` y
`section_version >= 1`. La seccion de problema se renderiza de forma
determinista desde el brief y las respuestas persistidas; no usa un writer LLM
separado.

Tras cerrar el problema, el carril de solucion usa `module = "solution"` y genera
una fila `generated_sections` con `section_kind = "solution"`. La seccion de
solucion tambien se renderiza de forma determinista desde respuestas persistidas
y fuentes internas.

El reporte basico Alpha se compone de forma deterministica desde el brief,
gaps actuales, seccion de problema, seccion de solucion, fuentes internas,
referencias de auditoria y advertencias fijas. La ruta publica
`GET /api/v1/sessions/:sessionId/report` devuelve solo el contrato
`BasicAlphaReport`; no expone `raw_model_output`, prompts, parametros de modelo
ni payloads crudos de los `agent_runs`.

Siguen fuera de alcance en esta PR: plan de negocio, costes, legal/regulatorio,
medical device, PDF export, RAG, scoring y aprobacion/rechazo.

## Tests

```bash
pnpm install --store-dir ./.pnpm-store
pnpm run type-check
pnpm run format:check
pnpm build
pnpm test:contracts
pnpm test:unit
pnpm test:web
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app pnpm test:integration
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app pnpm test:smoke
TEST_DATABASE_URL=postgresql://sokrai_app:localpass@localhost:5433/sokrai_app pnpm verify
```

`tests/helpers/test-environment.ts` usa `localhost:5433` por defecto para alinearse con Docker Compose. Puedes seguir sobreescribiendo `TEST_DATABASE_URL` si tu Postgres de pruebas vive en otro puerto.

## Smoke local contra stack vivo

Con `postgres`, `ollama`, `api` y `n8n` arriba, ejecuta:

```bash
bash scripts/smoke-core.sh
```

El script usa solo payloads ficticios de `examples/`, valida `healthz`, start/reply via webhooks de `n8n`, auditoria de sesion, estado por `request_id` y recuperacion activa de una solicitud parcialmente persistida. No valida texto exacto del modelo.

## Decisiones importantes de v1

- `n8n` orquesta, pero no contiene reglas criticas de negocio.
- La API valida todo contra schemas antes de aceptar o persistir.
- El modelo nunca es la unica barrera de validacion.
- Si el modelo devuelve JSON invalido, se intenta reparar una sola vez.
- Si la reparacion falla, se devuelve error controlado y se persiste `raw_model_output`.
- La reanudacion y trazabilidad salen de SQL, no de estado en memoria.

## Limitaciones conocidas

- El soporte PDF es para documentos con texto extraible, no OCR.
- Los documentos subidos se guardan como fuentes internas de la propuesta con hash de bytes decodificados y metadatos de extraccion.
- Los workflows n8n se importan manualmente en la ruta de desarrollo; `bootstrap-beta` los importa y publica automaticamente.
- La recuperacion no puede reconstruir solicitudes que nunca llegaron a persistirse en la API.
- Esta v1 no debe usarse con PHI real si `ALLOW_SENSITIVE_HEALTH_DATA=false`.

# DESPUES DE CADA PR

pnpm install
pnpm build
pnpm test
pnpm verify
