# UX0 Target UX Concept

## Target experience

SokrAI should feel like a guided, healthcare-appropriate proposal interview. The default screen should answer five questions at all times:

- Where am I in the maturation flow?
- What is already complete?
- What is locked or not applicable?
- What question should I answer now?
- What happens after I answer?

The app should not feel like a workflow debugger by default. It should feel like a calm conversation with visible structure around it: phase progress, current gaps, next step, and report readiness.

The experience should preserve the existing safety boundaries. Safety warnings are product requirements, not removable decoration. The redesign should make them easier to notice and less repetitive.

## Chat-first layout concept

Use a three-zone app shell:

1. **Phase rail**
   A compact left or top rail showing the canonical phase path:
   - Intake
   - Problem
   - Solution
   - Data / AI / privacy / regulatory
   - Medical device triage, if applicable
   - Resources / pilot / viability
   - Report
   - PDF/export

2. **Conversation center**
   The center column is the primary product:
   - Current phase header.
   - Current question.
   - Answer composer immediately below the question.
   - One clear primary CTA: `Send answer`, `Start phase`, `Prepare report`, or `Download PDF`.
   - Recent conversation turns below the composer.
   - Longer history behind a disclosure or timeline expansion.

3. **Guidance side panel**
   A right panel or collapsible drawer with:
   - Remaining gaps for the current phase.
   - Why the question is being asked.
   - What happens next.
   - Required safety notice.
   - Advanced/debug disclosure at the bottom.

On mobile, collapse this into:

- Sticky phase summary.
- Current question and composer.
- Gap summary below composer.
- History and advanced details collapsed.

## Phase and progress model

Replace the problem-only `SessionProgress` mental model with a canonical `PhaseProgress` model for the frontend presentation layer. The source of truth should still be existing contracts and persisted session/audit data, but the UI should derive a user-centered phase state.

Recommended phase states:

- `complete`: phase has the required generated section, completed chat, report, or export artifact.
- `current`: phase has an active question or is the next unlocked action.
- `ready`: phase is unlocked and waiting for the user to start.
- `locked`: prerequisites are incomplete.
- `not_applicable`: phase was triaged out, for example medical-device triage when not applicable.
- `recovering`: a request is still being reconciled after timeout or background workflow completion.
- `error`: the phase needs user action or technical recovery before continuing.

Progress should be phase-based, not only checklist-percent-based. Problem-phase checklist completion can remain as a per-phase detail, but whole-session progress should come from the canonical phase path.

The current phase should be selected deterministically:

- Active module question wins.
- If no question is active, the next ready phase wins.
- If report is ready but PDF is not exported, `PDF/export` is current.
- If everything is done, show completion with report/PDF actions.
- If recovery is in progress, keep the last known phase and show recovery state.

## App shell proposal

The shell should become quieter and less technical:

- Rename "Problem Definition Console" to a product-facing label such as "SokrAI proposal interview" or "SokrAI maturation workspace".
- Remove decorative AI orbs as primary hierarchy. They currently compete with status.
- Keep one persistent safety notice near the composer or phase guidance area.
- Move session switching into a deliberate session menu or drawer instead of a permanent rail section.
- Show a compact project header with project title, phase, and safe session status.
- Use technical status only as secondary copy, not headline copy.

Recommended primary shell regions:

- **Top bar**: project title, session menu, recovery/sync status, new proposal action.
- **Phase rail**: canonical phases with complete/current/locked/not applicable states.
- **Main chat**: question, composer, chat turns.
- **Guidance panel**: gaps, next step, safety, advanced details.

## Current phase card

Each phase should have a compact card model:

- Phase title.
- Status label in plain language.
- One-sentence purpose.
- Current question if active.
- Remaining gaps count and top 3 gaps.
- Primary action.
- Secondary action only when needed.

Examples:

- **Problem**: "Clarify who owns the problem, evidence, scope, and current alternatives."
- **Solution**: "Describe what will change and who will use it."
- **Data / AI / privacy / regulatory**: "Identify sensitive data, AI role, privacy controls, validation, and human review."
- **Medical device triage**: "Check whether the proposal may require competent human review for medical-device uncertainty."
- **Resources / pilot / viability**: "Capture people, technical resources, pilot environment, dependencies, metrics, and operational risks."
- **Report**: "Review the structured summary before export."
- **PDF/export**: "Create the local demo artifact."

