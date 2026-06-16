# Frontend Upgrade Audit

Fecha: 2026-06-14

## Current Frontend Summary

SokrAI web is a React 19 + Vite single-page frontend in `apps/web`. It supports:

- selecting a new proposal or resuming an existing proposal
- creating a proposal from text, supporting text or a PDF
- loading a persisted proposal session
- moving through proposal phases with a phase rail
- answering guided questions in a conversation workspace
- showing current gaps and phase guidance
- composing and downloading the Basic Alpha Report when backend state allows it

The frontend is functional and already has useful state derivation in `apps/web/src/lib/session-view.ts`. The main product issue is presentation: the normal user experience still reads like a technical demo console and exposes implementation language.

Browser inspection was performed with local Vite and headless Chrome screenshots at desktop and mobile sizes. Chrome DevTools MCP was not available, but Google Chrome headless was available after allowing localhost access. The first screenshots exposed a real load-position issue caused by `autoFocus` scrolling the page to the form.

## Main Screens Found

- Start mode page in `apps/web/src/App.tsx`
  - top bar
  - start/resume mode cards
  - new proposal intake form
- New proposal form in `apps/web/src/components/NewProposalPanel.tsx`
- Resume form and recent sessions in `apps/web/src/components/ContinueSessionPanel.tsx`
- Guided workspace in `apps/web/src/components/SessionWorkspace.tsx`
  - phase action panel
  - conversation history
  - current question callout
  - answer composer
  - downstream report container
- Phase rail in `apps/web/src/components/PhaseRail.tsx`
- Guidance and state panel in `apps/web/src/components/SessionStatePanel.tsx`
- Report review panel in `apps/web/src/components/BasicAlphaReportPanel.tsx`
- Session drawer in `apps/web/src/components/SessionMenu.tsx`
- Loading panel in `apps/web/src/components/WorkflowLoadingPanel.tsx`
- API/error copy in `apps/web/src/lib/feedback.ts` and `apps/web/src/lib/api.ts`

## Top UX And Copy Problems

1. The start page does not explain the product in user language. It says "Problem Definition Console", "AI evaluator ready", "Interview mode", "structured brief" and "`session_id`".
2. The primary CTA is split between mode-card selection and a form submit, which makes the first action less clear.
3. Resume copy asks for "Session ID" and explains PostgreSQL, snapshots and runs instead of helping the user continue a previous proposal.
4. Loading states mention payload validation, JSON contracts, workflows, lanes, n8n, Fastify and Ollama.
5. Error messages are written for developers. They mention backend contracts, proxy setup, n8n, API logs, model JSON and request IDs.
6. Workspace copy still says "Turno", "Agent status", "lane", "medical-device triage", "gaps/questions/uncertainty" and other internal labels.
7. Report copy shows "Basic Alpha Report", schema version, audit refs, internal sources and source IDs. Those are not appropriate in normal mode.
8. Several hidden compatibility blocks still render technical strings into the DOM. They are visually hidden, but they are still part of the normal document output and can be reached by tests or assistive tooling depending on behavior.
9. The answer composer is usable but still feels like a textarea attached to a chat transcript, not a guided work area.
10. The product uses "demo" language in normal states, which weakens trust for a healthcare/operations stakeholder.

## Visible Technical Or Debug Information Found

The normal UI currently exposes or can expose:

- `session_id` and "Session ID"
- `request_id` in recovery banners
- "JSON", "payload", "contrato", "schema version"
- "structured brief"
- "workflow"
- "n8n", "Fastify", "Ollama", "PostgreSQL"
- "API", "backend", "proxy"
- "runs", "snapshots", "eventos"
- source IDs in the report panel
- export ID after PDF download
- internal report names such as "Basic Alpha Report"
- "Agent status"
- "lane" and "carril"
- "medical-device triage" as an internal module name
- hash-related metadata in API download data, not directly rendered except via error/debug paths

Normal users should not see these. Contract names and technical codes can remain in code and API calls, but the UI boundary should map them to plain Spanish.

