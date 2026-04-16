# PLAN

## Objetivo

Implementar una primera version funcional, end-to-end y mantenible del sistema de maduracion de propuestas, centrada exclusivamente en el carril `problem_definition_agent`, con:

- ingreso de propuesta por texto y/o PDF,
- normalizacion determinista,
- extraccion de `structured_brief`,
- conversacion socratica de una sola pregunta por turno,
- persistencia completa de sesiones, turnos, snapshots y trazabilidad,
- continuidad de la sesion en turnos posteriores,
- operacion local con Docker sobre `n8n + Ollama + PostgreSQL + API`.

## Alcance exacto de la v1

### Incluido

- Un unico agente operativo real: `problem_definition_agent`.
- Contratos JSON versionados y validados en codigo.
- Extraccion inicial de brief estructurado con Ollama.
- Reparacion unica de JSON invalido del modelo.
- Persistencia en PostgreSQL de:
  - sesion actual,
  - turnos conversacionales,
  - ejecuciones de agente/modelo,
  - snapshots historicos de estado.
- Workflows n8n versionados:
  - `proposal_start_v1`
  - `proposal_reply_v1`
  - `agent_problem_definition_v1`
- API interna para que n8n orqueste el flujo sin esconder la logica critica dentro de nodos.
- Tests de contratos, dominio y flujo principal.
- Documentacion de arranque local, ejemplos y fixtures.

### Fuera de alcance deliberado

- Agentes legal, costes, scoring o priorizacion.
- RAG complejo o vector store operativo.
- UI rica; solo se dejara la superficie necesaria para demo/uso via n8n y HTTP.
- OCR para PDFs escaneados.
- Autenticacion empresarial.

## Estado inicial del repo

El repo es greenfield. Solo existen:

- `AGENTS.md`
- `README.md`
- `.codex/config.toml`
- la skill `project-maturation-v1` con sus referencias, prompts, schemas y SQL de referencia.

No existe aplicacion ejecutable, ni Docker, ni migraciones, ni workflows n8n, ni tests, ni fixtures, ni estructura de codigo.

## Decisiones operativas

### Contradicciones detectadas

- Los schemas base de la skill modelan el inicio con `proposal_text` o `document_text`.
- El requerimiento del usuario exige PDF opcional como entrada de primer nivel.

### Decision

Se extendera el contrato de inicio con:

- `file.file_name`
- `file.mime_type`
- `file.content_base64`

Y se mantendra `document_text` como ruta alternativa/interna para compatibilidad y pruebas.

## Arquitectura resultante

### Principios

- `n8n` coordina el flujo y expone webhooks.
- La API mantiene contratos, validacion, dominio, persistencia, prompts y llamadas al modelo.
- PostgreSQL es la fuente de verdad del estado.
- Ollama es el unico backend LLM de v1.

### Componentes

- `apps/api`
  - servicio TypeScript con Fastify
  - validacion con JSON Schema + Ajv
  - repositorios PostgreSQL con `pg`
  - extraccion PDF
  - cliente Ollama
  - servicios de orquestacion
- `infra/n8n/workflows`
  - exportes JSON versionados de los tres workflows
- `db/migrations`
  - SQL versionado para schema y tablas auxiliares
- `contracts/schemas`
  - source of truth de request/response y artefactos intermedios
- `prompts/v1`
  - prompts versionados y desacoplados
- `tests`
  - contracts, domain e integration
- `examples`
  - payloads de ejemplo

## Estructura de carpetas objetivo

