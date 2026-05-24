# Auditoria del estado actual consolidado de SokrAI

Fecha de auditoria: 2026-05-24  
Rama auditada: `chore/multi-branch-discovery` en `/home/tacosrra/src/personal/SokrAI`  
Commit auditado: `30e112c` (`docs: audit SokrAI branches`)  
Base inmediata: `main` / `origin/main` en `46812c6`  
Fuentes usadas:

- `docs/discovery/00-multi-branch-audit.md`
- rama actual `chore/multi-branch-discovery`
- worktree `arnau`: `/home/tacosrra/src/personal/SokrAI-worktrees/arnau`
- worktree `orchestrator-legal`: `/home/tacosrra/src/personal/SokrAI-worktrees/orchestrator-legal`

Nota de alcance: esta auditoria es estatica. No se han ejecutado merges, cherry-picks, borrados, builds ni tests para evitar modificar artefactos fuera de `docs/discovery/`. La worktree actual ya tenia archivos no trackeados en `.archon/` y `docs/prompts/`; no se han tocado.

## 1. Stack tecnico real detectado

El stack real de la rama actual es:

- Monorepo Node.js + TypeScript con `pnpm@10.28.0`.
- Workspace pnpm limitado a `apps/*`.
- API backend `@sokrai/api` con Fastify `^5.2.1`, TypeScript `^5.7.2`, `tsx`, `pg`, `ajv`, `ajv-formats`, `dotenv` y `pdf-parse`.
- Frontend `@sokrai/web` con React `^19.2.0`, React DOM `^19.2.0`, Vite `^7.1.10`, plugin React SWC y TypeScript `^5.9.3`.
- PostgreSQL 16 en Docker Compose, con inicializacion de dos bases: `sokrai_app` y `sokrai_n8n`.
- n8n `latest` en Docker Compose, persistido en volumen Docker y conectado a PostgreSQL.
- Ollama `latest` en Docker Compose, usado por la API via `/api/chat`.
- Modelo por defecto: `qwen2.5:3b-instruct`.
- Validacion de contratos con JSON Schema/AJV.
- Tests declarados con Vitest para API y web.

No estan presentes en la rama actual:

- pgvector.
- modulo RAG.
- endpoints RAG.
- especialidad legal.
- exportacion PDF.
- generacion de dossier/reporte final.
- autenticacion de usuarios.

## 2. Estructura del monorepo

Estructura relevante detectada:

```text
apps/api                 API Fastify, servicios, dominio, repositorios y scripts
apps/web                 Frontend React + Vite
contracts/schemas        JSON Schemas canonicos
db/migrations            Migraciones SQL de la base de aplicacion
infra/docker/postgres    SQL de inicializacion de bases/usuarios
infra/n8n/workflows      Workflows n8n exportados
prompts/v1               Prompts versionados
tests                    Contratos, unitarios, integracion y smoke
examples                 Payloads de ejemplo
docs                     Documentacion operativa y discovery
scripts                  Bootstrap/arranque/parada beta
```

El monorepo esta bien orientado para una v1: separa contratos, prompts, API, frontend, DB y workflows. La principal limitacion estructural es que solo `apps/*` esta en `pnpm-workspace.yaml`; no existen paquetes compartidos para contratos/tipos/prompts. Por eso hoy hay duplicacion manual entre contratos TypeScript de API y web.

## 3. Apps/packages detectados

Apps detectadas:

- `apps/api`: servicio Fastify. Expone rutas internas para n8n y rutas publicas de inspeccion/recovery.
- `apps/web`: UI React/Vite para crear propuesta, subir PDF, continuar sesion, responder turnos y consultar estado.

Packages reales del workspace:

- `@sokrai/api`
- `@sokrai/web`

Carpetas que actuan como paquetes conceptuales, pero no son workspace packages:

- `contracts/schemas`
- `prompts/v1`
- `db/migrations`
- `infra/n8n/workflows`

