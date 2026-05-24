Define la arquitectura técnica recomendada para implementar el MVP de SokrAI.

Fuentes obligatorias:
- docs/discovery/00-multi-branch-audit.md
- docs/discovery/01-current-state-audit.md
- docs/mvp/01-mvp-scope.md
- docs/prd/01-mvp-prd.md
- estado actual del repositorio

Ramas analizadas:
- main: versión más estable, aunque no plenamente funcional.
- arnau: contiene un intento de implementación RAG.
- orchestrator-legal: contiene implementación adicional del orquestador legal.

La arquitectura debe apoyarse en el análisis multi-rama. No asumas que todo el código actual debe conservarse. Debes proponer una estrategia técnica realista para conservar, rescatar, refactorizar o descartar piezas de cada rama.

Stack actual:
- Monorepo Node.js + TypeScript + pnpm.
- Frontend: React 19 + Vite.
- API: Fastify.
- DB: PostgreSQL.
- Orquestación: n8n.
- IA local: Ollama.

Producto:
SokrAI es un asistente local de maduración de propuestas de innovación sanitaria para Hospital Clínic.

Objetivo del MVP:
Permitir que equipos internos y externos creen una propuesta, suban documentación, resuelvan gaps mediante chats guiados y generen una propuesta estructurada exportable a PDF.

Principios técnicos:
- Incrementalidad.
- Evitar reescritura total salvo que sea inevitable.
- IA local con Ollama en el MVP.
- Abstracción preparada para cambiar de proveedor de IA en el futuro.
- Privacidad por defecto.
- No tratar datos reales de pacientes en el MVP.
- Trazabilidad entre documentos, gaps, preguntas, respuestas y reporte final.
- Separación clara entre frontend, API, orquestación, IA y persistencia.
- No introducir arquitectura VPS remota todavía.

Entrega:
Crea docs/architecture/01-technical-architecture.md con estas secciones:

1. Resumen ejecutivo.
2. Arquitectura actual detectada.
3. Arquitectura objetivo del MVP.
4. Estructura actual del monorepo.
5. Estructura objetivo del monorepo.
6. Qué conservar del repo actual.
7. Qué refactorizar.
8. Qué rehacer.
9. Qué eliminar o descartar.
10. Módulos frontend.
11. Módulos API/Fastify.
12. Modelo de datos PostgreSQL.
13. Integración con Ollama.
14. Abstracción de proveedor IA.
15. Integración con n8n.
16. Módulo de documentos.
17. Extracción de texto de PDFs/documentos.
18. Módulo RAG/retrieval si aplica al MVP.
19. Módulo de análisis de gaps.
20. Módulo de chats por sección.
21. Módulo de generación de secciones.
22. Módulo de reporte final.
23. Exportación PDF.
24. Trazabilidad/auditoría.
25. Seguridad y privacidad.
26. Estrategia de tests.
27. Estrategia de migración desde la versión actual.
28. Backlog técnico por PRs.
29. Riesgos técnicos.
30. Decisiones abiertas.

Además, incluye obligatoriamente una sección llamada:

"Estrategia técnica multi-rama"

Dentro de esa sección, incluye:

A. Qué se aprovecha de main
- Componentes, módulos o estructuras que deben mantenerse.
- Problemas técnicos de main.
- Cambios necesarios para hacerlo base del MVP.

B. Qué se aprovecha de arnau
- Evaluación técnica del intento de RAG.
- Qué partes podrían reutilizarse.
- Qué partes deben refactorizarse.
- Qué partes deben descartarse.
- Cómo debería integrarse el RAG en la arquitectura objetivo, si aplica.
- Riesgos de integrar ese código.

C. Qué se aprovecha de orchestrator-legal
- Evaluación técnica del orquestador legal.
- Qué partes podrían reutilizarse.
- Qué partes deben refactorizarse.
- Qué partes deben descartarse.
- Cómo debería integrarse el orquestador legal en el MVP, si aplica.
- Riesgos de integrar ese código.

D. Estrategia de rescate/migración
- Rama base recomendada.
- Si se recomienda cherry-pick selectivo o reimplementación.
- Orden recomendado de rescate.
- PRs técnicas necesarias para rescatar piezas.
- Cómo evitar merges caóticos.

E. Riesgos de merge
- Conflictos probables.
- Diferencias de dependencias.
- Diferencias de estructura de carpetas.
- Diferencias de modelos de datos.
- Diferencias de APIs.
- Riesgos sobre tests.
- Riesgos sobre n8n/Ollama.

F. Decisiones arquitectónicas recomendadas
- Qué debe decidirse antes de escribir código.
- Qué ADRs deberían crearse.

Restricciones:
- No escribas código.
- No modifiques archivos fuera de docs/architecture/.
- No hagas merges.
- No hagas cherry-picks.
- No borres nada.
- No propongas reescritura total salvo que esté muy justificada.
- No diseñes todavía VPS remoto para Ollama; solo deja la abstracción preparada.
