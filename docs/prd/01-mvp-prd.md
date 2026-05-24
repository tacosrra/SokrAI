# PRD MVP SokrAI para Hospital Clinic de Barcelona

Fecha: 2026-05-24  
Estado: borrador PRD v1  
Fuentes base:

- `docs/discovery/00-multi-branch-audit.md`
- `docs/discovery/01-current-state-audit.md`
- `docs/mvp/01-mvp-scope.md`
- Estado actual del repositorio en `chore/multi-branch-discovery`

## 1. Resumen ejecutivo

SokrAI es un asistente local de maduracion de propuestas de innovacion sanitaria. El primer MVP funcional para Hospital Clinic de Barcelona debe ayudar a que equipos proponentes conviertan una idea o documentacion inicial incompleta en una propuesta mas clara, trazable y estructurada antes de la revision humana por el equipo evaluador.

El MVP no debe decidir si una propuesta se aprueba o se rechaza. Su funcion es detectar gaps, formular preguntas guiadas, registrar respuestas, redactar secciones con fuentes internas y componer un reporte exportable a PDF. La propuesta estructurada debe mostrarse dentro de la app y debe mantener trazabilidad entre gaps, preguntas, respuestas, ejecuciones de IA, secciones generadas y reporte final.

La base tecnica recomendada es `main`/rama actual, porque ya contiene el nucleo mas alineado con v1: monorepo Node.js + TypeScript + pnpm, API Fastify, PostgreSQL, n8n, Ollama local, contratos JSON Schema, prompts versionados, workflows n8n, persistencia auditable y un carril funcional de `problem_definition_agent`. El MVP debe partir de ese nucleo, refactorizarlo hacia un modelo de propuesta/gaps/modulos/secciones/reporte y rescatar de otras ramas solo piezas seleccionadas.

El RAG de `arnau` no debe ser requisito del happy path. Puede rescatarse como referencia tecnica o adaptador opcional cuando haya corpus aprobado. La implementacion de `orchestrator-legal` no debe integrarse tal cual: introduce riesgos de seguridad, regresiones de rutas de recovery/status y scope drift hacia asesoramiento legal. Sus ideas pueden informar fases posteriores, pero el MVP debe limitarse a deteccion de gaps y preparacion para revision humana.

## 2. Problema a resolver

Hospital Clinic recibe propuestas de innovacion sanitaria que suelen llegar con informacion insuficiente, ambigua o poco comparable. Esto genera iteraciones manuales entre equipos proponentes y revisores antes de que el comite pueda evaluar con claridad.

Los problemas recurrentes que el MVP debe atacar son:

- Problema mal definido o descrito desde la solucion.
- Solucion poco clara, sin usuarios, alcance o funcionamiento explicito.
- Gaps regulatorios, de privacidad, datos o IA no identificados.
- Posible medical device no declarado, dudoso o mal definido.
- Recursos, plan piloto, entorno de prueba y dependencias poco claros.
- Metricas de exito ausentes o no observables.
- Falta de trazabilidad entre documentacion, respuestas y propuesta final.

El coste principal no es solo la falta de informacion, sino la falta de estructura para pedirla, registrarla y reutilizarla en un reporte comun.

## 3. Contexto Hospital Clinic

El MVP se orienta a un piloto local/on-premise. La prioridad es que la informacion del proyecto se procese con IA local, usando Ollama como proveedor actual, PostgreSQL para persistencia, n8n para orquestacion visible y una app web para interaccion humana.

El contexto sanitario obliga a reglas estrictas:

- No usar datos reales de pacientes en el MVP.
- No enviar contenido a proveedores externos.
- No inventar informacion ni completar datos no aportados.
- No emitir dictamen clinico, legal, regulatorio ni de producto sanitario.
- Indicar incertidumbre y necesidad de revision humana cuando corresponda.
- Mantener trazabilidad auditada de inputs, prompts, modelo, outputs y cambios de estado.

El producto debe preparar propuestas para revision humana, no sustituir a los equipos de innovacion, datos, privacidad, regulatorio, clinico o evaluacion.

## Uso de trabajo existente por rama

### A. Que se aprovecha de main

Partes de `main` que deben conservarse:

- Estructura monorepo: `apps/api`, `apps/web`, `contracts/schemas`, `db/migrations`, `infra/n8n/workflows`, `prompts/v1`, `tests`.
- Contratos JSON Schema como fuente de verdad.
- `structured-brief.schema.json` como contrato inicial de brief, aunque deba ampliarse o complementarse.
- `problem-definition-turn.schema.json` como base del modulo problema.
- API Fastify como propietaria de reglas, validaciones, guardrails y persistencia.
- `ProposalStartService`, `ProposalReplyService`, `ProblemDefinitionService`, `LlmOrchestrator` y `PromptService` como patron de servicios.
- Validacion JSON contra schemas y reparacion unica de JSON invalido.
- Prompts versionados en archivos y persistencia de prompt/model/schema en `agent_runs`.
- Persistencia auditable en PostgreSQL: sesiones, turnos, runs, snapshots y eventos.
- Idempotencia por `request_id`.
- Rutas de request status y recovery.
- Workflows n8n `proposal_start_v1`, `proposal_reply_v1` y `agent_problem_definition_v1`.
- UI actual como punto de partida para crear, continuar y responder sesiones.
- Tests de contratos, dominio, integracion y frontend.
- Scripts beta y documentacion de ejecucion local.

