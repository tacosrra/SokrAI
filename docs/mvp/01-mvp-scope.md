# Scope MVP Hospital Clinic Barcelona

Fecha: 2026-05-24  
Base de analisis: `docs/discovery/00-multi-branch-audit.md`, `docs/discovery/01-current-state-audit.md` y estado actual del repositorio.

## 1. Resumen del MVP

El MVP de SokrAI para Hospital Clinic de Barcelona debe ser una herramienta local y demostrable para madurar propuestas de innovacion sanitaria antes de enviarlas a un comite evaluador.

El alcance recomendado es un vertical slice completo: el equipo proponente crea una propuesta, sube documentacion, aporta contexto inicial, recibe un analisis de gaps por modulos, responde preguntas guiadas en chats acotados y obtiene un reporte estructurado exportable a PDF.

El MVP no debe intentar ser una plataforma completa de evaluacion, asesoramiento legal/regulatorio ni decision automatica. Su valor debe estar en ordenar informacion, detectar huecos, guiar preguntas utiles, guardar trazabilidad y redactar secciones solo con informacion aportada por el usuario o por documentos subidos.

La base tecnica debe partir de la rama actual/main, porque ya contiene el nucleo correcto: intake, normalizacion, `structured_brief`, PostgreSQL, prompts versionados, workflows n8n, Ollama local, estado resumible y tests. De `arnau` conviene rescatar RAG solo como referencia tecnica opcional. De `orchestrator-legal` no conviene rescatar la implementacion, solo ideas documentales para una fase posterior.

## 2. Objetivo principal

Permitir que un equipo del Hospital Clinic, o un equipo externo que colabore con el Hospital Clinic, convierta una idea o propuesta inicial incompleta en una propuesta estructurada, trazable y exportable, identificando y cerrando gaps antes de la revision formal.

El MVP debe responder a una pregunta practica: "¿Esta propuesta suficientemente clara para que el comite pueda evaluarla sin perder tiempo en pedir informacion basica?".

## 3. Usuarios principales

- Equipo proponente interno del Hospital Clinic: investigadores, clinicos, unidades de innovacion, equipos de transformacion digital o equipos mixtos asistenciales-tecnicos.
- Equipo proponente externo: startups, grupos de investigacion, universidades, proveedores tecnologicos o colaboradores que quieran presentar una propuesta al Hospital Clinic.
- Equipo de innovacion o preevaluacion del Hospital Clinic: personas que revisan propuestas antes de que pasen a un comite formal.

## 4. Usuarios secundarios

- Equipo evaluador del Hospital Clinic, como consumidor del reporte final.
- Responsables de datos, privacidad, calidad, investigacion o tecnologia, como revisores puntuales de secciones concretas.
- Administradores tecnicos del piloto, responsables de levantar el entorno local, revisar logs y gestionar configuracion.
- Equipo producto SokrAI, como observador de metricas de uso y calidad del piloto.

## 5. Jobs-to-be-done

- Como equipo proponente, quiero subir mi documentacion y describir mi proyecto para saber que informacion falta antes de presentarlo.
- Como equipo proponente, quiero responder preguntas guiadas por modulo para no enfrentarme a un formulario largo y generico.
- Como equipo proponente, quiero que la herramienta redacte secciones reutilizables sin inventar informacion.
- Como equipo de innovacion, quiero ver gaps y respuestas trazables para entender por que la propuesta esta o no esta suficientemente definida.
- Como equipo evaluador, quiero recibir un reporte comparable entre proyectos, con secciones claras y limites explicitos.
- Como administrador del piloto, quiero ejecutar todo en local con Ollama, PostgreSQL y n8n, sin depender todavia de un VPS remoto.

## 6. Flujo end-to-end del MVP

