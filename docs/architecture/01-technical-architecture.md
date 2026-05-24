# Arquitectura tecnica recomendada para el MVP de SokrAI

Fecha: 2026-05-24  
Estado: propuesta de arquitectura v1  
Fuentes:

- `docs/discovery/00-multi-branch-audit.md`
- `docs/discovery/01-current-state-audit.md`
- `docs/mvp/01-mvp-scope.md`
- `docs/prd/01-mvp-prd.md`
- Estado actual del repositorio en `chore/multi-branch-discovery`

## 1. Resumen ejecutivo

La arquitectura recomendada para el MVP de SokrAI debe partir de `main`/rama actual y evolucionar de forma incremental hacia un producto de maduracion de propuestas, no hacia una reescritura total. El repositorio actual ya contiene un nucleo valido: monorepo Node.js + TypeScript + pnpm, API Fastify, frontend React/Vite, contratos JSON Schema, PostgreSQL, n8n, Ollama local, prompts versionados, workflows exportados y un carril conversacional persistente para `problem_definition_agent`.

El problema principal no es la ausencia de base tecnica, sino que el modelo actual esta centrado en una sesion unica de definicion de problema. El MVP Hospital Clinic necesita una entidad de propuesta mas completa, documentos versionados, fuentes trazables, gaps por modulo, chats por seccion, secciones generadas, reporte final y exportacion PDF.

La estrategia recomendada es:

- conservar el core de `main`;
- refactorizar el modelo de datos y servicios hacia `proposal`, `document`, `gap`, `module_chat`, `generated_section` y `proposal_report`;
- mantener Ollama como proveedor IA local inicial, pero invocarlo mediante un puerto de proveedor IA;
- mantener n8n como orquestador ligero, con reglas criticas en API, schemas y prompts versionados;
- rescatar de `arnau` el RAG solo como referencia/adaptador opcional;
- descartar la implementacion directa de `orchestrator-legal` y redisenar cualquier modulo regulatorio/legal como deteccion de gaps, no como asesoramiento;
- no introducir arquitectura VPS remota en el MVP.

## 2. Arquitectura actual detectada

La rama actual esta en `chore/multi-branch-discovery`, con base funcional cercana a `main`. El estado observado incluye:

- Monorepo pnpm con workspace limitado a `apps/*`.
- `apps/api`: Fastify 5, TypeScript, `pg`, AJV, `pdf-parse`, `tsx` y Vitest.
- `apps/web`: React 19, Vite 7, TypeScript y Vitest.
- `contracts/schemas`: JSON Schemas canonicos, incluyendo `structured-brief.schema.json` y `problem-definition-turn.schema.json`.
- `db/migrations/001_initial.sql`: tablas `proposal_sessions`, `agent_runs`, `conversation_turns`, `session_snapshots` y `session_events`.
- `infra/n8n/workflows`: exports `proposal_start_v1`, `proposal_reply_v1` y `agent_problem_definition_v1`.
- `prompts/v1`: prompts versionados `extract-initial-brief`, `problem-definition-agent` y `json-repair`.
- `docker-compose.yml`: PostgreSQL 16, API, web, n8n y Ollama.
- Tests de contratos, dominio, integracion, smoke y frontend.

Funcionalmente, la arquitectura actual soporta:

- intake de propuesta desde texto, `document_text` o PDF con texto extraible;
- normalizacion y truncado de input;
- extraccion de `structured_brief` con Ollama;
- persistencia de sesion, turnos, snapshots, runs y eventos;
- primera pregunta de definicion del problema;
- respuesta y continuacion del chat;
- idempotencia por `request_id`;
- consulta de estado y recovery de requests;
- UI local para crear/retomar sesiones.

No soporta todavia:

- entidad de propuesta separada de sesion;
- gestion documental real;
- gaps por modulo;
- multiples chats por modulo;
- generacion de secciones versionadas fuera del problema;
- reporte final;
- exportacion PDF;
- RAG en la rama actual;
- especialidad legal/regulatoria segura;
- autenticacion/autorizacion para usuarios reales.

## 3. Arquitectura objetivo del MVP

La arquitectura objetivo debe ser un vertical slice local/on-premise con separacion clara:

```text
Usuario
  -> Web React/Vite
  -> n8n webhooks publicos de flujo
  -> API Fastify interna/publica
  -> PostgreSQL
  -> Ollama local
```

Responsabilidades recomendadas:

- Frontend: experiencia de propuesta, documentos, dashboard, chats por modulo, revision de secciones, reporte y export PDF.
- n8n: coordinacion visible de workflows, reintentos controlados y webhooks de start/reply/generacion.
- API Fastify: contratos, validacion, reglas de dominio, persistencia, orquestacion de IA, auditoria y endpoints publicos/privados.
- PostgreSQL: fuente de verdad transaccional para propuestas, documentos, gaps, chats, secciones, reportes, runs y eventos.
- Ollama: proveedor IA local inicial para extraccion, gap analysis, turnos, writers y composicion.
- Retrieval opcional: interfaz desacoplada, con `NoopRetrieval` o retrieval simple sobre documentos subidos como default.

El MVP debe mantener una frontera estricta: la IA no decide aprobacion, no emite dictamen legal/regulatorio/clinico y no inventa hechos. Las salidas deben pasar por contratos JSON Schema, guardrails deterministas y persistencia auditable.

## 4. Estructura actual del monorepo

Estructura relevante actual:

```text
apps/api                 API Fastify, servicios, dominio, repositorios y scripts
apps/web                 Frontend React + Vite
contracts/schemas        JSON Schemas canonicos
db/migrations            Migraciones SQL de la base de aplicacion
infra/docker/postgres    Inicializacion PostgreSQL local
infra/n8n/workflows      Workflows n8n exportados
prompts/v1               Prompts versionados
tests                    Contratos, unitarios, integracion, smoke y fixtures
examples                 Payloads de ejemplo
docs                     Discovery, PRD, MVP y documentacion
scripts                  Scripts de arranque/parada beta
```

El monorepo esta bien orientado, pero `contracts`, `prompts` y `db` no son paquetes workspace. Esto genera duplicacion de tipos entre API y web, y hace que los contratos existan como carpeta canonica pero no como dependencia tipada compartida.

## 5. Estructura objetivo del monorepo

La estructura objetivo debe adaptarse al repositorio actual sin forzar un redisenio innecesario:

```text
apps/
  api/
    src/
      contracts/
      domain/
      routes/
      services/
      repositories/
      ia/
      retrieval/
      documents/
      reports/
  web/
    src/
      components/
      features/
        proposal-intake/
        proposal-dashboard/
        module-chat/
        section-review/
        report/
      lib/
contracts/
  schemas/
    proposal-start.request.schema.json
    structured-brief.schema.json
    gap-analysis.schema.json
    module-turn.schema.json
    generated-section.schema.json
    proposal-report.schema.json
db/
  migrations/
infra/
  n8n/
    workflows/
prompts/
  v1/
tests/
  contracts/
  unit/
  integration/
  fixtures/
docs/
  architecture/
  decisions/
```

Evolucion recomendada:

- Mantener `apps/api` y `apps/web`.
- Mantener `contracts/schemas` como fuente de verdad.
- Crear, en una PR posterior, un paquete workspace `packages/contracts` o generacion de tipos desde JSON Schema.
- Mantener `prompts/v1` como ubicacion de prompts versionados.
- No introducir servicios nuevos salvo que sean necesarios para el vertical slice.
- No introducir VPS remoto ni dependencias cloud en el MVP.

## 6. Que conservar del repo actual

Conservar:

- Monorepo pnpm y separacion `apps/api` / `apps/web`.
- Fastify como API principal.
- React/Vite como frontend local.
- PostgreSQL como fuente de verdad.
- n8n como orquestador ligero.
- Ollama local como proveedor IA inicial.
- JSON Schemas canonicos en `contracts/schemas`.
- `structured-brief.schema.json` como contrato base de brief.
- `problem-definition-turn.schema.json` como contrato base del modulo problema.
- `ProposalStartService`, `ProposalReplyService`, `ProblemDefinitionService`, `LlmOrchestrator`, `PromptService` y `SessionStore` como patrones de implementacion.
- Validacion AJV en bordes.
- Reparacion JSON una vez.
- Prompts versionados y hash de prompt persistido.
- `agent_runs`, `conversation_turns`, `session_snapshots` y `session_events`.
- Idempotencia por `request_id`.
- Endpoints de status y recovery.
- Workflows n8n actuales.
- Tests de contratos, dominio, integracion y frontend.
- Scripts de demo local/beta.

## 7. Que refactorizar

Refactorizar antes de ampliar demasiado el producto:

- Separar propuesta, sesion y conversacion. `proposal_sessions` mezcla hoy estado de producto, input inicial, sesion y conversacion.
- Introducir documentos y fuentes como entidades persistidas, no solo texto embebido en la sesion.
- Introducir `gaps` como entidad propia con modulo, estado, origen, pregunta asociada y resolucion.
- Generalizar `conversation_turns` hacia chats por modulo.
- Crear contratos especificos para modulos que no encajan en `ProblemDefinitionTurn`.
- Crear `generated_sections` para secciones versionadas.
- Crear `proposal_reports` y `pdf_exports`.
- Extraer o generar tipos compartidos desde JSON Schema para reducir duplicacion API/web.
- Endurecer configuracion de secretos y modo local.
- Ocultar raw model output en vistas no tecnicas.
- Consolidar modos Docker y documentacion de entorno local.

## 8. Que rehacer

Rehacer con contrato propio:

- Modulo regulatorio/datos/IA/privacidad: debe ser deteccion de gaps y clarificacion, no asesor legal.
- Medical device: debe ser triage declarativo y necesidad de revision humana, no clasificacion formal.
- Reporte final: debe ser artefacto estructurado y versionado, no HTML improvisado.
- Exportacion PDF: debe generarse desde `ProposalReport`, con version, fecha, gaps y fuentes.
- Gestion documental: debe almacenar documentos, extraccion, hashes, versiones, fuentes y flags de privacidad.
- RAG de producto: si entra, debe entrar como retrieval opcional con citas y fuentes, no como dependencia global.

No se justifica rehacer el repositorio completo. La base actual encaja con la estrategia del MVP.

## 9. Que eliminar o descartar

No incorporar:

- Implementacion completa de `orchestrator-legal`.
- `POST /internal/sessions/switch-specialty` consumido desde frontend.
- Cualquier uso de `VITE_INTERNAL_SHARED_SECRET` o secretos internos en navegador.
- Retrieval legal automatico sobre `packs: ['legal']`.
- Especialidad legal dentro de `ProblemDefinitionTurn`.
- RAG obligatorio en el happy path.
- pgvector como requisito minimo de la demo si no hay decision explicita.
- Corpus legal/regulatorio no aprobado.
- Scoring, aprobacion, priorizacion automatica o dictamen.
- Vistas de usuario con raw model output.
- Defaults inseguros de secretos fuera de modo local.