## 4. Estado del frontend

El frontend existe y es bastante mas que un prototipo minimo. Permite:

- elegir entre crear propuesta nueva y retomar sesion;
- introducir `project_title`, `goal`, `proposal_text`, `document_text`;
- adjuntar un PDF opcional y convertirlo a base64 en cliente;
- enviar starts/replies a webhooks de n8n;
- generar `request_id` desde el navegador;
- manejar timeouts largos de start/reply;
- consultar estado por `GET /api/v1/requests/:requestId`;
- ejecutar recovery activo por `POST /api/v1/requests/:requestId/recover`;
- cargar una sesion por URL o `localStorage`;
- mostrar estado de sesion, turnos, snapshots, runs y progreso derivado.

Partes funcionalmente utiles:

- El flujo de demo local esta pensado para n8n + API + PostgreSQL + Ollama.
- La UI contempla latencias reales de Ollama con budgets altos.
- Hay validadores propios en `apps/web/src/lib/validation.ts`.
- Hay tests de API client, feedback, session view y validacion.

Limitaciones:

- No hay login ni control de acceso: una persona con `session_id` puede consultar la sesion si la API esta expuesta.
- El frontend duplica tipos/validacion en vez de consumir un paquete compartido de contratos.
- La subida de documentos se limita a PDF con texto extraible; no hay OCR ni previsualizacion robusta.
- No hay chats por modulo/fase; hay un unico workspace conversacional para `problem_definition`.
- No hay pantalla de reporte final ni exportacion PDF.
- El estado de sesiones recientes vive en `localStorage`, suficiente para demo pero no para producto multiusuario.

## 5. Estado del backend/Fastify

La API Fastify esta organizada de forma razonable:

- `buildApp` compone config, logger, DB, store, Ollama client, orquestador LLM y servicios.
- Rutas publicas:
  - `GET /healthz`
  - `GET /api/v1/sessions/:sessionId`
  - `GET /api/v1/requests/:requestId`
  - `POST /api/v1/requests/:requestId/recover`
- Rutas internas protegidas por `x-internal-shared-secret`:
  - `POST /internal/sessions/start-context`
  - `POST /internal/sessions/append-reply`
  - `POST /internal/agents/problem-definition/run`

Servicios principales:

- `ProposalStartService`: valida request, extrae texto de PDF opcional, normaliza/trunca input, llama a Ollama para `structured_brief`, persiste sesion/snapshot/run/eventos.
- `ProposalReplyService`: valida respuesta, impide respuesta vacia, persiste answer en el turno abierto y deja el turno en `processing`.
- `ProblemDefinitionService`: ejecuta el agente, aplica guardrails deterministicos, persiste run/snapshot/turnos y soporta idempotencia por `request_id`.
- `LlmOrchestrator`: carga prompts versionados, llama a Ollama, valida JSON contra schema y hace un intento de reparacion JSON.
- `SessionStore`: encapsula persistencia y vistas de auditoria/recovery.

Fortalezas:

- Contratos validados en bordes.
- Idempotencia por `request_id`.
- Recovery activo para workflows que hayan persistido parte del estado.
- Separacion correcta entre n8n como coordinador y API como dueña de reglas/contratos.
- Prompts versionados en archivos.
- Guardrails en codigo para una sola pregunta, maximo tres diagnosis y completion criteria.

Debilidades:

- No hay autenticacion/autorizacion.
- El secreto interno tiene default inseguro (`local-shared-secret`) si no se configura.
- La vista de auditoria puede exponer raw model output y contenido de propuestas.
- No hay rate limiting ni limites por usuario.
- No hay endpoint directo publico de start/reply; la UX depende de n8n para el camino normal.
- La recuperacion por `request_id` es buena para demo, pero necesita endurecimiento transaccional y observabilidad para produccion.

## 6. Estado de PostgreSQL/modelo de datos