1. El usuario crea una propuesta nueva desde la UI.
2. Introduce titulo, objetivo, descripcion inicial y documentacion disponible.
3. La herramienta extrae texto de documentos soportados, normaliza input y calcula hashes de archivos.
4. La IA genera un `structured_brief` inicial segun el contrato vigente.
5. El sistema crea una propuesta persistida y una sesion resumible.
6. El sistema detecta gaps iniciales por modulo usando reglas deterministas y salida estructurada validada.
7. La UI muestra una vista de madurez por modulos, sin scoring de aprobado/rechazado.
8. El usuario entra en el chat de definicion del problema.
9. El agente hace una pregunta principal por turno, registra respuesta y actualiza la seccion problema.
10. Cuando el problema alcanza criterios minimos, se genera una seccion problema versionada.
11. El usuario entra en el chat de definicion de solucion.
12. El agente cierra gaps sobre solucion propuesta, usuarios, funcionamiento, valor diferencial y alternativas.
13. Se genera una seccion solucion versionada.
14. El usuario entra en el modulo regulatorio/datos/IA/privacidad.
15. El agente identifica informacion faltante y riesgos declarativos sin emitir dictamen legal, clinico ni regulatorio.
16. Si la propuesta puede encajar como producto sanitario o software medical device, se activa un chat condicional de medical device.
17. El usuario entra en el modulo recursos/piloto/viabilidad.
18. El agente pregunta por equipo, recursos, plan piloto, entorno, dependencias, indicadores y restricciones.
19. El sistema compone un reporte final estructurado con gaps abiertos, fuentes usadas y secciones generadas.
20. El usuario revisa el reporte y exporta PDF.
21. El equipo de preevaluacion puede consultar la version final, el estado de gaps y la trazabilidad de respuestas.

## 7. Que entra en MVP

- Intake documental con texto, descripcion inicial y PDF con texto extraible.
- Extraccion y normalizacion de texto sin OCR.
- Persistencia de propuesta, documentos, sesiones, chats, gaps, secciones, eventos y runs de IA.
- Analisis general de madurez basado en gaps, no en scoring.
- Modulo problema completo, reutilizando y ampliando el `problem_definition_agent` actual.
- Modulo solucion en version acotada.
- Modulo regulatorio/datos/IA/privacidad en version de deteccion de gaps y preguntas, no de asesoramiento.
- Modulo medical device condicional, activado solo si hay senales declaradas por el usuario o documentos.
- Modulo recursos/piloto/viabilidad en version acotada.
- Generacion de secciones problema y solucion como artefactos persistidos y versionados.
- Reporte final estructurado con todas las secciones del MVP.
- Exportacion PDF desde el reporte estructurado.
- Resume/replay de sesion y chats por modulo.
- Ollama local como proveedor IA inicial.
- Abstraccion de proveedor IA para poder cambiar a otro proveedor mas adelante.
- n8n como orquestador ligero de workflows, manteniendo reglas criticas en codigo, schemas y prompts versionados.
- Politica de privacidad por defecto: no tratar datos reales de pacientes en el MVP.

## 8. Que queda fuera del MVP

- Scoring automatico de aprobado/rechazado.
- Priorizacion automatica para comite.
- Asesoramiento legal, clinico o regulatorio definitivo.
- RAG obligatorio en el happy path.
- Corpus legal/regulatorio no validado.
- OCR para PDFs escaneados.
- Integracion con sistemas hospitalarios reales.
- Datos reales de pacientes.
- Autenticacion corporativa completa.
- Roles enterprise avanzados.
- Multiagente amplio con agentes autonomos coordinandose entre si.
- Analisis de costes detallado.
- Business intelligence o dashboards ejecutivos.
- VPS remoto o arquitectura cloud definitiva.
- Firma electronica, workflow formal de aprobacion o expediente administrativo.

## 9. Que se rescata de main

De `main` y de la rama actual se debe rescatar como base del MVP:

- Estructura monorepo: `apps/api`, `apps/web`, `contracts/schemas`, `db/migrations`, `infra/n8n/workflows`, `prompts/v1`, `tests`.
- Contratos JSON Schema como fuente de verdad.
- `structured-brief.schema.json` como base de brief inicial, ampliandolo o complementandolo con contratos nuevos.
- `problem-definition-turn.schema.json` como base del modulo problema.
- `ProposalStartService`, `ProposalReplyService` y `ProblemDefinitionService` como patron de servicios.
- `LlmOrchestrator` con validacion JSON y repair una vez.
- `PromptService` y prompts versionados.
- Persistencia auditada en PostgreSQL: sessions, turns, agent runs, snapshots y events.
- Idempotencia por `request_id`.
- Request status y recovery, porque protegen la demo ante latencias de Ollama/n8n.
- Workflows n8n de start, reply y problem definition.
- UI de creacion, continuacion y workspace como punto de partida.
- Tests de contratos, dominio, integracion y frontend.
- Scripts beta para levantar demo local.

## 10. Que se rescata de arnau

De `arnau` se debe rescatar con prudencia:

- Diseno tecnico del modulo RAG como referencia para una interfaz de retrieval.
- Chunking, manifest de context packs, ingestion service, retrieval service y repositorios RAG como base futura.
- CLI de ingesta y busqueda como herramienta interna, no como requisito del MVP.
- `prompt-augmenter` como idea para introducir fuentes citables en prompts futuros.
- Tests RAG con `FakeEmbeddingClient` como patron de test.
- `docs/RAG.md`, reescrito para explicar que RAG es opcional y no bloquea el flujo core.

No se debe incorporar de entrada toda la dependencia operativa de pgvector, embeddings e ingestion si retrasa el vertical slice. Para el MVP, basta definir el puerto `RetrievalPort` y un adapter `NoopRetrieval` o `UploadedDocumentsRetrieval` simple sobre documentos de la propuesta.

## 11. Que se rescata de orchestrator-legal

De `orchestrator-legal` no conviene rescatar implementacion directa. Solo se deben rescatar ideas:

- El prompt legal como material de investigacion, no como prompt productivo.
- La idea de registrar prompt, agente, version y especialidad en auditoria.
- Tests de routing de prompts como inspiracion para futuros modulos.
- La necesidad de contratos especificos por modulo sensible.

El MVP debe redisenar el modulo regulatorio/datos/IA desde cero como deteccion de gaps y clarificacion, no como especialidad legal dentro de `ProblemDefinitionTurn`.

## 12. Que se descarta

- Incorporar `orchestrator-legal` completo.
- Endpoint `switch-specialty` consumido desde frontend.
- Cualquier uso de `VITE_INTERNAL_SHARED_SECRET` en navegador.
- Retrieval legal automatico sobre un pack `legal` inexistente.
- Mezclar legal/regulatorio dentro del schema del agente de problema.
- Perder rutas publicas de request status/recover.
- Hacer pgvector obligatorio para probar el MVP.
- Convertir RAG en condicion para generar el reporte.
- Cualquier lenguaje de producto que sugiera decision clinica, legal, regulatoria o de aprobacion.

## 13. Modulos necesarios

- Propuestas: entidad principal, estado global, metadatos, propietario y version activa.
- Documentos: archivos subidos, texto extraido, hash, estado de procesamiento y fuente.
- Intake y normalizacion: unifica texto inicial, documentacion y limites de contexto.
- Gap analysis: crea gaps por modulo con severidad descriptiva, no puntuacion.
- Chats por modulo: conversa sobre gaps concretos y mantiene una pregunta principal por turno.
- Secciones: genera y versiona texto estructurado por seccion.
- Reporte: compone secciones, gaps abiertos, fuentes y anexos.
- Export PDF: renderiza el reporte estructurado.
- Auditoria y trazabilidad: guarda eventos, runs de IA, prompt/model version, inputs y outputs.
- Configuracion IA: proveedor Ollama local inicial y abstraccion para futuro proveedor.
- Orquestacion: n8n coordina pasos, la API conserva reglas y contratos.
- UI operativa: crear propuesta, revisar gaps, chatear por modulo, ver reporte y exportar.

## 14. Agentes/modulos IA necesarios

El MVP necesita modulos IA acotados, no una red amplia de agentes autonomos.

- `brief_extraction`: extrae `structured_brief` inicial desde texto y documentos.
- `gap_analysis`: clasifica informacion faltante por modulo usando contratos estructurados.
- `problem_definition_agent`: carril principal y mas robusto, basado en el agente actual.
- `problem_section_writer`: redacta la seccion problema solo con informacion trazada.
- `solution_definition_agent`: pregunta por solucion, usuarios, funcionamiento, alternativas y valor.
- `solution_section_writer`: redacta la seccion solucion solo con informacion trazada.
- `data_ai_privacy_gap_agent`: pregunta por datos, IA, privacidad, validacion y gobernanza sin emitir dictamen.
- `medical_device_triage_agent`: determina si hacen falta preguntas de medical device y registra incertidumbre, sin clasificacion definitiva.
- `resources_pilot_viability_agent`: pregunta por equipo, recursos, piloto, dependencias, indicadores y restricciones.
- `report_composer`: compone reporte final desde secciones versionadas, gaps y fuentes.
- `json_repair`: mantiene el patron actual de reparacion unica de JSON invalido.

Cada modulo debe tener contrato propio cuando el dominio no encaje en `ProblemDefinitionTurn`.

## 15. Rol del RAG en el MVP