Partes de `main` que deben refactorizarse:

- Separar conceptualmente `proposal` de `session` y de `conversation`; hoy `proposal_sessions` concentra demasiadas responsabilidades.
- Modelar documentos, fuentes, gaps, chats por modulo, secciones generadas y reporte como entidades de producto.
- Ampliar o complementar `structured_brief` para cubrir solucion, datos/IA/privacidad, medical device, piloto, recursos y metricas.
- Convertir el unico carril de `problem_definition` en el primer modulo de una propuesta multi-modulo acotada.
- Extraer o generar tipos compartidos desde JSON Schema para reducir duplicacion entre API y web.
- Endurecer privacidad, acceso a sesiones y configuracion de secretos.
- Consolidar la experiencia de recovery/status para flujos con latencias de Ollama/n8n.

Partes de `main` que deben descartarse o no crecer sin redisenio:

- La idea de que una sesion conversacional unica sea suficiente para todo el MVP Clinic.
- Exponer vistas con raw model output o textos sensibles a usuarios no tecnicos.
- Usar `session_id` como unico control de acceso en un piloto con usuarios reales.
- Mantener defaults inseguros de secretos fuera de entornos estrictamente locales.

### B. Que se aprovecha de arnau

El RAG de `arnau` sirve parcialmente para el MVP, pero no como dependencia obligatoria. La rama contiene una implementacion tecnica util: migracion `002_rag.sql`, pgvector, ingesta desde `context-packs`, chunking, embeddings por Ollama, retrieval top-K, endpoints de inspeccion, CLIs y tests. Sin embargo, la propia auditoria indica que no esta conectado al `problem_definition_agent` y eleva la complejidad operativa.

Decision recomendada: rescatar y refactorizar, no fusionar completo.

Elementos rescatables:

- Interfaces y servicios de chunking, manifest de packs, ingesta y retrieval.
- `prompt-augmenter` como idea para introducir fuentes citables en prompts futuros.
- CLIs de ingesta/busqueda como herramientas internas.
- Tests RAG con fake embedding client.
- `docs/RAG.md`, reescrito para aclarar que RAG es opcional.

Riesgos de integrarlo:

- Requiere `pgvector`, imagen `pgvector/pgvector:pg16`, extension `vector`, modelo de embeddings y dimension fija.
- Puede bloquear el happy path por problemas de infraestructura, ingesta o embeddings.
- No existe todavia corpus sanitario/Hospital Clinic aprobado.
- Puede inducir a autocompletar con contexto no autorizado si no hay politica de fuentes.
- No resuelve por si solo la maduracion de propuestas si no esta ligado a gaps, preguntas, secciones y citas internas.

Queda fuera del MVP aunque este en `arnau`:

- RAG obligatorio para start/reply/reporte.
- Corpus externo o institucional no aprobado.
- Endpoints RAG como superficie de producto para usuarios finales.
- pgvector como requisito minimo para probar el MVP.
- Retrieval sin citas, umbrales, versionado editorial o auditoria de fuentes usadas en cada afirmacion.

### C. Que se aprovecha de orchestrator-legal

El orquestador legal de `orchestrator-legal` no sirve como implementacion directa para el MVP. Puede aportar investigacion, pero no debe fusionarse tal cual.

Decision recomendada: descartar implementacion, conservar ideas.

Elementos rescatables:

- Prompt legal como borrador de investigacion, no como prompt productivo.
- Idea de registrar agente/prompt/especialidad en auditoria si se disena un sistema multiagente posterior.
- Tests de prompt routing como inspiracion.
- Necesidad de contratos propios para modulos sensibles.

Riesgos de integrarlo:

- Regresion detectada: desaparecen rutas publicas de request status/recover en `app.ts`.
- El frontend consume un endpoint interno con `VITE_INTERNAL_SHARED_SECRET`, exponiendo un secreto en navegador.
- Usa `ProblemDefinitionTurn` para una tarea legal/regulatoria que requiere contrato propio.
- Intenta retrieval sobre `packs: ['legal']` sin pack legal existente.
- Mezcla scope legal con definicion de problema antes de estabilizar el core.
- Puede hacer que el producto parezca asesor legal/regulatorio, lo que contradice el MVP.

Queda fuera del MVP aunque este en `orchestrator-legal`:

- Switch de especialidad durante sesion.
- Endpoint `switch-specialty` en su forma actual.
- UI de especialidades.
- Retrieval legal automatico.
- Agente legal productivo.
- Dictamen, clasificacion o recomendacion legal/regulatoria.

### D. Estrategia de rescate/migracion