La rama actual contiene una unica migracion: `db/migrations/001_initial.sql`.

Tablas principales:

- `proposal_sessions`: head mutable de la sesion, input normalizado, estado actual, brief y problem definition actuales.
- `agent_runs`: auditoria por ejecucion de modelo, prompt, modelo, contratos, input/output, raw output, estado y metricas.
- `conversation_turns`: turnos conversacionales con pregunta, respuesta, estado, diagnosis y problem definition actualizado.
- `session_snapshots`: snapshots versionados del estado.
- `session_events`: eventos append-only por sesion.

Aspectos bien planteados:

- Checks SQL para estados, etapa/agente unico, maximo tres diagnosis y tipos JSON esperados.
- Indices para resume, user/date, turnos abiertos, request ids, runs fallidos y snapshots.
- FKs diferibles desde sesion a ultimo snapshot/run.
- Hash de snapshot para auditabilidad.
- Unicidad de turno abierto por sesion.

Limitaciones:

- No hay tablas de propuestas/documentos separadas: `proposal_sessions` mezcla propuesta, sesion y estado de workflow.
- No hay modelo de gaps por modulo/fase.
- No hay modelo de chats multiples por modulo.
- No hay modelo de reporte/dossier ni secciones generadas.
- No hay modelo de adjuntos/documentos con versiones; solo se guarda nombre/hash de un PDF y texto bruto/normalizado en sesion.
- No hay campos especificos para privacidad, medical device, regulatorio, IA/datos, piloto/viabilidad o metricas de exito.
- No hay migracion RAG ni legal en la rama actual.

## 7. Estado de n8n/orquestacion

Workflows versionados presentes:

- `proposal_start_v1.json`
- `proposal_reply_v1.json`
- `agent_problem_definition_v1.json`

Flujo real:

- `proposal_start_v1` recibe webhook, prepara payload, llama a `/internal/sessions/start-context`, y despues llama directamente a `/internal/agents/problem-definition/run`.
- `proposal_reply_v1` recibe webhook, llama a `/internal/sessions/append-reply`, y despues llama directamente a `/internal/agents/problem-definition/run`.
- `agent_problem_definition_v1` existe como superficie reutilizable, pero la documentacion indica que los workflows principales ya no encadenan otro webhook n8n sincrono; llaman a la API directamente.

Valor:

- n8n queda como orquestador ligero y visible para demo.
- Las reglas criticas no estan escondidas solo en nodos de n8n; viven en API, schemas y prompts.
- Los exports propagan errores controlados de API hacia la UI.

Limitaciones:

- Los workflows son JSON exportado; cualquier edicion manual en n8n debe reexportarse con disciplina.
- La dependencia de n8n para start/reply puede complicar pruebas y entornos si el objetivo es validar solo API.
- No hay workflows por modulo/fase mas alla de problem definition.
- No hay workflow de reporte final ni export PDF.

## 8. Estado de integracion con Ollama

La integracion con Ollama esta implementada en `apps/api/src/services/ollama-client.ts`.

Comportamiento:

- Usa `POST {OLLAMA_BASE_URL}/api/chat`.
- `stream: false`.
- Envia `format` con JSON Schema para forzar salida estructurada.
- Usa `temperature: 0.2`.
- Usa `num_ctx` configurable.
- Usa `keep_alive` configurable.
- Maneja timeout con `AbortSignal.timeout`.
- Traduce errores a `AppError` controlados: `ollama_timeout`, `ollama_unreachable`, `ollama_request_failed`, `ollama_invalid_response`.

Puntos fuertes:

- Modelo local y configurable.
- Contratos validados despues de la respuesta.
- Reparacion JSON una vez con prompt versionado.
- Persistencia de modelo, prompt hash, raw output y metricas.

Riesgos/limitaciones:

- No hay fallback de modelo.
- No hay cola ni cancelacion real de ejecuciones largas.
- No hay streaming para feedback progresivo.
- La calidad del flujo depende mucho de un modelo local pequeno (`qwen2.5:3b-instruct` por defecto).
- No hay evaluacion automatica de calidad semantica, solo validacion estructural.

## 9. Estado de RAG

En la rama actual, RAG no existe. No hay:

- `apps/api/src/rag`
- `apps/api/src/routes/rag-inspection.ts`
- `db/migrations/002_rag.sql`
- `contracts/schemas/rag-*`
- `context-packs`
- variables `EMBEDDING_*` o `RAG_*`
- pgvector en Docker Compose

En la worktree `arnau`, RAG si existe y es la fuente rescatable:

- migracion `002_rag.sql`;
- tablas `context_packs`, `rag_documents`, `rag_chunks`, `rag_retrievals`;
- `pgvector` con `vector(1024)` e indice HNSW cosine;
- ingesta CLI `rag-ingest`;
- busqueda CLI `rag-search`;
- endpoints de inspeccion `GET /api/v1/rag/packs` y `GET /api/v1/rag/search`;
- context pack de ejemplo `general_glossary`;
- embedding por Ollama, modelo `bge-m3`, 1024 dimensiones;
- documentacion `docs/RAG.md`;
- tests unitarios e integracion.

Recomendacion: rescatar RAG desde `arnau`, no desde `orchestrator-legal`, y solo como adapter opcional detras de una interfaz. No debe bloquear el happy path del MVP. Para Hospital Clinic, primero hace falta un corpus aprobado y una politica de citas/fuentes; sin eso RAG anade complejidad sin garantizar mejor maduracion.

## 10. Estado del orquestador legal

En la rama actual, el orquestador legal no existe. No hay:

- `specialty` en contratos actuales.
- prompt legal en `prompts/v1`.
- columnas `specialty`, `current_specialty`, `context_reset_at`.
- endpoint de cambio de especialidad.
- UI de especialidad.

En `orchestrator-legal` si existe un intento de especialidad legal:

- `prompts/v1/problem-definition-agent-legal.md`;
- migracion `003_add_specialty_columns.sql`;
- `specialty = default | legal` en start;
- seleccion de prompt por especialidad;
- intento de retrieval con `packs: ['legal']`;
- endpoint interno `POST /internal/sessions/switch-specialty`;
- UI para seleccionar/cambiar especialidad;
- tests de prompt routing y legal specialty.

Problemas detectados en `orchestrator-legal`:

- No registra las rutas publicas `GET /api/v1/requests/:requestId` ni `POST /api/v1/requests/:requestId/recover`, aunque conserva una funcion `recoverRequestExecution` sin ruta registrada y el frontend/tests siguen esperando esas rutas.
- El frontend consume `/internal/sessions/switch-specialty` con `VITE_INTERNAL_SHARED_SECRET`, lo que expone un secreto interno al navegador.
- Usa el schema `ProblemDefinitionTurn` para una tarea legal/regulatoria que necesita contrato propio.
- Intenta retrieval sobre un pack `legal` que no existe en esa rama.
- Mezcla scope legal con el carril core antes de cerrar el problema principal.

Recomendacion: no incorporar la implementacion legal tal cual. Rescatar solo ideas: prompt como borrador, tests de routing como inspiracion y el concepto de auditar prompt/especialidad si se disena un agente legal futuro separado.

## 11. Que funcionalidades existen

Funcionalidades realmente existentes en la rama actual:

- Crear una sesion/propuesta desde texto, `document_text` o PDF con texto extraible.
- Normalizar y truncar input.
- Extraer `structured_brief` con Ollama.
- Detectar gaps iniciales desde `ambiguities` y `missing_information`.
- Abrir una conversacion socratica de definicion del problema.
- Hacer una pregunta principal por turno.
- Persistir sesiones, turnos, snapshots, runs y eventos.
- Responder turnos y continuar la conversacion.
- Reanudar una sesion por `session_id`.
- Consultar vista auditada de una sesion.
- Recuperar requests que hayan quedado parcialmente persistidas.
- Versionar prompts.
- Versionar workflows n8n.
- Ejecutar bootstrap beta con Docker.

