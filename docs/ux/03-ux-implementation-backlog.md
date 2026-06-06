# UX0 Implementation Backlog

This backlog breaks the redesign into small PRs. It is documentation-only and does not change backend behavior, product modules, RAG, auth, remote AI, or safety policy.

## UX1 Canonical phase/progress model

### Objective

Create a frontend presentation model that represents the full product flow:

1. Intake / proposal context
2. Problem
3. Solution
4. Data / AI / privacy / regulatory
5. Medical device triage, if applicable
6. Resources / pilot / viability
7. Report
8. PDF/export

The user should always understand current phase, completed phases, locked future phases, and what happens next.

### Scope

- Add a derived frontend phase model based on existing contracts and audit data.
- Keep `structured-brief.schema.json` and API schemas as contract sources of truth.
- Preserve the existing problem checklist as per-phase progress, not whole-session progress.
- Add states such as `complete`, `current`, `ready`, `locked`, `not_applicable`, `recovering`, and `error`.
- Define deterministic current-phase selection.
- Document how report and PDF readiness are derived.

### Likely files

- `apps/web/src/lib/session-view.ts`
- `apps/web/src/lib/session-view.test.ts`
- `apps/web/src/domain/contracts.ts`
- `apps/web/src/components/StatusBadge.tsx`
- `docs/ux/02-target-ux-concept.md`

### Acceptance criteria

- Whole-session progress no longer displays problem checklist percent as global maturity.
- Problem checklist remains available as problem-phase detail.
- Each desired product phase can render a user-facing state.
- Future phases can be marked locked with a reason.
- Medical-device triage can be represented as current, complete, locked, or not applicable.
- Report and PDF/export are separate states.
- The derived model does not invent backend facts.

### Tests

- Unit tests for phase derivation from audit fixtures.
- Tests for active question priority across problem, solution, data/AI/privacy, medical-device triage, and resources/pilot.
- Tests for report ready vs locked.
- Tests for PDF/export ready when report exists.
- Tests for stale or missing audit artifacts not falsely marking phases complete.

### What not to touch

- Backend state transitions.
- API schemas.
- Prompt behavior.
- n8n workflows.
- Report composition behavior.
- PDF generation behavior.

## UX2 Sequential phase gating/navigation

### Objective

Make the UI communicate and enforce the desired sequential flow. Later modules should not feel parallel unless the product explicitly decides they are parallel.

### Scope

- Replace scattered inline phase-start CTAs with a canonical phase rail or phase navigator.
- Show locked future phases and clear unlock reasons.
- Allow exactly one primary next action for the current state.
- Gate resources/pilot behind the intended prerequisite path, not merely latest solution section, if the product decision is sequential.
- Gate report behind the required previous phases, including data/AI/privacy, conditional medical-device triage, and resources/pilot.
- Keep backend behavior unchanged. If backend still allows certain calls, this PR only changes frontend affordances.

### Likely files

- `apps/web/src/components/SessionWorkspace.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/session-view.ts`
- `apps/web/src/components/StatusBadge.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/lib/session-view.test.ts`

### Acceptance criteria

- The phase rail shows all eight desired phases.
- Only the current or ready phase exposes a primary action.
- Locked phases explain what must happen first.
- Resources/pilot no longer appears as an equally parallel action immediately after solution unless explicitly allowed.
- Report does not appear ready before required prior phases are complete or skipped.
- Medical-device triage is clearly conditional.

### Tests

- Component tests or presentation-model tests for each phase state.
- Regression tests for current phase when multiple module chats exist.
- Tests for report locked reasons.
- Manual test matrix for common states: new problem, problem complete, solution active, data/AI/privacy active, medical-device not applicable, resources complete, report ready, PDF ready.

### What not to touch

- API endpoints.
- Recovery polling.
- Backend module start/reply handlers.
- Prompt content.
- Generated section schemas.

## UX3 Clean chat-first app shell

### Objective

Rebuild the workspace layout so the current question and answer composer are the center of the product.

### Scope

