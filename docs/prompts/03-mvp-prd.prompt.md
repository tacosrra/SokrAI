Genera el PRD del primer MVP funcional de SokrAI para Hospital Clínic de Barcelona.

Fuentes obligatorias:
- docs/discovery/00-multi-branch-audit.md
- docs/discovery/01-current-state-audit.md
- docs/mvp/01-mvp-scope.md
- estado actual del repositorio

Ramas analizadas:
- main: versión más estable, aunque no plenamente funcional.
- arnau: contiene un intento de implementación RAG.
- orchestrator-legal: contiene implementación adicional del orquestador legal.

El PRD debe apoyarse en el análisis multi-rama. No asumas que todo lo existente sirve. Debes distinguir explícitamente qué se conserva, qué se rescata, qué se refactoriza y qué se descarta.

Producto:
SokrAI es un asistente local de maduración de propuestas de innovación sanitaria.

Objetivo:
Reducir iteraciones entre equipos proponentes y el comité evaluador, ayudando a que las propuestas lleguen más completas, claras, trazables y estructuradas antes de ser revisadas por el equipo evaluador del Hospital Clínic.

Contexto:
Hospital Clínic recibe propuestas de innovación con problemas frecuentes:
- problema mal definido
- solución poco clara
- gaps regulatorios
- falta de análisis de datos/IA/privacidad
- medical device no identificado o mal definido
- recursos y piloto poco claros
- métricas de éxito no definidas

Stack actual:
- Monorepo Node.js + TypeScript + pnpm.
- Frontend: React 19 + Vite.
- API: Fastify.
- DB: PostgreSQL.
- Orquestación: n8n.
- IA local: Ollama.

Principios:
- IA local/on-premise como prioridad.
- Ollama es el proveedor local actual.
- No diseñar todavía VPS remoto como parte del MVP.
- Preparar abstracción para cambiar proveedor de IA en el futuro.
- No inventar información.
- No autocompletar datos no proporcionados.
- Detectar gaps.
- Preguntar al usuario.
- Redactar secciones usando documentación y respuestas.
- Mantener trazabilidad entre gaps, preguntas, respuestas y reporte final.
- No emitir dictamen clínico, legal o regulatorio definitivo.
- Preparar la propuesta para revisión humana.
- Mostrar la propuesta estructurada dentro de la app.
- Permitir exportación PDF.

Entrega:
Crea docs/prd/01-mvp-prd.md con estas secciones:

1. Resumen ejecutivo.
2. Problema a resolver.
3. Contexto Hospital Clínic.
4. Objetivos del MVP.
5. No objetivos del MVP.
6. Usuarios principales.
7. Usuarios secundarios.
8. Casos de uso principales.
9. User stories.
10. Flujo end-to-end del MVP.
11. Módulos funcionales.
12. Módulos/agentes IA.
13. Reglas de comportamiento de IA.
14. Requisitos de privacidad y seguridad.
15. Requisitos de IA local/Ollama.
16. Requisitos documentales/RAG.
17. Modelo conceptual de datos.
18. Pantallas necesarias.
19. Estados de propuesta.
20. Estados de gap.
21. Estados de sección.
22. Estados de revisión.
23. Generación de reporte.
24. Exportación PDF.
25. Auditoría y trazabilidad.
26. Requisitos funcionales.
27. Requisitos no funcionales.
28. Métricas de éxito del piloto.
29. Riesgos y mitigaciones.
30. Criterios de aceptación.
31. Roadmap.
32. Preguntas abiertas.

Además, incluye obligatoriamente una sección llamada:

"Uso de trabajo existente por rama"

Dentro de esa sección, incluye:

A. Qué se aprovecha de main
- Qué partes de main deben conservarse.
- Qué partes de main deben refactorizarse.
- Qué partes de main deben descartarse.

B. Qué se aprovecha de arnau
- Si el RAG de arnau sirve para el MVP.
- Si debe rescatarse, refactorizarse o descartarse.
- Qué riesgos tiene integrarlo.
- Qué queda fuera del MVP aunque esté en arnau.

C. Qué se aprovecha de orchestrator-legal
- Si el orquestador legal sirve para el MVP.
- Si debe rescatarse, refactorizarse o descartarse.
- Qué riesgos tiene integrarlo.
- Qué queda fuera del MVP aunque esté en orchestrator-legal.

D. Estrategia de rescate/migración
- Si conviene partir de main y cherry-pick selectivo.
- Si conviene reimplementar algunos módulos.
- Si conviene crear una rama limpia de reconstrucción.
- Orden recomendado de rescate.

E. Riesgos de merge
- Conflictos probables.
- Código duplicado.
- Divergencias de modelo de datos.
- Divergencias de arquitectura.
- Riesgos de introducir deuda técnica.

Restricciones:
- No escribas código.
- No modifiques archivos fuera de docs/prd/.
- No hagas merges.
- No hagas cherry-picks.
- No borres nada.
- No conviertas el MVP en una plataforma enorme.
- Hazlo implementable sobre el stack existente.
- No propongas scoring automático de aprobado/rechazado.
- No propongas asesoramiento legal, clínico o regulatorio definitivo.
