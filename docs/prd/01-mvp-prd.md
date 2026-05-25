# PRD MVP SokrAI para Hospital Clinic de Barcelona

Fecha: 2026-05-24
Estado: PRD estrategico actualizado antes de PRs de implementacion
Fuentes obligatorias revisadas:

- `docs/discovery/00-multi-branch-audit.md`
- `docs/discovery/01-current-state-audit.md`
- `docs/mvp/01-mvp-scope.md`
- `docs/prd/01-mvp-prd.md`
- `docs/architecture/01-technical-architecture.md`
- `docs/mvp/02-implementation-backlog.md`

## 1. Resumen ejecutivo

SokrAI es un asistente local de maduracion de propuestas de innovacion sanitaria. Su primer objetivo no es construir todo el piloto institucional, sino entregar un **MVP Alpha** que pruebe el flujo central: crear propuesta, incorporar documentacion, detectar gaps, conversar sobre problema y solucion, generar secciones trazables y mostrar un reporte basico en la app.

Despues del Alpha, el **MVP Clinic Pilot** anadira modulos sensibles y hardening: regulatorio/datos/IA/privacidad, medical device condicional, recursos/piloto/viabilidad, exportacion PDF y preparacion de demo local para Hospital Clinic.

La herramienta no toma decisiones de aprobacion, cumplimiento, clasificacion legal/regulatoria ni medical device. Todo output sensible debe formularse como gaps, preguntas, incertidumbre y necesidad de revision humana competente.

## 2. Problema a resolver

Las propuestas de innovacion sanitaria suelen llegar incompletas o poco comparables. Esto genera iteraciones manuales antes de que un equipo de innovacion o un comite pueda revisarlas con claridad.

Problemas recurrentes:

- Problema descrito de forma vaga o confundido con la solucion.
- Solucion poco explicita: usuarios, funcionamiento, alcance, alternativas y valor diferencial.
- Documentacion inicial dispersa o pegada sin estructura.
- Gaps de informacion que no se detectan hasta tarde.
- Falta de trazabilidad entre documentos, respuestas y texto final.
- Riesgo de que se interpreten revisiones sensibles como dictamen legal, regulatorio o clinico.

## 3. Objetivos

Objetivos del MVP Alpha:

1. Crear una propuesta desde la app.
2. Aceptar documentacion subida o pegada.
3. Extraer un brief inicial validado contra contratos.
4. Detectar gaps iniciales.
5. Guiar un chat de definicion del problema.
6. Generar una seccion problema.
7. Guiar un chat de definicion de solucion.
8. Generar una seccion solucion.
9. Mostrar un reporte basico estructurado dentro de la app.
10. Mantener persistencia, resume, trazabilidad y auditoria basica.

Objetivos del MVP Clinic Pilot:

1. Anadir modulo regulatorio/datos/IA/privacidad.
2. Anadir medical device condicional.
3. Anadir recursos/piloto/viabilidad.
4. Exportar PDF final desde reporte estructurado.
5. Endurecer la demo local para un contexto Hospital Clinic.

## 4. No objetivos

No objetivos del MVP Alpha:

- No implementar modulo regulatorio/datos/IA/privacidad.
- No implementar medical device condicional.
- No implementar recursos/piloto/viabilidad.
- No exportar PDF final.
- No implementar RAG avanzado.
- No implementar autenticacion corporativa.
- No implementar proveedor IA remoto/VPS.
- No construir un editor dinamico de frameworks.
- No integrar `orchestrator-legal`.

No objetivos del MVP Clinic Pilot:

- No emitir dictamen legal, regulatorio, clinico, de privacidad o medical device.
- No afirmar cumplimiento/incumplimiento definitivo.
- No aprobar, rechazar, priorizar ni rankear propuestas.
- No procesar datos reales de pacientes.
- No integrar sistemas hospitalarios reales.
- No desplegar arquitectura VPS/remota salvo decision posterior.
- No convertir RAG en dependencia obligatoria sin corpus aprobado.

## 5. Usuarios

Usuarios Alpha:

- Equipo de implementacion SokrAI.
- Usuarios internos de prueba con datos ficticios o anonimizados.
- Revisores de producto que validan el flujo problema-solucion.

Usuarios Clinic Pilot:

- Equipos proponentes internos o colaboradores del Hospital Clinic.
- Equipo de innovacion o preevaluacion.
- Revisores humanos competentes en datos, privacidad, IA, regulatorio, clinico o medical device.
- Administradores tecnicos del piloto local.

## 6. Flujo MVP Alpha

1. El usuario crea una propuesta.
2. Introduce titulo, objetivo, descripcion y documentacion disponible.
3. Puede subir un documento soportado o pegar texto.
4. La API normaliza input, calcula metadatos/fuentes y genera `structured_brief`.
5. El sistema detecta gaps iniciales descriptivos.
6. La app muestra el estado inicial de madurez, sin scoring.
7. El usuario abre el chat de problema.
8. El agente hace una pregunta principal por turno.
9. El usuario responde y el sistema actualiza gaps/estado.
10. Cuando hay informacion suficiente, se genera seccion problema.
11. El usuario abre el chat de solucion.
12. El agente pregunta por solucion, usuarios, funcionamiento, alternativas y valor.
13. Se genera seccion solucion.
14. La app compone un reporte basico estructurado con brief, gaps, problema, solucion, fuentes internas y advertencias.
15. El usuario puede reanudar la propuesta desde estado persistido.