- Move the answer composer directly under the active question.
- Place recent turns below the composer.
- Move long persisted history behind a disclosure or history panel.
- Move session switching into a session menu/drawer rather than a permanent competing rail section.
- Keep project title, current phase, and sync/recovery state visible.
- Keep one safety notice near the active task.

### Likely files

- `apps/web/src/App.tsx`
- `apps/web/src/components/SessionWorkspace.tsx`
- `apps/web/src/components/SessionStatePanel.tsx`
- `apps/web/src/components/LocalDemoSafetyNotice.tsx`
- `apps/web/src/components/ContinueSessionPanel.tsx`
- `apps/web/src/styles.css`

### Acceptance criteria

- The current question is visible above the fold on desktop and mobile.
- The composer is visually and semantically tied to the current question.
- The primary CTA is obvious and unique.
- Phase CTAs no longer interrupt the chat stream.
- Technical session controls are secondary.
- Safety notice remains visible without repeated interruption.
- The layout works as one column on mobile.

### Tests

- Manual desktop and mobile pass for intake, active question, no active question, loading, and completed session.
- Keyboard-only pass from top bar to composer to submit.
- Screen-reader landmark check for top bar, phase navigation, main chat, and guidance panel.
- Visual regression screenshots if the project has screenshot tooling later.

### What not to touch

- API calls.
- Business rules.
- Safety warning content, except placement and deduplication.
- New product modules.

## UX4 Per-phase progress/maturation UI

### Objective

Replace a single "problem maturity" score with per-phase progress and gap summaries.

### Scope

- Show phase-level completion in the rail.
- Show current phase gap summary in the guidance panel.
- Keep the problem checklist only inside the problem phase.
- Add phase-specific copy for "remaining gaps".
- Hide resolved/deferred/not applicable gap groups by default.
- Make "what happens next" explicit after each answer.

### Likely files

- `apps/web/src/lib/session-view.ts`
- `apps/web/src/components/SessionStatePanel.tsx`
- `apps/web/src/components/SessionWorkspace.tsx`
- `apps/web/src/components/BasicAlphaReportPanel.tsx`
- `apps/web/src/lib/report-view.ts`
- `apps/web/src/styles.css`

### Acceptance criteria

- The user can see remaining gaps for the current phase without reading raw audit details.
- Problem checklist no longer implies whole-product completion.
- Later phases have meaningful visible status even when they do not have a checklist.
- Report preview distinguishes open gaps from debug gap metadata.
- The UI clearly states the next phase or next action.

### Tests

- Unit tests for gap-summary derivation.
- Tests for problem checklist rendering only in problem phase context.
- Component tests for no gaps, one gap, many gaps, and locked phase.
- Manual review with sessions across multiple phase combinations.

### What not to touch

- Gap detection logic.
- Backend gap statuses.
- Report generation.
- Prompt rules.

## UX5 Hide/collapse technical/debug info

### Objective

Move developer and audit internals out of the default user experience while keeping traceability available.

### Scope

- Add a collapsed `Audit details` or `Technical details` disclosure.
- Move session ID copy, request IDs, runs, snapshots, events, source IDs, source hashes, schema versions, export IDs, and full audit details into it.
- Remove workflow names and JSON-contract language from default loading/error copy.
- Keep warnings visible and product-facing.
- Keep raw model output hidden.

### Likely files

- `apps/web/src/components/SessionStatePanel.tsx`
- `apps/web/src/components/SessionWorkspace.tsx`
- `apps/web/src/components/BasicAlphaReportPanel.tsx`
- `apps/web/src/components/ContinueSessionPanel.tsx`
- `apps/web/src/lib/feedback.ts`
- `apps/web/src/lib/report-view.ts`
- `apps/web/src/styles.css`

### Acceptance criteria

- Default workspace no longer shows snapshots, runs, events, hashes, source IDs, schema versions, or request IDs.
- Advanced details are reachable, keyboard accessible, and clearly labeled.
- Safety warnings remain visible.
- Error copy is plain-language by default.
- Technical details still provide enough local demo troubleshooting information.
- No raw model output is shown.

