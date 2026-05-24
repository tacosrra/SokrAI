# Auditoria multi-rama de SokrAI

Fecha de auditoria: 2026-05-24  
Worktrees revisadas:

- `main`: `/home/tacosrra/src/personal/SokrAI`
- `arnau`: `/home/tacosrra/src/personal/SokrAI-worktrees/arnau`
- `orchestrator-legal`: `/home/tacosrra/src/personal/SokrAI-worktrees/orchestrator-legal`

Nota de alcance: esta auditoria se ha hecho con lectura estatica y comandos git seguros. No se han ejecutado merges, cherry-picks, borrados ni instalacion de dependencias. La worktree principal esta actualmente en `chore/multi-branch-discovery`, apuntando al mismo commit que `main`/`origin/main` (`46812c6`), con ficheros no trackeados ajenos a esta auditoria (`.archon/`, `docs/prompts/`).

## 1. Resumen ejecutivo

La rama que debe servir como base del MVP es `main`. Contiene el nucleo que encaja con el objetivo v1: intake de propuesta, normalizacion, extraccion de `structured_brief`, persistencia PostgreSQL, turnos resumibles, prompts versionados, workflows n8n y tests de contratos/unidad/integracion. No parece una version pulida, pero es la base mas alineada con los acuerdos del repositorio.

`arnau` contiene una implementacion RAG bastante completa como modulo lateral: migracion `002_rag.sql`, tablas pgvector, ingesta desde `context-packs`, chunking, embeddings por Ollama, retrieval top-K, endpoints de inspeccion y tests. La propia documentacion de la rama indica que no esta conectada al `problem_definition_agent`. Esto es positivo para el MVP: se puede rescatar como interfaz/adaptador opcional, pero no debe convertirse en dependencia del happy path del Hospital Clinic.

`orchestrator-legal` contiene `arnau` mas un intento de especializacion legal del orquestador. La idea reusable es limitada: prompt legal versionado, selector de prompt por `specialty`, campos de auditoria y algunos tests. La implementacion concreta no debe entrar tal cual en el MVP: mezcla legal con el lane de definicion de problema, introduce un endpoint interno accesible desde el frontend con secreto compartido, conecta RAG a un pack `legal` que no existe en la rama, y regresa funcionalidad del flujo de recuperacion de requests al eliminar rutas publicas de estado/recover en `app.ts`.

Recomendacion: crear una rama nueva limpia desde `main`, rescatar de `arnau` piezas de RAG solo como modulo opcional detras de interfaces, y rescatar de `orchestrator-legal` unicamente el prompt/documentacion/test ideas despues de redisenar la especializacion legal como fase posterior. Para el MVP del Hospital Clinic, no incorporar legal ni RAG en el camino obligatorio.

## 2. Estado de cada rama

### main

Estado observado:

- Rama base estable relativa: `46812c6`.
- Monorepo pnpm con `apps/api`, `apps/web`, `contracts/schemas`, `db/migrations`, `infra/n8n/workflows`, `prompts/v1`, `tests`.
- Worktree local no limpia por archivos no trackeados, pero no parecen parte del producto principal auditado.
- No contiene RAG ni especializacion legal.

Capacidades:

- API Fastify con endpoints internos para `start-context`, `append-reply`, `problem-definition/run`.
- Endpoints publicos de sesion, estado de request y recuperacion: `/api/v1/sessions/:sessionId`, `/api/v1/requests/:requestId`, `/api/v1/requests/:requestId/recover`.
- Persistencia PostgreSQL para sesiones, turnos, agent runs, snapshots y eventos.
- Prompts versionados en `prompts/v1`.
- Workflows n8n versionados para `proposal_start_v1`, `proposal_reply_v1`, `agent_problem_definition_v1`.
- Frontend React/Vite para crear propuestas, continuar sesiones y visualizar estado.

Valor para MVP:

- Alto. Es la base correcta para intake, normalizacion, persistencia y flujo socratico resumible.

Riesgos:

- El usuario ya advierte que es estable pero no funcional; esta auditoria no ha ejecutado tests.
- El flujo depende de n8n + Ollama + Postgres, por lo que la validacion runtime debe hacerse despues.
- Hay trabajo no trackeado local que no debe mezclarse automaticamente.

### arnau

Estado observado:

- HEAD: `08c03e3`.
- Diverge de `main` desde `6498081`.
- Anade un commit claro de RAG: `f2ecfbf Add RAG module with embedding and search capabilities`.
- Tiene cambios adicionales de entorno de tests (`.env.test.example`, `tests/vitest-load-env.ts`) y README.

Capacidades:

- Todo lo de `main`, mas modulo RAG.
- Migracion `002_rag.sql` con `context_packs`, `rag_documents`, `rag_chunks`, `rag_retrievals`.
- Uso de `pgvector` con `vector(1024)` e indice HNSW cosine.
- Ingesta CLI: `apps/api/scripts/rag-ingest.ts`.
- Busqueda CLI: `apps/api/scripts/rag-search.ts`.
- Endpoints de inspeccion: `GET /api/v1/rag/packs`, `GET /api/v1/rag/search`.
- Context packs versionables en filesystem.
- Tests unitarios e integracion para chunking, manifest, prompt augmenter, ingesta y retrieval.

Valor para MVP:

- Medio. Es util como rail tecnico para contexto futuro, pero no es necesario para el primer happy path.
- Debe quedar opcional y no bloquear intake, problem definition, persistencia ni resume.

Riesgos:

- Aumenta requisitos infra: imagen `pgvector/pgvector:pg16`, extension `vector`, modelo `bge-m3`, dimensiones fijas.
- Si se fusiona sin criterio, cambia docker-compose, env, lockfile, config y superficie HTTP.
- No hay conexion al agente principal, por diseno. No mejora todavia la maduracion de propuestas del Hospital Clinic.

### orchestrator-legal

Estado observado:

- HEAD: `2313e97`.
- Contiene RAG de `arnau` mas commits de especializacion legal.
- Anade documentos en raiz: `README_ORCHESTRATOR_LEGAL.md`, `TASKS_legal-prompt-specialization-v1.md`, `IMPL_legal-prompt-specialization-v1.md`.
- Anade migracion `003_add_specialty_columns.sql`.
- Modifica API, frontend, contrato de start, workflow n8n de start y tests.

Capacidades:

- Selector de `specialty` (`default` | `legal`) en `proposal-start.request.schema.json`.
- Prompt nuevo `prompts/v1/problem-definition-agent-legal.md`.
- `PromptService` resuelve prompt legal si `specialty === "legal"`.
- `ProblemDefinitionService` lee `session.specialty`/`current_specialty`, filtra turnos por `context_reset_at` e intenta retrieval para legal.
- Endpoint interno `POST /internal/sessions/switch-specialty`.
- Frontend permite seleccionar especialidad al inicio y cambiarla durante sesion.
- Tests para prompt routing, legal specialty y migracion de columnas.

Valor para MVP:

- Bajo como implementacion directa. La idea tiene valor futuro, pero el MVP debe priorizar un lane de definicion de problema, no una rama legal.

Riesgos:

- Rompe/regresa rutas publicas de estado y recuperacion en `apps/api/src/app.ts`: en esta rama ya no aparecen `GET /api/v1/requests/:requestId` ni `POST /api/v1/requests/:requestId/recover`, aunque frontend/tests siguen usandolas.
- El frontend llama a `/internal/sessions/switch-specialty` con `VITE_INTERNAL_SHARED_SECRET`, exponiendo un secreto interno al navegador.
- El retrieval legal usa `packs: ['legal']`, pero la rama no trae `context-packs/legal`; solo hay `general_glossary` y fixtures `sample_pack`.
- La semantica legal reutiliza el schema `ProblemDefinitionTurn`, que no modela bien frameworks regulatorios, datos, IP, cumplimiento o medical device.
- Introduce legal como comportamiento activo antes de cerrar el core path v1.