```text
.
├── apps/
│   └── api/
│       ├── src/
│       │   ├── config/
│       │   ├── contracts/
│       │   ├── domain/
│       │   ├── repositories/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── utils/
│       │   ├── app.ts
│       │   └── index.ts
│       ├── scripts/
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── contracts/
│   └── schemas/
├── db/
│   └── migrations/
├── docs/
├── examples/
├── infra/
│   ├── docker/
│   └── n8n/
│       ├── README.md
│       └── workflows/
├── prompts/
│   └── v1/
├── tests/
│   ├── contracts/
│   ├── fixtures/
│   └── integration/
├── .env.example
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Contratos de entrada y salida

### Inicio de propuesta

#### Request

- `project_title`: string, obligatorio
- `goal`: string, obligatorio
- `proposal_text`: string, opcional
- `document_text`: string, opcional
- `file`: objeto opcional con PDF en base64
- `metadata`: objeto opcional

Regla:

- al menos uno de `proposal_text`, `document_text` o `file`.

#### Response

- `session_id`
- `stage = "problem_definition"`
- `structured_brief`
- `detected_gaps`
- `next_question`
- `agent_status`
- `warnings`

### Turno de respuesta

#### Request

- `session_id`
- `answer`

#### Response

- `session_id`
- `stage = "problem_definition"`
- `updated_problem_definition`
- `next_question`
- `agent_status`
- `completion_reason`
- `diagnosis`
- `warnings`

### Contratos intermedios

- `structured-brief.schema.json`
- `problem-definition-turn.schema.json`

## Estrategia de persistencia

### Tablas obligatorias

- `proposal_sessions`
- `conversation_turns`
- `agent_runs`

### Tabla auxiliar imprescindible

- `session_snapshots`
- `session_events`

### Uso de cada tabla

- `proposal_sessions`
  - estado actual de la sesion
  - ultimo brief estructurado
  - estado del lane y del agente actual
  - inputs normalizados
- `conversation_turns`
  - secuencia completa de interacciones user/agent
  - una sola pregunta principal por turno de agente
- `agent_runs`
  - auditoria de cada invocacion al modelo
  - prompt, modelo, input, output, raw output y estatus
- `session_snapshots`
  - fotografia historica del estado tras extraccion inicial y tras cada turno valido
  - base para replay/resume y trazabilidad
- `session_events`
  - ledger operacional append-only para auditoria de workflow, retries y cambios de estado

### Reglas de persistencia

- Persistir la sesion antes de lanzar la primera pregunta.
- Persistir cada respuesta de usuario antes de volver a invocar al agente.
- Persistir `agent_runs` incluso en fallo controlado.
- Persistir snapshot despues de cada extraccion/turno valido.
- No crear sesiones silenciosamente desde el endpoint de reply.

## Workflows n8n a generar

### `proposal_start_v1`

- `Webhook`
- `Prepare Start Context` via HTTP hacia la API
- `Invoke agent_problem_definition_v1` via HTTP interno
- `Merge Start + Agent Result`
- `Respond to Webhook`

### `proposal_reply_v1`

- `Webhook`
- `Persist User Reply` via HTTP hacia la API
- `Invoke agent_problem_definition_v1` via HTTP interno
- `Respond to Webhook`

### `agent_problem_definition_v1`

- `Webhook`
- `Run Problem Definition Turn` via HTTP hacia la API
- `Respond to Webhook`

### Criterio de reparto n8n/API

- n8n orquesta pasos y expone entrypoints.
- La API concentra reglas de negocio, validacion, estado, prompts y llamadas al modelo.
- No se enterraran reglas criticas en texto libre de nodos n8n.
- La idempotencia se gestionara por `request_id` y frontera transaccional, no como unicidad global de workflow.

## Modulos a implementar

- normalizacion de input
- extraccion de texto desde PDF
- carga versionada de prompts
- cliente Ollama
- validacion/reparacion JSON
- evaluacion de completitud del problem definition
- servicio de inicio de propuesta
- servicio de reply
- servicio de ejecucion de `problem_definition_agent`
- repositorios PostgreSQL
- logging estructurado y errores controlados

## Estrategia de tests

### Contratos

- validacion de ejemplos positivos y negativos contra JSON schemas

### Dominio

- completitud del problem definition
- respuestas vagas o "no lo se"
- limites de diagnostico y una sola pregunta

### Integracion

- happy path end-to-end con cliente LLM fake
- vague proposal path
- invalid JSON repair path
- resume flow con persistencia
- unknown session reply
- empty submission

### Smoke local

- migracion aplicada sobre PostgreSQL
- API levantada
- workflows presentes

## Criterios de aceptacion

- El inicio por texto y/o PDF produce sesion + brief + primera pregunta.
- El lane `problem_definition_agent` mantiene una sola pregunta principal por turno.
- El sistema persiste sesiones, turnos, snapshots y agent runs.
- Una respuesta vaga no hace avanzar el estado sin precision adicional.
- El flujo puede reanudarse con `session_id` en turnos siguientes.
- La salida del modelo siempre se valida por schema y se intenta reparar una sola vez.
- La sesion puede llegar a `done` cuando el problema esta suficientemente definido.
- Los workflows n8n, prompts, migraciones, ejemplos y docs quedan versionados en el repo.

## Fases de implementacion

1. Scaffold de estructura, tooling y configuracion.
2. Contratos, prompts y migracion inicial.
3. Dominio y servicios de orquestacion.
4. Rutas/API y integracion con PostgreSQL y Ollama.
5. Workflows n8n versionados.
6. Tests, fixtures, smoke scripts y documentacion.
7. Validacion final, revision critica del diff y correcciones.

## Comandos previstos de verificacion

- `pnpm install`
- `pnpm --filter @sokrai/api build`
- `pnpm --filter @sokrai/api test`
- `docker compose up -d postgres`
- `pnpm --filter @sokrai/api migrate`
- `pnpm --filter @sokrai/api test:integration`

## Supuestos

- Se usara Node.js 24 disponible en el entorno.
- `pnpm` sera el gestor del workspace.
- El soporte PDF sera para PDFs con texto extraible, no OCR.
- Los tests automatizados usaran un cliente LLM fake para determinismo.
- Ollama real quedara listo para ejecucion local, aunque su disponibilidad efectiva dependera del modelo cargado por el operador.