Conviene partir de `main` o de una rama limpia creada desde `main`, no desde `arnau` ni `orchestrator-legal`.

Estrategia recomendada:

1. Crear una rama limpia de reconstruccion del MVP desde `main`.
2. Verificar primero el core path actual: start, primera pregunta, reply, resume, request status y recovery.
3. Refactorizar el modelo hacia propuesta, documentos, gaps, chats, secciones y reporte.
4. Mantener `problem_definition_agent` como modulo 1 estabilizado.
5. Implementar modulos adicionales acotados con contratos propios, no variantes improvisadas del schema de problema.
6. Reimplementar desde cero el modulo regulatorio/datos/IA como deteccion de gaps, no como asesor legal.
7. Rescatar de `arnau` solo interfaces o adaptadores RAG cuando haya necesidad real y corpus aprobado.
8. Dejar `orchestrator-legal` fuera del camino de implementacion; usarlo solo como material de aprendizaje.

Cherry-pick selectivo puede servir para piezas pequenas de `arnau`, pero no para ramas completas. Para legal/regulatorio conviene reimplementar, porque el diseno actual mezcla concerns y tiene riesgos de seguridad.

Orden recomendado de rescate:

1. Core de `main`: contratos, migracion `001`, servicios, prompts, workflows, recovery/status y UI base.
2. Modelo de producto: `Proposal`, `ProposalDocument`, `Gap`, `ModuleChat`, `GeneratedSection`, `ProposalReport`.
3. Modulo problema completo y seccion problema.
4. Modulo solucion y seccion solucion.
5. Modulo regulatorio/datos/IA/privacidad como gap detection.
6. Medical device condicional.
7. Recursos/piloto/viabilidad.
8. Reporte estructurado y PDF.
9. Retrieval opcional sobre documentos subidos.
10. RAG avanzado desde `arnau` solo si el piloto lo necesita.

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
- UI en `apps/web`

Riesgos de codigo duplicado:

- Tipos duplicados entre API/web y schemas.
- RAG duplicado entre `arnau` y `orchestrator-legal`.
- Prompts de especialidad mezclados con prompts de problem definition.
- Documentacion de plan/implementacion legal fuera de `docs/`.

Divergencias de modelo de datos:

- `main` solo modela sesiones/turnos/runs/snapshots/events.
- `arnau` agrega tablas RAG con pgvector.
- `orchestrator-legal` agrega columnas de especialidad sin un modelo modular completo.
- Ninguna rama modela todavia propuesta, gaps, secciones y reporte como producto Clinic completo.

Divergencias de arquitectura:

- `main` mantiene n8n como orquestador ligero y API como owner de reglas.
- `arnau` agrega RAG lateral no conectado al flujo principal.
- `orchestrator-legal` acopla especialidad, retrieval y UI al carril de problema.

Riesgos de introducir deuda tecnica:

- Convertir RAG en requisito antes de tener corpus aprobado.
- Reutilizar `ProblemDefinitionTurn` para dominios que necesitan contratos propios.
- Exponer secretos internos al frontend.
- Perder recovery/status al fusionar cambios de `orchestrator-legal`.
- Añadir legal, coste o scoring antes de cerrar la trazabilidad de propuesta y reporte.

## 4. Objetivos del MVP

1. Permitir crear una propuesta desde texto inicial y documentacion disponible.
2. Normalizar input y extraer un brief inicial validado contra contratos.
3. Detectar gaps de madurez por modulos sin scoring de aprobado/rechazado.
4. Guiar al usuario con preguntas socraticas, una pregunta principal por turno.
5. Completar el modulo de definicion del problema como primer carril robusto.
6. Cubrir de forma acotada solucion, datos/IA/privacidad, medical device condicional, recursos/piloto/viabilidad y metricas.
7. Redactar secciones estructuradas usando solo documentacion y respuestas trazadas.
8. Mostrar dentro de la app el estado de propuesta, gaps, secciones y reporte.
9. Exportar un PDF del reporte estructurado.
10. Mantener trazabilidad entre gaps, preguntas, respuestas, fuentes, secciones y reporte.
11. Ejecutar el MVP en local/on-premise con Ollama, PostgreSQL, n8n, API Fastify y frontend React/Vite.
12. Preparar una abstraccion de proveedor IA para cambiar de Ollama en el futuro sin redisenar producto.

## 5. No objetivos del MVP

- No aprobar, rechazar, priorizar ni rankear propuestas.
- No emitir dictamen clinico, legal, regulatorio, de privacidad ni de medical device.
- No implementar una plataforma enterprise completa.
- No diseñar todavia despliegue VPS remoto como parte del MVP.
- No integrar sistemas hospitalarios reales.
- No procesar datos reales de pacientes.
- No implementar OCR para PDFs escaneados.
- No hacer RAG obligatorio en el happy path.
- No incorporar corpus legal/regulatorio no aprobado.
- No implementar autenticacion corporativa completa.
- No construir dashboards BI o evaluacion ejecutiva amplia.
- No implementar legal, costes o multiagente amplio como carriles autonomos de v1.

