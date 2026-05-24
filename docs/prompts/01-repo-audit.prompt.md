Quiero que audites el estado actual del repositorio SokrAI, usando también el análisis multi-rama ya realizado.

Fuentes obligatorias:
- docs/discovery/00-multi-branch-audit.md
- rama actual main/chore/multi-branch-discovery
- worktrees de arnau y orchestrator-legal si necesitas contrastar algo

Contexto:
Este proyecto se llama SokrAI. Es una herramienta para ayudar a equipos de investigación e innovación a madurar propuestas antes de enviarlas a comités de evaluación, licitaciones públicas o instituciones privadas.

Stack conocido:
- Monorepo Node.js + TypeScript + pnpm.
- Frontend: React 19 + Vite.
- Backend/API: Fastify.
- Base de datos: PostgreSQL.
- Orquestación: n8n.
- IA local: Ollama.

Caso inicial:
Hospital Clínic de Barcelona recibe propuestas de innovación sanitaria inmaduras. Muchas propuestas llegan con:
- problema mal definido
- solución ambigua
- gaps regulatorios
- datos/IA/privacidad poco contemplados
- medical device no identificado o mal definido
- recursos/piloto/viabilidad mal planteados
- métricas de éxito poco claras

La herramienta debe permitir:
- crear una propuesta
- subir documentación existente
- analizar gaps
- abrir chats por módulo/fase
- hacer preguntas al equipo proponente
- no inventar información
- generar secciones refinadas de propuesta
- generar un reporte final estructurado
- permitir exportar a PDF

Tarea:
Audita el estado actual consolidado del proyecto.

Entrega:
Crea docs/discovery/01-current-state-audit.md con:

1. Stack técnico real detectado.
2. Estructura del monorepo.
3. Apps/packages detectados.
4. Estado del frontend.
5. Estado del backend/Fastify.
6. Estado de PostgreSQL/modelo de datos.
7. Estado de n8n/orquestación.
8. Estado de integración con Ollama.
9. Estado de RAG si existe o si debe rescatarse de arnau.
10. Estado del orquestador legal si existe o si debe rescatarse de orchestrator-legal.
11. Qué funcionalidades existen.
12. Qué partes parecen funcionales.
13. Qué partes están incompletas, rotas o mal planteadas.
14. Riesgos técnicos.
15. Riesgos de producto.
16. Riesgos de privacidad/seguridad.
17. Qué conservar.
18. Qué refactorizar.
19. Qué eliminar o rehacer.
20. Qué rescatar de otras ramas.
21. Qué falta para poder construir un MVP serio.
22. Recomendación de siguiente paso.

Restricciones:
- No escribas código.
- No modifiques archivos fuera de docs/discovery/.
- No hagas merges.
- No hagas cherry-picks.
- No borres nada.
