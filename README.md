# SokrAI v1

**Equipo:** Marcos Arroyo Saavedra, Arnau Costa Serra, Ziheng Zhang, Kirian Roca Moraga

## Guía de demo local

Para preparar el entorno, ejecutar y aceptar manualmente la demo local Clinic implementada, consulta la [guía completa de demo local Clinic](docs/manual-testing/clinic-local-demo-full-guide.md).

## Sobre el proyecto

SokrAI es un middleware de maduración de propuestas orientado a preparar proyectos antes de su revisión en comité. La plataforma recibe una propuesta inicial —en texto libre, documento adjunto o PDF— y la transforma en un `structured_brief` estructurado y validado. A partir de ahí conduce una conversación socrática, turno a turno, para clarificar el problema, detectar lagunas de información y avanzar hacia una definición de solución más sólida.

El flujo está pensado para ser resumible: cada sesión se identifica con un `session_id`, se persiste en base de datos y puede retomarse en cualquier momento sin perder el contexto acumulado. En cada turno el sistema formula una pregunta principal, registra la respuesta del usuario y actualiza el estado del agente correspondiente. Los contratos de entrada y salida están versionados y validados mediante esquemas JSON, de modo que el comportamiento del sistema sea predecible y auditable.

La v1 demuestra dos capacidades Alpha de forma sólida: la definición del problema y la definición de la solución. Además incluye módulos del piloto Clinic para explorar aspectos de datos e IA/privacidad, triaje condicional de dispositivo médico y viabilidad de recursos/piloto. El resultado puede consolidarse en un Basic Alpha Report con exportación local a PDF.

La arquitectura combina orquestación con **n8n**, inferencia local con **Ollama**, persistencia en **PostgreSQL** y una interfaz web en **apps/web** para demos locales y uso humano en el bucle. Los prompts, workflows y esquemas viven versionados en el repositorio como fuente de verdad. SokrAI no sustituye el criterio humano: sus salidas requieren revisión y no constituyen dictamen legal, clínico, regulatorio ni decisión de aprobación o rechazo.
