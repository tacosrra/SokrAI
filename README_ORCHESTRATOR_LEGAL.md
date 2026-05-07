# Legal Orchestrator Task (Draft)

This document defines the short-term task to introduce a temporary "legal specialist" prompt mode (switching from the current project-planning/problem-definition behavior), without changing the core v1 flow.

## Goal

Allow the orchestrator to switch from the current project-planning/problem-definition behavior to a legal-helper system prompt, while keeping the existing v1 problem-definition flow intact.

## Current v1 context

- The only fully implemented lane is `problem_definition_agent`.
- The orchestrator is the LLM-facing layer that loads prompts and validates model output.
- The workflow and persistence model assume one question per turn and a single active lane.

## How this affects the v1 flow

Short answer: it should not change the flow if implemented as a prompt-only variant.

- The same endpoints, schemas, and persistence remain unchanged.
- The same `problem_definition_agent` logic runs; only the system prompt changes.
- No new session stages or transitions are introduced.
- The change is opt-in (feature flag or explicit "specialty" input), with default behavior unchanged.

If the specialty is not provided, v1 behavior remains exactly the same.

## Temporary approach (prompt-only specialization)

1. Add a new prompt file (example):
   - `prompts/v1/problem-definition-agent-legal.md`
2. Let the orchestrator select the prompt by "specialty":
   - `default` -> current prompt
   - `legal` -> legal-specialist prompt
3. Persist the chosen prompt name/version in `agent_runs` for audit.

This keeps logic and contracts stable while enabling a controlled behavioral switch.

## Important limits (v1 scope)

- This is not a new "legal lane" with new rules or schemas.
- No legal scoring, cost lane, or multi-agent routing is added.
- No RAG or external knowledge is attached yet.
- The core scope remains problem definition only.

## Future direction (when RAG is added)

The same "specialty" switch can be used to attach a retrieval adapter:

- `specialty = legal` -> legal corpus retrieval
- `specialty = clinical` -> clinical corpus retrieval
- `specialty = default` -> no retrieval

At that point, the prompt mode becomes a gateway to a bounded context pack.

## Risks and guardrails

- Prompt-only specialization can drift into out-of-scope behavior if not tightly constrained.
- Keep the legal prompt focused on clarification and risk identification, not legal advice.
- Maintain the same one-question-per-turn rule and existing validation logic.

## Next steps (if approved)

- Define the new legal prompt content.
- Add a safe, explicit specialty switch (input param or feature flag).
- Log the selected specialty in the agent run metadata.
- Add a small test to verify the default path remains unchanged.
