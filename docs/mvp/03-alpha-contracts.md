# Alpha contract inventory

PR 2A defined schema-backed contracts and TypeScript domain types for the MVP Alpha data model. Later PRs extend the inventory with persisted Alpha/Clinic contracts while keeping RAG, embedded PDF fields, enterprise auth, and remote AI provider behavior outside this v1 surface.

## Contract files

| Contract | Schema | Purpose |
| --- | --- | --- |
| `ProposalSource` | `contracts/schemas/proposal-source.schema.json` | Stable provenance reference for user-provided or internally generated Alpha material. |
| `ProposalDocument` | `contracts/schemas/proposal-document.schema.json` | Pasted or uploaded source material payload shape. |
| `AlphaGap` | `contracts/schemas/alpha-gap.schema.json` | Descriptive information gap for problem, solution, data/AI/privacy, medical-device triage, or resources/pilot/viability work. |
| `ChatTurn` | `contracts/schemas/chat-turn.schema.json` | One question/answer turn with bounded diagnosis. |
| `ModuleChat` | `contracts/schemas/module-chat.schema.json` | Problem, solution, data/AI/privacy, medical-device triage, or resources/pilot/viability chat lifecycle and turns. |
| `GeneratedSection` | `contracts/schemas/generated-section.schema.json` | Versioned generated problem, solution, data/AI/privacy, medical-device triage, or resources/pilot/viability section. |
| `AlphaProposal` | `contracts/schemas/alpha-proposal.schema.json` | Aggregate contract that composes brief, documents, sources, gaps, chats, sections, and audit references. |
| `BasicAlphaReport` | `contracts/schemas/basic-alpha-report.schema.json` | Implemented in-app structured Alpha report, without PDF/export fields or raw model output. |
| `SolutionDefinitionTurn` | `contracts/schemas/solution-definition-turn.schema.json` | Bounded model output for the solution-definition lane. |
| `SolutionStartRequest` / `SolutionStartResponse` | `contracts/schemas/solution-start.*.schema.json` | Starts the solution lane after the problem section exists. |
| `SolutionReplyRequest` / `SolutionReplyResponse` | `contracts/schemas/solution-reply.*.schema.json` | Persists a solution answer and returns the next solution state. |
| `RegulatoryProfile` | `contracts/schemas/regulatory-profile.schema.json` | Static `hospital_clinic_v1` profile contract for the Clinic Pilot sensitive lane. |
| `DataAiPrivacyTurn` | `contracts/schemas/data-ai-privacy-turn.schema.json` | Bounded model output for sensitive data/AI/privacy gap clarification. |
| `DataAiPrivacyStartRequest` / `DataAiPrivacyStartResponse` | `contracts/schemas/data-ai-privacy-start.*.schema.json` | Starts the sensitive lane after the solution section exists. |
| `DataAiPrivacyReplyRequest` / `DataAiPrivacyReplyResponse` | `contracts/schemas/data-ai-privacy-reply.*.schema.json` | Persists a sensitive-lane answer and returns the next bounded state. |
| `MedicalDeviceTriageTurn` | `contracts/schemas/medical-device-triage-turn.schema.json` | Bounded, non-definitive output for conditional medical-device triage. |
| `MedicalDeviceTriageStartRequest` / `MedicalDeviceTriageStartResponse` | `contracts/schemas/medical-device-triage-start.*.schema.json` | Starts triage after the data/AI/privacy section exists, returning `applicable`, `uncertain`, or `not_applicable`. |
| `MedicalDeviceTriageReplyRequest` / `MedicalDeviceTriageReplyResponse` | `contracts/schemas/medical-device-triage-reply.*.schema.json` | Persists a triage answer and returns the next bounded state. |
| `ResourcesPilotViabilityTurn` | `contracts/schemas/resources-pilot-viability-turn.schema.json` | Bounded, non-scoring output for operational pilot inputs. |
| `ResourcesPilotViabilityStartRequest` / `ResourcesPilotViabilityStartResponse` | `contracts/schemas/resources-pilot-viability-start.*.schema.json` | Starts the resources/pilot/viability lane after the solution section exists. |
| `ResourcesPilotViabilityReplyRequest` / `ResourcesPilotViabilityReplyResponse` | `contracts/schemas/resources-pilot-viability-reply.*.schema.json` | Persists a resources/pilot answer and returns the next bounded state. |

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
| Module chat | `module` | `problem`, `solution`, `data_ai_privacy`, `medical_device_triage`, `resources_pilot_viability` | Implemented Alpha/Clinic module values. |
| Module chat | `chat_status` | `not_started`, `active`, `waiting_for_user`, `ready_to_generate`, `completed`, `blocked`, `failed` | Chat lifecycle for Alpha/Clinic modules. |
| Chat turn | `turn_status` | `awaiting_user`, `processing`, `resolved`, `failed`, `skipped` | Turn lifecycle for modular chats. |
| Generated section | `section_kind` | `problem`, `solution`, `data_ai_privacy`, `medical_device_triage`, `resources_pilot_viability` | Generated section kind. |
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

## Solution definition lane

The Alpha solution lane reuses the same tables as the problem lane:

- `module_chats.module = 'solution'`
- `chat_turns.module = 'solution'`
- `alpha_gaps.module = 'solution'`
- `agent_runs.run_purpose = 'solution_definition'`
- `generated_sections.section_kind = 'solution'`

