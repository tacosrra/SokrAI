# Arquitectura tecnica recomendada para el MVP de SokrAI

Fecha: 2026-05-24
Estado: arquitectura estrategica actualizada antes de PRs de implementacion
Fuentes obligatorias revisadas:

- `docs/discovery/00-multi-branch-audit.md`
- `docs/discovery/01-current-state-audit.md`
- `docs/mvp/01-mvp-scope.md`
- `docs/prd/01-mvp-prd.md`
- `docs/architecture/01-technical-architecture.md`
- `docs/mvp/02-implementation-backlog.md`

## 1. Principio arquitectonico

La arquitectura debe evolucionar desde `main`/rama actual, no desde `arnau` ni desde `orchestrator-legal`.

El repositorio actual ya contiene el nucleo correcto para empezar:

- API Fastify.
- Frontend React/Vite.
- PostgreSQL.
- n8n.
- Ollama local.
- JSON Schemas.
- Prompts versionados.
- Workflows n8n exportados.
- Persistencia auditable.
- `problem_definition_agent` resumible.

La evolucion debe separarse en dos objetivos:

- **MVP Alpha**: vertical slice funcional de propuesta, documentos, gaps iniciales, problema, solucion y reporte basico en app.
- **MVP Clinic Pilot**: modulos sensibles, PDF y hardening local.

## 2. Arquitectura actual detectada

La rama actual contiene:

- `apps/api`: API Fastify con servicios, dominio, rutas internas/publicas y adaptador Ollama.
- `apps/web`: UI local React/Vite para crear y retomar sesiones.
- `contracts/schemas`: fuente de verdad contractual.
- `db/migrations`: persistencia PostgreSQL.
- `infra/n8n/workflows`: workflows exportados.
- `prompts/v1`: prompts versionados.
- `tests`: contratos, unidad, integracion, smoke y frontend.

No contiene actualmente:

- RAG en la rama principal.
- pgvector.
- Legal/regulatorio productivo.
- Exportacion PDF.
- Auth de usuarios.
- Proveedor IA remoto.

## 3. Arquitectura objetivo MVP Alpha

Flujo logico:

```text
Usuario -> Web React/Vite -> n8n webhooks -> API Fastify -> PostgreSQL
                                             -> Ollama local
```

Responsabilidades:

- **Frontend**: crear propuesta, subir/pegar documentacion, mostrar gaps, chats de problema/solucion, revisar secciones y reporte basico.
- **n8n**: orquestador ligero de webhooks y pasos visibles de demo.
- **API**: reglas, contratos, validaciones, prompts, IA, persistencia, auditoria, estados y recovery.
- **PostgreSQL**: fuente de verdad.
- **Ollama local**: proveedor IA actual.
- **Retrieval**: no-op por defecto; no requerido para Alpha.

## 4. Arquitectura objetivo MVP Clinic Pilot

El Clinic Pilot anade sobre Alpha:

- Modulo regulatorio/datos/IA/privacidad con perfil `hospital_clinic_v1`.
- Medical device condicional.
- Recursos/piloto/viabilidad.
- Reporte final estructurado.
- Exportacion PDF.
- Hardening local: privacidad, secretos, logs, errores, retencion inicial y documentacion.

No anade por defecto:

- VPS/remoto.
- Proveedor IA externo.
- RAG avanzado.
- Auth enterprise.
- Configuracion dinamica de frameworks.
- Legal/regulatorio avanzado.

## 5. Propiedad de reglas y contratos

La API debe ser propietaria de:

- Reglas de dominio.
- Contratos de entrada/salida.
- Validaciones JSON Schema.
- Prompts versionados y resolucion de prompt/modelo.
- Persistencia.
- Estados y transiciones.
- Guardrails.
- Auditoria.
- Errores controlados.

n8n debe coordinar, no decidir. Los nodos n8n no deben contener logica critica de negocio ni reglas que no existan tambien en codigo, schemas o prompts versionados.

## 6. Modelo conceptual por fases

Alpha necesita como minimo:

- `Proposal`: propuesta creada por el usuario.
- `ProposalDocument` o fuente equivalente: texto pegado o documento subido.
- `StructuredBrief`: brief inicial validado.
- `Gap`: hueco de informacion inicial.
- `ModuleChat`: chat de problema y chat de solucion.
- `ChatTurn`: pregunta/respuesta.
- `GeneratedSection`: problema y solucion.
- `BasicReport`: reporte estructurado en app.
- `AgentRun` y `AuditEvent`: auditoria.

Clinic Pilot anade:

