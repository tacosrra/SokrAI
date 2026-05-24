# Scope MVP SokrAI para Hospital Clinic Barcelona

Fecha: 2026-05-24
Estado: scope estrategico actualizado antes de PRs de implementacion
Fuentes obligatorias revisadas:

- `docs/discovery/00-multi-branch-audit.md`
- `docs/discovery/01-current-state-audit.md`
- `docs/mvp/01-mvp-scope.md`
- `docs/prd/01-mvp-prd.md`
- `docs/architecture/01-technical-architecture.md`
- `docs/mvp/02-implementation-backlog.md`

## 1. Decision principal

El alcance de SokrAI se divide en dos hitos separados:

- **MVP Alpha**: primer objetivo funcional. Debe demostrar el flujo central de maduracion de una propuesta dentro de la app, sin intentar cubrir todavia todo el piloto institucional.
- **MVP Clinic Pilot**: extension posterior del Alpha para una demo/piloto local mas completo con modulos sensibles, exportacion PDF y hardening de entorno.

Esta separacion corrige el riesgo detectado en la documentacion anterior: el "MVP" mezclaba el primer vertical slice con el piloto completo. Las PRs iniciales deben perseguir primero el MVP Alpha.

## 2. Objetivo del producto

SokrAI debe ayudar a madurar propuestas de innovacion sanitaria antes de la revision humana. La herramienta ordena informacion, detecta gaps, formula preguntas guiadas, registra trazabilidad y genera texto estructurado a partir de informacion aportada por el usuario o documentos subidos.

SokrAI no aprueba, rechaza, prioriza ni emite dictamen clinico, legal, regulatorio, de privacidad o de producto sanitario.

## 3. MVP Alpha

El MVP Alpha es el primer objetivo funcional y debe incluir solo el camino minimo que prueba valor de producto:

1. Crear una propuesta desde la app.
2. Subir documentacion o pegar texto/documentacion disponible.
3. Normalizar el input y extraer un `structured_brief` segun los contratos vigentes.
4. Analizar gaps iniciales de forma estructurada y descriptiva.
5. Abrir un chat de definicion del problema.
6. Generar una seccion problema trazable.
7. Abrir un chat de definicion de solucion.
8. Generar una seccion solucion trazable.
9. Mostrar un reporte basico estructurado dentro de la app.
10. Permitir reanudar el flujo local mediante estado persistido.

El Alpha debe conservar las fortalezas actuales de `main`: contratos JSON Schema, prompts versionados, PostgreSQL, n8n como orquestador ligero, Ollama local, request status/recovery, idempotencia y auditoria basica.

## 4. Fuera del MVP Alpha

Queda fuera del Alpha:

- Modulo regulatorio/datos/IA/privacidad.
- Medical device condicional.
- Recursos/piloto/viabilidad.
- Exportacion PDF final.
- Hardening completo de demo local Clinic.
- RAG avanzado, pgvector, embeddings o context packs institucionales.
- Evaluacion del RAG de `arnau` como dependencia de producto.
- Orquestador legal/regulatorio avanzado.
- Autenticacion corporativa o enterprise.
- Proveedor IA remoto, VPS u on-prem potente adicional.
- Scoring, ranking, aprobacion/rechazo o priorizacion automatica.
- Datos reales de pacientes.

El Alpha puede dejar puntos de extension documentados, pero no debe implementar configuracion dinamica, RAG, auth ni proveedor IA remoto.

## 5. MVP Clinic Pilot

El MVP Clinic Pilot se construye despues del Alpha y debe anadir:

1. Modulo regulatorio/datos/IA/privacidad como deteccion de gaps y preguntas, no dictamen.
2. Activacion condicional de medical device cuando haya senales o incertidumbre.
3. Modulo de recursos/piloto/viabilidad.
4. Exportacion PDF final desde el reporte estructurado.
5. Hardening de demo local para Hospital Clinic: privacidad, secretos, errores, logs, limites de datos y documentacion de operacion local.

El Clinic Pilot sigue siendo un piloto local/on-premise. No implica despliegue VPS, proveedor IA remoto, integracion con sistemas hospitalarios reales ni autenticacion enterprise completa, salvo decision posterior explicita.

## 6. Perfil regulatorio `hospital_clinic_v1`

Para el MVP Clinic Pilot se define conceptualmente un perfil de evaluacion regulatoria por defecto:

`hospital_clinic_v1`

Familias normativas iniciales:

- **RGPD / GDPR**: proteccion de datos personales.
- **Cybersecurity Act**: ciberseguridad/certificacion TIC.
- **EEDS / EHDS**: Espacio Europeo de Datos de Salud.
- **MDR**: Medical Device Regulation.
- **EU AI Act**: sistemas de inteligencia artificial.
- **HTAR**: Health Technology Assessment Regulation.

Uso permitido:

- Detectar gaps.
- Formular preguntas.
- Separar informacion aportada, incertidumbre y revision necesaria.
- Indicar "requiere revision humana competente" cuando corresponda.

Uso no permitido:

- Declarar cumplimiento o incumplimiento definitivo.
- Emitir dictamen legal, regulatorio, clinico o de medical device.
- Sustituir a responsables competentes de privacidad, regulatorio, clinico, datos, IA o evaluacion.

## 7. Configurabilidad institucional

