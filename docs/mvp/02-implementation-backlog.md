# Backlog de implementacion MVP SokrAI por PRs

Fecha: 2026-05-24  
Estado: propuesta de backlog revisable  
Fuentes:

- `docs/discovery/00-multi-branch-audit.md`
- `docs/discovery/01-current-state-audit.md`
- `docs/mvp/01-mvp-scope.md`
- `docs/prd/01-mvp-prd.md`
- `docs/architecture/01-technical-architecture.md`
- Estado actual del repositorio en `chore/multi-branch-discovery`

## 1. Resumen de estrategia de implementacion

La estrategia recomendada es construir el MVP desde una rama limpia basada en `main` o en la rama actual una vez consolidada la documentacion, no desde `arnau` ni desde `orchestrator-legal`.

`main` contiene el nucleo que debe sobrevivir: monorepo pnpm, API Fastify, React/Vite, PostgreSQL, n8n, Ollama local, contratos JSON Schema, prompts versionados, workflows n8n, persistencia auditable, request status/recovery y un carril de `problem_definition_agent`. Ese nucleo no es el MVP completo de Hospital Clinic, pero es la base correcta.

`arnau` contiene un RAG lateral razonablemente trabajado. No debe entrar como requisito del happy path porque introduce pgvector, embeddings, modelo adicional y operaciones de ingesta antes de cerrar propuesta, gaps, chats, secciones y reporte. Se debe rescatar como referencia tecnica o adapter opcional cuando exista una decision explicita.

`orchestrator-legal` no debe fusionarse. La implementacion actual mezcla legal con definicion de problema, expone secretos internos desde frontend, pierde rutas publicas de status/recover y depende de un pack legal inexistente. Solo se deben rescatar ideas: prompt como investigacion, tests de routing como inspiracion y necesidad de contratos especificos para dominios sensibles.

El backlog divide el MVP en PRs pequenas y verificables. Primero estabiliza el core actual, despues introduce el modelo de producto, luego los modulos guiados, despues reporte/PDF/vista evaluador y finalmente hardening para piloto. Cada PR debe tener contrato, persistencia, prompts/workflows y tests en el mismo cambio cuando aplique.

## 2. Principios de implementacion

- Partir de `main` como base tecnica y evolucionar incrementalmente.
- No hacer merges completos de ramas divergentes.
- Tratar `contracts/schemas/*.schema.json` como fuente de verdad contractual.
- Mantener prompts versionados en archivos bajo `prompts/v1` o version posterior.
- Mantener workflows n8n exportados en `infra/n8n/workflows`.
- Mantener reglas criticas en API, schemas y dominio, no solo en nodos n8n.
- Separar propuesta, documentos, fuentes, gaps, chats, secciones, reportes y auditoria.
- Formular el producto como maduracion previa a evaluacion humana, no como aprobacion/rechazo.
- Usar Ollama local mediante una abstraccion de proveedor IA.
- No introducir IA remota, VPS remoto ni proveedor externo en el MVP.
- Mantener RAG opcional y desacoplado; `NoopRetrieval` o retrieval simple sobre documentos es suficiente para v1.
- No usar datos reales de pacientes en fixtures, pruebas ni demo.
- No emitir dictamen clinico, legal, regulatorio, privacidad o medical device.
- No inventar informacion: todo output generado debe enlazar a documentos, contexto inicial o respuestas.
- Cada PR debe poder validarse con tests y, cuando aplique, con un smoke end-to-end local.

## 3. Orden recomendado de PRs

1. PR 0 - Documentacion estrategica.
2. PR 1 - Estabilizar proyecto actual y setup tecnico.
3. PR 2 - Modelo de datos de propuestas/gaps/chats/reportes.
4. PR 3 - Rescate/decision de RAG desde `arnau`.
5. PR 4 - Upload de documentos y extraccion de texto.
6. PR 5 - Abstraccion de proveedor IA local/Ollama.
7. PR 6 - Motor de analisis de gaps.
8. PR 7 - Workflow de definicion del problema.
9. PR 8 - Workflow de definicion de solucion.
10. PR 9 - Rescate/decision de orquestador legal desde `orchestrator-legal`.
11. PR 10 - Workflow regulatorio/datos/IA.
12. PR 11 - Workflow medical device.
13. PR 12 - Workflow recursos/piloto/viabilidad.
14. PR 13 - Generacion de reporte estructurado.
15. PR 14 - Exportacion PDF.
16. PR 15 - Vista evaluador.
17. PR 16 - Hardening piloto Hospital Clinic.