## 7. Flujo MVP Clinic Pilot

El Clinic Pilot parte del Alpha y anade:

1. Modulo regulatorio/datos/IA/privacidad con perfil `hospital_clinic_v1`.
2. Preguntas sobre datos personales, datos de salud, IA, gobernanza, validacion, ciberseguridad y privacidad.
3. Medical device condicional cuando existan senales o incertidumbre.
4. Recursos/piloto/viabilidad: equipo, entorno, dependencias, indicadores, restricciones y plan piloto.
5. Reporte final completo.
6. Exportacion PDF.
7. Hardening local: privacidad, secretos, logs, errores, retencion inicial y documentacion de ejecucion.

## 8. Requisitos funcionales Alpha

- RF-A01: crear propuesta con titulo, objetivo y descripcion.
- RF-A02: aceptar texto pegado y/o documento soportado.
- RF-A03: normalizar input y extraer texto cuando sea posible.
- RF-A04: validar payloads contra schemas declarados.
- RF-A05: generar `structured_brief`.
- RF-A06: persistir propuesta/sesion, documentos o fuentes, runs, turns, snapshots/eventos segun el modelo vigente.
- RF-A07: generar gaps iniciales descriptivos.
- RF-A08: ejecutar chat de problema con una pregunta principal por turno.
- RF-A09: generar seccion problema con fuentes internas.
- RF-A10: ejecutar chat de solucion con una pregunta principal por turno.
- RF-A11: generar seccion solucion con fuentes internas.
- RF-A12: mostrar reporte basico estructurado en la app.
- RF-A13: permitir resume/replay local del flujo.
- RF-A14: registrar prompts, modelos, schema version, input/output y errores.
- RF-A15: mantener n8n como orquestador ligero sin logica critica.

## 9. Requisitos funcionales Clinic Pilot

- RF-C01: activar modulo regulatorio/datos/IA/privacidad despues del Alpha.
- RF-C02: usar el perfil `hospital_clinic_v1`.
- RF-C03: formular gaps y preguntas por familias normativas sin dictamen.
- RF-C04: incluir "requiere revision humana competente" cuando corresponda.
- RF-C05: activar medical device solo si hay senales o incertidumbre.
- RF-C06: registrar medical device como triage no definitivo.
- RF-C07: ejecutar recursos/piloto/viabilidad.
- RF-C08: componer reporte final estructurado.
- RF-C09: exportar PDF desde el reporte estructurado.
- RF-C10: endurecer demo local para uso Clinic controlado.

## 10. Requisitos no funcionales

- RNF01: ejecucion local/on-premise para MVP.
- RNF02: Ollama local como proveedor IA actual.
- RNF03: abstraccion preparada para proveedor IA futuro.
- RNF04: sin proveedor externo ni fallback remoto en MVP.
- RNF05: PostgreSQL como fuente de verdad.
- RNF06: JSON Schema como fuente de verdad contractual.
- RNF07: prompts versionados en archivos.
- RNF08: workflows n8n versionados.
- RNF09: reglas criticas en API/schemas/dominio, no en nodos n8n.
- RNF10: RAG avanzado fuera del happy path Alpha.
- RNF11: `session_id` aceptable solo para demo local.
- RNF12: proteccion minima obligatoria antes de usuarios reales con datos sensibles.
- RNF13: no datos reales de pacientes.
- RNF14: no raw model output en vistas no tecnicas.
- RNF15: auditoria suficiente para reconstruir gaps, preguntas, respuestas, secciones y reporte.

## 11. Perfil regulatorio `hospital_clinic_v1`

El Clinic Pilot define un perfil inicial por defecto:

`hospital_clinic_v1`

Familias normativas:

- RGPD / GDPR: proteccion de datos personales.
- Cybersecurity Act: ciberseguridad/certificacion TIC.
- EEDS / EHDS: Espacio Europeo de Datos de Salud.
- MDR: Medical Device Regulation.
- EU AI Act: sistemas de inteligencia artificial.
- HTAR: Health Technology Assessment Regulation.

Uso del perfil:

- Detectar huecos de informacion.
- Formular preguntas.
- Marcar incertidumbre.
- Recomendar revision humana competente cuando corresponda.

Limites:

- No da dictamen.
- No afirma cumplimiento/incumplimiento.
- No clasifica definitivamente medical device.
- No sustituye revision experta.

## 12. RAG y fuentes

Decision de producto:

- El Alpha no depende de RAG avanzado.
- El Alpha usa documentos subidos, texto pegado y respuestas del usuario.
- RAG avanzado se pospone hasta corpus aprobado, politica de citas/fuentes y decision explicita.
- El RAG de `arnau` se evaluara mas adelante como adapter opcional.