Future phases should appear as locked cards or rail steps, but not as actionable inline CTAs until prerequisites are met.

## Gap summary behavior

Gaps should be summarized for the current phase only by default.

Default gap summary:

- "3 things still needed"
- Short labels in user language.
- Optional one-line hint per gap.
- No `gap_kind`, `gap_status`, source IDs, absence fields, or audit refs.

Expanded gap detail:

- Show phase-specific gap groups.
- Show resolved/deferred/not applicable groups only when expanded.
- Include source references only in "Audit details".

Problem phase can keep the six-field checklist, but it should be presented as "Needed for this phase", not as global maturity.

## Report preview behavior

Report should become its own phase, not a floating card inside the conversation.

Before report is ready:

- Show locked or ready state based on all required previous phases.
- Explain exactly which phases block report generation.
- Do not auto-compose a report invisibly during session load unless the UX explicitly shows "Checking report readiness".

When report is ready:

- Show a human-readable preview with problem, solution, open gaps, warnings, and safety notice.
- Keep warnings visible.
- Hide audit reference count, schema version, source IDs, and source hashes by default.
- Put "Download PDF" in the final PDF/export phase or as a clear report footer action.

PDF/export should be treated as the final artifact action. It should show:

- Export readiness.
- Local demo warning.
- Download action.
- Optional technical export details in advanced disclosure.

Implementation note for UX1: current audit contracts do not persist a PDF export artifact. The UI may mark PDF/export complete only for the current in-memory session after a successful download, and must fall back to ready/current after reload until a durable export fact exists.

## Advanced/debug disclosure

Add a collapsed section named "Audit details" or "Technical details". It should be available but not prominent.

Contents:

- Session ID and copy action.
- Request IDs and recovery attempts.
- Runs, snapshots, events, and agent status.
- Source IDs, hashes, document technical statuses.
- Schema version, report/export IDs, PDF/report hashes.
- Full generated markdown and persisted audit history.
- Developer-focused recovery and contract details.

Rules:

- Closed by default.
- Never expose raw model output.
- Never replace safety warnings.
- Include a short explanation: "For local demo troubleshooting and audit verification."
- Keep this panel keyboard accessible and screen-reader understandable.

## Loading, error, and recovery states

Use user-centered state names:

- `Saving your answer`
- `Updating this phase`
- `Still working in the background`
- `Reconnected`
- `Session not found`
- `This saved shortcut is stale`
- `Recovery failed`

Default loading state should show:

- Current operation.
- Expected next result.
- Whether the user can safely wait, retry, or copy the session ID.

Recovery should separate:

- **Request recovery**: "The workflow may still be running. We are checking for the saved result."
- **Session refresh**: "We found the session and refreshed the latest state."
- **Stale local session**: "This browser remembered a session ID, but the local database no longer has it."

Developer details such as request ID, n8n, Fastify, Ollama, JSON contract, and proxy mismatch should be hidden under `Show technical details`.

## UX writing principles

- Use phase names consistently across rail, card, question label, and action.
- Use verb plus object for buttons: `Start solution`, `Send answer`, `Prepare report`, `Download PDF`.
- Avoid workflow names in default text.
- Avoid inline code styling in primary UX copy.
- Keep safety warnings direct and stable.
- Use "we could not" or "SokrAI could not" only when useful. Prefer direct recovery actions.
- Replace "agent status" with user-facing state such as `Waiting for your answer`, `Working`, `Ready to continue`, `Complete`, `Needs review`.
- Explain locked phases by prerequisite, not by implementation.
- Keep one primary action per view.

## Visual direction

The target visual language should be clean, calm, healthcare-appropriate, minimal, high-end, and non-SaaS-generic.

Design principles:

- Restrained light interface, not a blue/cyan AI-gradient surface.
- Warm-neutral or clinical-white canvas with carefully limited accent color.
- Clear typography with modest product-scale hierarchy.
- Fewer cards, more structured regions.
- Border radius closer to 8-16px for product surfaces.
- Avoid nested cards and repeated bordered panels.
- Use color for state and action, not decoration.
- Keep motion purposeful and fast: loading, state change, focus, disclosure.
- Respect reduced-motion preferences.
- Make the chat center feel stable and task-first.

The UI should feel closer to a refined clinical review workspace than a generic AI dashboard. It should make the system feel trustworthy by being legible, quiet, and precise.