## 4. Dependencias entre PRs

| PR | Depende de | Motivo |
| --- | --- | --- |
| PR 0 | Ninguna | Fija criterio de trabajo y evita merges caoticos. |
| PR 1 | PR 0 | Necesita acuerdos de base y alcance. |
| PR 2 | PR 1 | El modelo de datos debe partir de un setup verificable. |
| PR 3 | PR 0, PR 1 | Es decision tecnica aislada; no debe bloquear el core. |
| PR 4 | PR 2 | Documentos deben persistir como entidad y fuente trazable. |
| PR 5 | PR 1, PR 2 | La abstraccion IA debe registrar runs contra el modelo nuevo. |
| PR 6 | PR 2, PR 4, PR 5 | Gap analysis necesita propuesta, fuentes, documentos y provider IA. |
| PR 7 | PR 2, PR 5, PR 6 | Problema debe operar sobre gaps/chats y trazabilidad. |
| PR 8 | PR 2, PR 5, PR 6 | Solucion reutiliza el patron modular de chat y seccion. |
| PR 9 | PR 0, PR 1 | Decision aislada antes de implementar regulatorio/datos/IA. |
| PR 10 | PR 2, PR 5, PR 6, PR 9 | Requiere contrato sensible y decision de no integrar legal actual. |
| PR 11 | PR 2, PR 5, PR 6, PR 10 | Medical device depende de senales detectadas en datos/regulatorio/propuesta. |
| PR 12 | PR 2, PR 5, PR 6 | Recursos/piloto usa gaps y chats modulares. |
| PR 13 | PR 7, PR 8, PR 10, PR 11, PR 12 | Reporte compone secciones versionadas. |
| PR 14 | PR 13 | PDF debe salir del reporte estructurado, no de HTML improvisado. |
| PR 15 | PR 13 | Vista evaluador consume reporte, gaps y trazabilidad. |
| PR 16 | PR 14, PR 15 | Hardening cierra flujo completo de piloto. |

## 5. Riesgos generales

- Scope creep: intentar hacer RAG avanzado, legal completo, scoring o multiagente amplio antes del reporte exportable.
- Calidad y latencia de Ollama local: outputs invalidos, timeouts o respuestas pobres pueden romper la demo si no se mantiene recovery.
- Modelo de datos incompleto: si no se separan propuesta, gaps, chats, secciones y reporte, los siguientes PRs quedaran acoplados a `proposal_sessions`.
- Trazabilidad insuficiente: sin fuentes por afirmacion, el reporte puede parecer inventado o no auditable.
- Privacidad: documentos y raw outputs pueden contener contenido sensible; MVP no debe usar datos reales de pacientes.
- Seguridad: evitar secretos en frontend, defaults inseguros fuera de local y exposicion de raw outputs a usuarios no tecnicos.
- n8n drift: cambios manuales en workflows sin reexportar pueden romper reproducibilidad.
- Merge drift: integrar `arnau` u `orchestrator-legal` completo puede introducir conflictos, pgvector obligatorio, regresiones de status/recover y scope legal no deseado.
- UI demasiado amplia: el MVP necesita experiencia operativa, no dashboard BI ni plataforma enterprise.

## 6. Estrategia de validacion

