# UX0 Current UX Audit

## Scope and source files

This audit is documentation-only. It is based on Graphify-targeted discovery, then inspection of the specific web files Graphify identified:

- `apps/web/src/App.tsx`: app shell, session loading, request recovery, phase start/reply handlers, report/PDF actions.
- `apps/web/src/components/SessionWorkspace.tsx`: active workspace, current question, phase CTAs, generated section previews, chat history, composer.
- `apps/web/src/components/SessionStatePanel.tsx`: progress, checklist, live insights, sources, technical audit counters.
- `apps/web/src/components/ContinueSessionPanel.tsx`: resume form and recent session list.
- `apps/web/src/components/NewProposalPanel.tsx`: intake form and first-session CTA.
- `apps/web/src/components/BasicAlphaReportPanel.tsx`: report preview and PDF download.
- `apps/web/src/components/LocalDemoSafetyNotice.tsx`: required demo and clinical/regulatory safety warnings.
- `apps/web/src/lib/session-view.ts`: derived presentation state, current-question priority, current progress model.
- `apps/web/src/lib/report-view.ts`: report presentation summary.
- `apps/web/src/lib/storage.ts`: local browser recent sessions.
- `apps/web/src/lib/api.ts` and `apps/web/src/lib/feedback.ts`: API/recovery/error language surfaced to users.
- `apps/web/src/styles.css`: current visual shell, responsive behavior, panel/card vocabulary.

## Current UX problems

The app is functionally deep, but the primary experience reads as a technical operations console rather than a guided proposal-maturation conversation. The workspace shows the project header, session ID controls, phase badges, agent badges, technical counters, safety notices, current question, multiple future module cards, generated-section previews, report controls, persisted history, and a reply composer in one long column. This makes the current task harder to identify than the system state.

The experience is not chat-first. The active question appears near the top of `SessionWorkspace` (`question-callout`), while the actual answer field is far below the history and module cards. The user has to connect "Pregunta abierta" with "Siguiente intervención" manually.

The right rail is overloaded. `SessionStatePanel` shows the problem progress, latest problem section, full checklist values, detected gaps, warnings, source documents, source hashes, assumptions, ambiguities, diagnosis, constraints, completion reason, turn count, snapshot count, run count, and event count. Some of this is valuable, but it competes with the current question and next action.

The current IA mixes product phases, workflow internals, and audit artifacts. Labels such as `structured brief`, `proposal-reply-v1`, `n8n`, `runs`, `snapshots`, `conversation_turns`, `request_id`, and `session_id` appear as first-class UX copy. These are useful for debugging and local demos, but not for the default user journey.

## Overloaded areas

### Session workspace

`SessionWorkspace.tsx` is the most overloaded surface:

- Lines 152-209 render project header, session ID copy, stage/status/agent badges, resolved-turn count, category count, snapshot count, and a safety notice before the user sees or answers the active question.
- Lines 211-224 show the current question, but not as the central persistent interaction area.
- Lines 226-373 show solution, data/AI/privacy, medical-device triage, resources/pilot, report, generated content, and safety notices in sequence.
- Lines 375-444 render persisted history after the module cards rather than as the primary chat stream.
- Lines 446-505 render the reply composer after all of the above, with visible workflow implementation copy.

The result is a long page where controls and content from multiple mental models are interleaved: interview, module launcher, report preview, audit log, and debugger.

### State panel

`SessionStatePanel.tsx` is useful for traceability, but too much is default-visible:

- Lines 87-104 expose turns, snapshots, runs, and events as primary metrics.
- Lines 167-212 expose detected gaps with `gap_kind`, `gap_status`, source/absence labels, warnings, and source evidence.
- Lines 214-259 expose internal sources, document statuses, and SHA-256 fragments.
- Lines 261-313 expose assumptions, ambiguities, latest diagnosis, constraints, and completion reason in one dense panel.

For a healthcare proposal user, this reads as system internals before it reads as "what remains to answer."

### Intake and resume

`NewProposalPanel.tsx` includes fields that are valid for the contract but visually equivalent:

- Required proposal context and optional support material share the same surface.
- Optional `User ID` and `Metadata JSON` are visible in the default path.
- PDF copy explains base64 and contract mechanics.

`ContinueSessionPanel.tsx` exposes recent sessions as durable choices, but those records come from localStorage and can become stale after container restarts.

