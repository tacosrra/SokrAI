Quiero que audites este repositorio existente teniendo en cuenta que el equipo ha trabajado de forma desorganizada y hay trabajo útil repartido en varias ramas.

Proyecto:
SokrAI.

Contexto de producto:
SokrAI pretende ser una herramienta para ayudar a equipos de investigación e innovación a madurar propuestas de innovación sanitaria antes de enviarlas a comités de evaluación, licitaciones públicas o instituciones privadas.

Caso inicial:
Hospital Clínic de Barcelona recibe propuestas de innovación sanitaria inmaduras. Muchas propuestas llegan con:
- problema mal definido
- solución ambigua
- gaps regulatorios
- datos/IA/privacidad poco contemplados
- medical device no identificado o mal definido
- recursos/piloto/viabilidad mal planteados
- métricas de éxito poco claras

Stack conocido:
- Monorepo Node.js + TypeScript + pnpm.
- Frontend: React 19 + Vite.
- Backend/API: Fastify.
- Base de datos: PostgreSQL.
- Orquestación: n8n.
- IA local: Ollama.

Ramas a analizar:
1. main
   - Contiene una versión más o menos estable, pero no funcional.
2. arnau
   - Contiene un commit donde se intentó añadir un RAG.
   - Debes evaluar si esta implementación sirve, se puede rescatar, se debe refactorizar o se debe descartar.
3. orchestrator-legal
   - Contiene alguna implementación extra del orquestador legal.
   - Debes evaluar si sirve para el MVP, si se debe rescatar, refactorizar o descartar.

Ubicaciones de worktrees:
- main: /home/tacosrra/src/personal/SokrAI
- arnau: /home/tacosrra/src/personal/SokrAI-worktrees/arnau
- orchestrator-legal: /home/tacosrra/src/personal/SokrAI-worktrees/orchestrator-legal

Objetivo:
Analizar las tres ramas y producir una visión consolidada de qué existe, qué sirve y qué debemos rescatar para el MVP del Hospital Clínic.

Tarea:
Crea docs/discovery/00-multi-branch-audit.md con:

1. Resumen ejecutivo.
2. Estado de cada rama:
   - main
   - arnau
   - orchestrator-legal
3. Diferencias funcionales entre ramas.
4. Diferencias técnicas entre ramas.
5. Qué contiene main.
6. Qué contiene arnau.
7. Qué contiene orchestrator-legal.
8. Análisis de la implementación RAG de arnau:
   - qué hace
   - cómo está integrada
   - dependencias
   - calidad
   - riesgos
   - si sirve para MVP
   - recomendación: keep/refactor/discard
9. Análisis del orchestrator legal:
   - qué hace
   - cómo está integrado
   - dependencias
   - calidad
   - riesgos
   - si sirve para MVP
   - recomendación: keep/refactor/discard
10. Piezas reutilizables.
11. Piezas peligrosas o mal planteadas.
12. Código duplicado o divergente.
13. Riesgos de merge.
14. Recomendación de estrategia:
   - partir de main y cherry-pick
   - partir de otra rama
   - reimplementar desde cero algunos módulos
   - crear una rama nueva limpia
15. Backlog de rescate:
   - qué rescatar primero
   - qué dejar para después
   - qué eliminar
16. Preguntas abiertas.

Criterios:
- No escribas código.
- No modifiques archivos fuera de docs/discovery/.
- No hagas merge.
- No hagas cherry-pick.
- No borres nada.
- No instales dependencias.
- Analiza con lectura estática y comandos git seguros.