## Visual Quality Diagnosis

The current design has a coherent light cyan palette and decent component consistency, but it reads as a polished demo rather than a premium product:

- Too much cyan tint and glow makes the page feel like generic AI SaaS.
- Large rounded cards, blurred panels and soft shadows are overused.
- The hero is oversized and abstract, while the real product task starts below.
- Many labels use uppercase tracked text, creating a templated feel.
- Cards are used for nearly every group, reducing hierarchy.
- The workspace resembles a chat/dashboard hybrid instead of a guided proposal workspace.
- Report presentation is dense and metadata-heavy.
- Buttons have reasonable contrast, but the visual system lacks stronger neutral hierarchy.

## Responsive And Accessibility Issues

- The start form uses `autoFocus`, causing Chrome to scroll away from the first screen on load. On mobile, the first capture started mid-page instead of at the explanation and CTA.
- The 390px layout stacks content, but the first viewport can miss the product explanation because of autofocus and large top content.
- Tablet/mobile screenshots require delayed capture to see rendered content reliably.
- Icon-only SVGs in mode cards are decorative and hidden, which is acceptable, but the app hand-rolls SVG icons instead of a consistent icon system.
- Form labels are present, but placeholder and helper copy sometimes contain technical language.
- Focus states exist globally and on fields, but the first screen auto-focus behavior creates an unwanted scroll jump.
- Motion has reduced-motion handling, but duplicate `workflow-pulse` keyframes exist.
- Hidden compatibility DOM contains technical copy and should be removed or moved into tests instead of hidden normal markup.

## Highest-Impact Improvement Plan

1. Rewrite all normal user-facing copy into plain Spanish from Spain.
2. Remove technical/debug/internal information from normal UI, especially session/request IDs, JSON, contracts, API, n8n, Fastify, Ollama, PostgreSQL, snapshots, runs and source IDs.
3. Rebuild the start page around a clear proposition: improve a proposal with guided questions for human review.
4. Remove autofocus from start/resume forms so the first viewport stays stable.
5. Redesign the intake form as a calm, guided work area with clear fields, helper text and safety note.
6. Redesign resume as "Continuar una propuesta anterior", using "código o enlace de propuesta" instead of "Session ID".
7. Reframe workspace around phase, current question, why it matters, what to write, what happens next and missing items.
8. Improve phase labels: Inicio, Problema, Solución, Datos y privacidad, Revisión sanitaria/regulatoria, Piloto y recursos, Informe, Exportación.
9. Keep report/PDF controls gated by the existing phase logic, but make the report panel human-readable and remove metadata.
10. Replace developer error/loading messages with recovery-oriented language.
11. Reduce visual noise: fewer nested cards, smaller radii, calmer neutral surfaces, clearer spacing rhythm and better mobile structure.
12. Add accessible labels, clearer validation messages, stable touch targets and better focus behavior.

## Files Likely To Change

- `PRODUCT.md`
- `docs/frontend-upgrade-audit.md`
- `docs/frontend-upgrade-summary.md`
- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/NewProposalPanel.tsx`
- `apps/web/src/components/ContinueSessionPanel.tsx`
- `apps/web/src/components/SessionWorkspace.tsx`
- `apps/web/src/components/SessionStatePanel.tsx`
- `apps/web/src/components/BasicAlphaReportPanel.tsx`
- `apps/web/src/components/PhaseRail.tsx`
- `apps/web/src/components/WorkspaceTopBar.tsx`
- `apps/web/src/components/SessionMenu.tsx`
- `apps/web/src/components/WorkflowLoadingPanel.tsx`
- `apps/web/src/components/StatusBadge.tsx`
- `apps/web/src/lib/session-view.ts`
- `apps/web/src/lib/report-view.ts`
- `apps/web/src/lib/feedback.ts`
- `apps/web/src/lib/proposal-start-payload.ts`
- related frontend tests where assertions encode old copy