Los marcos normativos deben disenarse conceptualmente como perfiles configurables por institucion. En el MVP solo se necesita un perfil por defecto: `hospital_clinic_v1`.

No entra en MVP Alpha:

- UI de configuracion institucional.
- Editor dinamico de frameworks.
- Carga dinamica de perfiles desde la app.

Extensibilidad futura:

- Nuevas instituciones podran tener perfiles propios.
- Cada perfil debera versionar familias normativas, disclaimers, preguntas sugeridas, salidas permitidas y reglas de revision humana.
- Cualquier perfil sensible debera revisarse por personas competentes antes de usarse con usuarios reales.

## 8. RAG

RAG avanzado queda fuera del happy path del MVP Alpha.

Decision:

- El modo por defecto del Alpha es documentos subidos + respuestas del usuario + brief estructurado.
- RAG avanzado no entra hasta que exista corpus aprobado, politica de citas/fuentes y decision explicita.
- El RAG de `arnau` se evaluara mas adelante como adapter opcional, no como dependencia obligatoria.
- Se puede mantener una arquitectura preparatoria basada en `RetrievalPort`, `NoopRetrieval` y, si conviene, `UploadedDocumentsRetrieval` simple.

RAG no debe:

- Bloquear el flujo Alpha.
- Hacer pgvector obligatorio.
- Introducir corpus externo no aprobado.
- Autocompletar hechos no aportados por el usuario o documentos.

## 9. IA local y proveedor futuro

Actualmente Ollama corre localmente y es el proveedor IA del MVP.

Decision:

- El MVP debe seguir usando Ollama local.
- La arquitectura debe preparar una abstraccion de proveedor IA.
- No se implementa ni se disena despliegue VPS en MVP.
- En roadmap podria existir un proveedor local alojado en VPS/on-prem mas potente, siempre como arquitectura futura y tras decision explicita.

No debe haber fallback automatico a proveedores externos en MVP.

## 10. n8n

n8n se mantiene como orquestador ligero:

- Coordina webhooks y pasos de flujo.
- Facilita observabilidad de demo local.
- Propaga errores controlados.

La API sigue siendo dueña de:

- Reglas de negocio.
- Contratos.
- Prompts versionados.
- Persistencia.
- Validaciones.
- Guardrails.
- Auditoria.

n8n no debe contener logica critica de negocio ni reglas enterradas solo en nodos.

## 11. Autenticacion y sesiones

Para MVP Alpha/demo local se asume que no hay auth corporativa.

Decision:

- `session_id` es aceptable solo para demo local.
- `session_id` no es aceptable como unico control para piloto real con datos sensibles.
- Las PRs iniciales no deben bloquearse por auth enterprise.
- Antes de usuarios reales del Hospital Clinic se necesitara proteccion minima: control de acceso, secretos seguros, restricciones de vistas tecnicas y politica de datos.

## 12. Usuarios

Usuarios del Alpha:

- Equipo producto/implementacion SokrAI.
- Usuarios internos de prueba con datos ficticios o anonimizados.
- Revisores que validan si el flujo problema-solucion aporta valor.

Usuarios del Clinic Pilot:

- Equipo proponente interno o colaborador del Hospital Clinic.
- Equipo de innovacion/preevaluacion.
- Revisores humanos competentes para secciones sensibles.
- Administradores tecnicos del entorno local.

## 13. Criterios de aceptacion del MVP Alpha

El Alpha esta completo cuando:

- El usuario puede crear una propuesta.
- Puede subir o pegar documentacion.
- El sistema genera un brief inicial validado.
- El sistema muestra gaps iniciales.
- El chat de problema funciona con una pregunta principal por turno.
- Se genera seccion problema trazable.
- El chat de solucion funciona con una pregunta principal por turno.
- Se genera seccion solucion trazable.
- La app muestra un reporte basico estructurado.
- El flujo puede reanudarse desde estado persistido.
- Los payloads cumplen schemas declarados.
- Prompts y workflows usados por el flujo estan versionados.
- n8n coordina, pero las reglas viven en API/schemas/prompts.
- Ollama local es el proveedor IA activo.
- RAG avanzado, auth enterprise y proveedor remoto no son dependencias.

## 14. Criterios de aceptacion del MVP Clinic Pilot

El Clinic Pilot esta completo cuando, ademas del Alpha:

- Existe modulo regulatorio/datos/IA/privacidad basado en `hospital_clinic_v1`.
- Las salidas sensibles usan lenguaje de gaps, incertidumbre y "requiere revision humana competente" cuando corresponda.
- Medical device se activa de forma condicional y no da clasificacion definitiva.
- Recursos/piloto/viabilidad recoge informacion minima de ejecucion.
- El reporte final incluye secciones, gaps, fuentes internas, advertencias y version.
- PDF se exporta desde el reporte estructurado.
- La demo local esta endurecida para el contexto Clinic: privacidad, secretos, logs, errores y documentacion.

## 15. Roadmap posterior

- Evaluacion RAG desde `arnau` como adapter opcional.
- Orquestador legal/regulatorio avanzado con contratos propios.
- Proveedor IA remoto/VPS/on-prem potente.
- Autenticacion institucional y permisos.
- Corpus institucional aprobado y politica de citas/fuentes.
- OCR y gestion documental avanzada.
- Integraciones con sistemas hospitalarios, solo tras decisiones de seguridad y gobierno.