## 6. Usuarios principales

- Equipo proponente interno del Hospital Clinic: clinicos, investigadores, unidades de innovacion, equipos asistenciales-tecnicos o transformacion digital.
- Equipo proponente externo: startups, universidades, proveedores, grupos de investigacion o colaboradores.
- Equipo de innovacion/preevaluacion del Hospital Clinic: personas que preparan o revisan propuestas antes de comite.

## 7. Usuarios secundarios

- Comite evaluador, como consumidor del reporte final.
- Responsables de datos, privacidad, calidad, investigacion, tecnologia o regulatorio, como revisores humanos de secciones concretas.
- Administradores tecnicos del piloto, responsables de entorno local, logs, workflows y configuracion.
- Equipo producto/implementacion SokrAI, responsable de medir piloto y evolucionar el MVP.

## 8. Casos de uso principales

- Crear una propuesta nueva con titulo, objetivo, descripcion y documentos.
- Extraer un brief inicial y visualizar que informacion falta.
- Resolver gaps mediante chats por modulo.
- Reanudar una propuesta incompleta.
- Generar una seccion de problema trazable.
- Generar una seccion de solucion trazable.
- Identificar gaps de datos, IA, privacidad y regulatorio sin dictamen.
- Activar preguntas de medical device cuando haya señales o incertidumbre.
- Definir recursos, piloto, dependencias y metricas de exito.
- Revisar el reporte estructurado antes de exportarlo.
- Exportar PDF con version, fecha, gaps abiertos y fuentes internas.
- Consultar auditoria tecnica de runs, prompts, modelos, eventos y errores.

## 9. User stories

- Como proponente, quiero subir mi propuesta y documentos para saber que informacion falta antes de enviarla a revision.
- Como proponente, quiero responder preguntas guiadas por modulo para no rellenar un formulario largo sin contexto.
- Como proponente, quiero que la herramienta no invente informacion y me pregunte cuando algo falte.
- Como proponente, quiero ver una propuesta estructurada dentro de la app antes de exportarla.
- Como proponente, quiero exportar un PDF para compartir una version revisable.
- Como equipo de innovacion, quiero ver gaps abiertos y resueltos para entender el nivel de preparacion de una propuesta.
- Como equipo de innovacion, quiero comprobar de donde sale cada afirmacion del reporte.
- Como revisor humano, quiero distinguir hechos aportados, incertidumbres y temas que requieren revision experta.
- Como administrador tecnico, quiero ejecutar todo localmente con Docker/Ollama/PostgreSQL/n8n y diagnosticar fallos.
- Como equipo producto, quiero medir si se reducen iteraciones y si los usuarios completan propuestas con menos ambiguedad.

## 10. Flujo end-to-end del MVP

1. El usuario crea una propuesta nueva desde la UI.
2. Introduce titulo, objetivo, descripcion inicial y documentos soportados.
3. La UI muestra aviso de privacidad: no subir datos reales de pacientes ni PHI/PII identificable.
4. El sistema extrae texto de PDF con texto extraible, normaliza input y calcula hashes/metadatos.
5. La API invoca Ollama local para generar `structured_brief` validado.
6. PostgreSQL persiste propuesta, sesion inicial, documentos/fuentes, agent run, snapshot y eventos.
7. El sistema detecta gaps iniciales por modulo.
8. La UI muestra dashboard de propuesta: estado, modulos, gaps, siguiente accion y progreso descriptivo.
9. El usuario abre el modulo problema.
10. El agente de problema formula una pregunta principal por turno.
11. El usuario responde; la respuesta queda ligada a gap, turno, modulo y fuente.
12. El sistema actualiza la definicion del problema hasta cumplir criterios minimos.
13. Se genera una seccion problema versionada, con fuentes y gaps restantes.
14. El usuario trabaja el modulo solucion de forma similar.
15. El sistema genera seccion solucion.
16. El usuario trabaja modulo regulatorio/datos/IA/privacidad como checklist conversacional de gaps.
17. Si hay señales o incertidumbre, se activa medical device condicional.
18. El usuario completa recursos, piloto, dependencias y metricas de exito.
19. El sistema compone reporte estructurado desde secciones versionadas, gaps y fuentes.
20. El usuario revisa el reporte dentro de la app.
21. El sistema exporta PDF versionado.
22. El equipo de preevaluacion consulta reporte, gaps abiertos y trazabilidad.

## 11. Modulos funcionales

- Intake de propuesta: formulario, subida de documentos soportados, validacion y aviso de privacidad.
- Normalizacion documental: extraccion de texto, truncado controlado, hash y metadatos.
- Brief estructurado: extraccion inicial segun contrato.
- Analisis de gaps: identificacion de huecos por modulo y estado.
- Dashboard de propuesta: vista operativa de modulos, gaps, secciones y reporte.
- Chats por modulo: conversaciones resumibles asociadas a gaps.
- Generacion de secciones: redaccion versionada de problema, solucion y otras secciones del reporte.
- Reporte estructurado: composicion final desde secciones y trazabilidad.
- Exportacion PDF: generacion de documento exportable desde reporte versionado.
- Auditoria: runs de IA, prompts, modelos, eventos, snapshots y errores.
- Recovery/status: seguimiento de requests y recuperacion de ejecuciones parciales.
- Configuracion local: Ollama, PostgreSQL, n8n, API y frontend.