## Confusing actions and buttons

Phase-start CTAs appear as inline buttons inside informational `question-callout` sections:

- `Iniciar solución` appears after a generated problem section exists.
- `Iniciar datos/IA/privacidad` appears after solution exists.
- `Iniciar medical-device triage` appears after data/AI/privacy exists.
- `Iniciar recursos/piloto` appears after solution exists, in parallel with data/AI/privacy and medical-device triage.
- `Preparar informe` appears when problem and solution sections exist.

The buttons are technically gated in `SessionWorkspace.tsx` lines 124-148, but the UI does not present a single canonical phase path. Users see several "start" affordances as cards in the same scroll area, which implies that later modules are parallel tasks rather than a guided sequence.

The report and PDF controls also appear late in the same conversational flow. `BasicAlphaReportPanel.tsx` lines 75-90 places status, schema version, generated date, and `Download PDF` in a technical report header. A user looking for "what happens next" must infer whether PDF is an end state, a report sub-action, or another phase.

The top-level app also has duplicated resume affordances:

- Workspace rail "Abrir otra sesión" in `App.tsx` lines 1322-1344.
- Workspace rail recent sessions in lines 1347-1382.
- Standalone resume panel in `ContinueSessionPanel.tsx` lines 50-113.

This gives the user multiple ways to do the same risky operation without a clear recovery model.

## Misleading progress and maturation behavior

The current `SessionProgress` model is problem-definition-only. `deriveProgress` in `session-view.ts` lines 181-253 computes percent from six problem checklist fields:

- target user
- problem owner
- problem statement
- evidence of problem
- scope
- current alternatives

The progress steps are fixed as `intake`, `brief`, `clarification`, and `definition` (`session-view.ts` lines 190-217). This was accurate for the original v1 problem lane, but becomes misleading once solution, data/AI/privacy, medical-device triage, resources/pilot, report, and PDF exist.

The app then reuses this problem percent across the full workspace:

- `App.tsx` lines 1299-1315 labels it "madurez" in the rail.
- `SessionStatePanel.tsx` lines 53-85 labels it "Maduración del problema" but it lives beside later-phase UI, which makes it feel like whole-session progress.
- `SessionWorkspace.tsx` lines 191-205 shows categories and snapshots in the toolbar.

After the problem phase, a user can see high maturity even though later desired phases are incomplete or locked. The model lacks canonical states for:

- current phase
- completed phases
- locked future phases
- skipped medical-device triage when not applicable
- report prepared
- PDF exported

The current-question priority also hides phase intent. `deriveSessionPresentation` picks the current question by checking resources, medical-device triage, data/AI/privacy, solution, then problem (`session-view.ts` lines 350-355). That makes the newest downstream open question win, but it does not expose why that phase is active or what is locked next.

## Parallel navigation issues

The desired product flow is sequential:

1. Intake / proposal context
2. Problem
3. Solution
4. Data / AI / privacy / regulatory
5. Medical device triage, if applicable
6. Resources / pilot / viability
7. Report
8. PDF/export

The current UI does not enforce this mental model. `SessionWorkspace.tsx` allows resources/pilot once the latest solution section exists (`canStartResourcesPilotViability`, lines 142-147), while data/AI/privacy also starts after solution (`canStartDataAiPrivacy`, lines 130-135). This creates a parallel branch immediately after solution.

Medical-device triage is gated by a data/AI/privacy section (`canStartMedicalDeviceTriage`, lines 136-141), but the UI presents it as a normal next module rather than a conditional triage step. There is no visible "not applicable" route, no locked card state, and no explanation of why the phase is or is not needed.

Report composition is only gated by problem and solution sections (`canComposeReport`, line 148; `App.tsx` lines 103-107), which means it can appear before data/AI/privacy, medical-device triage, and resources/pilot are complete. That is inconsistent with the desired flow.

## Session recovery and resume issues

The recovery implementation is robust for a local workflow, but the UX exposes implementation details and does not clearly distinguish these cases:

- Resume an existing session by ID.
- Restore from URL query parameter.
- Restore from local browser recent sessions.
- Recover a timed-out request by request ID.
- Refresh the active session after a workflow continued in the background.
- Handle a stale localStorage entry after container reset.