RAG no debe ser obligatorio en el MVP. Su rol recomendado es opcional y limitado:

- Recuperar fragmentos de documentos subidos por el usuario dentro de la misma propuesta.
- Aportar citas internas al reporte cuando una afirmacion procede de un documento subido.
- Mantener un puerto de retrieval para incorporar en el futuro context packs aprobados.
- No recuperar informacion externa no validada.
- No usar RAG para autocompletar hechos no aportados.
- No bloquear el flujo si el indice no existe o no hay embeddings.

Para el piloto, el modo por defecto debe ser "documentos subidos + respuestas del usuario". El RAG de `arnau` puede convertirse en adapter posterior cuando haya un corpus aprobado, politicas de fuente y decision explicita sobre pgvector.

## 16. Rol del orquestador legal en el MVP

El orquestador legal no debe entrar como implementacion en el MVP.

El modulo regulatorio/datos/IA del MVP debe funcionar como un checklist conversacional de gaps:

- identifica informacion ausente;
- pregunta por datos personales, IA, validacion, consentimiento, responsable, entorno de uso y posibles restricciones;
- registra incertidumbre;
- recomienda revision humana cuando corresponda;
- evita asesoramiento legal, clinico o regulatorio definitivo.

Medical device debe seguir la misma logica: deteccion de necesidad de clarificacion, no clasificacion formal. Cualquier conclusion debe formularse como "requiere revision por equipo competente" cuando falte evidencia o el caso sea sensible.

## 17. Modelo conceptual de datos

Entidades conceptuales minimas:

- `Proposal`: proyecto presentado para maduracion. Contiene titulo, objetivo, estado, owner, origen interno/externo y version activa.
- `ProposalDocument`: documento subido, nombre, tipo, hash, texto extraido, estado de procesamiento, version y flags de privacidad.
- `ProposalSource`: fragmento trazable procedente de contexto inicial, documento o respuesta de chat.
- `StructuredBrief`: brief inicial validado contra schema.
- `MaturityModule`: modulo del MVP: problema, solucion, datos_ia_privacidad, medical_device, recursos_piloto_viabilidad, reporte.
- `Gap`: hueco de informacion detectado, asociado a modulo, fuente, estado y preguntas.
- `ModuleChat`: conversacion resumible por modulo.
- `ChatTurn`: pregunta, respuesta, estado, run de IA asociado y fuentes usadas.
- `GeneratedSection`: seccion redactada, version, estado, fuentes, gaps abiertos y run de IA.
- `ProposalReport`: composicion final estructurada, version, estado y PDF exportado.
- `AgentRun`: ejecucion de IA con prompt, modelo, input, output, schema, metricas y errores.
- `AuditEvent`: evento append-only de creacion, cambio de estado, generacion, exportacion o recovery.

El modelo actual de `proposal_sessions` puede sostener el primer carril, pero para el MVP Clinic conviene separar conceptualmente propuesta, documentos, chats, gaps y secciones.

## 18. Estados de una propuesta

- `draft`: creada, aun sin analisis inicial completo.
- `intake_processing`: documentos y contexto inicial en procesamiento.
- `needs_clarification`: hay gaps abiertos que requieren respuestas.
- `module_in_progress`: el usuario esta trabajando en un modulo concreto.
- `sections_ready`: las secciones minimas del MVP estan generadas.
- `report_ready`: el reporte estructurado esta compuesto y revisable.
- `exported`: se ha generado PDF.
- `archived`: propuesta cerrada o retirada del piloto.
- `failed`: error controlado que requiere recovery o intervencion tecnica.

No debe existir un estado equivalente a aprobado/rechazado.

## 19. Estados de un gap

- `detected`: gap identificado por intake o analisis de modulo.
- `question_pending`: el sistema ha preparado una pregunta para cerrarlo.
- `awaiting_user`: hay una pregunta abierta esperando respuesta.
- `answered`: el usuario respondio, pendiente de validacion/generacion.
- `resolved`: hay informacion suficiente para redactar o completar la seccion.
- `partially_resolved`: hay informacion util, pero queda incertidumbre explicita.
- `not_applicable`: el usuario o el contexto justifican que no aplica.
- `needs_human_review`: requiere revision por equipo competente.
- `deferred`: queda fuera del MVP o del alcance de la propuesta actual.

## 20. Estados de una seccion