## 3. Diferencias funcionales entre ramas

| Area | main | arnau | orchestrator-legal |
| --- | --- | --- | --- |
| Intake propuesta | Si | Si | Si, con `specialty` opcional |
| Problema socratico | Si | Si | Si, pero con prompt legal opcional |
| Persistencia/resume | Si | Si | Si, con columnas de especialidad |
| Estado/recover requests | Si | Si | Riesgo: rutas no registradas en `app.ts` |
| RAG | No | Si, lateral/no conectado | Si, conectado solo para legal |
| Legal | No | No | Si, como especialidad dentro del mismo lane |
| Frontend | Flujo base | Flujo base | Selector legal + switch en sesion |
| n8n | Workflows v1 base | Workflows v1 base | Start workflow reenvia `specialty` |

## 4. Diferencias tecnicas entre ramas

`arnau` introduce:

- Dependencia `yaml`.
- Configuracion RAG en `AppConfig`: `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `EMBEDDING_TIMEOUT_MS`, `EMBEDDING_BATCH_SIZE`, `RAG_DEFAULT_TOP_K`, `RAG_PACKS_DIR`.
- Docker cambia Postgres a `pgvector/pgvector:pg16` y monta `context-packs`.
- Init SQL crea extension `vector`.
- Nuevos schemas RAG.
- Nuevo decorador `app.services.rag`.

`orchestrator-legal` introduce ademas:

- `specialty` en contrato de start y tipos API/web.
- Columnas `specialty`, `current_specialty`, `context_reset_at` en sesiones; `specialty` en `agent_runs` y `session_snapshots`.
- Prompt legal versionado.
- Mutacion de prompt routing en `LlmOrchestrator`.
- Endpoint interno para cambio de especialidad.
- UI y estilos de selector/switch.
- Intento de retrieval legal dentro del `ProblemDefinitionService`.

## 5. Que contiene main

Piezas principales:

- `contracts/schemas/structured-brief.schema.json`: contrato central para brief.
- `contracts/schemas/proposal-start.*`, `proposal-reply.*`, `problem-definition-turn.schema.json`, `request-execution.response.schema.json`, `error-response.schema.json`.
- `apps/api/src/app.ts`: composicion Fastify, servicios, rutas internas y publicas.
- `apps/api/src/services/proposal-start-service.ts`: valida request, extrae PDF opcional, normaliza texto, invoca LLM, persiste sesion.
- `apps/api/src/services/proposal-reply-service.ts`: persiste respuesta del usuario y prepara turno.
- `apps/api/src/services/problem-definition-service.ts`: ejecuta agente, aplica guardrails, persiste runs/snapshots/turnos.
- `apps/api/src/domain/problem-definition.ts`: reglas deterministas de completion, vaguedad, fallback question, max 3 diagnosis, una pregunta.
- `apps/api/src/services/llm-orchestrator.ts`: prompt loading, validacion JSON, repair una vez.
- `db/migrations/001_initial.sql`: esquema auditable completo para v1.
- `infra/n8n/workflows/*.json`: workflows de inicio, reply y agente.
- `prompts/v1/*.md`: prompts versionados.
- `apps/web`: demo UI para crear/continuar sesiones.
- `tests`: contratos, unidad, integracion, smoke y fixtures.

## 6. Que contiene arnau

Ademas de lo anterior:

- `apps/api/src/rag/*`: modulo RAG completo.
- `apps/api/src/routes/rag-inspection.ts`: endpoints GET de inspeccion.
- `apps/api/scripts/rag-ingest.ts` y `apps/api/scripts/rag-search.ts`: herramientas CLI.
- `db/migrations/002_rag.sql`: tablas e indices RAG.
- `context-packs/general_glossary/*`: pack de ejemplo.
- `docs/RAG.md`: documentacion operativa.
- `contracts/schemas/rag-*.schema.json`: contratos HTTP de inspeccion.
- `tests/unit/rag/*`, `tests/integration/rag/*`, `tests/helpers/fake-embedding-client.ts`: cobertura del modulo.

## 7. Que contiene orchestrator-legal

Ademas de `arnau`:

- `prompts/v1/problem-definition-agent-legal.md`.
- `db/migrations/003_add_specialty_columns.sql`.
- Cambios en `ProposalStartService`, `ProblemDefinitionService`, `LlmOrchestrator`, `PromptService`, `SessionStore`.
- Cambio en `proposal-start.request.schema.json` para aceptar `specialty`.
- Cambio de `infra/n8n/workflows/proposal_start_v1.json` para reenviar `specialty`.
- Cambios en `apps/web` para selector y cambio de especialidad.
- Tests: `legal-specialty.test.ts`, `specialty-migration-smoke.test.ts`, `prompt-routing.test.ts`.
- Documentos de plan/implementacion legal en raiz.

## 8. Analisis de la implementacion RAG de arnau

### Que hace

Implementa un pipeline RAG lateral:

1. Lee packs desde `context-packs/<pack>/pack.yaml`.
2. Descubre fuentes `.md`, `.markdown`, `.txt`, `.pdf`.
3. Carga texto, normaliza y trocea por markdown o texto plano.
4. Genera embeddings con Ollama `/api/embed`.
5. Persiste packs, documentos, chunks y embeddings en PostgreSQL + pgvector.
6. Busca top-K por similitud coseno.
7. Registra auditoria de retrievals.
8. Expone inspeccion por CLI y GET HTTP.

### Como esta integrada

Esta integrada en la composicion de la API como `rag = buildRagModule(...)` y como `app.services.rag`. Registra rutas de inspeccion en `app.ts`.

No esta integrada en `ProblemDefinitionService`, `LlmOrchestrator` ni workflows n8n. `docs/RAG.md` lo declara explicitamente como independiente del lane `problem_definition_agent`.

### Dependencias

- PostgreSQL con extension `vector`.
- Imagen Docker `pgvector/pgvector:pg16`.
- Ollama embeddings, default `bge-m3`.
- Dimension fija `1024` en SQL y config.
- Dependencia npm `yaml`.
- Context packs en filesystem montado.

### Calidad

Fortalezas:

- Separacion razonable por servicios/repositorios.
- Contratos JSON para inspeccion.
- Migracion aditiva.
- Auditoria en `rag_retrievals`.
- Tests de chunking, manifest, prompt augmenter, ingesta y retrieval.
- Ingesta CLI en lugar de endpoint de escritura, reduciendo superficie.

Debilidades:

- Dimension vectorial hardcodeada a `vector(1024)`.
- Retrieval solo semantico top-K, sin reranking ni control de relevancia minima.
- No hay politicas de corpus sanitario/legal real, versionado editorial o aprobacion de fuentes.
- No hay integracion de citations con schemas de agentes actuales.
- Eleva complejidad infra para un v1 que no necesita RAG.

### Riesgos

- Bloquear el MVP por modelo de embeddings, pgvector o ingesta de packs.
- Confundir "tener RAG" con mejorar la maduracion de problema; no esta conectado al flujo principal.
- Deuda futura si se acopla directamente al prompt sin contrato de fuentes/citas.
- Riesgo operacional por dependencia de `bge-m3` y dimension fija.

### Si sirve para MVP

Sirve parcialmente, no como requisito del MVP. Para Hospital Clinic v1, el valor primario esta en definir bien el problema y persistir/resumir el flujo. RAG puede quedar como extension opcional para fases posteriores o para contexto institucional aprobado.

### Recomendacion

`refactor`

Rescatar como modulo opcional, detras de una interfaz `RetrievalPort`/adapter. No fusionar como dependencia obligatoria del core path. Mantener docs/tests de RAG, pero condicionar endpoints, migracion y docker a una decision explicita de incluir pgvector en la rama limpia.

## 9. Analisis del orchestrator legal

### Que hace

Intenta convertir el agente de definicion de problema en un agente seleccionable por especialidad:

- `default`: prompt normal.
- `legal`: prompt legal, guardrails que permiten terminos legal/regulatorio, y retrieval sobre pack `legal`.

Tambien permite cambiar especialidad durante una sesion y marcar `context_reset_at` para filtrar historial.

### Como esta integrado

- Contrato de start acepta `specialty`.
- n8n start reenvia `specialty` desde el body del webhook.
- `ProposalStartService` persiste `specialty`.
- `ProblemDefinitionService` selecciona prompt y retrieval segun sesion.
- `SessionStore` guarda columnas nuevas y filtra turnos por `context_reset_at`.
- Frontend muestra selector inicial y switch de especialidad.

### Dependencias

- Todo el RAG de `arnau`.
- Un pack llamado `legal`, no incluido.
- Nueva migracion `003_add_specialty_columns.sql`.
- Secreto interno expuesto al frontend para cambiar especialidad.

### Calidad

Fortalezas:

- Prompt legal esta versionado.
- El plan inicial en `README_ORCHESTRATOR_LEGAL.md` tenia una idea prudente: prompt-only, opt-in, sin cambiar flujo.
- Hay tests para persistencia de especialidad y prompt routing.
- La migracion es aditiva.

Debilidades:

- La implementacion ya no es prompt-only: conecta RAG, UI, endpoint interno y cambio mid-session.
- Usa el schema de problem definition para una tarea legal que requiere otro contrato.
- No registra en `inputPayloadJson` el `retrievalContext` usado, reduciendo auditabilidad.
- `getAuditView` no selecciona `specialty` de runs/snapshots aunque las interfaces lo esperan.
- El endpoint interno de switch specialty no debe ser consumido por navegador.
- Rutas de estado/recover desaparecen del registro de Fastify.
- El pack `legal` no existe, por lo que la ruta legal puede fallar o degradar silenciosamente.

### Riesgos

- Regresion directa del flujo resumible por perdida de `/api/v1/requests/:requestId` y `/recover`.
- Riesgo de seguridad al poner `VITE_INTERNAL_SHARED_SECRET` en cliente.
- Riesgo de scope drift: el MVP deja de ser problem definition y empieza a parecer asesor legal/regulatorio.
- Riesgo legal/compliance: prompt dice "no legal advice", pero la experiencia de usuario puede percibirse como asesor legal.
- Riesgo de mala evaluacion del Hospital Clinic si mezcla clarificacion legal con definicion del problema antes de consolidar el core.

### Si sirve para MVP

No como implementacion. Puede informar una fase futura, pero no debe entrar en el MVP del Hospital Clinic hasta que el core path este cerrado y se defina un contrato legal/regulatorio separado.

### Recomendacion

`discard implementation / keep ideas`

Descartar la implementacion directa. Rescatar:

- `prompts/v1/problem-definition-agent-legal.md` como borrador, no como prompt de produccion.
- La idea de `specialty` solo si se redisenia como feature flag backend o como agente futuro separado.
- Tests de prompt routing como inspiracion.
- Migracion de auditoria solo si se decide formalmente soportar agentes especializados.

## 10. Piezas reutilizables

De `main`:

- Contratos base y schemas.
- Migracion `001_initial.sql`.
- Servicios de intake, reply, problem definition.
- Guardrails deterministicos de problem definition.
- Prompt loading versionado.
- Workflows n8n v1.
- Estado/recover de requests.
- Tests y fixtures del flujo base.

De `arnau`:

- `apps/api/src/rag/chunking.ts`.
- `apps/api/src/rag/pack-manifest.ts`.
- `apps/api/src/rag/embedding-client.ts`.
- Repositorios RAG y migracion `002_rag.sql`, si se acepta pgvector.
- `prompt-augmenter.ts` como utilidad futura de sources/citations.
- CLI de ingesta/busqueda.
- `docs/RAG.md`, ajustado a la decision final.
- Tests RAG con `FakeEmbeddingClient`.

De `orchestrator-legal`:

- `problem-definition-agent-legal.md` como borrador.
- `resolveProblemDefinitionPromptName` como patron si se mantiene especialidad.
- La idea de registrar prompt/specialty para auditoria.
- Parte de los tests, despues de reescribirlos contra el contrato final.

## 11. Piezas peligrosas o mal planteadas

- `apps/web/src/lib/api.ts` en `orchestrator-legal`: uso de `VITE_INTERNAL_SHARED_SECRET` para llamar endpoint interno desde frontend.
- `POST /internal/sessions/switch-specialty` consumido por UI. Debe ser endpoint backend seguro o no existir en v1.
- Retrieval legal con `packs: ['legal']` sin pack legal versionado.
- Integrar legal dentro de `ProblemDefinitionTurn` sin contrato especifico.
- Eliminar accidentalmente rutas `/api/v1/requests/:requestId` y `/recover` en `orchestrator-legal`.
- Fusionar `docker-compose.yml` de RAG sin decidir si pgvector es obligatorio.
- Poner RAG en el path critico antes de validar intake/problem_definition end-to-end.

## 12. Codigo duplicado o divergente

Divergencias relevantes:

- `apps/api/src/app.ts`: `main` y `arnau` conservan request status/recover; `orchestrator-legal` no registra esas rutas.
- `apps/api/src/services/problem-definition-service.ts`: `orchestrator-legal` introduce retrieval, specialty y context reset; `main`/`arnau` mantienen lane simple.
- `apps/api/src/repositories/session-store.ts`: `orchestrator-legal` anade columnas/tipos, pero `getAuditView` no devuelve specialty en runs/snapshots.
- `contracts/schemas/proposal-start.request.schema.json`: solo legal anade `specialty`.
- `infra/n8n/workflows/proposal_start_v1.json`: solo legal reenvia `specialty`.
- `apps/web`: solo legal anade UI de especialidad.
- README y docs: `arnau`/`orchestrator-legal` tienen documentacion RAG/legal que no existe en main.

Duplicacion conceptual:

- RAG esta presente tanto en `arnau` como en `orchestrator-legal`; si se rescata, debe venir de `arnau` o de una rama limpia, no de la rama legal.
- La especializacion legal mezcla plan, implementacion y README en raiz; conviene mover cualquier documento superviviente a `docs/discovery/` o `docs/architecture/`.

## 13. Riesgos de merge

Riesgos altos:

- Conflictos y regresiones en `apps/api/src/app.ts`, `session-store.ts`, `problem-definition-service.ts`, `llm-orchestrator.ts`.
- Perder rutas de request status/recovery si se parte de `orchestrator-legal`.
- Exponer secretos internos si se incorpora UI legal sin revision.
- Incluir migraciones `002` y `003` sin orden/compatibilidad clara con entornos existentes.

Riesgos medios:

- `pnpm-lock.yaml` y dependencias por `yaml`.
- `docker-compose.yml` cambia imagen de Postgres; usuarios con `postgres_data` existente pueden necesitar recrear volumen.
- Cambios README amplios en ramas divergentes.
- Tests de integracion RAG/legal pueden requerir DB con pgvector y modelo/fixtures adecuados.

Riesgos bajos:

- Nuevos schemas RAG si quedan sin uso directo.
- Context pack `general_glossary` si se mantiene solo como ejemplo.

## 14. Recomendacion de estrategia

### Partir de main y cherry-pick

Si se usa cherry-pick, hacerlo de forma selectiva y revisada. No cherry-pickear `orchestrator-legal` completo.

De `arnau`, candidatos:

- RAG como modulo completo solo si se decide aceptar pgvector en v1.5.
- En caso contrario, rescatar solo interfaces/documentacion y dejar migracion para despues.

De `orchestrator-legal`, candidatos:

- Prompt legal como borrador documental.
- Tests o patrones de prompt routing, reescritos.

### Partir de otra rama

No recomendado. `arnau` anade complejidad RAG que no es necesaria para el core. `orchestrator-legal` contiene regresiones y scope drift.

### Reimplementar desde cero algunos modulos

Recomendado para legal. La rama actual sirve como investigacion, no como base. Una futura implementacion legal deberia tener:

- contrato propio,
- endpoint propio o agente propio,
- corpus aprobado,
- auditoria de retrieval context,
- disclaimers de producto,
- sin secretos en frontend,
- sin afectar el lane `problem_definition_agent`.

Para RAG, no reimplementar desde cero; refactorizar el modulo de `arnau`.

### Crear una rama nueva limpia

Recomendado. Nombre sugerido: `mvp-hospital-clinic-clean` o `mvp-core-rescue`.

Estrategia:

1. Crear desde `main`.
2. Validar primero core path: start -> first question -> reply -> resume/recover -> done/blocked.
3. Incorporar RAG solo como adapter opcional o mantenerlo fuera hasta que core pase.
4. Documentar legal como out of scope v1.
5. Evitar UI de especialidades en MVP.

## 15. Backlog de rescate

### Rescatar primero

- Confirmar y estabilizar `main`: contratos, migracion `001`, workflows, prompts, API y frontend base.
- Ejecutar/verificar happy path local con Postgres, n8n y Ollama.
- Asegurar request status/recover porque protege UX frente a timeouts.
- Documentar setup MVP local y known issues.

### Rescatar despues

- De `arnau`: `docs/RAG.md`, modulo `apps/api/src/rag`, tests RAG, scripts CLI.
- Crear interfaz de retrieval opcional para agentes futuros.
- Decidir si `pgvector` sera requisito de entorno o feature opcional.
- Preparar un context pack HealthGenAI/Hospital Clinic aprobado, si producto lo requiere.

### Dejar para despues

- Especialidad legal.
- Switch de agentes en frontend.
- Retrieval legal automatico.
- Multi-agent orchestration.
- Legal/cost/scoring.

### Eliminar o no incorporar

- Frontend que llama endpoints internos con `VITE_INTERNAL_SHARED_SECRET`.
- `switch-specialty` en su forma actual.
- Dependencia runtime a pack `legal` inexistente.
- Cambios de `orchestrator-legal` que eliminan rutas de status/recover.
- Documentos de implementacion legal en raiz sin moverlos a docs.

## 16. Preguntas abiertas

- Cual es el flujo exacto de demo para Hospital Clinic: solo texto, PDF, o ambos?
- Que significa "propuesta madura" para el primer piloto: completion del problema, dossier, o checklist?
- Hay que mantener n8n como orquestador visible en v1 o basta con API code-owned orchestration y workflows minimos?
- Que modelo Ollama esta previsto para el piloto y que latencias son aceptables?
- Se requiere RAG en el primer piloto o basta con prompts/contratos deterministas?
- Existe ya un context pack HealthGenAI o Hospital Clinic aprobado?
- Quien valida contenido legal/regulatorio si se incorpora en fase posterior?
- Debe el frontend permitir reanudar por `session_id`, por usuario, o por lista de sesiones recientes?
- Se deben soportar propuestas con datos sensibles reales o solo material anonimizado?
- Que entorno local debe ser la fuente de verdad: Docker completo, host pnpm + Docker DB, o ambos?