- En cada PR que toque contratos: tests de schema con payloads validos e invalidos.
- En cada PR que toque persistencia: migracion aplicable desde cero y prueba de repositorio/servicio.
- En cada PR que toque IA: fake provider en tests, validacion JSON, repair unico y persistencia de `agent_runs`.
- En cada PR que toque n8n: workflow exportado, payload de ejemplo y smoke de webhook/API cuando sea posible.
- En cada PR que toque frontend: tests de validacion/render basicos y comprobacion de estados de error/loading/recovery.
- En PRs de modulo: happy path, respuesta vaga, respuesta `no lo se`, output invalido de IA y resume del chat.
- En PRs de secciones/reporte/PDF: verificar que no hay afirmaciones sin fuente interna y que gaps abiertos aparecen.
- En PR 16: smoke end-to-end local con PostgreSQL, n8n, API, web y Ollama: crear propuesta, subir PDF con texto, analizar gaps, cerrar modulos minimos, generar reporte, exportar PDF y reanudar.

## 7. Estrategia de rescate multi-rama

- `main` es la base. Se rescata por evolucion directa, no por cherry-pick.
- `arnau` se evalua en PR 3 y solo se rescata de forma selectiva. Si se rescata codigo, debe quedar detras de `RetrievalPort`, con feature flag o adapter opcional, y sin hacer pgvector obligatorio.
- `orchestrator-legal` se evalua en PR 9. No se rescata implementacion directa. Se reimplementan ideas utiles en PR 10 y PR 11 con contratos propios, lenguaje de gaps y revision humana.
- Cualquier cherry-pick debe ser pequeno, por carpeta/responsabilidad, con tests y sin arrastrar cambios de Docker, lockfile, frontend y migraciones que no correspondan al PR.
- Si una pieza existente contradice el MVP, se descarta aunque este implementada.

## 8. Tabla completa de PRs

