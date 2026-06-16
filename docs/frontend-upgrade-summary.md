# Frontend Upgrade Summary

Fecha: 2026-06-14

## What Changed

The web frontend was upgraded from a technical proposal-session demo into a calmer Spanish product experience for healthcare and operations stakeholders.

The main experience now frames SokrAI as a guided proposal workspace:

- start a new proposal
- continue a previous proposal
- answer guided questions
- understand the current phase
- see what is missing
- keep human-review and safety boundaries visible
- review and export the report only when phase state allows it

I also added `PRODUCT.md` to capture the product positioning expected by the design workflow.

## Copy Improvements

User-facing copy was rewritten into plain Spanish:

- start page: "Mejora tu propuesta con SokrAI"
- primary action: "Empezar nueva propuesta"
- resume action: "Continuar una propuesta anterior"
- loading: "Preparando tu primera pregunta" and "Preparando la siguiente pregunta"
- reply action: "Enviar respuesta"
- report: "Informe para revisión"
- export: "Descargar PDF" / "Exportar PDF"
- recovery: messages now explain what the user can do without exposing internal IDs or backend steps

Safety copy now consistently uses human-review framing:

- "material para revisión humana"
- "propuesta en preparación"
- "revisión humana recomendada"
- "esta herramienta no toma decisiones clínicas, legales ni regulatorias"

## Technical Information Removed From Normal UI

Normal screens no longer intentionally display:

- session/request IDs
- JSON, payloads, schemas or contract language
- workflow, lane, runs, snapshots or event counts
- n8n, Fastify, Ollama, PostgreSQL or backend/proxy setup language
- source IDs or report audit metadata
- "Basic Alpha Report" as a visible product name
- "medical-device triage" as a visible phase label
- hidden compatibility DOM containing technical strings

Internal contract fields remain in code and API boundaries, but the display layer maps them to user-facing Spanish.

## Visual Design Improvements

- Reworked the start page around a clear product promise, trust chips and two understandable actions.
- Restored the original cyan SokrAI palette after follow-up review while keeping the clearer hierarchy and Spanish copy.
- Tightened the visual system with calmer surfaces, smaller radii, restrained borders and cleaner spacing.
- Rebalanced typography and spacing so the page reads as a working product rather than a dashboard demo.
- Turned the intake form into a guided work area with safety note, clearer labels, stronger input affordances and better helper text.
- Reframed the workspace around phase, current question, answer composer, compact proposal header and next step.
- Restored the animated three-dot loading affordance on the first loading screen.
- Reworked the right-side guidance panel into a phase-filtered checklist of proposal gaps/aclaraciones with checked answered items and unchecked pending items, avoiding duplication with the left phase rail.
- Reworked the report panel into a review-oriented document view and removed metadata-heavy presentation.

## Accessibility Improvements

- Removed autofocus that caused the page to scroll away from the first screen on load.
- Preserved meaningful labels for form controls.
- Improved validation and recovery messages in plain language.
- Kept visible focus treatment on interactive controls and fields.
- Maintained `aria-live` loading states.
- Ensured phase progress does not rely only on color; status labels remain text.
- Added a `scrollTo` fallback for environments where the DOM API is unavailable.

## Responsive Improvements

Screenshots were inspected with Chrome headless at:

- 1440px desktop: `/tmp/sokrai-start-1440-after.png`
- 1280px desktop: `/tmp/sokrai-start-1280-after.png`
- 768px tablet: `/tmp/sokrai-start-768-after.png`
- 390px mobile: `/tmp/sokrai-start-390-after.png`
- follow-up color restore captures: `/tmp/sokrai-start-1440-color-restore-2.png` and `/tmp/sokrai-start-390-color-restore-2.png`
- taller 768px and 390px captures for form inspection

The start/intake experience now stays at the top on load, stacks cleanly on tablet/mobile, and avoids text overlap in the first screen and intake form.

## Files Changed

Frontend implementation:

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
- `apps/web/src/components/WorkflowLoadingPanel.tsx`
- `apps/web/src/components/SessionMenu.tsx`
- `apps/web/src/components/StatusBadge.tsx`
- `apps/web/src/lib/session-view.ts`
- `apps/web/src/lib/feedback.ts`
- `apps/web/src/lib/proposal-start-payload.ts`
- `apps/web/src/lib/user-facing-text.ts`

Tests:

- `apps/web/src/components/local-demo-safety-notice.test.ts`
- `apps/web/src/lib/feedback.test.ts`
- `apps/web/src/lib/session-view.test.ts`

Docs:

- `PRODUCT.md`
- `docs/frontend-upgrade-audit.md`
- `docs/frontend-upgrade-summary.md`

Generated project graph:

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `graphify-out/manifest.json`

Note: unrelated modified files were already present in the worktree before this upgrade, including `.codex/config.toml`, `.archon/workflows/archon-upgrade-existing-frontend-premium.yaml` and `scripts/validate-archon-frontend-upgrade.sh`.

## Validation Commands Run

All passed:

- `pnpm --filter @sokrai/web type-check`
- `pnpm --filter @sokrai/web exec vitest run --reporter=dot` (112 tests)
- `pnpm --filter @sokrai/web build`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- `graphify update .`

Browser validation:

- local Vite app opened through Google Chrome headless
- screenshots captured at 1440, 1280, 768 and 390 widths

Chrome DevTools MCP was not available in this environment, so inspection used local Vite plus Chrome headless screenshots.

## Remaining Limitations

- No runtime demo fixture exists for opening a complete workspace/report state in the browser without calling the local backend. Workspace and report states were validated through component render tests and static inspection.
- Generated report body text can still contain whatever the backend/model produced. The UI now normalizes known technical labels around that content, but full report-language control should also be enforced in prompts/backend generation.
- The logo asset in the production build is still large and should be optimized separately.

## Recommended Next Improvements

- Add a safe local demo/fixture route for visual QA of workspace, report-ready and export-ready states without backend dependency.
- Add axe or another accessibility audit runner to CI for the web package.
- Move backend prompt copy toward the same Spanish, human-review language so generated report sections are consistent.
- Optimize the logo/image asset size.
