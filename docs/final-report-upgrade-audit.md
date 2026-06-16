# Auditoría de mejora del informe final

Fecha: 14 de junio de 2026.

## Resumen del flujo actual

El informe final se genera a partir de `BasicAlphaReport`. El frontend lo pide con `GET /api/v1/sessions/:sessionId/report` y lo compone con `POST /api/v1/sessions/:sessionId/report` cuando la fase `Informe` está disponible. La descarga PDF usa `GET /api/v1/sessions/:sessionId/report.pdf`.

El gating de producto ya está bien orientado: `SessionWorkspace` solo muestra `BasicAlphaReportPanel` cuando existe un `report`, y el botón de descarga depende de la fase `Exportación`. No hay que abrir exportación durante la entrevista activa.

## Datos disponibles para el informe

El contrato `basic-alpha-report.schema.json` aporta:

- Título, objetivo y resumen estructurado de la propuesta.
- Gaps actuales con módulo, estado, campo, descripción, pista de pregunta y warnings.
- Secciones generadas de problema y solución.
- Material interno usado como fuente, con tipo y etiqueta.
- Warnings del informe.
- Fecha de generación.
- Metadatos internos como identificadores, versión de esquema y referencias de auditoría.

La exportación PDF puede incorporar secciones adicionales ya generadas en el agregado de propuesta: datos y privacidad, revisión sanitaria y piloto/recursos. Estas secciones no están siempre dentro del `BasicAlphaReport` web, pero el servicio PDF las puede leer del agregado.

## Problemas actuales de UI

- El panel web ya está en español y oculta parte de la información técnica, pero aún se siente como un panel de datos: resumen, secciones, gaps, fuentes y warnings sin narrativa de dossier.
- La cabecera no diferencia suficientemente entre estado de revisión, contexto ejecutivo y acción de exportación.
- Los gaps se muestran principalmente por estado, no por impacto o módulo, y faltan etiquetas de acción para el revisor.
- El resumen ejecutivo no está compuesto como una lectura rápida. Hay datos útiles, pero no una jerarquía clara de "qué es", "qué falta" y "qué revisar".
- Las secciones de privacidad, revisión sanitaria y piloto no aparecen en el panel web porque el contrato web no las trae dentro del informe básico.
- Las fuentes se muestran como material usado, pero no hace falta darles peso visual si no aportan decisión al revisor.

## Problemas actuales del PDF

- El PDF se genera con PDFKit, pero la plantilla es una lista técnica de claves y valores.
- La portada dice "Basic Alpha Report" y "Structured proposal snapshot", que no es lenguaje de producto para un usuario normal.
- El PDF muestra identificadores de propuesta e informe, versión de esquema, versión de plantilla, referencias de auditoría, hash del payload y metadatos de exportación.
- Las secciones incluyen `Kind`, `Version/status` y conteos de sources/gaps con lenguaje técnico.
- Las fuentes se imprimen como `source_id - source_kind - label`.
- Las referencias de auditoría se imprimen como `agent_run: ...`.
- Las advertencias salen en inglés y con tono interno.
- No hay portada profesional, resumen ejecutivo, mapa visual de fases, checklist de revisión ni próximos pasos.

## Información técnica visible encontrada

En la plantilla PDF actual:

- `Proposal ID`
- `Report ID`
- `Report schema`
- `Template version`
- `Kind`
- `Version/status`
- `Sources/gaps`
- `source_id`
- `source_kind`
- `Audit References`
- `agent_run`
- `Export Metadata`
- `Export ID`
- `Report payload SHA-256`

En el panel web normal no se renderizan los identificadores principales, pero `report-view.ts` aún deriva `reportId`, `schemaVersion` y `auditRefCount`. No aparecen en pantalla ahora mismo, pero conviene no convertirlos en presentación normal.

## Copy débil

- "Basic Alpha Report", "Structured Brief", "Open Gaps", "Internal Sources", "Export Metadata" y textos similares del PDF son lenguaje de sistema.
- "Descargando..." es correcto, pero puede ser más claro como "Preparando PDF...".
- Los warnings del backend llegan en inglés y deben mapearse siempre a lenguaje humano en UI y PDF.

## Jerarquía visual débil

- Falta una capa de lectura ejecutiva antes del detalle.
- No hay visualización honesta del estado por secciones.
- Los bloques tienen poca diferenciación entre resumen, pendientes, secciones narrativas y seguridad.
- El PDF no usa ritmo documental: no hay portada, bloques de atencion, tabla de revisión ni footer de documento.

## Oportunidades de resumen visual

Sin inventar scores, se pueden usar datos reales para:

- Conteo de secciones recogidas.
- Conteo de gaps pendientes y resueltos.
- Estado por fase/sección.
- Checklist de revisión derivada de campos del structured brief y gaps existentes.
- Bloques de próximos pasos basados en si quedan gaps abiertos.
- Etiquetas de estado: "Listo para revisar", "Pendiente de validar", "No aplica", "Falta información".

## Plan de implementación

1. Centralizar presentación del informe: etiquetas españolas, estados, secciones, gaps, resumen ejecutivo, checklist y próximos pasos.
2. Rediseñar `BasicAlphaReportPanel` como dossier: cabecera documental, resumen ejecutivo, mapa de revisión, gaps accionables, secciones narrativas, checklist, avisos y panel de exportación.
3. Reescribir la plantilla PDF con PDFKit: portada, resumen ejecutivo, mapa de secciones, información recogida, gaps, checklist, avisos y footer. El PDF no debe imprimir metadatos técnicos en el contenido visible.
4. Mantener metadatos técnicos solo en cabeceras/audit interno del backend, no en el documento ni UI normal.
5. Ajustar tests para proteger que el PDF ya no contiene hashes, referencias de auditoría ni identificadores visibles.
6. Validar typecheck, tests, build/lint si están disponibles, y revisar renderizado en navegador/PDF si el entorno local lo permite.

## Archivos probablemente afectados

- `apps/web/src/lib/report-view.ts`
- `apps/web/src/components/BasicAlphaReportPanel.tsx`
- `apps/web/src/styles.css`
- `apps/api/src/services/pdf-report-template.ts`
- `tests/unit/pdf-export-service.test.ts`
- `apps/web/src/lib/report-view.test.ts`
- `apps/web/src/components/local-demo-safety-notice.test.ts`
- `docs/final-report-upgrade-summary.md`