## 12. Modulos/agentes IA

El MVP necesita modulos IA acotados, no una red autonoma de agentes.

- `brief_extraction`: extrae `structured_brief` inicial desde texto/documentos.
- `gap_analysis`: crea gaps por modulo con severidad descriptiva y fuente.
- `problem_definition_agent`: modulo principal, basado en el agente actual.
- `problem_section_writer`: redacta seccion problema usando fuentes internas.
- `solution_definition_agent`: pregunta por solucion, usuarios, funcionamiento, alternativas y valor diferencial.
- `solution_section_writer`: redacta seccion solucion.
- `data_ai_privacy_gap_agent`: identifica gaps de datos, IA, privacidad, validacion y gobernanza sin dictamen.
- `medical_device_triage_agent`: activa preguntas condicionales y registra incertidumbre sin clasificacion formal.
- `resources_pilot_viability_agent`: pregunta por equipo, recursos, piloto, dependencias, indicadores y restricciones.
- `report_composer`: compone reporte final desde secciones versionadas y gaps.
- `json_repair`: mantiene el patron actual de reparacion unica de JSON invalido.

Cada modulo sensible debe tener contrato propio si no encaja en `ProblemDefinitionTurn`.

## 13. Reglas de comportamiento de IA

- No inventar informacion.
- No autocompletar datos no proporcionados.
- Si falta informacion, declarar el gap y preguntar.
- Formular una sola pregunta principal por turno.
- Limitar diagnosis/hallazgos principales a tres por turno.
- Separar hechos aportados, inferencias y pendientes.
- No convertir falta de informacion en conclusion negativa.
- No emitir dictamen clinico, legal, regulatorio, de privacidad o medical device.
- No sugerir aprobacion, rechazo, prioridad o scoring.
- Redactar secciones solo con documentacion, brief y respuestas trazadas.
- Toda afirmacion del reporte debe tener fuente interna o quedar marcada como pendiente.
- Usar JSON validado contra schema.
- Reparar JSON invalido una vez; si falla, devolver error controlado y registrar raw output.
- Persistir prompt version, prompt hash, modelo, parametros, input y output.
- Mantener prompts versionados en archivos.
- Mantener reglas criticas en codigo/schemas, no solo en texto de workflow.

## 14. Requisitos de privacidad y seguridad

- El MVP debe ejecutarse local/on-premise.
- No enviar contenido a proveedores externos en el MVP.
- No tratar datos reales de pacientes.
- Mostrar aviso explicito de no subir PHI/PII real.
- Detectar posibles datos sensibles de forma basica y marcar la propuesta para revision o retirada.
- Minimizar el texto enviado a Ollama por tarea.
- Persistir hashes y metadatos de documentos.
- Proteger secretos internos; nunca exponer secretos de API/n8n en frontend.
- Evitar defaults inseguros fuera de modo local.
- Restringir vistas tecnicas con raw outputs a administradores del piloto.
- Registrar eventos relevantes de acceso, generacion, recovery y exportacion.
- Definir politica de retencion y borrado para propuestas del piloto.
- Mantener `session_id` como mecanismo aceptable solo para demo local; para usuarios reales se requiere proteccion adicional.

## 15. Requisitos de IA local/Ollama

- Ollama es el proveedor IA local inicial.
- La API debe comunicarse con Ollama mediante un adaptador desacoplado.
- El modelo debe ser configurable por entorno.
- El proveedor debe registrar modelo, parametros, prompt y metricas por run.
- La salida debe solicitarse y validarse como JSON estructurado.
- Se debe conservar timeout controlado, errores tipados y recovery.
- No debe existir fallback automatico a proveedor externo en el MVP.
- La arquitectura debe permitir cambiar de proveedor IA en fases futuras sin cambiar contratos de producto.
- El MVP debe documentar latencias esperadas y limites de modelo local.

## 16. Requisitos documentales/RAG

El modo por defecto del MVP debe ser documentos subidos + respuestas del usuario. RAG avanzado no es requisito del happy path.

Requisitos documentales minimos:

- Soportar PDF con texto extraible y texto pegado.
- Guardar nombre, hash, tipo, estado de extraccion y version del documento.
- Mantener fragmentos/fuentes internas trazables.
- Asociar gaps, preguntas, respuestas y secciones a fuentes.
- Mostrar cuando una afirmacion procede de documento, descripcion inicial o respuesta.
- No usar documentos para inferir hechos no declarados si la evidencia es ambigua.

Requisitos RAG:

- Definir una interfaz futura de retrieval.
- Proveer un modo no-op o retrieval simple sobre documentos de la propuesta.
- No requerir pgvector ni embeddings para completar el MVP.
- No incorporar context packs externos sin aprobacion editorial.
- Si se rescata `arnau`, hacerlo como adapter opcional con citas, versionado y pruebas.

