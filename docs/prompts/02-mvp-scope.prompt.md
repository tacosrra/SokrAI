A partir de:
- docs/discovery/00-multi-branch-audit.md
- docs/discovery/01-current-state-audit.md
- el estado actual del repositorio
- el contexto de producto descrito abajo

Define el mejor scope posible para un primer MVP funcional para Hospital Clínic de Barcelona.

Ten en cuenta:
- Puede haber piezas útiles en arnau, especialmente RAG.
- Puede haber piezas útiles en orchestrator-legal.
- No asumas que esas piezas deben usarse; decide si encajan en el MVP.
- Prioriza un MVP funcional, robusto y demostrable.

Producto:
SokrAI es una herramienta para ayudar a equipos de investigación e innovación a madurar propuestas de innovación sanitaria antes de enviarlas a un comité evaluador.

Objetivo del MVP:
Crear una herramienta funcional que actúe como filtro previo. El equipo proponente sube documentación, describe el proyecto y la herramienta detecta gaps. Luego, mediante chats guiados por módulo, la herramienta hace preguntas para cerrar esos gaps. Finalmente genera una propuesta estructurada y exportable a PDF.

Regla clave:
La IA no debe inventar información ni autocompletar hechos no proporcionados. Debe detectar huecos, hacer preguntas, almacenar respuestas y redactar secciones usando solo:
- documentación subida
- contexto inicial
- respuestas dadas en los chats

Usuarios:
- equipos internos del Hospital Clínic
- investigadores/equipos externos
- equipo evaluador del Hospital Clínic

IA:
- Ollama local actual.
- No diseñar todavía VPS remoto.
- Preparar abstracción para cambiar proveedor más adelante.

Datos:
- En el MVP no se tratarán datos reales de pacientes.
- Solo documentación de proyecto y datos ficticios si existen.
- Diseñar con privacidad por defecto.

Fases deseadas:
1. Intake documental.
2. Contexto inicial del proyecto.
3. Análisis general de madurez.
4. Chat de definición del problema.
5. Generación de sección problema.
6. Chat de definición de solución.
7. Generación de sección solución.
8. Chat regulatorio/datos/IA.
9. Chat medical device, si aplica.
10. Chat recursos/piloto/viabilidad.
11. Reporte final estructurado.
12. Exportación PDF.

Entrega:
Crea docs/mvp/01-mvp-scope.md con:

1. Resumen del MVP.
2. Objetivo principal.
3. Usuarios principales.
4. Usuarios secundarios.
5. Jobs-to-be-done.
6. Flujo end-to-end del MVP.
7. Qué entra en MVP.
8. Qué queda fuera del MVP.
9. Qué se rescata de main.
10. Qué se rescata de arnau.
11. Qué se rescata de orchestrator-legal.
12. Qué se descarta.
13. Módulos necesarios.
14. Agentes/módulos IA necesarios.
15. Rol del RAG en el MVP.
16. Rol del orquestador legal en el MVP.
17. Modelo conceptual de datos.
18. Estados de una propuesta.
19. Estados de un gap.
20. Estados de una sección.
21. Pantallas necesarias.
22. Reglas de IA.
23. Reglas de privacidad.
24. Reglas de trazabilidad.
25. Criterios de aceptación.
26. Métricas de éxito del piloto.
27. Roadmap posterior.
28. Riesgos y mitigaciones.

Restricciones:
- No escribas código.
- No modifiques archivos fuera de docs/mvp/.
- No conviertas el MVP en una plataforma enorme.
- Prioriza una versión que el Hospital Clínic pueda probar pronto.
- No propongas scoring automático de aprobado/rechazado.
- No propongas asesoramiento legal, clínico o regulatorio definitivo.