| ID | Nombre | Objetivo | Rama sugerida | Base sugerida | Rescate main/arnau/orchestrator-legal | Archivos/modulos probablemente afectados | Cambios esperados | Restricciones | Tests esperados | Criterios de aceptacion | Riesgos | Que NO debe tocar | Decision humana previa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PR 0 | Documentacion estrategica | Confirmar auditoria multi-rama, scope MVP, PRD, arquitectura y backlog. | `docs/mvp-implementation-backlog` | `chore/multi-branch-discovery` o `main` actualizado con discovery | Rescata conclusiones de `main`; sintetiza `arnau` y `orchestrator-legal` sin codigo. | `docs/mvp/02-implementation-backlog.md`; opcionalmente indices docs si ya existen. | Crear backlog por PRs, dependencias, riesgos, estrategia de validacion, rescate multi-rama y reglas para Archon. | No codigo. No modificar fuera de `docs/mvp/` salvo aprobacion explicita. | Revision documental; comprobar links/rutas mencionadas. | Documento creado; cubre PR 0-16; incluye decisiones multi-rama; no propone merges completos. | Que el backlog quede demasiado amplio o contradictorio con PRD. | `apps/`, `contracts/`, `db/`, `infra/`, `prompts/`, `tests/`. | Si: validar que este orden refleja prioridad de producto. |
| PR 1 | Estabilizar proyecto actual y setup tecnico | Dejar el repo actual verificable antes de crecer funcionalidad. | `chore/stabilize-mvp-core` | `main` o rama limpia tras PR 0 | Usa `main` como base; no rescata `arnau` ni `orchestrator-legal`. | `package.json`, `apps/*/package.json`, `.env.example`, `docker-compose*.yml`, `.github/workflows/*`, `docs/INICIALIZACION_V1.md`, scripts beta. | Asegurar scripts `build`, `test`, `verify`, typecheck/lint si aplica, CI basico, env vars documentadas, Docker/Postgres local reproducible y smoke del core actual. | No funcionalidad nueva. No modelo nuevo. No RAG. No legal. | `pnpm verify`; `pnpm build`; smoke API/web/n8n si el entorno lo permite. | Setup documentado; CI ejecuta checks; core actual no empeora; env vars sin secretos reales. | Descubrir fallos runtime del core actual; divergencia entre compose normal y beta. | Contratos de producto, migraciones funcionales nuevas, UI nueva, workflows de nuevos modulos. | Si: decidir comandos oficiales de verificacion y modo local canonico. |
| PR 2 | Modelo de datos de propuestas/gaps/chats/reportes | Introducir el modelo persistente del MVP Clinic. | `feat/proposal-domain-model` | PR 1 | Refactoriza desde `main`; no rescata RAG/legal. | `contracts/schemas/*`, `db/migrations/*`, `apps/api/src/domain/*`, `apps/api/src/repositories/*`, `tests/contracts`, `tests/unit`, docs de arquitectura si cambia. | Crear o preparar entidades `Proposal`, `Document`, `Section`, `Gap`, `Chat`, `Message`, `Answer`, `Report`, `AuditEvent`; mantener compatibilidad temporal con `proposal_sessions`. | No eliminar tablas actuales de golpe. No implementar flujos IA nuevos. No PDF. | Tests de migracion/repositorio; tests de estados; contratos de schemas; snapshots de fixtures. | Se puede persistir propuesta con documentos/fuentes/gaps/chats/secciones/reportes en estados iniciales; auditoria append-only definida. | Migracion demasiado grande; romper resume/status actual. | RAG, legal, UI completa, export PDF, proveedor IA externo. | Si: decidir nombres finales de entidades/tablas y compatibilidad con sesiones actuales. |
| PR 3 | Rescate/decision de RAG desde `arnau` | Decidir si RAG se cherry-pickea, refactoriza, se deja como adapter futuro o se descarta de v1. | `decision/rag-rescue-arnau` | PR 1 o PR 2 segun alcance | Evalua `arnau`; no usar `orchestrator-legal` como fuente RAG. | `docs/architecture/decisions/*` o `docs/mvp/*`; opcionalmente `apps/api/src/retrieval/*` si se decide puerto no-op; no necesariamente codigo. | Crear ADR de RAG; si entra algo, solo `RetrievalPort` y `NoopRetrieval` o `UploadedDocumentsRetrieval` simple; documentar piezas rescatables de `arnau`. | No hacer pgvector obligatorio. No integrar RAG en happy path. No context packs externos no aprobados. | Si es solo decision: revision documental. Si hay puerto: unit tests del adapter no-op/simple. | Decision explicita: cherry-pick, refactor o reimplementacion; RAG no bloquea MVP; criterios para activar pgvector claros. | Meter demasiado RAG pronto; conflictos en Docker/migraciones/lockfile. | Workflows core, legal, PDF, UI final, migracion pgvector obligatoria. | Si: decidir si v1.0 incluye retrieval simple visible o solo interfaz. |
| PR 4 | Upload de documentos y extraccion de texto | Implementar gestion documental basica trazable. | `feat/document-upload-extraction` | PR 2 | Reusa PDF extraction de `main`; no necesita `arnau`. | `apps/api/src/services/pdf-extraction-service.ts`, `apps/api/src/services/document-service.ts`, rutas de upload, repositorios, `contracts/schemas`, `apps/web/src/components/NewProposalPanel.tsx`, tests. | Subida de documentos, extraccion PDF/texto, hash, metadatos, estado de procesamiento, fuentes internas y errores recuperables. | No OCR. No RAG avanzado. No aceptar datos reales de pacientes. No guardar secretos en frontend. | Unit de extraccion/hash; integracion upload; contratos; frontend validacion archivo; caso PDF sin texto. | Propuesta puede tener al menos un PDF con texto extraible; documentos quedan versionados y convertidos en fuentes trazables. | PDFs grandes, texto vacio, contenido sensible, limites de payload. | Gap analysis avanzado, secciones, PDF export, pgvector. | Si: limites de tamano/tipos MIME y politica ante posible PHI/PII. |
| PR 5 | Abstraccion de proveedor IA local/Ollama | Desacoplar dominio de Ollama y preparar cambio futuro de proveedor. | `feat/ai-provider-port` | PR 2 | Refactoriza `OllamaClient` de `main`; no rescata otras ramas. | `apps/api/src/services/ollama-client.ts`, `apps/api/src/services/llm-orchestrator.ts`, `apps/api/src/services/prompt-service.ts`, `apps/api/src/config/env.ts`, `apps/api/src/ia/*`, tests. | Crear `AiProviderPort`, `OllamaChatProvider`, errores tipados, timeouts por proposito, structured outputs, health check de Ollama y registro de provider/model. | No proveedor externo. No streaming si complica contratos. No cambios de producto. | Unit con fake provider; tests de timeout/error; tests de JSON repair; health check. | Servicios actuales funcionan mediante el puerto; health check indica estado de Ollama; outputs siguen validados por schema. | Refactor puede romper brief/problem definition; naming prematuro. | UI nueva, RAG, legal, modelo de datos fuera de registros de runs. | Si: confirmar modelo Ollama por defecto y presupuestos de timeout. |
| PR 6 | Motor de analisis de gaps | Crear gaps iniciales por modulo desde brief, documentos y ausencias. | `feat/gap-analysis-engine` | PR 5 | Usa patrones de `main`; no rescata legal; RAG solo via puerto no-op si existe. | `contracts/schemas/gap-analysis*.json`, `prompts/v1/gap-analysis.md`, `apps/api/src/domain/gaps.ts`, `apps/api/src/services/gap-analysis-service.ts`, repositorios, workflows n8n si aplica, tests. | Taxonomia de gaps, deteccion, confidence/uncertainty, preguntas sugeridas, fuentes, estados y no invencion. | No scoring de aprobado/rechazado. No dictamen. No legal productivo. | Contratos; unit de taxonomia/estado; integracion con fake IA; caso de informacion ausente; caso de documento ambiguo. | Al crear propuesta, el sistema genera gaps por modulo con origen y preguntas candidatas; no completa hechos ausentes. | Clasificaciones inconsistentes; preguntas genericas; exceso de gaps. | Chats completos, secciones, reporte, PDF. | Si: validar taxonomia final de modulos y estados de gap. |
| PR 7 | Workflow de definicion del problema | Convertir el carril actual en modulo problema del MVP. | `feat/problem-module-workflow` | PR 6 | Rescata fuertemente `ProblemDefinitionService`, prompt, workflows y tests de `main`. | `problem-definition-service`, `domain/problem-definition.ts`, `module-chat-service`, `prompts/v1/problem-definition-agent.md`, `infra/n8n/workflows/*`, UI de chat problema, tests. | Chat guiado, gaps de problema, una pregunta por turno, seccion problema generada/versionada y trazabilidad gap -> respuesta -> seccion. | No preguntas legales/coste. No multiples preguntas principales. No inventar. | Unit guardrails; integracion start/reply/resume; fake IA; test respuesta vaga; test seccion con fuentes. | El usuario cierra gaps de problema y genera seccion problema versionada; resume funciona. | Romper flujo actual; mezclar modelo antiguo/nuevo. | Solucion, regulatorio, medical device, PDF, RAG avanzado. | No, salvo confirmar criterios minimos de problema definido. |
| PR 8 | Workflow de definicion de solucion | Implementar modulo de solucion con chat y seccion. | `feat/solution-module-workflow` | PR 7 | Usa patrones de `main` y PR 7; implementacion nueva. | Nuevos schemas de modulo/turno/seccion solucion, `prompts/v1/solution-*`, `module-chat-service`, `section-generation-service`, workflows, UI, tests. | Chat guiado sobre solucion, usuarios, funcionamiento, alternativas, valor diferencial; seccion solucion generada con fuentes. | No convertir en plan comercial completo. No inventar propuesta tecnica. | Contratos; unit de estados; integracion chat solucion; seccion con fuentes; resume modulo. | Modulo solucion puede completarse y producir seccion revisable. | Duplicar logica de problema; preguntas demasiado amplias. | Regulatorio, medical device, recursos, reporte final, PDF. | Si: definir campos minimos de solucion para Hospital Clinic. |
| PR 9 | Rescate/decision de orquestador legal desde `orchestrator-legal` | Evaluar la rama legal y decidir que se descarta o reimplementa. | `decision/legal-orchestrator-rescue` | PR 1 o PR 8 | Evalua `orchestrator-legal`; no cherry-pick de implementacion salvo documentos/prompt como investigacion si se aprueba. | ADR en docs; posible traslado documental a `docs/discovery` o `docs/architecture`; no codigo productivo salvo decision explicita. | Documentar por que no se fusiona: status/recover, secreto frontend, pack legal inexistente, contrato incorrecto. Definir reglas para PR 10/11. | No dictamen legal. No endpoint `switch-specialty`. No `VITE_INTERNAL_SHARED_SECRET`. | Revision documental; si se mueve prompt como referencia, sin activarlo. | Decision explicita de descartar implementacion directa y reimplementar modulo regulatorio/datos/IA con contrato propio. | Presion por rescatar demasiado codigo existente. | App, workflows productivos, migraciones de specialty, UI de especialidades. | Si: confirmar que legal completo queda fuera de MVP. |
| PR 10 | Workflow regulatorio/datos/IA | Implementar modulo sensible como deteccion de gaps, no asesoramiento. | `feat/data-ai-privacy-module` | PR 9 | Reimplementa desde cero; solo usa ideas de `orchestrator-legal` como investigacion. | Schemas de gaps/turnos/seccion datos IA privacidad, prompts versionados, servicios de modulo, UI, workflows, tests. | Gaps regulatorios declarativos, datos sensibles, IA, privacidad, validacion, gobernanza, preguntas guiadas y seccion generada con revision humana. | No dictamen legal/regulatorio/privacidad. No corpus legal no aprobado. No RAG legal. | Contratos; test de no dictamen; test de incertidumbre; test fuentes; integracion chat/resume. | Modulo identifica huecos y genera seccion con advertencias, gaps abiertos y necesidad de revision humana. | Lenguaje puede parecer asesoramiento; sensibilidad de datos. | Medical device salvo senales basicas, PDF, scoring, legal completo. | Si: revision humana de wording y limites del modulo. |
| PR 11 | Workflow medical device | Implementar triage condicional de medical device. | `feat/medical-device-module` | PR 10 | Reimplementa desde cero; no usar schema legal de `orchestrator-legal`. | Schemas medical device, prompts, domain rules, module chat, section writer, UI condicional, tests. | Deteccion de si aplica o hay incertidumbre, preguntas especificas, seccion medical device y estado `needs_human_review` cuando corresponda. | No clasificacion MDR definitiva. No decision de producto sanitario. | Tests de activacion condicional; test no aplicable; test incertidumbre; seccion con fuentes. | Modulo se activa solo por senales/incertidumbre y no emite dictamen definitivo. | Sobregeneralizar senales; generar falsas conclusiones. | Legal completo, scoring, RAG legal, PDF. | Si: validar lista inicial de senales y lenguaje de revision humana. |
| PR 12 | Workflow recursos/piloto/viabilidad | Implementar modulo de ejecucion practica del piloto. | `feat/resources-pilot-viability-module` | PR 8 o PR 10 | Implementacion nueva usando patron de PR 7/8. | Schemas recursos/piloto, prompts, servicios, UI, workflows, tests. | Preguntar por recursos humanos, recursos tecnicos, presupuesto orientativo si aplica, duracion piloto, metricas, dependencias y riesgos. | No analisis de costes detallado. No aprobacion de viabilidad. | Contratos; unit de gaps; integracion chat; seccion con fuentes; respuesta vaga. | Modulo recoge informacion minima de ejecucion y genera seccion versionada. | Convertirse en estimador de costes; preguntas demasiado largas. | Reporte final, PDF, scoring, dashboards BI. | Si: decidir si presupuesto entra como campo cualitativo o numerico acotado. |
| PR 13 | Generacion de reporte estructurado | Componer reporte final desde secciones, gaps y fuentes. | `feat/structured-report` | PR 12 | Implementacion nueva; usa modelo y secciones de PRs previos. | `contracts/schemas/proposal-report*.json`, `apps/api/src/services/report-service.ts`, repositorios, UI report preview, workflows, tests. | Compilar secciones, mantener trazabilidad, versionar reporte en app, incluir gaps abiertos, advertencias y fuentes. | No export PDF si se mantiene separado. No raw model output. No afirmaciones sin fuente. | Contratos; unit composer; integracion reporte; test gaps abiertos; test versionado. | Reporte estructurado visible en app, versionado y trazable. | Reporte incompleto si modulos no estan listos; tentacion de redactar sin fuentes. | PDF, vista evaluador avanzada, scoring. | Si: aprobar formato canonico de `ProposalReport`. |
| PR 14 | Exportacion PDF | Exportar PDF desde el reporte estructurado. | `feat/pdf-export` | PR 13 | Implementacion nueva. | `apps/api/src/services/pdf-export-service.ts`, rutas report/pdf, `contracts/schemas/pdf-export*.json`, UI descarga, tests, docs de dependencias. | Plantilla PDF, descarga, version exportada, hash/metadata, evento de exportacion y bloqueo de version incluida. | PDF debe partir de `ProposalReport`. No raw model output. No HTML improvisado sin version. | Unit de render metadata; integracion export; test no genera si reporte invalido; smoke descarga. | Usuario descarga PDF con version, fecha, gaps abiertos, fuentes y advertencias. | Dependencia PDF pesada; diferencias entorno local/Docker. | Nuevos modulos IA, scoring, RAG. | Si: elegir motor/plantilla PDF y formato visual minimo. |
| PR 15 | Vista evaluador | Crear vista de lectura para comite/preevaluacion. | `feat/evaluator-view` | PR 13 | Reusa UI base de `main`; implementacion nueva. | `apps/web/src/features/report`, rutas API publicas/restringidas, contratos de vista, tests frontend. | Vista de lectura con estado de madurez descriptivo, gaps resueltos/no resueltos, fuentes, secciones y advertencias. | No aprobado/rechazado automatico. No priorizacion. No raw outputs salvo vista tecnica restringida. | Tests de derivacion de estado; frontend render; permisos/visibilidad si aplica. | Evaluador puede leer reporte y gaps sin modificar flujo ni ver secretos/raw outputs. | Confundir madurez con scoring; exponer datos sensibles. | PDF generation, modulos nuevos, legal/scoring. | Si: decidir quien ve vista evaluador en piloto y nivel de auditoria visible. |
| PR 16 | Hardening piloto Hospital Clinic | Cerrar seguridad, UX, logging, errores, docs y demo flow. | `chore/hospital-clinic-pilot-hardening` | PR 15 y PR 14 | Refuerza todo lo rescatado de `main`; no incorpora ramas divergentes. | `.env.example`, docs locales, scripts, logging, errores, UI polish, tests e2e/smoke, workflows. | Avisos privacidad, no PHI/PII, manejo errores, logging auditable, docs locales, demo flow reproducible, limites de secretos, retencion/borrado inicial si se decide. | No nuevas features grandes. No IA remota/VPS. No RAG avanzado salvo decision previa. | `pnpm verify`; smoke local completo; checklist manual demo; fixtures anonimos. | Happy path end-to-end funciona: crear propuesta, subir documento, gaps, chats, secciones, reporte, PDF, resume. Docs explican ejecucion local. | Descubrir deuda de seguridad o UX tarde; hardening demasiado amplio. | Nuevos modulos producto, merges de ramas, scoring, legal completo. | Si: confirmar condiciones reales del piloto, usuarios, datos permitidos y demo script. |