- `not_started`: no hay contenido generado.
- `insufficient_information`: faltan datos minimos.
- `draft_generated`: existe borrador generado por IA.
- `needs_user_review`: el usuario debe revisar o confirmar.
- `approved_by_user`: el usuario acepta el texto para el reporte.
- `updated`: la seccion fue regenerada tras nuevas respuestas.
- `locked_for_report`: version incluida en el reporte exportado.

"Approved" aqui significa aceptada por el usuario para el documento, no validada por el Hospital Clinic ni aprobada por comite.

## 21. Pantallas necesarias

- Nueva propuesta: titulo, objetivo, descripcion y subida de documentos.
- Procesamiento de intake: estado de extraccion, errores y recovery.
- Dashboard de propuesta: modulos, gaps abiertos, secciones y estado del reporte.
- Chat de problema: conversacion guiada y vista lateral de gaps/seccion.
- Revision de seccion problema: texto generado, fuentes usadas y gaps abiertos.
- Chat de solucion.
- Revision de seccion solucion.
- Chat regulatorio/datos/IA/privacidad.
- Chat medical device condicional.
- Chat recursos/piloto/viabilidad.
- Reporte final: secciones, gaps abiertos, fuentes y advertencias.
- Exportacion PDF: previsualizacion, estado de generacion y descarga.
- Reanudar propuesta: por `session_id` o identificador equivalente para piloto local.
- Vista tecnica/auditoria basica: runs, prompts, modelos, eventos y errores, restringida al equipo del piloto.

## 22. Reglas de IA

- No inventar informacion.
- No autocompletar hechos no presentes en documentos, contexto inicial o respuestas.
- Si falta informacion, declarar el hueco y preguntar.
- Una pregunta principal por turno.
- Maximo tres diagnosis o hallazgos principales por turno.
- Usar salida JSON validada contra schema.
- Reparar JSON una sola vez; si falla, devolver error controlado.
- Separar hechos aportados, inferencias y preguntas pendientes.
- Toda seccion generada debe listar fuentes internas: documento, contexto inicial o respuesta de chat.
- No usar conocimiento general para afirmar caracteristicas del proyecto.
- No convertir una ausencia de informacion en conclusion negativa.
- No emitir dictamen legal, clinico, regulatorio ni de medical device.
- No dar recomendacion de aprobacion/rechazo.
- Mantener prompts versionados en archivos.
- Persistir prompt version, prompt hash, modelo, parametros, input y output.
- Permitir cambiar proveedor IA en el futuro mediante interfaz, no por acoplamiento directo a Ollama.

## 23. Reglas de privacidad

- No tratar datos reales de pacientes en el MVP.
- Mostrar aviso explicito antes del intake: no subir PHI/PII real ni datos clinicos identificables.
- Permitir solo documentacion de proyecto y datos ficticios/anonimizados.
- Guardar hashes de documentos y metadatos de trazabilidad.
- Minimizar texto enviado al modelo local a lo necesario para cada tarea.
- Ejecutar Ollama local en el piloto.
- No enviar contenido a proveedores externos en el MVP.
- Registrar acceso y cambios relevantes.
- Evitar exponer raw outputs y textos completos en vistas no tecnicas.
- Mantener secretos internos fuera del frontend.
- Definir politica de retencion y borrado para propuestas del piloto.
- Si se detectan posibles datos sensibles, marcar la propuesta y pedir confirmacion o retirada del contenido.

## 24. Reglas de trazabilidad

- Cada gap debe tener origen: documento, contexto inicial, respuesta o inferencia de ausencia.
- Cada pregunta debe estar asociada a uno o varios gaps.
- Cada respuesta debe quedar ligada al turno y modulo correspondiente.
- Cada seccion generada debe apuntar a las fuentes internas usadas.
- Cada run de IA debe guardar prompt, version, hash, modelo, parametros, input contract y output contract.
- Cada cambio de estado debe crear evento append-only.
- Cada reporte exportado debe quedar versionado.
- El PDF debe indicar fecha, version del reporte y gaps abiertos.
- Las afirmaciones sin fuente interna deben quedar prohibidas o marcadas como pendiente.

## 25. Criterios de aceptacion

