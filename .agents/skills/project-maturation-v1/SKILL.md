---
name: project-maturation-v1
description: Use when the task is to design, scaffold, implement, review, or harden the first functional version of the AI-assisted project maturation platform, especially an n8n + Ollama + PostgreSQL MVP that ingests a proposal, extracts a structured brief, persists state, and runs a resumable problem-definition conversation. Do not use for unrelated generic web work.
---

## Purpose

This skill exists to help Codex produce a **high-quality first version** of a system that matures research or innovation proposals before committee review.

The core product idea is:
- intake an initial proposal or document,
- detect ambiguity and missing information,
- guide the user through a socratic clarification flow,
- persist state and traceability,
- produce a more mature, more comparable project dossier.

The first functional version must prioritize the **problem-definition path** before expanding into legal, cost, or multi-agent specialization.

## Non-negotiable product boundaries

Build the MVP around these constraints:

1. **Primary value**
   The system improves proposal maturity before formal evaluation. It does not replace the evaluation committee and must not present itself as making the final decision.

2. **First implemented lane**
   The only fully implemented conversational lane in v1 is:
   - `problem_definition_agent`

3. **Mandatory v1 capabilities**
   - proposal intake from text and optionally uploaded document text
   - text normalization
   - extraction of a typed structured brief
   - persistent session state in PostgreSQL
   - resumable multi-turn conversation
   - one socratic question per turn
   - auditable storage of turns, agent outputs, and prompt/model versions
   - a clear completion signal when the problem is sufficiently defined

4. **Out of scope for full implementation in v1**
   Unless the user explicitly requests otherwise after the core path is complete, do **not** fully implement:
   - legal agent
   - cost agent
   - scoring engine
   - broad RAG pipeline
   - committee prioritization
   - full enterprise authentication
   - polished production BI/dashboard work

5. **Allowed scaffolding for future phases**
   You may create extension points, interfaces, TODO docs, or empty adapters for:
   - context packs
   - legal screening
   - architecture/resource analysis
   - cost estimation
   - dossier builder
   - retrieval layer

## Files to read first

When this skill is activated, inspect these files if they exist:

1. `AGENTS.md`
2. `.codex/config.toml`
3. repo manifests and dependency files (`package.json`, `pyproject.toml`, `pnpm-workspace.yaml`, `docker-compose*.yml`, etc.)
4. existing infra folders
5. existing db migrations
6. existing workflow exports for n8n
7. existing prompts and contract definitions

Then read these skill references:
- `references/product-brief.md`
- `references/v1-target-architecture.md`
- `assets/implementation-blueprint.md`
- `assets/n8n-workflow-spec.md`
- `assets/acceptance-checklist.md`

## How to work

### 1. Start with repo-aware planning

First decide whether the repository is:
- **greenfield**, or
- **an existing codebase that must be adapted**

Then produce a short execution plan that names:
- target entrypoints,
- persistence layer,
- workflow locations,
- prompt locations,
- test strategy,
- verification commands.

Do not begin implementation before identifying the existing stack and constraints.

### 2. Use contracts first

Before changing business logic, define or validate these contracts:
- proposal start request
- proposal start response
- structured brief
- problem-definition turn result
- proposal reply request
- proposal reply response

Use the JSON schemas under `assets/` as the baseline. Adapt them to repo conventions only if needed.

### 3. Prefer code-owned orchestration over prompt-only behavior

Critical rules must live in version-controlled code and schemas, not only inside prompts:
- stage transitions
- max questions per turn
- max diagnosis items
- retry behavior
- completion criteria
- status enums
- audit payload shape

### 4. Treat prompts as versioned assets

Prompts must be stored in files, referenced by name/version, and easy to diff.
At minimum keep:
- intake extraction prompt
- problem-definition prompt
- JSON repair prompt

### 5. Keep persistence explicit and inspectable

The MVP should have explicit tables or equivalent persistence structures for:
- sessions
- conversation turns
- agent runs

Store enough information to reproduce or audit decisions:
- normalized input
- brief snapshots
- agent inputs/outputs
- model name
- prompt version
- timestamps

### 6. n8n workflow design rules

Use n8n for orchestration, but avoid hiding the whole product inside workflow node text blobs.
Prefer this split:
- workflows coordinate stages and I/O
- app code or shared libraries own contracts and reusable logic
- prompts live in versioned files
- workflow exports are committed to the repo

Required workflow set for v1:
- `proposal_start_v1`
- `agent_problem_definition_v1`
- `proposal_reply_v1`

### 7. Subagents and parallel workstreams

If the current Codex environment supports subagents, use them only for bounded parallel work, for example:
- **repo-cartographer**: inspect structure, conventions, run commands, summarize findings
- **workflow-implementer**: build or update n8n workflow exports and integration plumbing
- **qa-verifier**: add or improve tests, fixtures, smoke checks, and docs

Rules:
- main thread owns final architecture and final edits
- subagents do not invent product scope
- merge subagent work only after reviewing contracts, boundaries, and compatibility
- if subagents are unavailable, do the same tasks sequentially

### 8. Quality bar

Every implementation should aim for:
- deterministic contracts
- small, composable modules
- strong naming
- minimal hidden magic
- repo-native conventions
- auditable behavior
- upgrade path to future agents

## Recommended target architecture

If the repo is greenfield, use this as the default shape unless the user instructs otherwise:

- `apps/api` or equivalent server/service layer
- `apps/web` only if a web UI is requested
- `infra/n8n/workflows`
- `db/migrations`
- `packages/contracts` or equivalent DTO/schema folder
- `packages/prompts` or equivalent prompt folder
- `packages/domain` or equivalent business logic folder
- `context-packs/healthgenai`
- `tests/fixtures`

If the repo already has a different structure, map the same responsibilities into the existing layout.

## Required business rules for v1

Implement and verify these rules:

- one primary socratic question per turn
- at most three diagnosis items per turn
- no legal or financial questioning inside the problem-definition lane
- no invented facts
- completion requires a sufficiently clear:
  - problem owner
  - problem statement
  - evidence of the problem
  - scope
  - current alternatives
  - major assumptions / remaining ambiguities
- if output JSON is invalid, repair once
- if repair still fails, return a controlled error and log the raw output
- if user answer is empty, too short, or `no lo sé`, reformulate rather than advancing the stage
- never advance to future agents automatically in v1 unless explicitly requested

## Minimum implementation deliverables

Unless the user says otherwise, aim to leave the repository with all of the following:

1. persisted contracts and schemas
2. database migration(s)
3. prompt files
4. workflow exports/specs for n8n
5. service/module code for:
   - normalization
   - extraction orchestration
   - state transitions
   - agent turn handling
   - audit logging
6. tests covering:
   - schema conformance
   - happy path
   - vague proposal path
   - invalid model JSON repair path
   - resume flow
7. run instructions for local development
8. sample fixtures for proposal text and expected structured outputs

## Verification checklist before finishing

Before declaring success:

1. run the most relevant tests
2. validate example payloads against the schemas
3. confirm the happy path reaches `problem_defined`
4. confirm conversation state persists across turns
5. confirm workflow files and prompt files are committed
6. confirm docs explain how to run the MVP locally
7. summarize:
   - what was implemented
   - what remains intentionally out of scope
   - what assumptions were made

## Final response format

When you finish a task using this skill, report:
- files added/changed
- commands run
- tests/status
- remaining gaps or risks
- next best step
