# Repository working agreements

## Skill routing

Use the repo skill `project-maturation-v1` for any task that mentions:
- project maturation
- proposal intake
- n8n orchestration
- Ollama
- PostgreSQL session state
- dossier generation
- problem-definition agent
- HealthGenAI context pack
- guided clarification or socratic questioning

## Delivery rules

- Treat `structured-brief.schema.json` and the API schemas as the source of truth for contracts.
- Keep prompts versioned in files. Do not bury critical business rules only inside workflow node text.
- Focus the first functional version on intake, normalization, persistence, the problem-definition agent, and a resumable multi-turn flow.
- Do not fully implement legal, cost, scoring, or broad multi-agent orchestration in v1 unless the task explicitly asks for that after the core path is working.
- If the repo already has conventions, adapt to them instead of forcing the sample layout from the skill.
- When adding or changing architecture, update tests, docs, and environment examples in the same change.
- Prefer deterministic outputs: typed DTOs, JSON schema validation, bounded state transitions, explicit retries, and auditable logs.
- Keep RAG optional and behind interfaces in v1. A stubbed adapter is better than a half-working retrieval pipeline.
- If subagents are available in the current Codex build, use them only for bounded parallel workstreams and keep final architectural judgment in the main thread.

## Definition of done

A task is not complete until:
1. the happy path works end to end,
2. payloads match the declared schemas,
3. persistence and replay/resume behavior are covered,
4. prompts and workflow files are committed,
5. docs explain how to run the MVP locally.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