### Tests

- Component tests for collapsed and expanded advanced panel.
- Accessibility test for disclosure keyboard behavior and accessible name.
- Manual check that safety notices still appear in intake, workspace, clinic modules, report, and export contexts.
- Manual check that debug strings do not appear in default UI.

### What not to touch

- Audit persistence.
- API response payloads.
- Safety warning semantics.
- Raw model storage rules.

## UX6 Session resume/recovery UX and resilience

### Objective

Make resume and recovery understandable, especially when local browser session shortcuts become stale after container restarts.

### Scope

- Distinguish browser-saved recent sessions from backend-confirmed sessions.
- Add stale-state handling for recent sessions that fail with `session_not_found`.
- Offer a clear action: remove stale shortcut, create new session, or enter another ID.
- Simplify recovery banners into user-centered states.
- Move request IDs and service details into technical disclosure.
- Keep URL session resume behavior, but show a clear reconnecting state.

### Likely files

- `apps/web/src/App.tsx`
- `apps/web/src/components/ContinueSessionPanel.tsx`
- `apps/web/src/lib/storage.ts`
- `apps/web/src/lib/feedback.ts`
- `apps/web/src/components/WorkflowLoadingPanel.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/styles.css`

### Acceptance criteria

- A stale localStorage session is visibly marked stale after failed load.
- The user can remove stale entries without clearing all browser storage manually.
- Loading and recovery states use plain language.
- Recovery keeps the user on the current phase when possible.
- Technical request details are available only on demand.
- A failed recovery tells the user what to do next.

### Tests

- Unit tests for storage read/write/remove behavior.
- Component tests for recent session normal, active, loading, stale, and failed states.
- Tests for error mapping of `session_not_found`, `request_timeout`, `request_recovery_timeout`, and `network_error`.
- Manual test after container restart or database reset.
- Manual test for URL `?session=` resume.

### What not to touch

- Backend recovery endpoints.
- Request execution persistence.
- Workflow timeout values unless a separate technical PR explicitly covers them.
- Authentication or remote user accounts.

## UX7 Visual polish/accessibility/responsive/manual testing

### Objective

Make the redesigned UI feel calm, high-end, healthcare-appropriate, and usable across desktop and mobile.

### Scope

- Reduce card density and nested panel feel.
- Use a quieter palette with restrained semantic color.
- Reduce large radii and decorative gradients in product surfaces.
- Standardize button hierarchy and focus states.
- Add responsive layout rules for phase rail, chat center, guidance panel, and advanced disclosure.
- Verify contrast, keyboard flow, touch targets, and reduced motion.
- Ensure visible text does not overflow or overlap.

### Likely files

- `apps/web/src/styles.css`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/SessionWorkspace.tsx`
- `apps/web/src/components/SessionStatePanel.tsx`
- `apps/web/src/components/StatusBadge.tsx`
- `apps/web/src/components/WorkflowLoadingPanel.tsx`
- `apps/web/src/components/BasicAlphaReportPanel.tsx`

### Acceptance criteria

- The app no longer reads as a cyan glass AI console.
- Primary surfaces use restrained borders, modest radius, and clear hierarchy.
- The current question and composer remain visible and usable on mobile.
- All interactive elements have visible focus states.
- Touch targets are at least 44px where practical.
- Motion respects `prefers-reduced-motion`.
- Text remains readable and contained across supported breakpoints.
- No critical safety warning is removed or visually buried.

### Tests

- Manual keyboard navigation from start page through active workspace.
- Manual screen-reader landmark and control-label pass.
- Contrast review for text, badges, buttons, warnings, and error states.
- Responsive review at 390px, 768px, 1024px, 1440px.
- Reduced-motion review.
- Manual happy path from intake to problem, solution, data/AI/privacy, medical-device triage if applicable, resources, report, PDF/export.

### What not to touch

- Backend behavior.
- API contracts.
- Prompt files.
- RAG/auth/remote AI.
- Legal, cost, scoring, or broad multi-agent orchestration.
- Safety warning requirements.

