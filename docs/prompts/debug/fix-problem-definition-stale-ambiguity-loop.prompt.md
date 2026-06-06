Archon, please investigate and fix a bug in the SokrAI MVP Alpha problem-definition lane.

Observed issue:
During the manual local demo flow, the problem-definition agent keeps asking the same question:

"¿Puedes concretar este punto que sigue ambiguo: No se especificó qué es exactamente el cuello de botella principal.?"

The user answered this clearly multiple times, including:
- the bottleneck is the initial classification of ambiguous administrative requests;
- it is not just volume;
- the problem is deciding whether to resolve administratively, request more data, or escalate to nursing;
- minimum data needed includes request reason, channel, symptoms/worsening mention, administrative procedure requested, missing fields, and escalation criteria;
- the workflow change is the first administrative triage step, using a structured card for human review.

Despite that, the app opened more turns with the same question. The session ended up with:
- turn_seq 1-5 resolved with agent_status = continue
- turn_seq 6 awaiting_user with the same bottleneck question
- generated_sections = []
- current_stage = problem_definition
- status = waiting_for_user

Important evidence from grep:
- apps/api/src/domain/problem-definition.ts:401 handles latestAnswerIsVague + done => continue
- apps/api/src/domain/problem-definition.ts:414-416 handles done + !isComplete => warning + continue
- apps/api/src/domain/problem-definition.ts:421 handles continue with missing next_question
- apps/api/src/domain/problem-definition.ts:426 handles done
- apps/api/src/domain/problem-definition.ts:433 appears to force continue in another guard
- apps/api/src/domain/problem-definition.ts:71, 141, 172, 275, 347, 358, 443 reference ambiguities_remaining
- apps/api/src/services/problem-definition-service.ts:314, 334, 703, 1034 depend on guardedTurn.agent_status and next_question

Likely root cause:
The model raw output returns "agent_status": "done" and sometimes next_question: "" with a completion_reason saying the problem is sufficiently clear. However, the backend normalization/guard layer forces agent_status back to "continue" because updated_problem_definition.ambiguities_remaining still contains stale ambiguity strings copied from previous state, especially:
- "No se especificó qué es exactamente el cuello de botella principal."
- "No se determinaron los datos mínimos necesarios ni qué parte del flujo debería cambiar con la implementación del asistente."

The system then regenerates the same question from the stale ambiguity, causing a loop.

Task:
1. Inspect the problem-definition completion guard in apps/api/src/domain/problem-definition.ts.
2. Inspect how updated_problem_definition.ambiguities_remaining is merged/deduped around the normalize/guard path.
3. Inspect how next_question is chosen when agent_status is forced from done to continue.
4. Identify why a clearly resolved ambiguity remains in ambiguities_remaining and causes repeated questions.
5. Implement the smallest safe fix.

Required behavior:
- Do not simply remove validation.
- Do not allow "done" when required problem fields are missing.
- Keep safeguards for vague answers.
- Keep blocking/continue behavior when the latest answer is genuinely insufficient.
- But if the latest user answer concretely resolves a known ambiguity, that ambiguity must not keep forcing continue just because the model copied stale ambiguity text forward.
- If raw model output says done, next_question is empty, required fields are complete, and the latest answer is not vague, the lane should be allowed to finish even if stale ambiguity text remains in the model output.
- Alternatively, normalize stale ambiguities out before isComplete is evaluated.

Please define "complete enough" conservatively:
The problem lane may finish only when these fields are non-empty and meaningful:
- problem_owner
- problem_statement
- evidence_of_problem
- scope
- current_alternatives
- assumptions may be present
And the latest answer must not be vague.

Specific bug fix guidance:
- Add a helper that detects and removes resolved stale ambiguities from updated_problem_definition.ambiguities_remaining based on the updated fields and/or latest answer.
- At minimum, handle these two ambiguity families:
  1. bottleneck ambiguity:
     "cuello de botella", "bottleneck"
     Consider it resolved when problem_statement or latest answer contains concrete classification/triage language such as "clasificación inicial", "triaje administrativo", "resolver", "pedir más datos", "escalar", "derivar", "enfermería", "solicitudes ambiguas".
  2. minimum data / workflow-change ambiguity:
     "datos mínimos", "flujo", "parte del flujo", "workflow"
     Consider it resolved when latest answer or updated fields mention concrete required data and the changed step, such as "motivo", "canal", "síntomas", "datos faltantes", "criterio de escalado", "ficha estructurada", "primer triaje", "revisión humana".
- Prefer a conservative implementation that only removes these ambiguities when there is explicit evidence in the latest answer or updated problem definition.
- Avoid broad fuzzy matching that might hide real unresolved gaps.

Regression tests:
Add tests for apps/api/src/domain/problem-definition.ts or the nearest existing test suite.

Create a regression scenario matching this bug:
Input:
- current problem definition already has owner, statement, evidence, scope, alternatives.
- ambiguities_remaining contains:
  - "No se especificó qué es exactamente el cuello de botella principal."
  - "No se determinaron los datos mínimos necesarios ni qué parte del flujo debería cambiar con la implementación del asistente."
- latest answer clearly states:
  - bottleneck = initial classification of ambiguous administrative requests
  - minimum data = reason, channel, symptoms/worsening mention, requested admin procedure, missing fields, escalation criteria
  - workflow change = first administrative triage using structured card for human confirmation
- raw model output says agent_status = done but still repeats stale ambiguities_remaining.

Expected:
- guarded/normalized turn has agent_status = done
- next_question is empty
- no warning "Model marked the lane as done before completion criteria were met"
- stale ambiguity strings are removed or ignored for completion
- no new problem question is opened

Also add a negative test:
If required fields are missing or the latest answer is vague, raw agent_status = done must still be forced to continue.

Run:
- pnpm run type-check
- pnpm run test:unit
- pnpm run test:contracts
- relevant API/domain tests
- if available, problem-definition service tests

Check whether solution-definition has the same stale-ambiguity loop pattern.
Do not change solution-definition unless the same bug is clearly present and the change can be tested symmetrically.

Acceptance criteria:
- The manual demo can progress from problem_definition to generated problem section after a clear final answer.
- The repeated bottleneck question is not opened again after it has been answered concretely.
- Existing validation still prevents premature completion for vague or incomplete answers.
- No database schema changes unless absolutely necessary.
- No contract/schema changes unless tests prove they are necessary.
- No changes to public API response shape unless necessary and covered by contract tests.