- El usuario puede crear una propuesta con contexto inicial y al menos un documento PDF con texto extraible.
- El sistema persiste la propuesta, documentos, brief inicial, gaps y primer chat.
- El sistema genera un analisis general de gaps sin scoring de aprobado/rechazado.
- El chat de problema puede completarse y generar una seccion problema.
- El chat de solucion puede completarse y generar una seccion solucion.
- El modulo regulatorio/datos/IA identifica gaps y preguntas sin emitir dictamen.
- El modulo medical device se activa solo cuando aplica o cuando hay incertidumbre razonable.
- El modulo recursos/piloto/viabilidad recoge informacion minima de ejecucion.
- El usuario puede reanudar una propuesta y continuar donde la dejo.
- Los payloads cumplen schemas declarados.
- Los turnos, respuestas, runs y snapshots quedan persistidos.
- Las secciones generadas usan solo fuentes internas trazables.
- El reporte final se genera desde secciones versionadas y muestra gaps abiertos.
- El PDF se exporta desde el reporte estructurado.
- Los prompts y workflows estan versionados en archivos.
- El entorno local funciona con PostgreSQL, n8n y Ollama.
- La documentacion explica como ejecutar el MVP localmente.
- No se usan datos reales de pacientes en pruebas ni fixtures.

## 26. Metricas de exito del piloto

- Tiempo medio desde intake hasta reporte exportable.
- Porcentaje de propuestas que completan el modulo problema.
- Porcentaje de propuestas que generan reporte final.
- Numero medio de gaps detectados por propuesta.
- Porcentaje de gaps resueltos, parcialmente resueltos, no aplicables y pendientes.
- Numero medio de turnos por modulo.
- Porcentaje de secciones aceptadas por el usuario sin regeneracion.
- Incidencias por JSON invalido, timeout o recovery.
- Tiempo medio de respuesta por run de Ollama.
- Satisfaccion cualitativa del equipo proponente.
- Utilidad percibida por equipo de preevaluacion.
- Numero de ocasiones en que revisores detectan informacion inventada: objetivo cero.
- Numero de propuestas bloqueadas por datos sensibles reales: objetivo prevenir y retirar.

## 27. Roadmap posterior

- v1.1: endurecer autenticacion, permisos y acceso por usuarios reales del piloto.
- v1.1: separar contratos compartidos en paquete workspace o generar tipos desde JSON Schema.
- v1.2: mejorar gestion documental, versiones y previsualizacion.
- v1.2: incorporar OCR si el piloto lo necesita.
- v1.3: activar RAG opcional con documentos subidos y citas mas finas.
- v1.4: incorporar context packs aprobados por Hospital Clinic o HealthGenAI.
- v1.5: redisenar modulo regulatorio/legal con contrato propio y validacion experta.
- v1.6: mejorar medical device con criterios revisados por expertos, manteniendo no-dictamen.
- v1.7: incorporar analisis de costes/recursos mas detallado, sin decision automatica.
- v2: integracion con identidad corporativa y flujos institucionales.
- v2: despliegue remoto si el piloto local valida valor y requisitos de seguridad.

## 28. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| El MVP crece demasiado y no llega a demo | Alto | Mantener modulos acotados, sin scoring, sin RAG obligatorio y sin legal completo |
| Ollama local da baja calidad o latencia alta | Alto | Usar contratos estrictos, prompts cortos, repair unico, recovery y modelos configurables |
| La IA inventa informacion en secciones | Alto | Fuentes obligatorias, validacion de afirmaciones internas, gaps explicitos y revision de usuario |
| Se suben datos reales de pacientes | Alto | Avisos, bloqueo/flag de posibles datos sensibles, fixtures anonimos y politica de borrado |
| RAG retrasa el core | Medio | Mantener `RetrievalPort` opcional y `NoopRetrieval` por defecto |
| Legal/regulatorio se percibe como asesoramiento | Alto | Lenguaje de gaps, no dictamen, revision humana y disclaimers de producto |
| `orchestrator-legal` introduce regresiones | Alto | No fusionar implementacion; rescatar solo ideas |
| Falta trazabilidad suficiente para confiar en el reporte | Alto | Guardar fuentes, eventos, runs, prompts, modelos y versiones de reporte |
| n8n oculta reglas criticas | Medio | Mantener reglas en API, schemas y prompts versionados; n8n solo coordina |
| El modelo de datos actual se queda corto | Medio | Introducir proposal/document/gap/section/report como entidades conceptuales antes de ampliar |
| La demo falla por timeouts o ejecuciones parciales | Medio | Conservar request status/recover e idempotencia por `request_id` |
| Usuarios esperan evaluacion final | Medio | Mensajes de producto claros: preparacion previa, no aprobacion ni ranking |