- `RegulatoryProfile`: perfil `hospital_clinic_v1`.
- `RegulatoryGap`: gaps por familia normativa.
- `MedicalDeviceTriage`: activacion condicional e incertidumbre.
- `PilotViabilitySection`: recursos, piloto, dependencias y metricas.
- `ProposalReport`: reporte final.
- `PdfExport`: metadata de PDF.

La implementacion concreta debe seguir los contratos y schemas vigentes. Este documento define responsabilidades y orden, no tablas finales.

## 7. Abstraccion IA

Estado actual:

- Ollama corre localmente y es el unico proveedor soportado en v1.
- La API crea el proveedor con `createAiProvider`.
- `AI_PROVIDER=ollama` falla cerrado si se configura otro valor.
- El modelo efectivo se resuelve por entorno con `AI_MODEL` y, si falta, `OLLAMA_MODEL`.

Decision:

- Mantener Ollama local en MVP Alpha.
- Usar `AiProviderPort` como frontera interna entre la orquestacion y el proveedor IA.
- No implementar proveedor externo en MVP.
- No disenar despliegue VPS en MVP.

Componentes implementados:

- `AiProviderPort`: contrato provider-neutral para generar texto estructurado y devolver metadata de proveedor/modelo.
- `createAiProvider`: selecciona el proveedor soportado por configuracion y falla cerrado fuera de `ollama`.
- `OllamaClient`: implementa `AiProviderPort`, ejecuta la llamada server-side a `/api/chat`, aplica timeout, envia `format` con el schema JSON y normaliza errores de proveedor.
- `LlmOrchestrator`: carga prompts versionados, invoca el proveedor, parsea JSON, valida contra schemas canonicos y ejecuta una reparacion unica cuando corresponde.
- `SessionStore.recordAgentRun`: persiste prompt, provider, modelo, parametros, schema, raw output, estado, errores y metricas de cada ejecucion.

Responsabilidades:

- El proveedor ejecuta la llamada IA y devuelve contenido, metadata y metricas provider-owned.
- El orquestador conserva la responsabilidad de parseo, validacion de schema y reparacion.
- La persistencia registra la auditoria de ejecucion, incluidos `model_provider`, `model_name` y `model_params_json`.

Futuro explicito:

- Proveedor local alojado en VPS/on-prem mas potente.
- Evaluacion de modelos por tarea.
- Despliegue remoto solo tras decision explicita de seguridad/operacion.

## 8. RAG y retrieval

Decision:

- RAG avanzado no entra en el happy path del MVP Alpha.
- No se requiere pgvector ni embeddings para completar Alpha.
- El RAG de `arnau` se evaluara mas adelante como adapter opcional.
- RAG avanzado requiere corpus aprobado, politica de citas/fuentes y decision explicita.

Arquitectura preparatoria permitida:

- `RetrievalPort`.
- `NoopRetrieval` por defecto.
- `UploadedDocumentsRetrieval` simple sobre fuentes de la propuesta si ayuda a citar texto subido.
- `PgvectorRetrievalAdapter` futuro, basado en `arnau`, solo en PR futura.

Reglas:

- Retrieval nunca debe autocompletar hechos ausentes.
- Las fuentes recuperadas deben quedar trazadas.
- Ausencia de indice, embeddings o corpus no puede bloquear Alpha.
- Context packs externos no aprobados no se usan en producto.

## 9. n8n

n8n se mantiene en MVP como orquestador ligero:

- Recibe webhooks.
- Llama endpoints internos de API con secreto server-side.
- Coordina pasos visibles de demo.
- Facilita retries/observabilidad.
- Propaga errores controlados.

No debe:

- Contener reglas criticas de negocio.
- Contener prompts productivos no versionados.
- Ser fuente de verdad de contratos.
- Exponer secretos al frontend.

Los workflows deben seguir exportados en `infra/n8n/workflows`.

## 10. Autenticacion y seguridad de sesiones

Alpha/demo local:

- No requiere auth corporativa.
- `session_id` puede servir para reanudar una demo local.
- Las PRs iniciales no se bloquean por auth enterprise.

Clinic Pilot con usuarios reales:

- `session_id` solo no basta.
- Debe existir proteccion minima antes de tratar datos sensibles.
- Vistas tecnicas con raw outputs deben restringirse.
- Secretos internos nunca deben aparecer en frontend.

Requisito permanente:

- No usar datos reales de pacientes en MVP.
- No enviar contenido a proveedores externos.
- Minimizar texto enviado al modelo local.
- Registrar auditoria sin exponer contenido sensible en logs de usuario.

