# Implementation blueprint

Use this blueprint when the repository is empty or does not yet have a strong structure.

## Recommended layout

```text
.
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── contracts/
│   │   │   ├── domain/
│   │   │   ├── services/
│   │   │   ├── routes/
│   │   │   ├── prompts/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── README.md
│   └── web/                         # optional in v1
├── context-packs/
│   └── healthgenai/
│       ├── README.md
│       ├── maturity-criteria.md
│       ├── use-case-taxonomy.md
│       └── risks-and-governance.md
├── db/
│   └── migrations/
├── infra/
│   ├── docker/
│   └── n8n/
│       ├── workflows/
│       └── README.md
├── tests/
│   ├── contracts/
│   ├── integration/
│   └── fixtures/
├── AGENTS.md
└── .codex/
    └── config.toml
```

## Minimum modules

### contracts
Keep API DTOs and JSON schema-backed contracts here.

### domain
Keep business rules here:
- stage transitions
- completion criteria
- turn limits
- diagnosis limits
- allowed stage/agent mapping

### services
Keep side-effectful orchestration here:
- normalization
- prompt loading
- LLM invocation adapters
- persistence repositories
- audit logging

### prompts
Store prompts as files, not inline constants when possible.

### workflows
Commit exported n8n workflow JSON files here.

## Greenfield defaults

If the stack is not predetermined:
- TypeScript or Python is fine
- prefer whichever the repo already uses
- if choosing from scratch, use the language best aligned with surrounding tooling and team conventions
- avoid introducing more services than needed for v1

## Environment variables to document

At minimum, explain:
- database connection
- Ollama base URL / model name
- n8n webhook URLs or local workflow invocation settings
- app/base URLs for local development

## Required local flow

A new engineer should be able to:
1. start Postgres
2. start Ollama
3. import or load n8n workflows
4. run the service layer
5. send a start request
6. send reply requests
7. inspect persisted state
