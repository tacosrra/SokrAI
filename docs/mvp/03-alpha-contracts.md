# Alpha contract inventory

PR 2A defines schema-backed contracts and TypeScript domain types for the MVP Alpha data model. These contracts are groundwork for later persistence, workflow, and UI work; they do not implement database tables, repositories, UI behavior, RAG, Clinic Pilot modules, PDF export, enterprise auth, or remote AI provider behavior.

## Contract files

| Contract | Schema | Purpose |
| --- | --- | --- |
| `ProposalSource` | `contracts/schemas/proposal-source.schema.json` | Stable provenance reference for user-provided or internally generated Alpha material. |
| `ProposalDocument` | `contracts/schemas/proposal-document.schema.json` | Pasted or uploaded source material payload shape. |
| `AlphaGap` | `contracts/schemas/alpha-gap.schema.json` | Descriptive information gap for problem or solution work. |
| `ChatTurn` | `contracts/schemas/chat-turn.schema.json` | One question/answer turn with bounded diagnosis. |
| `ModuleChat` | `contracts/schemas/module-chat.schema.json` | Problem or solution chat lifecycle and turns. |
| `GeneratedSection` | `contracts/schemas/generated-section.schema.json` | Versioned generated problem or solution section. |
| `AlphaProposal` | `contracts/schemas/alpha-proposal.schema.json` | Aggregate contract that composes brief, documents, sources, gaps, chats, sections, and audit references. |
| `BasicAlphaReport` | `contracts/schemas/basic-alpha-report.schema.json` | In-app structured Alpha report, without PDF/export fields. |

`structured-brief.schema.json` remains canonical and is referenced by aggregate/report contracts rather than duplicated.

## State values

| Concept | Field | Values | Meaning |
| --- | --- | --- | --- |
| Proposal | `proposal_status` | `draft`, `active`, `completed`, `blocked`, `failed`, `archived` | Lifecycle of the future Alpha proposal aggregate. |
| Document | `document_status` | `received`, `normalized`, `unsupported`, `failed` | Availability and normalization state for source material. |
| Source | `source_kind` | `pasted_text`, `uploaded_file`, `extracted_text`, `user_answer`, `generated_section` | Internal provenance kind only; no RAG corpus or vector reference. |
| Gap | `gap_kind` | `missing_information`, `ambiguous_information`, `unsupported_claim`, `needs_user_confirmation` | Descriptive gap kind, not scoring or approval. |
| Gap | `gap_status` | `open`, `in_progress`, `resolved`, `deferred`, `not_applicable` | Gap resolution state for later chats. |
| Gap | `origin` | `structured_brief_field`, `structured_brief_missing_information`, `structured_brief_ambiguity`, `proposal_source`, `system_rule` | Deterministic provenance for why the gap exists. |
| Module chat | `module` | `problem`, `solution` | Alpha modules only. |
| Module chat | `chat_status` | `not_started`, `active`, `waiting_for_user`, `ready_to_generate`, `completed`, `blocked`, `failed` | Chat lifecycle for problem and solution modules. |
| Chat turn | `turn_status` | `awaiting_user`, `processing`, `resolved`, `failed`, `skipped` | Turn lifecycle for modular chats. |
| Generated section | `section_kind` | `problem`, `solution` | Alpha generated section kind. |
| Generated section | `section_status` | `draft`, `generated`, `accepted`, `needs_revision`, `superseded` | Versioned section lifecycle. |
| Basic report | `report_status` | `draft`, `ready`, `needs_revision` | In-app report readiness state. |
| Audit reference | `audit_refs[].kind` | `agent_run`, `audit_event`, `snapshot`, `chat_turn` | Reference-only audit linkage. |

## AlphaGap absence and provenance

PR 5 extends `AlphaGap` so initial gaps can be audited without inventing evidence:

- `origin` records which deterministic path created the gap.
- `absence.is_absent = true` is required for `missing_information`.
- `absence.checked_fields` lists the structured brief fields that were checked.
- `absence.reason` explains the absence without making a negative assessment.
- `source_refs` remains empty for absence-only gaps.
- `source_refs` may contain persisted internal sources only when the gap is tied to real submitted material.

Initial gap analysis is deterministic API/domain code. It does not add scoring, ranking, approval, legal/regulatory conclusions, medical-device classification, cost/resource analysis, RAG, or PDF export.

## PR2A exclusions

- No `db/migrations` changes or SQL constraints.
- No repositories, persistence calls, or current session status reinterpretation.
- No UI components or runtime API calls.
- No RAG, pgvector, embeddings, corpus citations, or context packs.
- No Clinic Pilot regulatory, medical-device, cost, scoring, or resource modules.
- No PDF export fields such as `pdf_url`.
- No enterprise auth, remote AI provider, VPS, merges, or cherry-picks.