The lane starts only after a current generated problem section exists. It asks one
primary question per turn, caps diagnosis at three items, stores answer
idempotency on `chat_turns.answer_request_id`, and renders the final solution
section deterministically from persisted solution fields and internal source
refs. It does not introduce business plan, cost, legal/regulatory,
medical-device, RAG, PDF, scoring, ranking, approval, or committee-decision
behavior.

## Basic Alpha report

PR 8 implements `BasicAlphaReport` as a deterministic composition over persisted
Alpha state:

- structured brief
- current Alpha gaps and statuses
- current generated problem section
- current generated solution section
- internal source references
- audit references
- fixed warnings that the payload is not a dictamen, not an approval/rejection
  and not a legal, clinical, or regulatory decision
- `schema_version` and `generated_at`

Composition is exposed through `POST /internal/reports/basic-alpha/compose` for
n8n/internal orchestration. The public app-facing read model is
`GET /api/v1/sessions/:sessionId/report`. That route returns only the report
contract; raw `agent_runs` output remains available in the audit endpoint but is
not copied into the report payload or UI.

Still excluded from `BasicAlphaReport`: `pdf_url`, embedded export fields,
legal/regulatory or medical-device decisions, RAG citations, scoring, ranking,
approval and rejection.

## Basic Alpha report PDF export

PR 12 adds a separate local export surface for the composed Basic Alpha report:

- public route: `GET /api/v1/sessions/:sessionId/report.pdf`
- binary response: `application/pdf`
- headers: `X-Sokrai-Export-Id`, `X-Sokrai-Report-Sha256`,
  `X-Sokrai-Pdf-Sha256`
- audit event: `basic_report_pdf_exported` in `audit_events.payload_json`
- template version: `basic-report-pdf.v1`

`BasicAlphaReport` still does not contain `pdf_url` or embedded export fields.
The PDF is generated from validated persisted report/section data and must not
include raw model output, prompt fields, model parameters, scoring, ranking,
approval/rejection, or legal/clinical/regulatory dictamen.

## Data/AI/privacy Clinic lane

PR 9 adds the fixed `hospital_clinic_v1` profile and a
`data_ai_privacy` module. The lane reuses the same Alpha primitives:

- `module_chats.module = 'data_ai_privacy'`
- `chat_turns.module = 'data_ai_privacy'`
- `alpha_gaps.module = 'data_ai_privacy'`
- `agent_runs.run_purpose = 'data_ai_privacy_gap'`
- `generated_sections.section_kind = 'data_ai_privacy'`

The lane starts only after a current generated solution section exists. It asks
one primary question per turn, caps diagnosis at three items, persists gaps and
uncertainty, and renders a deterministic section from persisted state and
internal sources.

Allowed outputs are gaps, questions, uncertainty, and the exact marker
`requires competent human review`. The module must not produce legal,
regulatory, clinical, privacy, or medical-device decisions; definitive
compliance/non-compliance; approval/rejection; ranking/scoring; or definitive
medical-device classification. Basic Alpha report remains Alpha-only and does
not include the sensitive section.

## Medical-device triage Clinic lane

PR 10 adds `medical_device_triage` as a conditional, non-definitive Clinic Pilot
module. It reuses the same Alpha primitives:

- `module_chats.module = 'medical_device_triage'`
- `chat_turns.module = 'medical_device_triage'`
- `alpha_gaps.module = 'medical_device_triage'`
- `agent_runs.run_purpose = 'medical_device_triage'`
- `generated_sections.section_kind = 'medical_device_triage'`

The lane starts only after a current generated data/AI/privacy section exists.
It records `applicable`, `uncertain`, or `not_applicable` as triage state only;
this is not a legal, regulatory, product, MDR, approval, rejection, or final
classification decision. Allowed outputs are bounded gaps, questions,
uncertainty, evidence needs, intended-use claims for review, and the exact
marker `requires competent human review`.

## Resources/pilot/viability Clinic lane

PR 11 adds `resources_pilot_viability` as a bounded operational input module. It
reuses the same Alpha primitives:

- `module_chats.module = 'resources_pilot_viability'`
- `chat_turns.module = 'resources_pilot_viability'`
- `alpha_gaps.module = 'resources_pilot_viability'`
- `agent_runs.run_purpose = 'resources_pilot_viability'`
- `generated_sections.section_kind = 'resources_pilot_viability'`

The lane starts only after a current generated solution section exists. It asks
one primary question per turn, caps diagnosis at three items, stores answer
idempotency on `chat_turns.answer_request_id`, and renders the final section
deterministically from persisted operational fields and internal source refs.

Collected inputs are human resources, technical resources, pilot environment,
dependencies, indicators/metrics, constraints, operational risks, assumptions,
and any remaining operational uncertainties. An empty uncertainty list is valid
when the other operational inputs are complete.

The lane does not produce scores, rankings, approvals, go/no-go decisions,
detailed financial models, RAG conclusions, legal/regulatory/clinical/privacy
or medical-device determinations, PDF output, or export behavior.

## GeneratedSection versioning

`GeneratedSection.section_version` is required and must be an integer starting at `1`.
Consumers must preserve it when reading, replaying, or rendering generated sections.
Persistence orders versions by `section_kind`, `section_version`, `created_at`, and id; callers must not infer currentness from array position alone or omit `section_version` from cached payloads.

## Historical PR2A exclusions

- No `db/migrations` changes or SQL constraints.
- No repositories, persistence calls, or current session status reinterpretation.
- No UI components or runtime API calls.
- No RAG, pgvector, embeddings, corpus citations, or context packs.
- No cost, scoring, or resource modules.
- No PDF export fields such as `pdf_url`.
- No enterprise auth, remote AI provider, VPS, merges, or cherry-picks.
