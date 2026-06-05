# Backlog de implementacion MVP SokrAI por PRs

Fecha: 2026-05-24
Estado: backlog estrategico actualizado antes de PRs de implementacion
Fuentes obligatorias revisadas:

- `docs/discovery/00-multi-branch-audit.md`
- `docs/discovery/01-current-state-audit.md`
- `docs/mvp/01-mvp-scope.md`
- `docs/prd/01-mvp-prd.md`
- `docs/architecture/01-technical-architecture.md`
- `docs/mvp/02-implementation-backlog.md`

## 1. Estrategia

El backlog queda ordenado en dos hitos:

- **MVP Alpha**: PR 0 a PR 8.
- **MVP Clinic Pilot**: PR 9 a PR 13.

Las PRs futuras quedan fuera del plan inmediato y requieren decision explicita.

Reglas de trabajo:

- Partir de `main` o de una rama limpia tras PR 0.
- No hacer merges completos de `arnau` ni `orchestrator-legal`.
- No hacer cherry-picks amplios.
- No introducir RAG avanzado en Alpha.
- No introducir auth enterprise en Alpha.
- No introducir proveedor IA remoto/VPS en MVP.
- No esconder reglas criticas en n8n.
- Mantener API/schemas/prompts/persistencia como fuente de verdad.
- Mantener `structured-brief.schema.json` y API schemas como contratos canonicos.

## 2. Orden recomendado de PRs

### MVP Alpha

1. **PR 0: Documentacion estrategica.**
2. **PR 1: Estabilizar core actual.**
3. **PR 2A: Contratos/domain types del modelo de datos.**
4. **PR 2B: Migraciones/repositorios del modelo de datos.**
5. **PR 3: Abstraccion IA/Ollama.**
6. **PR 4: Documentos/extraccion/fuentes.**
7. **PR 5: Gap analysis.**
8. **PR 6: Modulo problema.**
9. **PR 7: Modulo solucion.**
10. **PR 8: Reporte basico Alpha.**

### MVP Clinic Pilot

11. **PR 9: Perfil regulatorio `hospital_clinic_v1` y modulo datos/IA/privacidad.**
12. **PR 10: Medical device condicional.**
13. **PR 11: Recursos/piloto/viabilidad.**
14. **PR 12: Exportacion PDF.**
15. **PR 13: Hardening demo local Clinic.**

### PRs futuras

- **PR futura: Evaluacion RAG desde `arnau`.**
- **PR futura: Orquestador legal/regulatorio avanzado.**
- **PR futura: Proveedor IA remoto/VPS/on-prem potente.**

## 3. Dependencias

| PR | Depende de | Motivo |
| --- | --- | --- |
| PR 0 | Ninguna | Fija alcance, decisiones y limites antes de codigo. |
| PR 1 | PR 0 | Estabiliza el core con acuerdos claros. |
| PR 2A | PR 1 | Define contratos/tipos sobre un core verificable. |
| PR 2B | PR 2A | Implementa persistencia despues de contratos. |
| PR 3 | PR 1, PR 2A | Desacopla Ollama sin cambiar producto. |
| PR 4 | PR 2B | Documentos/fuentes necesitan modelo persistente. |
| PR 5 | PR 3, PR 4 | Gap analysis necesita IA, brief y fuentes. |
| PR 6 | PR 5 | Problema opera sobre gaps y chats. |
| PR 7 | PR 6 | Solucion reutiliza patron modular. |
| PR 8 | PR 6, PR 7 | Reporte Alpha compone problema, solucion, gaps y fuentes. |
| PR 9 | PR 8 | Clinic Pilot empieza despues del Alpha funcional. |
| PR 10 | PR 9 | Medical device depende de senales/gaps sensibles. |
| PR 11 | PR 8 | Recursos/piloto puede apoyarse en modelo modular del Alpha. |
| PR 12 | PR 9, PR 10, PR 11 | PDF final parte del reporte completo Clinic. |
| PR 13 | PR 12 | Hardening cierra demo local Clinic. |

## 4. PR 0: Documentacion estrategica

Objetivo:

- Actualizar scope, PRD, arquitectura, backlog y ADRs con las decisiones humanas.

Archivos esperados:

- `docs/mvp/01-mvp-scope.md`
- `docs/prd/01-mvp-prd.md`
- `docs/architecture/01-technical-architecture.md`
- `docs/mvp/02-implementation-backlog.md`
- `docs/decisions/ADR-001-mvp-alpha-vs-clinic-pilot.md`
- `docs/decisions/ADR-002-regulatory-framework-profiles.md`
- `docs/decisions/ADR-003-rag-outside-alpha-happy-path.md`
- `docs/decisions/ADR-004-local-ollama-now-remote-provider-later.md`

Restricciones:

- Solo documentacion estrategica.
- No codigo.
- No modificar `apps/`, `contracts/`, `db/`, `infra/`, `prompts/` ni `tests/`.

Criterios de aceptacion:

- El alcance queda dividido en Alpha y Clinic Pilot.
- RAG queda fuera del happy path Alpha.
- Ollama local queda como proveedor actual.
- VPS/proveedor remoto queda en roadmap.
- n8n queda como orquestador ligero.
- Auth enterprise no bloquea PRs iniciales.
- `hospital_clinic_v1` queda definido.
- Backlog refleja el orden actualizado.

## 5. PR 1: Estabilizar core actual

Objetivo:

- Verificar y corregir el core actual sin ampliar funcionalidad.

Incluye:

- Setup local reproducible.
- Scripts de verificacion.
- Happy path actual: start, primera pregunta, reply, status/recover, resume.
- Documentacion de ejecucion local.
- Confirmar que n8n coordina y API conserva reglas.

No incluye:

- Modelo nuevo amplio.
- RAG.
- Legal/regulatorio.
- Auth enterprise.
- Proveedor remoto.

## 6. PR 2A: Contratos/domain types del modelo de datos

Objetivo:

- Definir contratos y tipos de dominio para propuesta, documentos, fuentes, gaps, chats, secciones y reporte.

Incluye:

- Schemas y DTOs segun convenciones del repo.
- Estados Alpha.
- Fixtures validos/invalidos.
- Compatibilidad conceptual con `structured-brief.schema.json`.

No incluye:

- Migraciones.
- Repositorios.
- UI completa.
- Modulos Clinic Pilot.

## 7. PR 2B: Migraciones/repositorios del modelo de datos

Objetivo:

- Persistir el modelo definido en PR 2A.

Incluye:

- Migraciones incrementales.
- Repositorios.
- Constraints y estados.
- Auditoria append-only.
- Tests de persistencia y resume.

No incluye:

- Eliminacion brusca de tablas actuales.
- RAG/pgvector.
- PDF.

## 8. PR 3: Abstraccion IA/Ollama

Objetivo:

- Desacoplar el dominio de Ollama manteniendo Ollama local como implementacion activa.

Incluye:

- Puerto conceptual de proveedor IA.
- Adapter Ollama.
- Errores tipados.
- Timeouts por proposito.
- Persistencia de provider/model/prompt/schema.
- Fake provider en tests.

No incluye:

- Proveedor externo.
- VPS.
- Fallback remoto.
- Streaming si complica contratos.

## 9. PR 4: Documentos/extraccion/fuentes

Objetivo:

- Soportar documentacion subida o pegada como fuentes internas trazables.

Incluye:

- Texto pegado.
- PDF con texto extraible si ya encaja con el stack.
- Hash/metadatos.
- Estados de extraccion.
- Fuentes internas estables.
- Avisos de privacidad.

No incluye:

- OCR.
- RAG avanzado.
- Corpus externo.
- Datos reales de pacientes.

## 10. PR 5: Gap analysis

Objetivo:

- Detectar gaps iniciales para el Alpha.

Incluye:

- Gaps descriptivos, no scoring.
- Origen/fuente/ausencia.
- Preguntas candidatas.
- Estados de gap.
- Validacion por schema.
- Persistencia inicial en `alpha_gaps` durante `proposal_start_v1`.
- Exposicion de `gaps` en la vista de auditoria de sesion.

No incluye:

- Dictamen.
- Regulacion Clinic.
- Medical device.
- Costes.

## 11. PR 6: Modulo problema

Objetivo:

- Convertir el carril actual de definicion del problema en modulo Alpha robusto.

Incluye:

- Una pregunta principal por turno.
- Maximo tres hallazgos/diagnosis.
- Respuestas vagas no avanzan estado.
- Seccion problema versionada.
- Trazabilidad gap -> pregunta -> respuesta -> seccion.
- Resume.

No incluye:

- Legal/regulatorio.
- Solucion.
- PDF.

## 12. PR 7: Modulo solucion

Objetivo:

- Implementar chat y seccion de solucion.

Incluye:

- Preguntas sobre solucion, usuarios, funcionamiento, alternativas, valor diferencial y alcance.
- Seccion solucion versionada.
- Fuentes internas.
- Resume.

No incluye:

- Plan comercial completo.
- Costes detallados.
- Medical device.

## 13. PR 8: Reporte basico Alpha

Estado:

- Implementado en esta rama como reporte estructurado en app.

Objetivo:

- Mostrar dentro de la app un reporte basico estructurado.

Incluye:

- Brief.
- Gaps iniciales y estado.
- Seccion problema.
- Seccion solucion.
- Fuentes internas.
- Advertencias de no dictamen/no aprobacion.
- Version basica del reporte en app.
- Endpoint interno `POST /internal/reports/basic-alpha/compose`.
- Endpoint publico `GET /api/v1/sessions/:sessionId/report`.
- Persistencia idempotente en `basic_reports`.
- Tests de contrato, dominio, integracion y UI para evitar salida cruda de modelo.

No incluye:

- PDF.
- Modulos Clinic Pilot.
- Vista evaluador enterprise.
- Legal/regulatorio, medical device, RAG, scoring, ranking, aprobacion o rechazo.

Criterio Alpha:

- Al terminar PR 8, el MVP Alpha debe ser demostrable end-to-end.

## 14. PR 9: Perfil `hospital_clinic_v1` y modulo datos/IA/privacidad

Objetivo:

- Iniciar MVP Clinic Pilot con el perfil regulatorio por defecto.

Incluye `hospital_clinic_v1`:

- RGPD / GDPR.
- Cybersecurity Act.
- EEDS / EHDS.
- MDR.
- EU AI Act.
- HTAR.

Incluye modulo:

- Datos personales/salud.
- IA y validacion.
- Privacidad.
- Gobernanza.
- Ciberseguridad.
- Gaps y preguntas.
- "requiere revision humana competente" cuando corresponda.

No incluye:

- Dictamen legal/regulatorio.
- Cumplimiento/incumplimiento definitivo.
- UI de configuracion de frameworks.
- Editor dinamico.
- RAG legal.

## 15. PR 10: Medical device condicional

Objetivo:

- Activar un modulo de triage solo cuando haya senales o incertidumbre.

Incluye:

- Preguntas condicionales.
- Estado de incertidumbre.
- `needs_human_review` cuando corresponda.
- Lenguaje no definitivo.

No incluye:

- Clasificacion MDR definitiva.
- Decision de producto sanitario.
- Dictamen.

## 16. PR 11: Recursos/piloto/viabilidad

Objetivo:

- Recoger informacion minima de ejecucion del piloto.

Incluye:

- Equipo.
- Recursos.
- Entorno piloto.
- Dependencias.
- Indicadores.
- Restricciones.
- Riesgos operativos.

No incluye:

- Analisis financiero detallado.
- Scoring de viabilidad.
- Decision de aprobacion.

## 17. PR 12: Exportacion PDF

Objetivo:

- Exportar PDF desde el reporte estructurado.
- Descarga local desde `GET /api/v1/sessions/:sessionId/report.pdf`.

Incluye:

- Version, fecha e identificador.
- Gaps abiertos.
- Fuentes internas.
- Advertencias.
- Metadata/hash/evento de exportacion.
- Evento `basic_report_pdf_exported` en `audit_events`.

No incluye:

- PDF desde HTML improvisado sin estructura.
- Raw model output.
- Servicio remoto de PDF.
- Workflow n8n binario nuevo.

## 18. PR 13: Hardening demo local Clinic

Objetivo:

- Preparar demo local Clinic tras Alpha + modulos Clinic + PDF.

Incluye:

- Avisos de privacidad.
- Secretos seguros para modo no local.
- Logs sin contenido sensible por defecto.
- Errores recuperables.
- Documentacion de ejecucion.
- Politica inicial de retencion/borrado.
- Restriccion de vistas tecnicas.

No incluye:

- Auth enterprise completa.
- VPS/remoto.
- RAG avanzado.
- Integracion con sistemas hospitalarios.

## 19. PR futura: Evaluacion RAG desde `arnau`

Condiciones de entrada:

- Alpha completo.
- Decision explicita.
- Corpus aprobado.
- Politica de citas/fuentes.
- Criterios de auditoria.

Objetivo:

- Evaluar el RAG de `arnau` como adapter opcional, no dependencia obligatoria.

No debe:

- Hacer pgvector obligatorio para Alpha.
- Usar corpus no aprobado.
- Autocompletar hechos no aportados.

## 20. PR futura: Orquestador legal/regulatorio avanzado

Condiciones de entrada:

- Clinic Pilot validado.
- Contratos propios.
- Revision humana competente.
- Lenguaje de no dictamen.

No debe partir de merge completo de `orchestrator-legal`.

## 21. PR futura: Proveedor IA remoto/VPS/on-prem potente

Condiciones de entrada:

- Necesidad demostrada por latencia/calidad.
- Decision de seguridad/operacion.
- Abstraccion IA ya estable.
- Politica clara de datos.

No entra en MVP.

## 22. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Scope creep antes de Alpha | Alto | PR 0-8 cerrados alrededor de problema/solucion/reporte basico. |
| RAG bloquea core | Alto | RAG avanzado queda como PR futura. |
| Legal parece dictamen | Alto | Modulo sensible solo en Clinic Pilot, con gaps y revision humana. |
| Ollama local tiene baja calidad | Medio | Contratos estrictos, repair unico, fake provider en tests y abstraccion IA. |
| n8n contiene reglas criticas | Medio | API/schemas/prompts como fuente de verdad. |
| Auth bloquea PRs iniciales | Medio | Alpha demo local sin auth corporativa; proteccion minima antes de usuarios reales. |
| `session_id` se usa en piloto real | Alto | Documentar que solo vale para demo local. |
| Merge de ramas divergentes introduce regresiones | Alto | No merges completos; PRs futuras aisladas. |

## 23. Definition of done por fase

MVP Alpha:

- Happy path de propuesta -> documentos/texto -> gaps -> problema -> solucion -> reporte basico funciona end-to-end.
- Payloads cumplen schemas.
- Persistencia y resume cubiertos.
- Prompts/workflows usados estan versionados.
- Docs explican como ejecutar la demo local Alpha.

MVP Clinic Pilot:

- Alpha sigue funcionando.
- Modulos Clinic no emiten dictamen.
- PDF sale del reporte estructurado.
- Hardening local documentado.
- `hospital_clinic_v1` se usa como perfil por defecto.
