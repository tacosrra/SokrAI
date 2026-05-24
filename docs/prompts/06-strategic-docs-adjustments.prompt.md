Actualiza la documentación estratégica de SokrAI antes de empezar las PRs de implementación.

Fuentes obligatorias:
- docs/discovery/00-multi-branch-audit.md
- docs/discovery/01-current-state-audit.md
- docs/mvp/01-mvp-scope.md
- docs/prd/01-mvp-prd.md
- docs/architecture/01-technical-architecture.md
- docs/mvp/02-implementation-backlog.md

Contexto:
Ya hemos revisado la documentación generada y queremos aplicar varias decisiones humanas antes de empezar PRs de código.

Decisiones a aplicar:

1. Dividir claramente el alcance en:
   A. MVP Alpha
   B. MVP Clinic Pilot

MVP Alpha debe ser el primer objetivo funcional y debe incluir:
- crear propuesta
- subir o pegar documentación
- analizar gaps iniciales
- chat de definición del problema
- generación de sección problema
- chat de definición de solución
- generación de sección solución
- reporte básico estructurado en la app

MVP Clinic Pilot debe añadir:
- módulo regulatorio/datos/IA/privacidad
- medical device condicional
- recursos/piloto/viabilidad
- exportación PDF final
- hardening de demo local

2. RAG:
- Mantener RAG fuera del happy path del MVP Alpha.
- Documentar que RAG avanzado no entra hasta que haya corpus aprobado, política de citas/fuentes y decisión explícita.
- Mantener RetrievalPort / NoopRetrieval / UploadedDocumentsRetrieval simple como posible arquitectura futura o preparatoria.
- Dejar claro que el RAG de arnau se evaluará más adelante como adapter opcional, no como dependencia obligatoria.

3. IA remota/VPS:
- Documentar que actualmente Ollama corre local.
- Documentar que más adelante podría existir un proveedor local alojado en VPS/on-prem más potente.
- Dejar esto como roadmap/future architecture, no como parte del MVP.
- La arquitectura debe dejar preparada la abstracción de proveedor IA, pero no implementar ni diseñar despliegue VPS en MVP.

4. n8n:
- Mantener n8n como orquestador ligero en MVP.
- La API debe seguir siendo dueña de reglas, contratos, prompts, persistencia y validaciones.
- n8n no debe contener lógica crítica de negocio.

5. Autenticación:
- Para el MVP Alpha/demo local, asumir que no hay auth corporativa.
- Mantener advertencia de que para usuarios reales del Hospital Clínic se necesitará protección mínima.
- No bloquear PRs iniciales por auth enterprise.
- Documentar que session_id es aceptable solo para demo local, no para piloto real con datos sensibles.

6. Marco normativo Hospital Clínic:
Añadir un perfil de evaluación regulatoria llamado hospital_clinic_v1 con estas familias normativas iniciales:
- RGPD / GDPR: protección de datos personales.
- Cybersecurity Act: ciberseguridad/certificación TIC.
- EEDS / EHDS: Espacio Europeo de Datos de Salud.
- MDR: Medical Device Regulation.
- EU AI Act: sistemas de inteligencia artificial.
- HTAR: Health Technology Assessment Regulation.

Importante:
- La herramienta no debe dar dictamen legal/regulatorio definitivo.
- Estas normativas deben usarse para detectar gaps y formular preguntas.
- El output debe decir “requiere revisión humana competente” cuando corresponda.
- No debe afirmar cumplimiento/incumplimiento definitivo.

7. Configurabilidad institucional:
- Diseñar conceptualmente los marcos normativos como configurables por institución.
- En MVP solo hace falta un perfil por defecto: hospital_clinic_v1.
- La arquitectura debe dejar claro que en futuras instituciones se podrán configurar otros frameworks.
- No implementar UI de configuración en MVP Alpha.
- No implementar editor dinámico de frameworks en MVP.
- Documentar esto como extensibilidad futura.

8. Backlog:
Actualizar el backlog para reflejar el nuevo orden recomendado:
- PR 0: Documentación estratégica.
- PR 1: Estabilizar core actual.
- PR 2A: Contratos/domain types del modelo de datos.
- PR 2B: Migraciones/repositorios del modelo de datos.
- PR 3: Abstracción IA/Ollama.
- PR 4: Documentos/extracción/fuentes.
- PR 5: Gap analysis.
- PR 6: Módulo problema.
- PR 7: Módulo solución.
- PR 8: Reporte básico Alpha.
- PR 9: Perfil regulatorio hospital_clinic_v1 y módulo datos/IA/privacidad.
- PR 10: Medical device condicional.
- PR 11: Recursos/piloto/viabilidad.
- PR 12: Exportación PDF.
- PR 13: Hardening demo local Clinic.
- PR futura: Evaluación RAG desde arnau.
- PR futura: Orquestador legal/regulatorio avanzado.
- PR futura: proveedor IA remoto/VPS/on-prem potente.

Archivos a actualizar:
- docs/mvp/01-mvp-scope.md
- docs/prd/01-mvp-prd.md
- docs/architecture/01-technical-architecture.md
- docs/mvp/02-implementation-backlog.md

Si conviene, crear también:
- docs/decisions/ADR-001-mvp-alpha-vs-clinic-pilot.md
- docs/decisions/ADR-002-regulatory-framework-profiles.md
- docs/decisions/ADR-003-rag-outside-alpha-happy-path.md
- docs/decisions/ADR-004-local-ollama-now-remote-provider-later.md

Restricciones:
- No escribas código.
- No modifiques apps/, contracts/, db/, infra/, prompts/ ni tests/.
- No hagas merges.
- No hagas cherry-picks.
- No implementes configuración dinámica todavía.
- No implementes RAG.
- No implementes auth.
- No implementes proveedor IA remoto.
- Solo documentación estratégica y decisiones.