Funcionalidades pedidas por el producto que no existen todavia:

- Chats por modulo/fase.
- Analisis de gaps por regulatorio, datos/IA/privacidad, medical device, recursos/piloto/viabilidad y metricas.
- Generacion de secciones refinadas fuera de problem definition.
- Reporte final estructurado.
- Exportacion PDF.
- Gestion real de documentos y adjuntos.
- RAG en la rama actual.
- Legal/regulatorio como agente separado.

## 12. Que partes parecen funcionales

Parecen funcionales por lectura de codigo, contratos y tests existentes:

- Validacion de schemas con AJV.
- Start context hasta crear sesion, run de brief extraction y snapshot inicial.
- Ejecucion de problem definition con guardrails.
- Reply context sobre turno abierto.
- Idempotencia de start/reply por `request_id`.
- Request status y active recovery en la rama actual.
- Persistencia auditada de runs, turns, snapshots y eventos.
- PDF text extraction para PDFs no escaneados.
- Frontend de demo para crear/continuar/responder.
- Workflows n8n para start/reply llamando API interna.

No se ha verificado runtime en esta auditoria. Por tanto, "parece funcional" significa que las piezas estan implementadas y cubiertas por tests declarados, no que se haya ejecutado `pnpm verify` en este turno.

## 13. Que partes estan incompletas, rotas o mal planteadas

Incompleto en la rama actual:

- Producto multi-modulo.
- Modelo de propuesta persistente separado de la sesion conversacional.
- Gestion documental real.
- Gaps por dominio.
- Reporte/dossier.
- Export PDF.
- RAG.
- Legal/regulatorio.
- Seguridad multiusuario.

Mal planteado o riesgoso:

- La API publica permite inspeccionar sesiones por `session_id` sin auth.
- `ALLOW_SENSITIVE_HEALTH_DATA=false` existe como config, pero no se ve una politica fuerte de redaccion/bloqueo de PHI/PII.
- El input bruto y outputs de modelo se guardan en DB; esto es auditable, pero sensible.
- El contrato `structured_brief` es demasiado estrecho para el caso Hospital Clinic: no representa medical device, datos personales, IA, regulatorio, piloto, recursos o metricas.
- El estado de producto esta centrado en `problem_definition_agent`, no en propuestas completas.
- Los tipos del frontend estan duplicados respecto a API/schemas.

Roto o no incorporable desde otras ramas:

- `orchestrator-legal` no debe incorporarse completo por la perdida de rutas publicas de request status/recover y por exponer secretos internos en frontend.
- RAG no debe incorporarse como dependencia obligatoria porque requeriria pgvector, modelo `bge-m3`, corpus y nuevas operaciones.

## 14. Riesgos tecnicos

- Dependencia runtime de cuatro servicios locales: API, PostgreSQL, n8n y Ollama.
- Latencias altas de Ollama y posibles timeouts en primera extraccion + primera pregunta.
- Falta de fallback si Ollama no devuelve JSON valido despues de un repair.
- Contratos TypeScript duplicados entre API y web.
- `pnpm-workspace.yaml` no modela `contracts` o `prompts` como paquetes.
- Migraciones aun son simples; falta estrategia de versionado/rollback para entornos existentes.
- n8n `latest` puede cambiar comportamiento entre instalaciones.
- Los workflows dependen de `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` para leer env vars.
- Docker Compose principal usa bind mounts locales para `postgres_data` y `ollama_data`; la ruta beta usa volumenes, pero hay dos modos con diferencias.
- RAG de `arnau` fija `vector(1024)` y modelo `bge-m3`; cambiar modelo implica migracion/reestructura.

## 15. Riesgos de producto

