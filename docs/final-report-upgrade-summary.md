# Resumen de mejora del informe final

Fecha: 14 de junio de 2026.

## Qué ha cambiado

- El panel final del informe ahora se presenta como un dossier de propuesta, no como un volcado de datos.
- La exportación PDF usa una plantilla documental con portada, resumen ejecutivo, mapa de revisión, secciones preparadas, aspectos pendientes, avisos, lista de revisión, próximos pasos y pie de página.
- El botón de descarga PDF ya no aparece como acción deshabilitada cuando la fase no permite exportar. Si no procede, el panel explica que el PDF estará disponible cuando el informe esté listo.
- El nombre del archivo descargado deja de incluir el identificador interno del informe.

## Mejoras de UI del informe

- Nueva cabecera con título de propuesta, estado, fecha legible y etiqueta "Material para revisión humana".
- Resumen ejecutivo con problema, solución propuesta y foco para quien revise.
- Banda de resumen basada en datos reales: secciones recogidas, aspectos pendientes, puntos respondidos y materiales usados.
- Mapa de revisión por fases: problema, solución, datos/privacidad, revisión sanitaria, piloto/recursos e informe.
- Gaps visibles con estado, tipo, campo afectado, descripción y pista de avance si existe.
- Secciones preparadas renderizadas con Markdown simple en lugar de texto plano bruto.
- Lista de revisión y próximos pasos orientados a revisión humana.
- Avisos de seguridad visibles sin tono alarmista.

## Mejoras de PDF

- La portada usa el lenguaje de producto: "Informe de propuesta" y "Material para revisión humana".
- El PDF ya no imprime IDs, hashes, referencias de auditoría, versiones de esquema ni metadatos de exportación en el contenido visible.
- Las secciones técnicas antiguas como "Audit References" y "Export Metadata" se han eliminado del documento normal.
- El PDF mantiene los metadatos técnicos solo para auditoría interna del backend y cabeceras HTTP, no como contenido del informe.
- Se corrigió un problema de layout donde el footer podía crear páginas extra.
- Se corrigió un problema de coordenada horizontal de PDFKit que podía desplazar bloques después de filas en columnas.

## Copy

- Se normalizó la experiencia del informe a español claro.
- Se sustituyeron etiquetas técnicas por lenguaje de revisión: "Aspectos pendientes", "Lista de revisión", "Próximos pasos recomendados", "Material de apoyo".
- Los warnings del backend se mapean a copy seguro: no dictamen clínico/legal/regulatorio, no aprueba ni prioriza, requiere revisión humana competente.
- La acción principal es "Descargar PDF".

## Información técnica retirada del informe normal

Retirado del contenido visible de UI/PDF:

- Identificadores de propuesta e informe.
- Referencias de auditoría.
- Versiones de esquema o plantilla.
- Hashes de payload o PDF.
- Source IDs y tipos internos sin traducir.
- Secciones de metadatos de exportación.
- Copy técnico como JSON, payload, schema o workflow.

## Visual summaries

No se han inventado scores ni métricas de madurez. Los resúmenes visuales usan datos reales disponibles:

- Número de secciones recogidas.
- Número de gaps pendientes.
- Número de puntos respondidos.
- Número de materiales usados.
- Estado por sección o fase.
- Lista de revisión derivada de campos, secciones y gaps existentes.

## Seguridad

- Se mantiene el marco de revisión humana.
- El informe no presenta aprobaciones, cumplimiento, decisión regulatoria ni decisión clínica.
- Se recuerda que no debe sustituir una revisión clínica, legal ni regulatoria.
- Se mantiene el aviso de no introducir datos reales de pacientes en la demo local.

## Accesibilidad y responsive

- El panel usa encabezados semánticamente claros y regiones con `aria-label` donde ayudan.
- El botón de PDF solo existe cuando es accionable.
- Los estados no dependen solo del color: muestran texto como "Recogida", "Pendiente", "Requiere revisión" o "No aplica".
- El layout del informe colapsa a una columna en móvil, con filas de lista de revisión adaptadas.
- Los focos globales existentes se conservan.

## Archivos cambiados en esta fase

- `apps/web/src/lib/report-view.ts`
- `apps/web/src/components/BasicAlphaReportPanel.tsx`
- `apps/web/src/components/SessionWorkspace.tsx`
- `apps/web/src/components/SessionStatePanel.tsx`
- `apps/web/src/styles.css`
- `apps/api/src/services/pdf-report-template.ts`
- `apps/api/src/services/pdf-export-service.ts`
- `apps/web/src/lib/report-view.test.ts`
- `apps/web/src/components/local-demo-safety-notice.test.ts`
- `tests/unit/pdf-export-service.test.ts`
- `tests/integration/basic-report-pdf-export.test.ts`
- `docs/final-report-upgrade-audit.md`

## Validación ejecutada

- `pnpm --filter @sokrai/api type-check` - pasa.
- `pnpm --filter @sokrai/web type-check` - pasa.
- `pnpm --filter @sokrai/web exec vitest run --reporter=dot` - 113 tests pasan.
- `pnpm test:unit` - 110 tests API unitarios pasan.
- `pnpm build` - pasa.
- `pnpm lint` - pasa.
- `pnpm test:contracts` - 32 tests pasan.
- `pnpm --filter @sokrai/api exec vitest run ../../tests/integration/basic-report-pdf-export.test.ts --reporter=dot` - 3 tests pasan.
- PDF temporal generado en `/tmp/sokrai-final-report-sample.pdf` y revisado visualmente con PyMuPDF renderizado a PNG.

## Limitaciones encontradas

- La suite completa de integración del API sigue fallando en 3 tests no relacionados con informe/PDF:
  - `data-ai-privacy-flow.test.ts`: espera `chat_status: failed`, recibe `waiting_for_user`.
  - `medical-device-triage-flow.test.ts`: espera `chat_status: failed`, recibe `waiting_for_user`.
  - `resources-pilot-viability-flow.test.ts`: espera `chat_status: failed`, recibe `waiting_for_user`.
- Esos fallos no aparecen en la integración específica de informe/PDF y no proceden de los archivos cambiados para el reporte.
- No hay una ruta local presembrada que abra directamente un informe final en el navegador sin una sesión real ya compuesta. La UI web del informe se validó con render estático y tests; el PDF sí se inspeccionó visualmente.
- Chrome headless mostró una captura negra del visor PDF; se usó PyMuPDF como herramienta fiable de inspección visual.

## Recomendaciones siguientes

- Crear una ruta/dev fixture local para abrir un informe final de ejemplo sin depender de una sesión viva.
- Llevar las secciones adicionales del informe también al contrato web si el backend quiere que el panel final muestre siempre datos/privacidad, revisión sanitaria y piloto sin depender del agregado de sesión.
- Investigar los 3 fallos de integración de reparación de módulo, porque parecen una divergencia entre expectativa de test y comportamiento actual de recuperación.