## 17. Modelo conceptual de datos

Entidades conceptuales:

- `Proposal`: propuesta de innovacion, titulo, objetivo, owner, origen, estado y version activa.
- `ProposalDocument`: archivo o texto subido, hash, tipo, texto extraido, estado y flags de privacidad.
- `ProposalSource`: fragmento trazable procedente de descripcion inicial, documento o respuesta.
- `StructuredBrief`: brief inicial validado contra schema.
- `MaturityModule`: problema, solucion, datos_ia_privacidad, medical_device, recursos_piloto_viabilidad, reporte.
- `Gap`: hueco de informacion con modulo, estado, origen, pregunta asociada y resolucion.
- `ModuleChat`: conversacion resumible por modulo.
- `ChatTurn`: pregunta, respuesta, estado, run asociado y fuentes.
- `GeneratedSection`: seccion redactada, version, estado, fuentes y gaps abiertos.
- `ProposalReport`: reporte final versionado y exportable.
- `PdfExport`: artefacto PDF generado, fecha, version y estado.
- `AgentRun`: ejecucion IA con prompt, modelo, input/output, schema, metricas y errores.
- `AuditEvent`: evento append-only de cambios relevantes.

El modelo actual de `proposal_sessions`, `conversation_turns`, `agent_runs`, `session_snapshots` y `session_events` se conserva como base, pero debe evolucionar para no mezclar propuesta, sesion conversacional y estado de reporte.

## 18. Pantallas necesarias

- Nueva propuesta: titulo, objetivo, descripcion, documentos y aviso de privacidad.
- Procesamiento de intake: extraccion, estado, errores y recovery.
- Dashboard de propuesta: modulos, gaps, secciones y estado de reporte.
- Chat de problema: pregunta principal, respuesta, gaps y seccion en progreso.
- Revision de seccion problema.
- Chat de solucion.
- Revision de seccion solucion.
- Chat regulatorio/datos/IA/privacidad.
- Chat medical device condicional.
- Chat recursos/piloto/viabilidad.
- Reporte final: secciones, gaps abiertos, fuentes, advertencias y version.
- Exportacion PDF: previsualizacion/estado y enlace de descarga dentro de la app.
- Reanudar propuesta: por identificador local del piloto.
- Vista tecnica/auditoria: runs, prompts, modelos, eventos y errores, restringida.

## 19. Estados de propuesta

- `draft`: propuesta creada, intake no completado.
- `intake_processing`: documentos/contexto en procesamiento.
- `needs_clarification`: hay gaps abiertos.
- `module_in_progress`: un modulo esta en conversacion.
- `sections_ready`: secciones minimas generadas.
- `report_ready`: reporte estructurado preparado.
- `exported`: PDF generado.
- `archived`: propuesta cerrada o retirada del piloto.
- `failed`: error controlado que requiere recovery o intervencion tecnica.

No debe existir estado de aprobado/rechazado.

## 20. Estados de gap

- `detected`: gap identificado.
- `question_pending`: hay pregunta preparada.
- `awaiting_user`: pregunta abierta esperando respuesta.
- `answered`: respuesta recibida, pendiente de validacion.
- `resolved`: informacion suficiente para completar seccion.
- `partially_resolved`: informacion util, pero persiste incertidumbre.
- `not_applicable`: justificado como no aplicable.
- `needs_human_review`: requiere revision experta.
- `deferred`: fuera de alcance del MVP o de la propuesta actual.

## 21. Estados de seccion

- `not_started`: sin contenido generado.
- `insufficient_information`: faltan datos minimos.
- `draft_generated`: borrador generado.
- `needs_user_review`: pendiente de revision del usuario.
- `approved_by_user`: aceptada por usuario para el reporte.
- `updated`: regenerada tras nuevas respuestas.
- `locked_for_report`: incluida en una version exportada.

`approved_by_user` no significa aprobacion por Hospital Clinic ni validacion de comite.

## 22. Estados de revision

- `not_requested`: no se ha solicitado revision humana.
- `ready_for_user_review`: el usuario puede revisar una seccion o reporte.
- `user_changes_requested`: el usuario pide cambios o responde gaps.
- `ready_for_preevaluation`: reporte preparado para revision humana interna.
- `human_review_needed`: hay gaps sensibles o incertidumbre que requieren experto.
- `reviewed_by_human`: un revisor humano marco la revision como realizada.
- `returned_for_clarification`: se devuelve al proponente por gaps abiertos.

Estos estados no deben implicar decision final de comite.

## 23. Generacion de reporte

El reporte debe ser un artefacto estructurado y versionado, no una pagina HTML improvisada.

Contenido minimo:

- Datos basicos de propuesta.
- Resumen ejecutivo de la propuesta.
- Problema definido.
- Solucion propuesta.
- Usuarios/beneficiarios y contexto de uso.
- Gaps y respuestas por modulo.
- Datos/IA/privacidad: informacion aportada, gaps y necesidad de revision.
- Medical device: señales, incertidumbre y revision humana requerida si aplica.
- Recursos, piloto, dependencias y metricas.
- Gaps abiertos y temas no aplicables.
- Fuentes internas usadas.
- Advertencias de limites: no dictamen ni decision.
- Historial de version y fecha.

El reporte debe componerse solo desde secciones versionadas, fuentes internas y estados de gaps.

## 24. Exportacion PDF

La exportacion PDF debe partir del `ProposalReport` estructurado.

Requisitos:

- Generar PDF con version, fecha, identificador de propuesta y estado.
- Incluir gaps abiertos y advertencias de no dictamen.
- Incluir fuentes internas de secciones o referencias trazables.
- No incluir raw model output.
- Guardar evento de exportacion y metadata del PDF.
- Permitir regenerar PDF cuando cambie el reporte.
- Mantener la version exportada bloqueada para trazabilidad.

## 25. Auditoria y trazabilidad

Trazabilidad obligatoria:

- Gap -> origen -> pregunta -> respuesta -> seccion -> reporte.
- Documento -> fragmento/fuente -> afirmacion del reporte.
- Run IA -> prompt version/hash -> modelo -> input contract -> output contract -> resultado.
- Cambio de estado -> actor -> evento -> timestamp.
- Export PDF -> version de reporte -> gaps abiertos incluidos.

El sistema debe permitir reconstruir por que una pregunta se hizo, que respuesta la resolvio y donde se uso en el reporte final.

## 26. Requisitos funcionales

- RF01: crear propuesta con titulo, objetivo y al menos texto, documento o PDF con texto extraible.
- RF02: validar payloads de entrada contra schemas.
- RF03: extraer y normalizar texto.
- RF04: generar `structured_brief` inicial con Ollama local.
- RF05: persistir propuesta, sesion, documentos/fuentes, runs, snapshots y eventos.
- RF06: detectar gaps iniciales por modulo.
- RF07: mostrar dashboard de propuesta.
- RF08: ejecutar chat de problema resumible con una pregunta por turno.
- RF09: generar seccion problema versionada.
- RF10: ejecutar chat de solucion y generar seccion solucion.
- RF11: ejecutar modulo regulatorio/datos/IA/privacidad como deteccion de gaps.
- RF12: activar medical device solo por señales o incertidumbre.
- RF13: ejecutar modulo recursos/piloto/viabilidad.
- RF14: reanudar propuesta y modulo donde quedo.
- RF15: componer reporte estructurado.
- RF16: exportar PDF.
- RF17: registrar auditoria completa de IA y eventos.
- RF18: soportar request status y recovery.
- RF19: impedir respuestas vacias o insuficientes sin avanzar estado.
- RF20: mostrar gaps abiertos y necesidad de revision humana.

## 27. Requisitos no funcionales

- RNF01: ejecucion local/on-premise.
- RNF02: sin dependencia de proveedor IA externo.
- RNF03: contratos JSON versionados y validados.
- RNF04: prompts versionados en archivos.
- RNF05: reglas criticas en codigo/schemas.
- RNF06: persistencia PostgreSQL auditable.
- RNF07: idempotencia por `request_id`.
- RNF08: errores controlados y recuperables.
- RNF09: latencias tolerantes a Ollama local, con estado visible.
- RNF10: no exponer secretos al frontend.
- RNF11: no guardar ni mostrar datos sensibles innecesarios en vistas de usuario.
- RNF12: arquitectura preparada para cambiar proveedor IA.
- RNF13: RAG opcional y desacoplado.
- RNF14: tests de contratos, dominio, integracion y UI para el happy path.
- RNF15: documentacion local reproducible.

## 28. Metricas de exito del piloto

- Tiempo medio desde intake hasta reporte exportable.
- Porcentaje de propuestas que completan modulo problema.
- Porcentaje de propuestas que completan reporte.
- Numero medio de gaps detectados por propuesta.
- Porcentaje de gaps resueltos, parcialmente resueltos, no aplicables y pendientes.
- Numero medio de turnos por modulo.
- Porcentaje de secciones aceptadas por el usuario sin regeneracion.
- Incidencias de JSON invalido, repair fallido, timeout o recovery.
- Tiempo medio de respuesta de Ollama por tipo de run.
- Numero de afirmaciones sin fuente interna detectadas en revision: objetivo cero.
- Numero de propuestas bloqueadas por posible dato sensible.
- Satisfaccion cualitativa del equipo proponente.
- Utilidad percibida por preevaluacion.
- Reduccion cualitativa de iteraciones manuales antes de comite.