## 11. Perfil regulatorio configurable

Los marcos regulatorios se modelan conceptualmente como perfiles configurables por institucion.

MVP:

- Solo perfil por defecto `hospital_clinic_v1`.
- Sin UI de configuracion.
- Sin editor dinamico de frameworks.
- Sin carga dinamica desde la app.

Perfil `hospital_clinic_v1`:

- RGPD / GDPR: proteccion de datos personales.
- Cybersecurity Act: ciberseguridad/certificacion TIC.
- EEDS / EHDS: Espacio Europeo de Datos de Salud.
- MDR: Medical Device Regulation.
- EU AI Act: sistemas de inteligencia artificial.
- HTAR: Health Technology Assessment Regulation.

Salida permitida:

- Gaps.
- Preguntas.
- Incertidumbre.
- "requiere revision humana competente" cuando corresponda.

Salida prohibida:

- Dictamen legal/regulatorio definitivo.
- Afirmacion de cumplimiento/incumplimiento definitivo.
- Clasificacion medical device definitiva.

Futuro:

- Nuevas instituciones podran tener otros perfiles.
- Cada perfil debera versionar reglas, familias, disclaimers, preguntas y salidas permitidas.

## 12. Modulos del MVP Alpha

Modulos funcionales:

- Intake de propuesta.
- Documentos/texto pegado.
- Gap analysis inicial.
- Chat problema.
- Writer de seccion problema.
- Chat solucion.
- Writer de seccion solucion.
- Reporte basico en app.

Modulos IA:

- `brief_extraction`.
- `gap_analysis`.
- `problem_definition_agent`.
- `problem_section_writer`.
- `solution_definition_agent`.
- `solution_section_writer`.
- `basic_report_composer`.
- `json_repair`.

## 13. Modulos del MVP Clinic Pilot

Modulos funcionales:

- Regulatorio/datos/IA/privacidad.
- Medical device condicional.
- Recursos/piloto/viabilidad.
- Reporte final.
- Exportacion PDF.
- Hardening demo local.

Modulos IA:

- `data_ai_privacy_gap_agent`.
- `medical_device_triage_agent`.
- `resources_pilot_viability_agent`.
- `final_report_composer`.

Cada modulo sensible debe tener contrato propio si no encaja en el contrato de problema/solucion.

## 14. Multi-rama

Base recomendada:

- Partir de `main` o rama actual limpia tras documentacion.

`arnau`:

- Contiene RAG lateral rescatable como referencia.
- No se fusiona completo.
- Se evaluara como adapter opcional en PR futura.

`orchestrator-legal`:

- No se fusiona.
- No se cherry-pickea implementacion.
- Sus ideas pueden informar un orquestador futuro.
- No debe introducir `switch-specialty`, secreto en frontend ni legal dentro de `ProblemDefinitionTurn`.

## 15. Estrategia de migracion

Fase Alpha:

1. Estabilizar core actual.
2. Separar contratos/domain types del modelo de datos.
3. Anadir migraciones/repositorios necesarios.
4. Abstraer IA/Ollama.
5. Incorporar documentos/fuentes.
6. Implementar gap analysis.
7. Implementar modulo problema.
8. Implementar modulo solucion.
9. Mostrar reporte basico Alpha.

Fase Clinic Pilot:

1. Anadir perfil `hospital_clinic_v1` y modulo datos/IA/privacidad.
2. Anadir medical device condicional.
3. Anadir recursos/piloto/viabilidad.
4. Exportar PDF.
5. Hardening de demo local Clinic.

Futuro:

- RAG desde `arnau`.
- Orquestador legal/regulatorio avanzado.
- Proveedor IA remoto/VPS/on-prem potente.

## 16. Tests y verificacion esperada

Aunque este documento no implementa codigo, las PRs posteriores deberan verificar:

- Contratos con payloads validos e invalidos.
- Persistencia y resume.
- One-question-per-turn.
- JSON repair una vez.
- No invencion de informacion.
- Fuentes internas en secciones.
- n8n como coordinador.
- Ollama local via abstraccion.
- RAG no requerido para Alpha.
- `session_id` restringido a demo local.
- Outputs sensibles sin dictamen.

## 17. ADRs relacionados

- `docs/decisions/ADR-001-mvp-alpha-vs-clinic-pilot.md`
- `docs/decisions/ADR-002-regulatory-framework-profiles.md`
- `docs/decisions/ADR-003-rag-outside-alpha-happy-path.md`
- `docs/decisions/ADR-004-local-ollama-now-remote-provider-later.md`