- El producto prometido es una herramienta de maduracion integral; la implementacion actual solo madura definicion de problema.
- Hospital Clinic necesita detectar gaps de regulatorio, privacidad, datos/IA, medical device, viabilidad y metricas; esos dominios aun no estan modelados.
- "No inventar informacion" esta en prompts y guardrails parciales, pero no hay trazabilidad de afirmaciones/citas para secciones generadas.
- Un unico chat puede quedarse corto para equipos que esperan fases o modulos diferenciados.
- No hay reporte final, que es una pieza central del valor percibido.
- Sin export PDF, la salida no encaja todavia con flujos de comite/licitacion.
- Legal/regulatorio es un area sensible: si se incorpora mal, puede parecer asesoramiento legal.

## 16. Riesgos de privacidad/seguridad

- Sin autenticacion ni autorizacion.
- `session_id` funciona como bearer secret informal.
- Raw proposal text, document text y raw model output quedan persistidos.
- No hay clasificacion, minimizacion ni redaccion de datos sensibles.
- `ALLOW_SENSITIVE_HEALTH_DATA=false` no parece imponer controles fuertes por si solo.
- No hay cifrado de campos sensibles a nivel aplicacion.
- No hay retention policy ni borrado de sesiones/documentos.
- No hay audit trail de acceso a sesiones, solo eventos de flujo.
- En `orchestrator-legal`, la exposicion de `VITE_INTERNAL_SHARED_SECRET` al navegador es un blocker de seguridad.
- Si se usa RAG futuro, hacen falta reglas de aprobacion de corpus, versionado editorial y control de fuentes.

## 17. Que conservar

Conservar de la rama actual:

- Contratos JSON como fuente de verdad.
- `structured-brief.schema.json` y `problem-definition-turn.schema.json` como base del core path, aunque deban ampliarse.
- Separacion `apps/api`, `apps/web`, `contracts`, `db`, `infra/n8n`, `prompts`.
- Fastify como owner de reglas, guardrails y persistencia.
- n8n como coordinador ligero, no como contenedor de reglas criticas.
- Prompts versionados con hash persistido.
- Modelo de `agent_runs`, `conversation_turns`, `session_snapshots` y `session_events`.
- Idempotencia por `request_id`.
- Request status/recovery.
- Tests de contratos, dominio, integracion y frontend.
- Bootstrap beta como ruta de demo.

## 18. Que refactorizar

Refactorizar antes de crecer el producto:

- Extraer contratos/tipos compartidos a un paquete workspace, o generar tipos desde JSON Schema.
- Separar entidad `proposal` de `session` y de `conversation`.
- Modelar gaps como entidades propias con dominio, estado, evidencia, preguntas asociadas y resolucion.
- Introducir fases/modulos explicitamente: problema, solucion, datos/IA/privacidad, regulatorio/legal, medical device, piloto/viabilidad, metricas, reporte.
- Convertir recovery/request execution en una abstraccion de workflow mas clara.
- Endurecer configuracion: no permitir defaults inseguros de secretos en entornos no locales.
- Consolidar modos Docker beta/manual para reducir divergencias.
- Preparar interfaces para retrieval sin incorporar pgvector al camino obligatorio.
- Revisar y documentar politica de datos sensibles.

## 19. Que eliminar o rehacer

Eliminar o no incorporar:

- Implementacion completa de `orchestrator-legal` en su estado actual.
- UI que llama endpoints internos con secretos expuestos.
- Switch de especialidad mid-session como feature de v1.
- Retrieval legal automatico sobre pack inexistente.
- Cualquier dependencia obligatoria a RAG para el happy path.
- Cualquier intento de generar dictamen legal/regulatorio definitivo.

Rehacer con contrato propio:

- Legal/regulatorio como modulo de gap detection o agente posterior, no como variante de `ProblemDefinitionTurn`.
- Medical device como modulo propio, con preguntas de clasificacion y evidencia.
- Reporte final como artefacto persistido y versionado.
- Export PDF a partir de un reporte estructurado, no desde HTML improvisado.