## 29. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| El MVP crece demasiado | Alto | Mantener modulos acotados, sin scoring, sin legal completo y sin RAG obligatorio |
| Ollama local tiene baja calidad o latencia alta | Alto | Contratos estrictos, prompts breves, repair unico, recovery y modelo configurable |
| La IA inventa informacion | Alto | Fuentes obligatorias, gaps explicitos, revision de usuario y validacion de afirmaciones internas |
| Usuarios suben datos reales de pacientes | Alto | Avisos, flags de privacidad, no PHI/PII, politica de borrado y fixtures anonimos |
| RAG retrasa el core | Medio | `RetrievalPort` opcional y no-op por defecto |
| Legal/regulatorio parece asesoramiento | Alto | Lenguaje de gaps, no dictamen, revision humana y disclaimers |
| `orchestrator-legal` introduce regresiones | Alto | No fusionar implementacion; rescatar solo ideas |
| Falta trazabilidad para confiar en reporte | Alto | Guardar fuentes, runs, prompts, modelos, eventos y versiones |
| n8n oculta reglas criticas | Medio | API/schemas/prompts como fuente de reglas; n8n solo coordina |
| Modelo de datos actual se queda corto | Medio | Introducir proposal/document/gap/section/report antes de ampliar carriles |
| Demo falla por timeouts | Medio | Conservar request status/recover e idempotencia |
| Usuarios esperan evaluacion final | Medio | Mensajes claros: preparacion previa, no aprobacion ni ranking |

## 30. Criterios de aceptacion

- CA01: el usuario puede crear propuesta con contexto inicial y PDF con texto extraible.
- CA02: el sistema persiste propuesta, documento, brief inicial, gaps y primer modulo.
- CA03: todos los payloads cumplen schemas declarados.
- CA04: el sistema genera analisis de gaps sin scoring aprobado/rechazado.
- CA05: el chat de problema completa criterios minimos y genera seccion problema.
- CA06: el chat de solucion genera seccion solucion.
- CA07: el modulo regulatorio/datos/IA/privacidad identifica gaps sin dictamen.
- CA08: medical device solo se activa cuando aplica o hay incertidumbre razonable.
- CA09: recursos/piloto/viabilidad recoge informacion minima de ejecucion.
- CA10: el usuario puede reanudar propuesta y continuar desde el estado anterior.
- CA11: turnos, respuestas, runs, snapshots y eventos quedan persistidos.
- CA12: secciones generadas usan solo fuentes internas trazables.
- CA13: reporte final muestra secciones, fuentes, gaps abiertos y advertencias.
- CA14: PDF se exporta desde reporte estructurado versionado.
- CA15: prompts y workflows estan versionados en archivos.
- CA16: entorno local funciona con PostgreSQL, n8n, API, web y Ollama.
- CA17: documentacion explica como ejecutar el MVP local.
- CA18: no hay datos reales de pacientes en fixtures ni pruebas.
- CA19: no se incorpora implementacion completa de `orchestrator-legal`.
- CA20: RAG no bloquea el happy path del MVP.

## 31. Roadmap

- v0.1: estabilizar core actual de `main`: start, primera pregunta, reply, resume, status y recovery.
- v0.2: introducir modelo conceptual de propuesta, documentos, gaps, chats, secciones y reporte.
- v0.3: completar modulo problema y seccion problema.
- v0.4: implementar modulo solucion y seccion solucion.
- v0.5: implementar datos/IA/privacidad como gap detection sin dictamen.
- v0.6: implementar medical device condicional.
- v0.7: implementar recursos/piloto/viabilidad y metricas.
- v0.8: componer reporte estructurado y exportacion PDF.
- v0.9: endurecer privacidad, auditoria y documentacion local.
- v1.0: piloto local Hospital Clinic con flujo completo.
- v1.1: autenticacion/permisos minimos para usuarios reales.
- v1.2: gestion documental mejorada y OCR si el piloto lo pide.
- v1.3: retrieval opcional sobre documentos subidos.
- v1.4: context packs aprobados por Hospital Clinic/HealthGenAI.
- v1.5: RAG avanzado rescatado de `arnau` si hay corpus aprobado.
- v1.6: modulo regulatorio/legal redisenado con contrato propio y validacion experta.
- v2: integracion institucional o despliegue remoto si el piloto local valida valor y requisitos.

## 32. Preguntas abiertas

- Cual es el flujo exacto de piloto: solo texto, PDF, o ambos?
- Que documentacion real o anonima se usara en demo Hospital Clinic?
- Cuales son los criterios minimos de "propuesta suficientemente madura" para preevaluacion?
- Que modulos deben ser obligatorios para generar reporte: problema y solucion solamente, o todos los modulos del MVP?
- Que modelo Ollama se usara en el piloto y que latencias son aceptables?
- Se requiere autenticacion minima antes de probar con usuarios reales?
- Cual sera la politica de retencion y borrado de propuestas del piloto?
- Quien revisara los textos de privacidad/regulatorio/medical device para asegurar que no parezcan dictamen?
- Hay un context pack HealthGenAI u Hospital Clinic aprobado?
- RAG debe quedar totalmente fuera de v1.0 o como interfaz no-op visible en arquitectura?
- Como se validara la utilidad percibida por el equipo de preevaluacion?
- Cual debe ser el formato final del PDF para encajar con el proceso interno del Hospital Clinic?
- Que nivel de auditoria puede ver un usuario proponente frente a un administrador tecnico?