## Estrategia tecnica multi-rama

### A. Que se aprovecha de main

Componentes, modulos o estructuras que deben mantenerse:

- Estructura `apps/api`, `apps/web`, `contracts/schemas`, `db/migrations`, `infra/n8n/workflows`, `prompts/v1` y `tests`.
- API Fastify como propietaria de reglas, validaciones, guardrails y persistencia.
- Contratos JSON Schema como fuente de verdad.
- `structured-brief.schema.json` y `problem-definition-turn.schema.json`.
- Servicios `ProposalStartService`, `ProposalReplyService`, `ProblemDefinitionService`, `LlmOrchestrator` y `PromptService`.
- Persistencia auditable en PostgreSQL.
- Idempotencia por `request_id`.
- Request status y active recovery.
- Workflows n8n de start, reply y problem definition.
- UI de creacion, continuacion y workspace como base.
- Tests y fixtures existentes.

Problemas tecnicos de `main`:

- No es plenamente funcional segun la advertencia de producto; requiere verificacion runtime.
- El modelo de datos esta centrado en `proposal_sessions`.
- No existen propuestas, documentos, gaps, secciones ni reportes como entidades separadas.
- El frontend duplica tipos/validacion.
- No hay autenticacion/autorizacion.
- El secreto interno tiene fallback local inseguro.
- La vista auditada puede exponer raw output y contenido sensible.
- No hay exportacion PDF ni reporte final.

Cambios necesarios para hacerlo base del MVP:

- Validar primero el happy path actual con Docker/n8n/Ollama/PostgreSQL.
- Introducir migraciones incrementales para propuestas, documentos, gaps, chats, secciones y reportes.
- Mantener compatibilidad temporal con sesiones actuales mientras se migra.
- Convertir `problem_definition_agent` en el primer modulo de una propuesta multi-modulo.
- Crear contratos nuevos para gap analysis, module turn, generated section y report.
- Endurecer privacidad, secretos y acceso a vistas tecnicas.

### B. Que se aprovecha de arnau

Evaluacion tecnica del intento de RAG:

`arnau` contiene un modulo RAG lateral bastante completo: migracion `002_rag.sql`, pgvector, tablas de context packs, documentos, chunks y retrievals, embeddings con Ollama, modelo `bge-m3`, dimension 1024, ingesta CLI, busqueda CLI, endpoints de inspeccion y tests. La auditoria indica que no esta conectado al `problem_definition_agent`, lo que reduce el riesgo de acoplamiento pero tambien significa que no aporta valor directo al happy path actual.

Partes reutilizables:

- `chunking`.
- Lectura de manifests de context packs.
- Servicios de ingesta y retrieval.
- Repositorios RAG.
- Cliente de embeddings de Ollama como referencia.
- `prompt-augmenter` como idea para introducir fragmentos citables.
- CLIs de ingesta/busqueda como herramientas internas.
- Tests con `FakeEmbeddingClient`.
- `docs/RAG.md`, reescrito segun la decision final.

Partes que deben refactorizarse:

- Dimension vectorial hardcodeada a `vector(1024)`.
- Acoplamiento operativo a pgvector y `bge-m3`.
- Ausencia de politicas de corpus aprobado, versionado editorial y umbrales de relevancia.
- Falta de contrato de fuentes/citas integrado con gaps, secciones y reportes.
- Endpoints de inspeccion si se exponen fuera de administracion tecnica.

Partes que deben descartarse:

- RAG como requisito obligatorio de start/reply/reporte.
- Corpus de ejemplo como contenido productivo.
- Retrieval sin citas auditables.
- Dependencia global de pgvector para ejecutar el MVP.

Integracion recomendada del RAG:

- Definir `RetrievalPort` en API.
- Usar `NoopRetrieval` por defecto.
- Para el MVP, priorizar retrieval simple sobre documentos subidos y fuentes internas.
- Incorporar el RAG de `arnau` como adapter opcional solo si hay corpus aprobado o necesidad clara.
- Guardar cada retrieval usado en `agent_runs` o tabla de auditoria equivalente.
- No permitir que retrieval complete hechos ausentes; solo debe citar o recuperar evidencia interna.

Riesgos de integrar ese codigo:

- Aumenta complejidad infra con pgvector, embeddings y modelo adicional.
- Puede bloquear el flujo por fallos de ingesta o embeddings.
- Puede inducir respuestas con contexto no aprobado.
- Puede crear conflictos en `docker-compose.yml`, `pnpm-lock.yaml`, migraciones y config.
- Puede distraer del objetivo MVP: propuesta, gaps, chats, secciones y reporte.

### C. Que se aprovecha de orchestrator-legal

Evaluacion tecnica del orquestador legal:

`orchestrator-legal` contiene RAG de `arnau` mas una especialidad legal acoplada al carril de definicion de problema. Añade `specialty`, prompt legal, columnas de especialidad, selector de prompt, endpoint interno para cambiar especialidad y UI. La auditoria detecta regresiones y riesgos relevantes: perdida de rutas publicas de status/recover, secreto interno expuesto en frontend, retrieval sobre pack `legal` inexistente y uso de `ProblemDefinitionTurn` para una tarea que requiere contrato propio.