## PRs de rescate multi-rama

### PRs que rescatan algo de `main`

- PR 1 rescata y estabiliza setup, scripts, tests, Docker, n8n, Ollama y PostgreSQL de `main`.
- PR 2 conserva la persistencia auditable actual como base, pero la extiende hacia propuesta/documentos/gaps/chats/secciones/reportes.
- PR 4 reutiliza `pdf-extraction-service` y el patron de intake actual.
- PR 5 reutiliza `OllamaClient`, `LlmOrchestrator`, `PromptService`, schema validation y JSON repair.
- PR 6 reutiliza `structured_brief`, `ambiguities`, `missing_information` y patrones de guardrails.
- PR 7 rescata directamente `ProblemDefinitionService`, `problem-definition-agent`, workflows de start/reply/problem-definition y tests.
- PR 15 reutiliza la UI actual de creacion/continuacion/workspace como base de lectura.
- PR 16 conserva scripts beta, docs locales, status/recover e idempotencia por `request_id`.

### PRs que rescatan algo de `arnau`

- PR 3 es el punto de decision de RAG.
- PR 3 puede rescatar documentacion `docs/RAG.md`, ideas de `chunking`, `pack-manifest`, `embedding-client`, `retrieval-service`, `prompt-augmenter`, CLIs y tests con fake embeddings.
- PR 4 podria reutilizar ideas de chunking solo si ayudan a crear `ProposalSource`, sin embeddings.
- PR 6 o PR 13 podrian usar `prompt-augmenter` como inspiracion para fuentes citables, no como dependencia directa.
- RAG avanzado de `arnau` solo debe entrar despues del core si hay corpus aprobado, decision de pgvector y necesidad demostrada.