Arquitectura permitida:

- `RetrievalPort` como preparacion.
- `NoopRetrieval` por defecto.
- `UploadedDocumentsRetrieval` simple si ayuda a localizar fuentes internas.

No permitido:

- pgvector obligatorio.
- context packs no aprobados.
- RAG como requisito para completar Alpha.
- Retrieval que autocompleta hechos no aportados.

## 13. IA local y proveedor futuro

Ollama corre actualmente local y debe seguir siendo el proveedor del MVP.

La arquitectura debe desacoplar el dominio mediante un puerto de proveedor IA, pero no debe implementar proveedor remoto ni disenar despliegue VPS en el MVP.

Roadmap futuro:

- proveedor local alojado en VPS/on-prem mas potente;
- seleccion de modelos por tarea;
- evaluacion de latencia/calidad;
- cambios solo tras decision de seguridad y operacion.

## 14. n8n

n8n coordina flujos, pero la API conserva reglas, contratos, prompts, validaciones, persistencia y auditoria.

En el MVP no se permite que n8n contenga logica critica de negocio. Los workflows deben mantenerse exportados y versionados.

## 15. Autenticacion

Alpha/demo local:

- No hay auth corporativa.
- `session_id` puede usarse para retomar una demo local.
- No se deben bloquear PRs iniciales por auth enterprise.

Clinic Pilot con usuarios reales o datos sensibles:

- `session_id` solo no basta.
- Se requiere proteccion minima antes de exponer datos reales o sensibles.
- Las vistas tecnicas y raw outputs deben restringirse.

## 16. Criterios de aceptacion Alpha

- CA-A01: se crea propuesta desde la app.
- CA-A02: se sube o pega documentacion.
- CA-A03: se genera brief inicial validado.
- CA-A04: se detectan gaps iniciales.
- CA-A05: chat de problema funciona y resume persiste.
- CA-A06: se genera seccion problema trazable.
- CA-A07: chat de solucion funciona y resume persiste.
- CA-A08: se genera seccion solucion trazable.
- CA-A09: reporte basico estructurado se muestra en app.
- CA-A10: no hay dependencia de RAG avanzado.
- CA-A11: no hay dependencia de auth corporativa.
- CA-A12: Ollama local es el proveedor activo.
- CA-A13: n8n no contiene reglas criticas.

## 17. Criterios de aceptacion Clinic Pilot

- CA-C01: el perfil `hospital_clinic_v1` esta documentado y aplicado conceptualmente al modulo sensible.
- CA-C02: el modulo regulatorio/datos/IA/privacidad detecta gaps sin dictamen.
- CA-C03: medical device condicional no clasifica definitivamente.
- CA-C04: recursos/piloto/viabilidad completa la informacion minima.
- CA-C05: reporte final incluye gaps, fuentes, advertencias y version.
- CA-C06: PDF exportado parte del reporte estructurado.
- CA-C07: demo local esta endurecida para Clinic.

## 18. Metricas de exito

Metricas Alpha:

- Porcentaje de propuestas que llegan a seccion problema.
- Porcentaje de propuestas que llegan a seccion solucion.
- Numero medio de gaps detectados inicialmente.
- Numero medio de turnos por modulo.
- Incidencias por JSON invalido, timeout o recovery.
- Numero de afirmaciones sin fuente interna detectadas: objetivo cero.

Metricas Clinic Pilot:

- Porcentaje de propuestas que completan reporte final.
- Porcentaje de gaps sensibles marcados para revision humana.
- Tiempo desde intake hasta PDF.
- Utilidad percibida por equipo de preevaluacion.
- Incidencias de privacidad o datos sensibles: objetivo prevenir y retirar.

## 19. Roadmap

- MVP Alpha: propuesta, documentos, gaps iniciales, problema, solucion y reporte basico en app.
- MVP Clinic Pilot: regulatorio/datos/IA/privacidad, medical device, recursos, PDF y hardening local.
- Futuro: evaluacion RAG desde `arnau`.
- Futuro: orquestador legal/regulatorio avanzado.
- Futuro: proveedor IA remoto/VPS/on-prem potente.
- Futuro: autenticacion institucional y permisos.

## 20. Preguntas abiertas

- Que tipos de documento se aceptaran en Alpha ademas de texto/PDF con texto extraible?
- Que criterios minimos cierran problema y solucion?
- Que proteccion minima exigira Clinic antes de usuarios reales?
- Quien revisara el lenguaje de `hospital_clinic_v1` antes del Clinic Pilot?
- Cuando se decidira si el RAG de `arnau` entra como adapter opcional?

## 21. Decisiones resueltas

- El formato actual del reporte basico Alpha queda definido por
  `contracts/schemas/basic-alpha-report.schema.json`. Futuras ampliaciones de
  reporte, como modulos Clinic Pilot o exportacion PDF, deberan versionar un
  contrato nuevo o extender explicitamente este contrato sin cambiar el alcance
  Alpha.