Partes reutilizables:

- Prompt legal como borrador de investigacion, no productivo.
- Idea de registrar agente/prompt/especialidad en auditoria futura.
- Tests de routing de prompts como inspiracion.
- Necesidad de contratos separados para dominios sensibles.

Partes que deben refactorizarse:

- Cualquier routing de prompts debe vivir detras de un modelo de modulos/agentes, no de un switch improvisado de sesion.
- La auditoria debe registrar retrieval context si se usa.
- Las rutas internas no deben consumirse desde navegador.
- Legal/regulatorio debe usar contrato propio, no `ProblemDefinitionTurn`.

Partes que deben descartarse:

- Endpoint `switch-specialty` actual.
- UI de selector/switch de especialidad para v1.
- `VITE_INTERNAL_SHARED_SECRET`.
- Retrieval legal automatico.
- Pack `legal` inexistente como dependencia.
- Mezcla de legal con definicion de problema.

Integracion recomendada en el MVP:

- No integrar el orquestador legal en el MVP.
- Implementar un modulo `data_ai_privacy_gap_agent` y, si aplica, un modulo regulatorio declarativo como deteccion de gaps.
- Formular siempre necesidad de revision humana cuando haya incertidumbre sensible.
- Evitar cualquier lenguaje de dictamen legal, clinico, regulatorio o medical device.

Riesgos de integrar ese codigo:

- Regresiones directas de status/recover.
- Exposicion de secretos.
- Scope drift hacia asesoramiento legal.
- Contratos inadecuados.
- Dependencia de RAG/legal sin corpus aprobado.
- Conflictos con el modelo modular recomendado.

### D. Estrategia de rescate/migracion

Rama base recomendada:

- Crear una rama limpia desde `main` o desde la rama actual una vez validado que apunta al core estable.
- No partir de `arnau`.
- No partir de `orchestrator-legal`.

Cherry-pick selectivo o reimplementacion:

- Para `main`: evolucion incremental directa.
- Para `arnau`: cherry-pick selectivo solo de piezas RAG si se decide incorporarlas; preferible empezar por interfaces y tests.
- Para `orchestrator-legal`: reimplementacion de ideas, no cherry-pick de implementacion.

Orden recomendado de rescate:

1. Verificar core actual: start, primera pregunta, reply, resume/status/recover.
2. Introducir modelo de propuesta/documentos/fuentes.
3. Introducir gaps y chats por modulo.
4. Estabilizar modulo problema y generar seccion problema.
5. Implementar modulo solucion y seccion solucion.
6. Implementar datos/IA/privacidad como gap detection.
7. Implementar medical device condicional.
8. Implementar recursos/piloto/viabilidad.
9. Implementar reporte estructurado y PDF.
10. Evaluar retrieval opcional.
11. Rescatar RAG avanzado desde `arnau` solo si hay decision explicita.

PRs tecnicas necesarias:

- PR 1: verificacion y fixes del core path de `main`.
- PR 2: contratos y migraciones de propuesta/documentos/fuentes.
- PR 3: gaps y dashboard de madurez.
- PR 4: chats por modulo y adaptacion de `problem_definition_agent`.
- PR 5: writers de seccion problema/solucion.
- PR 6: modulos sanitario-regulatorios acotados.
- PR 7: reporte estructurado.
- PR 8: exportacion PDF.
- PR 9: privacidad, auditoria y acceso tecnico.
- PR 10: retrieval opcional/no-op y, si procede, adapter RAG.

Como evitar merges caoticos:

- No fusionar ramas completas.
- Revisar cambios por carpeta y responsabilidad.
- Mantener `main` como base de comparacion.
- Reimplementar legal con contrato propio si se necesita.
- Aislar RAG en una PR separada y reversible.
- No mezclar cambios de `docker-compose`, migraciones, API, frontend y RAG en una sola PR.
- Ejecutar tests de contratos e integracion en cada PR que toque schemas o persistencia.

### E. Riesgos de merge

Conflictos probables:

- `apps/api/src/app.ts`
- `apps/api/src/services/problem-definition-service.ts`
- `apps/api/src/services/llm-orchestrator.ts`
- `apps/api/src/services/prompt-service.ts`
- `apps/api/src/repositories/session-store.ts`
- `contracts/schemas/proposal-start.request.schema.json`
- `infra/n8n/workflows/proposal_start_v1.json`
- `docker-compose.yml`
- `pnpm-lock.yaml`
- `apps/web/src/*`

Diferencias de dependencias:

- `arnau` añade `yaml`, pgvector y variables `EMBEDDING_*`/`RAG_*`.
- `orchestrator-legal` hereda RAG y añade campos/especialidad.
- `main` no requiere pgvector ni embeddings.

Diferencias de estructura de carpetas:

- `main` no tiene `apps/api/src/rag` ni `context-packs`.
- `arnau` agrega RAG lateral.
- `orchestrator-legal` añade documentacion legal en raiz y cambios UI/API.

Diferencias de modelos de datos:

- `main`: sesiones, turnos, runs, snapshots y eventos.
- `arnau`: tablas RAG con pgvector.
- `orchestrator-legal`: columnas de especialidad y reset de contexto.
- Ninguna rama tiene todavia el modelo completo de propuestas/gaps/secciones/reporte.

Diferencias de APIs:

- `main`: rutas internas para start/reply/problem-definition y publicas para session/status/recover.
- `arnau`: añade endpoints de inspeccion RAG.
- `orchestrator-legal`: añade endpoint interno de switch y pierde rutas publicas de status/recover segun auditoria.

Riesgos sobre tests:

- Tests RAG pueden requerir DB con pgvector o fakes especificos.
- Tests legales pueden validar un modelo que no debe entrar en el MVP.
- Tests actuales no cubren todavia reporte, documentos, gaps ni PDF.

Riesgos sobre n8n/Ollama:

- Workflows pueden divergir si se editan en n8n sin reexportar.
- n8n `latest` puede cambiar comportamiento.
- Ollama local puede tener latencias altas o calidad variable.
- RAG introduce un segundo modelo de Ollama para embeddings.

### F. Decisiones arquitectonicas recomendadas

Decidir antes de escribir codigo:

- Cuales son los modulos obligatorios para generar el primer reporte.
- Si el MVP v1.0 incluye retrieval simple sobre documentos o solo deja el puerto preparado.
- Si `contracts` se convierte en paquete workspace o se generan tipos por build.
- Formato canonico de `ProposalReport`.
- Motor de PDF.
- Politica de retencion/borrado.
- Proteccion minima de sesiones para piloto con usuarios reales.
- Modelo Ollama y limites de latencia aceptables.
- Que vistas de auditoria son para administradores y cuales para proponentes.

ADRs recomendadas:

- ADR-001: `main` como rama base y estrategia multi-rama.
- ADR-002: JSON Schema como fuente de verdad contractual.
- ADR-003: separacion `Proposal` / `ModuleChat` / `AgentRun`.
- ADR-004: Ollama local mediante `AiProviderPort`.
- ADR-005: n8n como orquestador ligero, API como owner de reglas.
- ADR-006: RAG opcional detras de `RetrievalPort`.
- ADR-007: no incorporar `orchestrator-legal` en MVP v1.
- ADR-008: reporte estructurado como fuente de PDF.
- ADR-009: privacidad por defecto y no PHI/PII real en MVP.

## 10. Modulos frontend

Modulos recomendados:

- `proposal-intake`: alta de propuesta, titulo, objetivo, texto inicial, documentos y aviso de privacidad.
- `document-processing`: estado de extraccion, hashes, errores y documentos soportados.
- `proposal-dashboard`: modulos, gaps, estado general, siguiente accion y progreso descriptivo.
- `module-chat`: chat reusable por modulo, una pregunta principal por turno, estado de gap y respuestas.
- `section-review`: revision de secciones generadas, fuentes usadas y gaps abiertos.
- `report-preview`: reporte estructurado, advertencias, version y fuentes.
- `pdf-export`: estado de generacion, version exportada y descarga.
- `resume-proposal`: retomar propuesta por identificador local del piloto.
- `technical-audit`: vista restringida para runs, prompts, modelos, eventos y errores.

El frontend no debe llamar endpoints internos ni incluir secretos. Debe consumir endpoints publicos de API o webhooks n8n expuestos para el flujo.

## 11. Modulos API/Fastify

Modulos recomendados:

- `routes/public`: proposal start/status/resume, document upload, module chat, report, pdf.
- `routes/internal`: endpoints usados por n8n con secreto interno server-side.
- `domain/proposals`: estados de propuesta y reglas de transicion.
- `domain/gaps`: estados de gaps, severidad descriptiva y resolucion.
- `domain/modules`: reglas por modulo de madurez.
- `services/proposal-start`: intake, normalizacion, brief y creacion.
- `services/document-service`: extraccion, hash, versionado y fuentes.
- `services/gap-analysis-service`: gaps iniciales y por modulo.
- `services/module-chat-service`: preguntas/respuestas por modulo.
- `services/section-generation-service`: writers de secciones.
- `services/report-service`: composicion de `ProposalReport`.
- `services/pdf-export-service`: renderizado y metadatos PDF.
- `services/ai-orchestrator`: proveedor IA, validacion JSON, repair y auditoria.
- `repositories/*`: acceso a PostgreSQL.

La API debe seguir siendo propietaria de reglas, contratos y persistencia. n8n coordina, pero no decide.

## 12. Modelo de datos PostgreSQL

Modelo objetivo minimo:

- `proposals`: entidad principal, titulo, objetivo, owner, origen, estado, version activa, timestamps.
- `proposal_documents`: documentos/inputs, nombre, tipo, hash, estado de extraccion, texto extraido, version, flags de privacidad.
- `proposal_sources`: fragmentos trazables desde descripcion inicial, documento o respuesta.
- `structured_briefs`: brief inicial por version, schema version y run asociado.
- `maturity_modules`: catalogo o enum de modulos del MVP.
- `proposal_gaps`: gaps por propuesta/modulo, estado, origen, severidad descriptiva, fuente y resolucion.
- `module_chats`: conversacion por propuesta/modulo, estado y version.
- `chat_turns`: pregunta, respuesta, estado, gap asociado, run asociado y fuentes.
- `generated_sections`: secciones versionadas, estado, texto estructurado, fuentes y gaps abiertos.
- `proposal_reports`: reporte estructurado, version, estado, secciones incluidas y warnings.
- `pdf_exports`: PDF generado, ruta/blob metadata, hash, version y estado.
- `agent_runs`: extender el modelo actual para todos los propositos IA.
- `audit_events`: eventos append-only de cambios relevantes.
- `request_executions`: opcion recomendada para formalizar status/recovery hoy disperso por runs/turns.