### PRs que rescatan algo de `orchestrator-legal`

- PR 9 es el punto de decision de legal.
- PR 9 puede conservar el prompt legal como material de investigacion, no productivo.
- PR 9 puede rescatar ideas de prompt routing y auditoria de especialidad, pero no su implementacion.
- PR 10 reimplementa regulatorio/datos/IA desde cero, usando solo aprendizajes de la rama legal.
- PR 11 reimplementa medical device con contrato propio, sin mezclarlo con `ProblemDefinitionTurn`.

### Cuando conviene cherry-pick

- Cambios pequenos, autocontenidos y con bajo acoplamiento.
- Tests de RAG de `arnau` que usen fakes y no requieran pgvector si se rescata el puerto.
- Utilidades puras como chunking o manifest parsing, si encajan con el modelo `ProposalSource`.
- Documentacion tecnica que se pueda mover a `docs/` y adaptar al alcance MVP.

### Cuando conviene reimplementar

- Modelo de propuesta/gaps/chats/secciones/reporte: ninguna rama lo resuelve completo.
- Regulatorio/datos/IA: debe tener contrato propio y lenguaje de gaps.
- Medical device: debe ser triage condicional, no dictamen.
- Reporte/PDF/vista evaluador: no existen en ramas actuales.
- Abstraccion IA: conviene envolver `OllamaClient` actual en vez de copiar una rama.
- Legal: la rama existente tiene riesgos de seguridad, regresiones y contrato equivocado.