`App.tsx` lines 304-320 auto-loads a URL `session` parameter and otherwise selects resume mode when a last session ID exists. `storage.ts` lines 43-75 persists recent sessions in localStorage after successful audit fetch. That means the session list is a browser memory, not a guarantee that PostgreSQL still contains the session.

When a localStorage session is stale, the user still sees a selectable session. Clicking it runs `loadSession`, which maps backend failure to an error banner. There is no UI state that marks the local entry as stale, removes it, or explains "this browser remembered the ID, but the local database no longer has it."

Request recovery is implemented in `App.tsx` lines 451-554 and repeated through the start/reply/module handlers. The default banners use phrases such as "request_id", "workflow", "formato inesperado", "API de inspección", and "recovery window". These are accurate for developers but too technical for default users.

`WorkflowLoadingPanel.tsx` and `feedback.ts` also expose `n8n`, Fastify, Ollama, JSON contracts, and service-version mismatch language in primary loading/error states. That is useful in dev mode, but intimidating and unclear for normal operators.

## Information that should be hidden by default

Hide these behind an advanced/debug disclosure by default:

- `session_id` full value and copy action, except as a small secondary "Session details" control.
- `request_id` values and request recovery mechanics.
- `runs`, `snapshots`, `events`, raw turn counts, and audit counters.
- Source IDs, SHA-256 fragments, internal source labels, document technical statuses.
- `gap_kind`, `gap_status`, `source_refs`, `absence`, and low-level evidence labels.
- Schema version, audit reference count, export ID, PDF/report hashes, and generated technical timestamps.
- Workflow names, webhook names, `proposal-reply-v1`, n8n, Fastify, Ollama, JSON contract language.
- Metadata JSON and user ID fields in intake unless an advanced section is open.
- Full generated markdown sections for downstream modules in the chat stream.
- Completion reason and latest diagnosis as raw audit concepts.

## Information that should stay visible

Keep these visible in the default experience:

- Product name and active project title.
- Current phase and completed/locked phase status.
- The current question.
- A clear answer composer directly adjacent to the question.
- Remaining gaps for the current phase, written in user language.
- What happens after submitting the answer.
- The last few conversational turns, with full history available but not dominating.
- Safety warnings, especially local demo, anonymized data, no patient data, no legal/clinical/regulatory/medical-device decision.
- Clear loading state for long-running workflows.
- Plain-language error state with next action.
- Resume state that says whether the app is reconnecting, recovered, not found, or stale.
- Report readiness and PDF/export readiness when the user reaches those phases.

## Information that should move to advanced/debug panels

Create one explicit advanced area, likely named "Technical details" or "Audit details", for:

- Session ID and copy action.
- Request IDs and recovery attempts.
- Runs, snapshots, event counts, agent run status.
- Internal sources, document IDs, SHA-256, source IDs, source refs.
- Contract/schema versions and report/export IDs.
- Full persisted audit history.
- Full generated section raw markdown.
- Gap internals and source evidence.
- Developer-focused recovery messages.

The advanced area should be collapsed by default, persist its open/closed state per browser if needed, and never expose raw model output.

## Accessibility and usability risks

- The visual hierarchy is too card-heavy. `styles.css` lines 102-113 applies large-radius, bordered, blurred, shadowed panels broadly. This makes primary and secondary surfaces look equally important.
- The three-column workspace (`styles.css` lines 823-828) creates a dense cockpit layout. On medium screens, the right insight panel drops below the main area (`styles.css` lines 1806-1824), making debug-heavy content even longer.
- The answer composer is not anchored to the current question. Keyboard and screen-reader users may need to traverse many intermediate controls before answering.
- Status badges rely on technical string transformations such as `replaceAll('_', ' ')`, which may produce labels that are accurate for code but not natural UX copy.
- Loading states include animated pulse dots and numbered steps. They use `aria-live` and `aria-busy`, which is good, but the copy is too workflow-specific and there is no reduced-motion review noted in the inspected files.
- Recent sessions are buttons with dense nested content. Without clearer stale/error states, users can repeatedly try broken entries.
- Many paragraphs include inline code styling in user-facing text. This increases cognitive load and makes routine actions feel like developer tasks.
- Safety notices are repeated in multiple locations. Repetition protects users, but the current placement can feel like repeated interruption. The warning should remain visible and persistent, but be structured once per relevant context.