Estados clave:

- Propuesta: `draft`, `intake_processing`, `needs_clarification`, `module_in_progress`, `sections_ready`, `report_ready`, `exported`, `archived`, `failed`.
- Gap: `detected`, `question_pending`, `awaiting_user`, `answered`, `resolved`, `partially_resolved`, `not_applicable`, `needs_human_review`, `deferred`.
- Seccion: `not_started`, `insufficient_information`, `draft_generated`, `needs_user_review`, `approved_by_user`, `updated`, `locked_for_report`.

Migracion recomendada:

- No eliminar `proposal_sessions` de golpe.
- Añadir nuevas tablas y adaptar servicios por capas.
- Mantener vistas/adaptadores temporales para el modulo problema.
- Migrar `conversation_turns` a `chat_turns` o crear tabla nueva y dejar la actual como compatibilidad durante una fase.

## 13. Integracion con Ollama

Ollama debe seguir siendo el proveedor IA local inicial.

Comportamiento recomendado:

- API llama a Ollama server-side, nunca desde frontend.
- Modelo configurable por entorno.
- `stream: false` inicialmente para simplificar contratos.
- Salida solicitada como JSON estructurado.
- Validacion AJV posterior obligatoria.
- Reparacion JSON una sola vez con prompt versionado.
- Timeouts por proposito IA.
- Persistencia de modelo, parametros, prompt, prompt hash, input, raw output, validated output, metricas y error.
- No fallback automatico a proveedor externo en el MVP.

El cliente actual `OllamaClient` es una base valida, pero debe renombrarse o envolverlo detras de un puerto de proveedor IA para no acoplar todo el dominio a Ollama.

## 14. Abstraccion de proveedor IA

Crear una interfaz interna tipo `AiProviderPort`:

- `completeJson(request): Promise<AiJsonResult>`
- `providerName`
- `modelName`
- `modelParams`
- errores tipados: timeout, unreachable, invalid response, provider rejected.

La abstraccion debe vivir en API, no en frontend. El dominio no debe saber si el proveedor es Ollama u otro futuro proveedor.

Componentes:

- `OllamaChatProvider`: implementacion actual.
- `JsonRepairService`: usa el mismo puerto con prompt `json-repair`.
- `AiRunRecorder`: crea/actualiza `agent_runs`.
- `PromptRegistry`: resuelve prompts por nombre/version.
- `SchemaRegistry`: valida outputs por contrato.

No debe implementarse todavia un proveedor externo. Solo debe quedar preparada la sustitucion futura.

## 15. Integracion con n8n

n8n debe seguir como orquestador ligero y visible:

- recibe webhooks del frontend o proxy web;
- llama endpoints internos de API con secreto server-side;
- propaga errores controlados a la UI;
- permite observar ejecuciones y reintentos;
- mantiene workflows exportados versionados en `infra/n8n/workflows`.

Workflows objetivo:

- `proposal_start_v1`: crear propuesta, procesar documentos, brief, gaps iniciales y primer modulo.
- `proposal_reply_v1`: registrar respuesta y avanzar modulo.
- `module_chat_turn_v1`: ejecutar turno de modulo.
- `section_generate_v1`: generar seccion versionada.
- `report_compose_v1`: componer reporte.
- `pdf_export_v1`: disparar exportacion PDF.

Regla clave: los nodos n8n no deben contener logica de negocio critica. La API, los schemas y prompts versionados son la fuente de verdad.

## 16. Modulo de documentos

Responsabilidades:

- Recibir documentos soportados y texto pegado.
- Calcular hash SHA-256.
- Guardar nombre, tipo MIME, tamaño, version y estado.
- Extraer texto si es PDF con texto embebido.
- Crear `proposal_sources` desde fragmentos de documento y contexto inicial.
- Marcar posibles datos sensibles.
- Mantener errores de extraccion recuperables.
- Asociar fuentes a gaps, preguntas, respuestas, secciones y reporte.

Estados recomendados:

- `uploaded`
- `extracting`
- `extracted`
- `unsupported`
- `failed`
- `flagged_sensitive`
- `removed`

El MVP no debe incluir OCR. PDFs escaneados deben quedar como `unsupported` o `failed` con mensaje claro.

## 17. Extraccion de texto de PDFs/documentos

La extraccion actual con `pdf-parse` sirve como base para PDFs con texto extraible.

Reglas:

- Limitar tamaño y caracteres procesados.
- Guardar hash y metadatos antes de enviar a IA.
- No enviar el documento completo si una tarea solo necesita fragmentos.
- Registrar warnings cuando el PDF no tenga texto suficiente.
- No aceptar datos reales de pacientes; mostrar aviso y marcar contenido sospechoso si se detecta.
- Evitar OCR en MVP.

El texto extraido debe convertirse en fuentes internas con identificadores estables. El reporte debe citar esas fuentes, no raw blobs completos.

## 18. Modulo RAG/retrieval si aplica al MVP

RAG avanzado no debe ser requisito del MVP.

Arquitectura recomendada:

- `RetrievalPort` con metodo `retrieve(query, scope): RetrievalResult[]`.
- `NoopRetrieval` por defecto.
- `UploadedDocumentsRetrieval` simple sobre fuentes de la propuesta, sin embeddings, si se necesita recuperar fragmentos.
- `PgvectorRetrievalAdapter` futuro basado en `arnau`, detras de feature flag y migracion separada.

Uso permitido:

- Recuperar fragmentos internos de documentos subidos por el usuario.
- Citar fuentes en secciones y reportes.
- Ayudar a encontrar evidencia dentro de una propuesta.

Uso no permitido:

- Autocompletar hechos ausentes.
- Usar corpus externo no aprobado.
- Hacer RAG obligatorio para completar el flujo.
- Bloquear la demo si embeddings/pgvector no estan disponibles.

## 19. Modulo de analisis de gaps

Responsabilidades:

- Crear gaps iniciales desde `structured_brief`, documentos y ausencia de informacion.
- Clasificar gaps por modulo.
- Asociar cada gap a fuente, ausencia o inferencia controlada.
- Mantener severidad descriptiva, no scoring.
- Crear preguntas candidatas o preparar el siguiente chat.
- Actualizar estado del gap cuando el usuario responde.

Modulos de gaps:

- `problem`
- `solution`
- `data_ai_privacy`
- `medical_device`
- `resources_pilot_viability`
- `metrics`
- `report`

El analisis puede usar IA, pero las transiciones de estado y limites deben vivir en codigo y schemas.

## 20. Modulo de chats por seccion

Cada modulo debe tener un chat resumible:

- Una pregunta principal por turno.
- Maximo tres diagnosis/hallazgos por turno.
- Cada pregunta asociada a uno o varios gaps.
- Cada respuesta asociada al turno, modulo y fuentes resultantes.
- Si la respuesta es vacia, demasiado vaga o "no lo se", no se avanza estado; se reformula.
- El modulo problema puede reutilizar `ProblemDefinitionService` como primer caso.
- Otros modulos deben tener contratos propios si su dominio no encaja.

El usuario debe poder salir y volver a cada modulo sin perder estado.

## 21. Modulo de generacion de secciones

Responsabilidades:

- Generar secciones versionadas desde fuentes internas.
- Usar solo brief, documentos, respuestas y gaps resueltos/pendientes.
- Listar fuentes por afirmacion o bloque.
- Marcar incertidumbres y gaps abiertos.
- No inventar informacion.
- Permitir regeneracion cuando cambien respuestas.
- Requerir revision del usuario antes de incluir en reporte.

Secciones MVP:

- Problema.
- Solucion.
- Datos/IA/privacidad y necesidades de revision.
- Medical device condicional.
- Recursos/piloto/viabilidad.
- Metricas de exito.

## 22. Modulo de reporte final

El reporte debe ser un artefacto estructurado:

- propuesta y metadatos;
- resumen ejecutivo;
- problema;
- solucion;
- usuarios/beneficiarios;
- gaps por modulo;
- datos/IA/privacidad;
- medical device si aplica;
- recursos, piloto, dependencias y metricas;
- gaps abiertos;
- fuentes internas;
- advertencias de no dictamen;
- version e historial.

El reporte se compone desde secciones versionadas y gaps, no desde texto libre improvisado. Debe quedar persistido antes de exportar PDF.

## 23. Exportacion PDF

La exportacion PDF debe partir de `ProposalReport`.

Requisitos:

- Incluir version, fecha, identificador de propuesta y estado.
- Incluir advertencia de no aprobacion/no dictamen.
- Incluir gaps abiertos.
- Incluir fuentes internas o referencias trazables.
- No incluir raw model output.
- Guardar hash/metadatos del PDF.
- Bloquear la version exportada para auditoria.
- Permitir regenerar si cambia el reporte.

Decision abierta: motor PDF. Opciones razonables: Playwright/Chromium para render HTML controlado o una libreria server-side de PDF. Debe decidirse por estabilidad local y facilidad de versionado.

## 24. Trazabilidad/auditoria

Trazabilidad obligatoria:

- Documento -> fuente -> gap -> pregunta -> respuesta -> seccion -> reporte -> PDF.
- Run IA -> prompt version/hash -> modelo -> input contract -> output contract -> resultado.
- Cambio de estado -> actor -> evento -> timestamp.
- Retrieval -> query -> fuentes recuperadas -> run/seccion que las uso.

La auditoria actual con `agent_runs`, `session_snapshots` y `session_events` es una base buena. Debe ampliarse a propuesta, documentos, gaps, secciones y reportes.

Las vistas de auditoria deben distinguir:

- vista usuario: explicacion trazable y legible;
- vista admin tecnico: raw outputs, payloads, errores, prompt hashes y metricas.

## 25. Seguridad y privacidad

Principios:

- Privacidad por defecto.
- No tratar datos reales de pacientes en MVP.
- No enviar contenido a proveedores externos.
- Ollama local como proveedor inicial.
- Secretos internos solo server-side.
- `session_id` aceptable solo para demo local, no para piloto con usuarios reales sin proteccion adicional.

Controles recomendados:

- Aviso explicito antes de subir contenido.
- Deteccion basica de posibles PHI/PII y flag de propuesta.
- Limites de tamaño y caracteres.
- Minimizacion de contexto enviado al modelo.
- Restriccion de raw outputs a admin tecnico.
- Politica de retencion y borrado.
- Logs sin contenido sensible por defecto.
- Configuracion que falle si secretos inseguros se usan fuera de `APP_ENV=local`.

No incorporar el patron de `orchestrator-legal` que expone secreto interno al frontend.

## 26. Estrategia de tests

Cobertura minima por PR:

- Contratos: todos los payloads contra JSON Schemas.
- Dominio: estados de propuesta, gaps, chats, secciones y reglas de una pregunta.
- Servicios API: start, reply, gap analysis, section generation, report compose y PDF metadata.
- Persistencia: migraciones, constraints, idempotencia, resume/recovery.
- IA: fakes de proveedor para outputs validos, JSON invalido reparable y JSON invalido no reparable.
- Documentos: PDF con texto, PDF sin texto, texto largo, hash y errores.
- Frontend: validacion, estado de loading/recovery, dashboard, chat y reporte.
- Smoke: happy path local sin depender de modelo real mediante fake o fixture.

Comandos actuales utiles:

- `pnpm test:contracts`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:smoke`
- `pnpm test:web`
- `pnpm verify`

Cada cambio de schema debe incluir fixtures validos e invalidos.

## 27. Estrategia de migracion desde la version actual

Fase 1: estabilizar core actual.

- Ejecutar migraciones.
- Verificar n8n, Ollama y Postgres.
- Confirmar start -> first question -> reply -> resume/status/recover.
- Corregir fallos sin ampliar scope.

Fase 2: introducir entidades nuevas.

- Añadir `proposals`, `proposal_documents`, `proposal_sources`, `proposal_gaps`, `module_chats`, `chat_turns`, `generated_sections`, `proposal_reports`, `pdf_exports`.
- Mantener compatibilidad con `proposal_sessions`.
- Mapear el flujo actual al modulo `problem`.

Fase 3: modularizar.

- Convertir problem definition en un modulo.
- Añadir solution.
- Añadir data/AI/privacy.
- Añadir medical device condicional.
- Añadir resources/pilot/viability.

Fase 4: reporte y PDF.

- Persistir secciones.
- Componer reporte.
- Exportar PDF.
- Añadir auditoria end-to-end.

Fase 5: retrieval opcional.

- Crear `RetrievalPort`.
- Usar no-op o documentos subidos.
- Evaluar adapter RAG desde `arnau` si hay corpus aprobado.

## 28. Backlog tecnico por PRs

PR 1: validacion y hardening del core actual.

- Ejecutar happy path.
- Corregir errores.
- Documentar setup local.
- Asegurar status/recover.

PR 2: contratos base del MVP Clinic.

- Schemas de propuesta, documento, fuente, gap, modulo, seccion y reporte.
- Fixtures.
- Tests de contratos.

PR 3: migraciones de producto.

- Nuevas tablas.
- Indices y constraints.
- Eventos/auditoria.
- Tests de persistencia.

PR 4: modulo documental.

- Documentos, hashes, extraccion, fuentes y flags.
- UI de documentos.

PR 5: gap analysis.

- Servicio de gaps.
- Dashboard de propuesta.
- Reglas de estado.

PR 6: chats por modulo.

- Generalizar turnos.
- Adaptar problem definition.
- Mantener una pregunta por turno.

PR 7: seccion problema y solucion.

- Writers.
- Revision de usuario.
- Fuentes.

PR 8: modulos sanitario-regulatorios acotados.

- Datos/IA/privacidad.
- Medical device condicional.
- Recursos/piloto/viabilidad.

PR 9: reporte final.

- `ProposalReport`.
- Composicion.
- Vista frontend.

PR 10: export PDF.

- Motor PDF.
- Metadata.
- Hash y version bloqueada.

PR 11: privacidad y acceso.

- Avisos, flags, retencion.
- Vistas admin vs usuario.
- Secretos sin defaults inseguros fuera de local.

PR 12: retrieval opcional.

- `RetrievalPort`.
- `NoopRetrieval`.
- Adapter sobre documentos subidos.
- Evaluacion de RAG `arnau` como PR separada si procede.

## 29. Riesgos tecnicos

Riesgos altos:

- Scope creep: intentar legal, RAG avanzado, costes o scoring antes de cerrar reporte.
- Latencias y calidad variable de Ollama local.
- Modelo de datos actual insuficiente si no se refactoriza pronto.
- Falta de trazabilidad de afirmaciones en secciones/reportes.
- Datos sensibles reales subidos por error.
- Merge accidental de `orchestrator-legal`.

Riesgos medios:

- Duplicacion de tipos API/web.
- n8n `latest` y workflows editados fuera de git.
- Timeouts en start/reply.
- Incompatibilidades al introducir pgvector.
- Tests lentos o fragiles si dependen de servicios reales.
- Reporte PDF dificil de mantener si no parte de estructura estable.

Mitigaciones:

- Mantener PRs pequenas y reversibles.
- Contratos primero.
- Fakes de IA en tests.
- Recovery/idempotencia.
- RAG opcional.
- Legal fuera del MVP core.
- ADRs antes de cambios estructurales.

## 30. Decisiones abiertas

- Que modulos son obligatorios para exportar el primer PDF.
- Si solucion y problema bastan para una demo temprana o si todos los modulos PRD son obligatorios.
- Motor exacto de PDF.
- Modelo Ollama del piloto y latencias aceptables.
- Si se requiere autenticacion minima antes de usuarios reales.
- Politica de retencion y borrado.
- Nivel de deteccion automatica de datos sensibles en MVP.
- Si `contracts` se convierte en paquete workspace.
- Si el RAG queda totalmente fuera de v1.0 o como adapter no-op/documental.
- Existencia y aprobacion de un context pack HealthGenAI/Hospital Clinic.
- Formato visual del reporte requerido por Hospital Clinic.
- Que puede ver un proponente frente a un administrador tecnico.