### Cuando conviene descartar

- Merge completo de `arnau` si hace pgvector obligatorio antes del reporte.
- Merge completo de `orchestrator-legal`.
- `POST /internal/sessions/switch-specialty` consumido por frontend.
- `VITE_INTERNAL_SHARED_SECRET`.
- Retrieval legal con `packs: ['legal']` sin corpus versionado.
- Cambios que eliminen `/api/v1/requests/:requestId` o `/recover`.
- Uso de `ProblemDefinitionTurn` para legal/regulatorio/medical device.
- Cualquier feature que sugiera dictamen, scoring, aprobacion o rechazo.

## Reglas para Archon en futuras PRs

- No hacer merges completos de `arnau` u `orchestrator-legal`.
- No tocar modulos fuera del scope declarado de cada PR.
- No implementar IA remota, VPS remoto ni proveedor externo en el MVP.
- No introducir datos reales de pacientes en codigo, fixtures, tests, docs de ejemplo ni demos.
- No generar dictamen legal, clinico, regulatorio, privacidad o medical device.
- No inventar informacion en outputs de IA.
- Todo output generado debe mantener trazabilidad a documentos, contexto inicial o respuestas.
- No usar RAG como requisito del happy path.
- No introducir pgvector salvo decision explicita y PR aislada.
- No exponer secretos internos en frontend.
- No llamar endpoints internos desde el navegador.
- No eliminar request status/recover sin reemplazo equivalente y tests.
- No esconder reglas criticas en nodos n8n.
- No modificar prompts productivos sin versionarlos y actualizar tests/fixtures.
- No cambiar schemas sin actualizar API, web, tests y ejemplos.
- No mezclar cambios de Docker, DB, API, web, workflows y RAG en una sola PR salvo que el PR lo justifique explicitamente.
- No mostrar raw model output a usuarios no tecnicos.
- No convertir estados de madurez en aprobado/rechazado.
- No introducir scoring automatico en el MVP.
- No bloquear el flujo por ausencia de corpus externo o embeddings.
- Cada PR debe tener criterios de aceptacion verificables antes de abrir el siguiente PR dependiente.