## 20. Que rescatar de otras ramas

De `arnau`:

- Modulo RAG como base tecnica opcional:
  - chunking;
  - manifest de context packs;
  - ingestion service;
  - retrieval service;
  - repositorios RAG;
  - `prompt-augmenter`;
  - CLIs `rag-ingest` y `rag-search`;
  - migracion `002_rag.sql` solo si se acepta pgvector;
  - `docs/RAG.md`;
  - tests RAG con fake embedding client.
- No rescatarlo como dependencia obligatoria del MVP core.

De `orchestrator-legal`:

- `prompts/v1/problem-definition-agent-legal.md` como borrador de investigacion.
- Idea de registrar prompt/especialidad en auditoria, si se disena un sistema multiagente real.
- Tests de prompt routing como inspiracion.
- Migracion de columnas de especialidad solo si se redefine formalmente el modelo de agentes/fases.

No rescatar:

- `POST /internal/sessions/switch-specialty` consumido por frontend.
- `VITE_INTERNAL_SHARED_SECRET`.
- Retrieval con `packs: ['legal']` sin corpus.
- Cambios que eliminan rutas publicas de request status/recover.

## 21. Que falta para poder construir un MVP serio

Para un MVP serio de SokrAI/Hospital Clinic falta:

1. Definir contrato de propuesta separada de sesion.
2. Modelar documentos y fuentes subidas con versionado, hashes, extraccion y estado.
3. Modelar gaps por modulo/fase.
4. Mantener el carril actual de problem definition como primer modulo estable.
5. Crear al menos un modulo adicional de alto valor para el caso sanitario: datos/IA/privacidad o medical device.
6. Crear chats por modulo, cada uno ligado a gaps concretos.
7. Evitar invencion con reglas de "unknown", evidencia obligatoria y trazabilidad de fuentes.
8. Persistir secciones refinadas como artefactos versionados.
9. Crear un `proposal_report` estructurado.
10. Exportar PDF desde el reporte estructurado.
11. Definir politica de datos sensibles: anonimizar, bloquear o permitir bajo configuracion explicita.
12. Anadir autenticacion minima o al menos proteccion de sesiones para demo con usuarios reales.
13. Ejecutar y documentar happy path end-to-end con Docker beta.
14. Decidir si RAG entra en MVP o queda en v1.5; si entra, crear un context pack aprobado.
15. Documentar limites: no dictamen clinico/legal, no sustitucion de comite.

## 22. Recomendacion de siguiente paso

El siguiente paso recomendado es estabilizar una rama limpia de MVP core desde la rama actual/main, no desde `orchestrator-legal`.

Orden propuesto:

1. Verificar runtime completo actual: bootstrap beta, migraciones, import/activacion n8n, start, primera pregunta, reply, resume y recovery.
2. Corregir cualquier fallo del core path antes de ampliar alcance.
3. Crear una arquitectura de producto para `proposal`, `document`, `gap`, `module_chat`, `refined_section` y `report`.
4. Mantener `problem_definition_agent` como modulo 1.
5. Implementar el siguiente modulo sanitario minimo, preferiblemente `datos_ia_privacidad` o `medical_device`, con contrato propio.
6. Dejar RAG como adapter opcional; rescatarlo de `arnau` solo cuando haya corpus aprobado.
7. Dejar legal fuera del MVP core; rescatar de `orchestrator-legal` solo ideas y prompt borrador para una fase posterior.
8. Construir reporte estructurado y luego export PDF.

Decision recomendada: conservar el nucleo actual, refactorizar el modelo de producto alrededor de propuestas/gaps/modulos, y no fusionar ramas completas. El proyecto tiene una base tecnica valida para una v1 de problem definition, pero todavia no es el MVP de maduracion integral descrito para Hospital Clinic.
