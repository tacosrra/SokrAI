Genera un backlog de implementación por PRs pequeñas y revisables para construir el MVP de SokrAI.

Fuentes obligatorias:
- docs/discovery/00-multi-branch-audit.md
- docs/discovery/01-current-state-audit.md
- docs/mvp/01-mvp-scope.md
- docs/prd/01-mvp-prd.md
- docs/architecture/01-technical-architecture.md
- estado actual del repositorio

Ramas analizadas:
- main: versión más estable, aunque no plenamente funcional.
- arnau: contiene un intento de implementación RAG.
- orchestrator-legal: contiene implementación adicional del orquestador legal.

El backlog debe considerar explícitamente el trabajo repartido en ramas. No debe asumir que todo se implementa desde cero, pero tampoco debe asumir que todo lo existente sirve. Debe decidir qué PRs rescatan piezas existentes, qué PRs refactorizan y qué PRs implementan desde cero.

Producto:
SokrAI es una herramienta para ayudar a equipos de investigación e innovación a madurar propuestas de innovación sanitaria antes de enviarlas a comités de evaluación.

MVP:
Para Hospital Clínic, el MVP debe permitir:
- crear una propuesta
- subir documentos
- añadir contexto inicial
- analizar gaps
- resolver gaps mediante chats guiados
- generar secciones de problema, solución, regulatorio/datos/IA, medical device y recursos/piloto/viabilidad
- generar reporte final estructurado
- exportar PDF

Stack:
- Monorepo Node.js + TypeScript + pnpm.
- React 19 + Vite.
- Fastify.
- PostgreSQL.
- n8n.
- Ollama.

Entrega:
Crea docs/mvp/02-implementation-backlog.md con:

1. Resumen de estrategia de implementación.
2. Principios de implementación.
3. Orden recomendado de PRs.
4. Dependencias entre PRs.
5. Riesgos generales.
6. Estrategia de validación.
7. Estrategia de rescate multi-rama.
8. Tabla completa de PRs.

Para cada PR, incluye:

- ID de PR.
- Nombre.
- Objetivo.
- Rama sugerida.
- Base sugerida.
- Si rescata código de main, arnau u orchestrator-legal.
- Archivos/módulos probablemente afectados.
- Cambios esperados.
- Restricciones.
- Tests esperados.
- Criterios de aceptación.
- Riesgos.
- Qué NO debe tocar.
- Si requiere decisión humana previa.

El backlog debe cubrir como mínimo:

PR 0: Documentación estratégica
- Confirmar auditoría multi-rama, scope MVP, PRD, arquitectura y backlog.
- No código.

PR 1: Estabilizar proyecto actual y setup técnico
- Scripts.
- Lint/typecheck/tests.
- CI.
- Variables de entorno.
- Docker/Postgres local si aplica.
- No funcionalidad nueva.

PR 2: Modelo de datos de propuestas/gaps/chats/reportes
- Proposal.
- Document.
- Section.
- Gap.
- Chat.
- Message.
- Answer.
- Report.
- Audit trail.

PR 3: Rescate/decisión de RAG desde arnau
- Decidir si se cherry-pickea, refactoriza o reimplementa.
- Integrar solo si encaja con MVP.
- No sobredimensionar retrieval.

PR 4: Upload de documentos y extracción de texto
- Document upload.
- PDF/text extraction.
- Document metadata.
- No RAG avanzado si no está aprobado.

PR 5: Abstracción de proveedor IA local/Ollama
- Adapter de IA.
- Health check de Ollama.
- Prompt execution.
- Timeouts.
- Structured outputs.
- Preparar cambio futuro de proveedor.

PR 6: Motor de análisis de gaps
- Gap taxonomy.
- Gap detection.
- Confidence/uncertainty.
- No inventar.
- Preguntas sugeridas.

PR 7: Workflow de definición del problema
- Chat guiado.
- Gaps de problema.
- Sección problema generada.
- Trazabilidad.

PR 8: Workflow de definición de solución
- Chat guiado.
- Gaps de solución.
- Sección solución generada.
- Trazabilidad.

PR 9: Rescate/decisión de orquestador legal desde orchestrator-legal
- Evaluar si se rescata.
- Refactorizar si aplica.
- No convertirlo en dictamen legal.
- Integrarlo como detector de gaps legales/regulatorios.

PR 10: Workflow regulatorio/datos/IA
- Gaps regulatorios.
- Datos sensibles.
- IA.
- Privacidad.
- Preguntas guiadas.
- Sección generada.

PR 11: Workflow medical device
- Detección de si aplica.
- Preguntas específicas.
- Sección medical device.
- No dictamen MDR definitivo.

PR 12: Workflow recursos/piloto/viabilidad
- Recursos humanos.
- Recursos técnicos.
- Presupuesto.
- Duración piloto.
- Métricas.
- Riesgos.

PR 13: Generación de reporte estructurado
- Compilar secciones.
- Mantener trazabilidad.
- Versión en app.
- No export PDF todavía si conviene separarlo.

PR 14: Exportación PDF
- Plantilla PDF.
- Descarga.
- Control de versiones.

PR 15: Vista evaluador
- Vista de lectura para comité.
- Estado de madurez.
- Gaps resueltos/no resueltos.
- No aprobado/rechazado automático.

PR 16: Hardening piloto Hospital Clínic
- Seguridad.
- UX.
- Logging.
- Errores.
- Documentación.
- Demo flow.

Además, incluye una sección llamada:

"PRs de rescate multi-rama"

Dentro de esa sección, especifica:
- Qué PRs rescatan algo de main.
- Qué PRs rescatan algo de arnau.
- Qué PRs rescatan algo de orchestrator-legal.
- En qué casos conviene cherry-pick.
- En qué casos conviene reimplementar.
- En qué casos conviene descartar.

También incluye una sección llamada:

"Reglas para Archon en futuras PRs"

Con reglas como:
- No hacer merges completos de arnau u orchestrator-legal.
- No tocar módulos fuera del scope de cada PR.
- No implementar IA remota/VPS en el MVP.
- No introducir datos reales de pacientes.
- No generar dictámenes legales/clínicos definitivos.
- No inventar información en outputs de IA.
- Todo output generado debe mantener trazabilidad a documentos o respuestas.

Restricciones:
- No escribas código.
- No modifiques archivos fuera de docs/mvp/.
- Cada PR debe ser pequeña y verificable.
- No propongas merges caóticos.
- No propongas una reescritura total salvo justificación explícita.
