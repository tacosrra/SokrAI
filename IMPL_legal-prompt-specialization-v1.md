# Implementation Plan: Legal Orchestrator Specialization

**Change ID:** `legal-prompt-specialization-v1`
**Source:** `TASKS_legal-prompt-specialization-v1.md`
**Baseline:** SokrAI v1 — single lane `problem_definition_agent`, n8n + Ollama + PostgreSQL

---

## 1. Executive Summary

This document describes exactly what to build, where to change it, and how each piece connects, in order to implement the specialty-aware agent routing described in `TASKS_legal-prompt-specialization-v1.md`. The default path must remain byte-identical in behavior; the legal path adds a prompt switch, optional RAG context, and full audit traceability — all behind an opt-in `specialty` field.

---

## 2. Current State Inventory

| Layer | File(s) | Relevant State |
|---|---|---|
| **DB schema** | `db/migrations/001_initial.sql` | `proposal_sessions`, `agent_runs`, `conversation_turns`, `session_snapshots`, `session_events`. No `specialty` column. |
| **RAG schema** | `db/migrations/002_rag.sql` | `context_packs`, `rag_documents`, `rag_chunks`, `rag_retrievals`. Fully functional pgvector pipeline. |
| **Contracts (JSON)** | `contracts/schemas/proposal-start.request.schema.json` | No `specialty` field. |
| **Contracts (TS API)** | `apps/api/src/contracts/types.ts` | `ProposalStartRequest` has no `specialty`. |
| **Contracts (TS Web)** | `apps/web/src/domain/contracts.ts` | Mirror of API types, no `specialty`. |
| **Schema registry** | `apps/api/src/contracts/schema-registry.ts` | Ajv-based validation; loads all JSON schemas. |
| **Prompt service** | `apps/api/src/services/prompt-service.ts` | `loadPrompt(name)` resolves from a static `PROMPT_FILES` map. No specialty dispatch. |
| **LLM orchestrator** | `apps/api/src/services/llm-orchestrator.ts` | `runProblemDefinition()` always loads `problem-definition-agent`. No specialty param. |
| **ProblemDefinitionService** | `apps/api/src/services/problem-definition-service.ts` | Calls `llmOrchestrator.runProblemDefinition()`. No specialty awareness. |
| **ProposalStartService** | `apps/api/src/services/proposal-start-service.ts` | Creates session via `sessionStore.createSession()`. No specialty stored. |
| **ProposalReplyService** | `apps/api/src/services/proposal-reply-service.ts` | Appends answer and dispatches to agent. No specialty awareness. |
| **Service types** | `apps/api/src/services/service-types.ts` | DTOs for `StartContextCommand`, `RunProblemDefinitionCommand`. No specialty. |
| **Session store** | `apps/api/src/repositories/session-store.ts` | `SessionRecord` and `createSession()` have no specialty field. |
| **Domain guardrails** | `apps/api/src/domain/problem-definition.ts` | `enforceTurnGuardrails()` blocks legal/cost topics via `FORBIDDEN_TOPIC_PATTERNS`. |
| **App (routes)** | `apps/api/src/app.ts` | Three internal endpoints. No specialty in request bodies. |
| **Prompts** | `prompts/v1/problem-definition-agent.md` | Single prompt. No legal variant exists. |
| **RAG retrieval** | `apps/api/src/rag/retrieval-service.ts` | Fully working `RetrievalService.retrieve()`. |
| **RAG augmenter** | `apps/api/src/rag/prompt-augmenter.ts` | `buildSourcesBlock()` and `validateCitations()` ready. |
| **n8n start** | `infra/n8n/workflows/proposal_start_v1.json` | Forwards `$node["Webhook_StartProposal"].json.body` to API. No specialty field forwarded. |
| **n8n reply** | `infra/n8n/workflows/proposal_reply_v1.json` | Similar pattern. |
| **Web UI** | `apps/web/src/components/NewProposalPanel.tsx` | Form with title, goal, proposal text, document text, file, userId, metadata. No specialty selector. |
| **Web API client** | `apps/web/src/lib/api.ts` | `startSession()` sends payload to webhook. No specialty. |
| **Config** | `apps/api/src/config/env.ts` | `AppConfig` has RAG settings. No specialty-related config. |

---

## 3. Phase 1 — Foundation (Data Layer)

### 3.1 Migration: `db/migrations/003_add_specialty_columns.sql`

```sql
-- 003_add_specialty_columns.sql
-- Adds session-level and run-level specialty tracking for multi-agent prompt routing.

ALTER TABLE proposal_sessions
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT NULL
    CHECK (specialty IS NULL OR specialty IN ('default', 'legal'));

ALTER TABLE proposal_sessions
  ADD COLUMN IF NOT EXISTS current_specialty TEXT DEFAULT NULL
    CHECK (current_specialty IS NULL OR current_specialty IN ('default', 'legal'));

ALTER TABLE proposal_sessions
  ADD COLUMN IF NOT EXISTS context_reset_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT NULL
    CHECK (specialty IS NULL OR specialty IN ('default', 'legal'));

ALTER TABLE session_snapshots
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT NULL
    CHECK (specialty IS NULL OR specialty IN ('default', 'legal'));
```

**What this does:**
- `proposal_sessions.specialty` — the specialty chosen at session creation (immutable seed value).
- `proposal_sessions.current_specialty` — the active specialty for the next agent run. Starts equal to `specialty`, but can be switched mid-session.
- `proposal_sessions.context_reset_at` — timestamp marking the last specialty switch. Turns before this timestamp are excluded from model context for the current specialty.
- `agent_runs.specialty` — the specialty used for that specific run, for audit.
- `session_snapshots.specialty` — audit continuity in the snapshot.
- All columns are nullable; existing sessions get `NULL` which is treated as `'default'` in application code.

**Why nullable:** If `specialty` is omitted, the system behaves exactly as today (same prompt, no retrieval, no specialty recorded).

### 3.2 Update `SessionRecord` type

**File:** `apps/api/src/repositories/session-store.ts`

Add to `SessionRecord`:

```typescript
specialty: 'default' | 'legal' | null;
current_specialty: 'default' | 'legal' | null;
context_reset_at: string | null;  // ISO timestamp
```

### 3.3 Update `AgentRunRecord` type

**File:** `apps/api/src/repositories/session-store.ts`

Add to `AgentRunRecord`:

```typescript
specialty: 'default' | 'legal' | null;
```

### 3.4 Update `SnapshotRecord` type

**File:** `apps/api/src/repositories/session-store.ts`

Add to `SnapshotRecord`:

```typescript
specialty: 'default' | 'legal' | null;
```

### 3.5 Update `ProposalStartRequest` contract

**File:** `contracts/schemas/proposal-start.request.schema.json`

Add inside `"properties"`:

```json
"specialty": {
  "type": "string",
  "enum": ["default", "legal"]
}
```

Do **not** add it to `"required"`. The field is optional.

### 3.6 Update TypeScript types

**File:** `apps/api/src/contracts/types.ts` — add to `ProposalStartRequest`:

```typescript
specialty?: 'default' | 'legal';
```

**File:** `apps/web/src/domain/contracts.ts` — mirror the same addition:

```typescript
specialty?: 'default' | 'legal';
```

Also add `specialty` to `SessionRecord` in the web contracts:

```typescript
specialty: 'default' | 'legal' | null;
current_specialty: 'default' | 'legal' | null;
```

### 3.7 Update `SessionStore.createSession()`

**File:** `apps/api/src/repositories/session-store.ts`

In `createSession()` params interface, add:

```typescript
specialty?: 'default' | 'legal';
```

In the INSERT query, add `specialty` and `current_specialty` columns, both set to `params.specialty ?? null`.

### 3.8 Update `SessionStore.insertAgentRun()`

**File:** `apps/api/src/repositories/session-store.ts`

In `insertAgentRun()` params, add:

```typescript
specialty?: 'default' | 'legal';
```

Add `specialty` to the INSERT.

### 3.9 Update `SessionStore.createSnapshot()`

**File:** `apps/api/src/repositories/session-store.ts`

In `createSnapshot()` params, add:

```typescript
specialty?: 'default' | 'legal';
```

Add `specialty` to the INSERT.

### 3.10 Smoke check for migration

Add a small test or fixture assertion that verifies:
- Inserting a session with `specialty = NULL` succeeds.
- Inserting a session with `specialty = 'default'` succeeds.
- Inserting a session with `specialty = 'legal'` succeeds.
- Inserting a session with `specialty = 'invalid'` fails the CHECK constraint.

### 3.11 Quality Gate

- `pnpm test:contracts` passes with the updated schema (the new optional field should not break existing test fixtures).
- Migration runs cleanly against a fresh DB (`pnpm migrate`).

---

## 4. Phase 2 — Business Logic (Domain / Orchestrator)

### 4.1 Create legal prompt: `prompts/v1/problem-definition-agent-legal.md`

A new prompt file focused on legal clarification. Key differences from the default prompt:

```markdown
# Prompt: problem-definition-agent-legal@v1

You specialize in identifying legal, regulatory, and compliance considerations
related to a research or innovation proposal.

Your role is NOT to give legal advice. Your role is to:
- identify areas that require legal clarification,
- surface regulatory or compliance risks,
- ask bounded questions to reduce legal ambiguity,
- help the proposer articulate what legal review they need.

**DISCLAIMER: This agent does not provide legal advice. All outputs are for
informational structuring purposes only and must be reviewed by qualified legal
counsel before any decisions are made.**

## Target clarity

You are trying to reach a sufficiently clear understanding of:

- what regulatory frameworks may apply
- what data governance requirements exist
- what intellectual property considerations are relevant
- what compliance risks have been identified
- what legal review the project team has already conducted
- what legal assumptions remain unvalidated

## Hard rules

- Return JSON only.
- Follow the exact schema provided by the caller.
- Ask exactly one primary question per turn.
- Keep `diagnosis` concise and to at most 3 items.
- Do NOT provide legal advice, opinions, or definitive legal conclusions.
- Focus only on clarification and risk identification.
- Do not drift into cost, architecture, or solution design topics.
- Do not invent facts or legal citations.
- If retrieval context is provided, ground your questions in it; if none is
  provided, ask the user to supply the missing regulatory information.
- If the latest user answer is vague, narrow the next question instead of
  advancing.
- If the user says they do not know, reformulate the question to make it
  easier to answer.
- If `agent_status` is `done`, `next_question` must be an empty string.

## Retrieval context usage

When sources are provided below the input JSON:
- Reference them by their ID (e.g., [S1], [S2]).
- Only cite sources that are actually relevant to the current question.
- If no sources are relevant, state that the information was not found in the
  available corpus and ask the user directly.

## Completion

Use `agent_status = "done"` only if these are reasonably clear:

- applicable regulatory frameworks
- data governance posture
- IP and licensing status
- known compliance risks
- legal review status
- remaining legal ambiguities
```

### 4.2 Extend `loadPrompt()` in `prompt-service.ts`

**File:** `apps/api/src/services/prompt-service.ts`

Current `PROMPT_FILES` map has three entries. Add the legal prompt and change the function signature:

```typescript
const PROMPT_FILES = {
  'extract-initial-brief': 'extract-initial-brief.md',
  'json-repair': 'json-repair.md',
  'problem-definition-agent': 'problem-definition-agent.md',
  'problem-definition-agent-legal': 'problem-definition-agent-legal.md',
} as const;
```

Add a helper to resolve the prompt name by specialty:

```typescript
export type Specialty = 'default' | 'legal';

export function resolveProblemDefinitionPromptName(
  specialty?: Specialty | null,
): keyof typeof PROMPT_FILES {
  if (specialty === 'legal') {
    return 'problem-definition-agent-legal';
  }
  return 'problem-definition-agent';
}
```

The existing `loadPrompt(name)` function stays unchanged — it already takes any key from `PROMPT_FILES`. The caller will use `resolveProblemDefinitionPromptName()` to pick the right name.

### 4.3 Thread specialty through `LlmOrchestrator.runProblemDefinition()`

**File:** `apps/api/src/services/llm-orchestrator.ts`

Change the input parameter of `runProblemDefinition()`:

```typescript
async runProblemDefinition(input: {
  structuredBrief: StructuredBrief;
  recentTurns: Array<{ question_text: string; answer_text: string | null; diagnosis: string[] }>;
  latestAnswer?: string;
  specialty?: 'default' | 'legal' | null;      // NEW
  retrievalContext?: string;                     // NEW
}): Promise<GenerationResult<ProblemDefinitionTurn>> {
  const promptName = resolveProblemDefinitionPromptName(input.specialty);
  const prompt = await loadPrompt(promptName);

  const userPromptParts = [
    'Return a single bounded problem-definition turn.',
    '',
    `Output schema id: ${schemaIds.problemDefinitionTurn}`,
    '',
    'Input JSON:',
    JSON.stringify(
      {
        structured_brief: input.structuredBrief,
        recent_turns: input.recentTurns,
        latest_user_answer: input.latestAnswer ?? null,
      },
      null,
      2,
    ),
  ];

  if (input.retrievalContext) {
    userPromptParts.push('', input.retrievalContext);
  }

  const userPrompt = userPromptParts.join('\n');
  // ... rest unchanged
}
```

**Key invariant:** When `specialty` is `undefined` or `null` or `'default'`, the prompt resolved is `problem-definition-agent` — identical to pre-change behavior.

### 4.4 Legal retrieval adapter hook

**File:** `apps/api/src/services/problem-definition-service.ts` (inside `execute()`)

Before calling `this.llmOrchestrator.runProblemDefinition()`, add a conditional retrieval step:

```typescript
const effectiveSpecialty = session.current_specialty ?? session.specialty ?? undefined;
let retrievalContext: string | undefined;

if (effectiveSpecialty === 'legal') {
  try {
    const ragModule = this.rag;  // injected via constructor
    const result = await ragModule.retrievalService.retrieve({
      requester: 'problem_definition_agent_legal',
      requesterRef: command.sessionId,
      query: openTurn?.answer_text ?? session.latest_structured_brief_json.problem_statement,
      packs: ['legal'],  // configurable pack name
      topK: 5,
    });
    retrievalContext = buildSourcesBlock(result.chunks);
  } catch (error) {
    this.logger.warn('legal_retrieval_failed', {
      session_id: command.sessionId,
      error_message: error instanceof Error ? error.message : 'unknown',
    });
    // Retrieval failure is non-fatal: the prompt will ask the user for the info.
  }
}

const modelTurn = await this.llmOrchestrator.runProblemDefinition({
  structuredBrief: session.latest_structured_brief_json,
  recentTurns,
  latestAnswer: openTurn?.answer_text ?? undefined,
  specialty: effectiveSpecialty,
  retrievalContext,
});
```

**For `default` specialty:** retrieval is never called. Pre-change behavior is preserved.
**For `legal` specialty:** retrieval is attempted. If no legal pack exists or retrieval fails, the legal prompt's own instructions tell the model to ask for the information rather than inventing it.

**Constructor change for ProblemDefinitionService:**

```typescript
constructor(
  private readonly config: AppConfig,
  private readonly logger: Logger,
  private readonly sessionStore: SessionStore,
  private readonly llmOrchestrator: LlmOrchestrator,
  private readonly rag?: { retrievalService: RetrievalService },  // NEW, optional
) {}
```

Wire this in `apps/api/src/app.ts`:

```typescript
const problemDefinitionService = new ProblemDefinitionService(
  config, logger, sessionStore, llmOrchestrator, { retrievalService: rag.retrievalService },
);
```

### 4.5 Domain guardrails: relax forbidden topics for legal specialty

**File:** `apps/api/src/domain/problem-definition.ts`

The current `FORBIDDEN_TOPIC_PATTERNS` includes `/\blegal\b/i` and `/\bregulator/i`. For the `legal` specialty, these must NOT be treated as forbidden.

Option: make `enforceTurnGuardrails` accept an optional `specialty` parameter:

```typescript
export function enforceTurnGuardrails(
  brief: StructuredBrief,
  turn: ProblemDefinitionTurn,
  latestAnswer?: string,
  specialty?: 'default' | 'legal' | null,
): { ... } {
  // ...
  const effectiveForbiddenPatterns = specialty === 'legal'
    ? FORBIDDEN_TOPIC_PATTERNS.filter(p => !isLegalPattern(p))
    : FORBIDDEN_TOPIC_PATTERNS;
  // ...
}
```

Where `isLegalPattern()` filters out `/\blegal\b/i` and `/\bregulator/i` from the blocked list when specialty is `legal`. Cost, architecture, and solution topics remain blocked for both specialties.

### 4.6 Audit: `agent_runs.specialty`

Already addressed by 3.8. In `ProblemDefinitionService.execute()`, when calling `this.sessionStore.insertAgentRun()`, add:

```typescript
specialty: effectiveSpecialty ?? undefined,
```

The `prompt_name` and `prompt_version` fields already capture which prompt was used (e.g., `problem-definition-agent-legal` vs `problem-definition-agent`). The `specialty` field provides a direct query dimension.

### 4.7 Context filtering for specialty switch

In `ProblemDefinitionService.execute()`, when loading recent turns, filter by reset marker:

```typescript
let recentTurns = await this.sessionStore.listRecentResolvedTurns(command.sessionId, 5);

if (session.context_reset_at) {
  recentTurns = recentTurns.filter(turn => {
    // Only include turns after the reset, and only if they match the current specialty.
    // Turns don't store specialty directly, but they were created after context_reset_at
    // if they are relevant to the current context window.
    return turn.created_at && new Date(turn.created_at) > new Date(session.context_reset_at!);
  });
}
```

This requires adding `created_at` to the `ConversationTurnRecord` type and SELECT query. Alternatively, the store method can accept a `contextResetAt` parameter to filter at the SQL level:

```sql
SELECT * FROM conversation_turns
WHERE session_id = $1 AND status = 'resolved'
  AND ($3::timestamptz IS NULL OR created_at > $3)
ORDER BY turn_seq DESC
LIMIT $2
```

### 4.8 Tests

Add to `tests/unit/`:

- **`prompt-routing.test.ts`**: verify `resolveProblemDefinitionPromptName('default')` returns `'problem-definition-agent'`, `resolveProblemDefinitionPromptName('legal')` returns `'problem-definition-agent-legal'`, `resolveProblemDefinitionPromptName(null)` and `resolveProblemDefinitionPromptName(undefined)` both return `'problem-definition-agent'`.
- **`problem-definition-domain.test.ts`** (extend existing): add test cases verifying that `enforceTurnGuardrails()` with `specialty='legal'` does NOT trigger the legal-topic fallback, but still triggers the cost/architecture/solution fallback.
- **`llm-orchestrator.test.ts`** (extend existing): verify that `runProblemDefinition({ specialty: 'legal' })` loads the legal prompt and appends retrieval context to the user prompt.

### 4.9 Quality Gate

- `pnpm test:unit` passes.
- Default path (no specialty) is verified to be byte-identical in behavior to pre-change baseline.
- Legal prompt selection is covered by at least one happy-path and one JSON-repair-path test.

---

## 5. Phase 3 — API & n8n Surface

### 5.1 Update `/internal/sessions/start-context`

**File:** `apps/api/src/app.ts`

In the `start-context` handler, extract `specialty` from the body and forward it:

```typescript
app.post('/internal/sessions/start-context', async (request, reply) => {
  assertInternalSecret(request);

  const body = request.body as {
    request_id?: string;
    workflow_version?: string;
    workflow_execution_id?: string;
    specialty?: 'default' | 'legal';   // NEW
    payload: unknown;
  };

  const result = await proposalStartService.execute({
    context: {
      requestId: body.request_id ?? getRequestId(request),
      workflowVersion: body.workflow_version ?? 'proposal_start_v1',
      workflowExecutionId: body.workflow_execution_id,
    },
    payload: body.payload as never,
    specialty: body.specialty,  // NEW
  });
  // ...
});
```

### 5.2 Update `StartContextCommand`

**File:** `apps/api/src/services/service-types.ts`

```typescript
export interface StartContextCommand {
  context: WorkflowContext;
  payload: ProposalStartRequest;
  specialty?: 'default' | 'legal';  // NEW
}
```

### 5.3 Update `ProposalStartService.execute()`

**File:** `apps/api/src/services/proposal-start-service.ts`

Read specialty from command OR from payload (payload takes precedence as it comes from the user):

```typescript
const specialty = payload.specialty ?? command.specialty;
```

Pass to `sessionStore.createSession()`:

```typescript
const createdSession = await this.sessionStore.createSession(client, {
  // ... existing fields ...
  specialty,
});
```

### 5.4 Update `RunProblemDefinitionCommand`

**File:** `apps/api/src/services/service-types.ts`

No change needed here — `ProblemDefinitionService` reads the session's `current_specialty` from the database, not from the command. This is by design: the reply workflow must use the stored session specialty, not the incoming payload.

### 5.5 Update `ProblemDefinitionService` to read session specialty

Already addressed in 4.4. The service reads `session.current_specialty ?? session.specialty` and uses it for prompt routing and retrieval decisions.

### 5.6 Update n8n `proposal_start_v1.json`

**File:** `infra/n8n/workflows/proposal_start_v1.json`

In the `HTTP_StartSession` node, the JSON body currently sends:

```json
{
  "request_id": ...,
  "workflow_version": ...,
  "workflow_execution_id": ...,
  "payload": ...
}
```

Change to also forward `specialty` if present in the webhook body:

```json
{
  "request_id": ...,
  "workflow_version": ...,
  "workflow_execution_id": ...,
  "specialty": "$node['Webhook_StartProposal'].json.body.specialty",
  "payload": ...
}
```

Since the field is optional, if it's absent from the webhook payload, it arrives as `undefined`/omitted in the JSON and the API treats it as `null` → default behavior.

### 5.7 Update n8n `proposal_reply_v1.json`

**File:** `infra/n8n/workflows/proposal_reply_v1.json`

No change needed. The reply workflow does NOT forward a specialty — the API reads it from the stored session. This is explicitly stated in the expected behavior.

### 5.8 Update web UI: specialty selector

**File:** `apps/web/src/components/NewProposalPanel.tsx`

Add a specialty selector to the form. Add to `FormState`:

```typescript
specialty: 'default' | 'legal';
```

Default value:

```typescript
specialty: 'default',
```

Add a radio group or dropdown in the form, before the submit button:

```tsx
<fieldset className="field field--radio-group">
  <legend className="field__label">Especialidad del agente</legend>
  <label className="radio-option">
    <input
      type="radio"
      name="specialty"
      value="default"
      checked={form.specialty === 'default'}
      onChange={() => updateField('specialty', 'default')}
      disabled={isSubmitting}
    />
    <span>Definición de problema (por defecto)</span>
  </label>
  <label className="radio-option">
    <input
      type="radio"
      name="specialty"
      value="legal"
      checked={form.specialty === 'legal'}
      onChange={() => updateField('specialty', 'legal')}
      disabled={isSubmitting}
    />
    <span>Clarificación legal</span>
  </label>
</fieldset>
```

In `handleSubmit()`, include it in the payload:

```typescript
await onSubmit({
  // ... existing fields ...
  specialty: form.specialty === 'default' ? undefined : form.specialty,
});
```

When `specialty` is `'default'`, omit it from the payload to preserve backward compatibility.

### 5.9 Update web API client

**File:** `apps/web/src/lib/api.ts`

No change needed. The `startSession()` function already sends `payload` as-is to the webhook, and the new `specialty` field is part of `ProposalStartRequest`.

### 5.10 New API endpoint: switch specialty mid-session

**File:** `apps/api/src/app.ts`

Add a new internal endpoint that updates `current_specialty` and records the context reset:

```typescript
app.post('/internal/sessions/switch-specialty', async (request, reply) => {
  assertInternalSecret(request);

  const body = request.body as {
    session_id: string;
    specialty: 'default' | 'legal';
  };

  const session = await sessionStore.getDatabase().withTransaction(async (client) => {
    const locked = await sessionStore.getSessionForUpdate(body.session_id, client);

    if (locked.status === 'completed' || locked.status === 'failed') {
      throw new AppError(
        409,
        'session_not_switchable',
        'Cannot switch specialty on a completed or failed session',
        false,
        body.session_id,
      );
    }

    return sessionStore.updateSessionSpecialty(client, {
      sessionId: body.session_id,
      specialty: body.specialty,
    });
  });

  return reply.send({
    session_id: session.id,
    current_specialty: session.current_specialty,
    context_reset_at: session.context_reset_at,
  });
});
```

### 5.10b New store method: `updateSessionSpecialty()`

**File:** `apps/api/src/repositories/session-store.ts`

```typescript
async updateSessionSpecialty(
  client: PoolClient,
  params: {
    sessionId: string;
    specialty: 'default' | 'legal';
  },
): Promise<SessionRecord> {
  const result = await client.query<SessionRecord>(
    [
      'UPDATE proposal_sessions',
      'SET current_specialty = $2, context_reset_at = NOW()',
      'WHERE id = $1',
      'RETURNING *',
    ].join(' '),
    [params.sessionId, params.specialty],
  );

  return result.rows[0];
}
```

This updates `current_specialty` and stamps `context_reset_at = NOW()` so subsequent agent runs only see turns created after the switch.

### 5.10c Update web API client: `switchSpecialty()`

**File:** `apps/web/src/lib/api.ts`

Add a function the UI can call to switch specialty on an active session:

```typescript
export async function switchSessionSpecialty(
  sessionId: string,
  specialty: 'default' | 'legal',
): Promise<{ session_id: string; current_specialty: string; context_reset_at: string }> {
  return requestJson({
    url: joinUrl(API_BASE_URL, '/internal/sessions/switch-specialty'),
    method: 'POST',
    payload: { session_id: sessionId, specialty },
    headers: {
      'x-internal-shared-secret': INTERNAL_SHARED_SECRET,
    },
    timeoutMs: SESSION_AUDIT_TIMEOUT_MS,
    parse: (value) => value as { session_id: string; current_specialty: string; context_reset_at: string },
  });
}
```

> **Note:** The shared secret must be available to the web client for this direct API call to work. Alternatively, the switch can go through an n8n webhook that forwards the call with the secret, matching the existing pattern. Choose whichever matches your deployment model.

### 5.10d Specialty switch in the chat workspace

**File:** `apps/web/src/components/SessionWorkspace.tsx`

This is the key UI change: add a toggle in the **conversation toolbar** (the bar that already shows session status badges and stats) so the user can flip between `default` (project planner) and `legal` at any time during the conversation.

Add to `SessionWorkspaceProps`:

```typescript
onSwitchSpecialty: (specialty: 'default' | 'legal') => Promise<void>;
isSwitchingSpecialty: boolean;
```

Inside the `conversation-toolbar` section (after the stats), add the switch control:

```tsx
<div className="conversation-toolbar__specialty">
  <span className="conversation-toolbar__specialty-label">Agente activo</span>
  <div className="specialty-toggle">
    <button
      className={`specialty-toggle__option ${
        currentSpecialty !== 'legal' ? 'specialty-toggle__option--active' : ''
      }`}
      type="button"
      onClick={() => void onSwitchSpecialty('default')}
      disabled={isSwitchingSpecialty || isReplying || currentSpecialty !== 'legal'}
    >
      Planificador
    </button>
    <button
      className={`specialty-toggle__option ${
        currentSpecialty === 'legal' ? 'specialty-toggle__option--active' : ''
      }`}
      type="button"
      onClick={() => void onSwitchSpecialty('legal')}
      disabled={isSwitchingSpecialty || isReplying || currentSpecialty === 'legal'}
    >
      Legal
    </button>
  </div>
</div>
```

Where `currentSpecialty` is derived from the session record:

```typescript
const currentSpecialty = audit.session.current_specialty ?? audit.session.specialty ?? 'default';
```

The toggle is disabled while the agent is processing a reply (`isReplying`) or while a switch is in progress (`isSwitchingSpecialty`), and the already-active option is also disabled to prevent no-op calls.

### 5.10e Wire the switch in `App.tsx`

**File:** `apps/web/src/App.tsx`

Add handler and state:

```typescript
const [isSwitchingSpecialty, setIsSwitchingSpecialty] = useState(false);

async function handleSwitchSpecialty(specialty: 'default' | 'legal') {
  if (!activeAudit) return;

  setIsSwitchingSpecialty(true);
  setBanner({
    tone: 'info',
    text: `Cambiando agente a ${specialty === 'legal' ? 'Legal' : 'Planificador'}…`,
  });

  try {
    await switchSessionSpecialty(activeAudit.session.id, specialty);
    await loadSession(activeAudit.session.id, {
      successMessage: `Agente cambiado a ${specialty === 'legal' ? 'Legal' : 'Planificador'}. El contexto se ha reiniciado.`,
      skipBannerOnStart: true,
    });
  } catch (error) {
    setBanner({ tone: 'error', text: mapApiError(error) });
  } finally {
    setIsSwitchingSpecialty(false);
  }
}
```

Pass it to `SessionWorkspace`:

```tsx
<SessionWorkspace
  audit={activeAudit}
  isReplying={isReplying}
  isSwitchingSpecialty={isSwitchingSpecialty}
  onReply={handleReply}
  onSwitchSpecialty={handleSwitchSpecialty}
  presentation={presentation}
/>
```

After switching, the session is reloaded so the UI reflects the new `current_specialty` and the user can continue chatting with the new agent style.

### 5.11 Persist specialty through session in the UI

The UI currently tracks the active session via `SessionAuditView`. The session record returned by the API will now include `specialty` and `current_specialty`. Display this in the `SessionStatePanel` or `SessionWorkspace` as a badge so the user knows which specialty is active.

**File:** `apps/web/src/components/SessionStatePanel.tsx` or `SessionWorkspace.tsx`

Add a visual indicator (e.g., a badge or label) showing the active specialty:

```tsx
{audit.session.current_specialty === 'legal' && (
  <span className="specialty-badge specialty-badge--legal">Legal</span>
)}
```

### 5.12 Smoke test

Add to `tests/integration/smoke.test.ts` (or a new `tests/integration/legal-specialty.test.ts`):

```typescript
it('should accept specialty=legal and return a valid next_question', async () => {
  const startResult = await startWithSpecialty('legal');
  expect(startResult.session_id).toBeTruthy();
  expect(startResult.next_question).toBeTruthy();

  // Verify agent_runs has specialty = 'legal'
  const audit = await fetchSessionAudit(startResult.session_id);
  const legalRun = audit.runs.find(r => r.run_purpose === 'problem_definition');
  expect(legalRun?.specialty).toBe('legal');
});
```

### 5.12 Quality Gate

- `pnpm test:web` passes.
- `pnpm test:smoke` passes end-to-end with `specialty = "legal"` payload.

---

## 6. Phase 4 — Integration & Polish

### 6.1 i18n

Follow existing patterns. Currently the UI uses Spanish strings directly. If any i18n system exists, add keys for "Especialidad del agente", "Definición de problema (por defecto)", and "Clarificación legal".

### 6.2 Full integration suite

```bash
TEST_DATABASE_URL=... pnpm test:integration
```

With the legal specialty active. Verify that:
- Legal specialty selects the legal prompt.
- RAG retrieval is attempted (and gracefully degraded if no legal pack is ingested).
- `agent_runs.specialty` is `'legal'`.
- Schema validation and guardrails are unchanged.

### 6.3 Confirm default path unchanged

Run the full test suite without specialty to confirm no regressions:

```bash
pnpm test:contracts && pnpm test:unit && pnpm test:web && pnpm test:integration && pnpm test:smoke
```

### 6.4 Update `README.md`

**File:** `README.md`

Under **Decisiones importantes de v1**, add:

```markdown
- La v1 soporta `specialty` como campo opcional en el payload de inicio. `default` usa el prompt de
  definición de problema. `legal` activa un prompt de clarificación legal y opcionalmente recupera
  contexto del corpus legal vía RAG. Si se omite, el comportamiento es idéntico al de antes de este cambio.
```

### 6.5 Update `README_ORCHESTRATOR_LEGAL.md`

**File:** `README_ORCHESTRATOR_LEGAL.md`

Change status from *Draft* to *Implemented*. Add:

```markdown
## Implemented status

- **Prompt file:** `prompts/v1/problem-definition-agent-legal.md`
- **Input param:** `specialty` in `ProposalStartRequest` (optional, enum: `"default" | "legal"`)
- **Audit field:** `agent_runs.specialty` (nullable text, values: `null`, `"default"`, `"legal"`)
- **Retrieval:** When `specialty = "legal"`, the orchestrator queries the `legal` context pack via `RetrievalService`. If no pack exists or retrieval fails, the model asks the user for the information.
- **Guardrails:** The legal prompt explicitly forbids legal advice. Legal topic patterns are unblocked for `specialty = "legal"` but cost/architecture/solution patterns remain blocked.
```

### 6.6 Quality Gate

- All test suites pass (`contracts`, `unit`, `web`, `integration`, `smoke`).
- Code analysis clean (no new lint errors).
- Both READMEs reflect the implemented state.

---

## 7. File Change Summary

| Action | File | Description |
|--------|------|-------------|
| **CREATE** | `db/migrations/003_add_specialty_columns.sql` | Add `specialty`, `current_specialty`, `context_reset_at` to sessions; `specialty` to runs and snapshots |
| **CREATE** | `prompts/v1/problem-definition-agent-legal.md` | Legal clarification prompt |
| **MODIFY** | `contracts/schemas/proposal-start.request.schema.json` | Add optional `specialty` field |
| **MODIFY** | `apps/api/src/contracts/types.ts` | Add `specialty` to `ProposalStartRequest` |
| **MODIFY** | `apps/api/src/services/prompt-service.ts` | Add legal prompt to `PROMPT_FILES`, add `resolveProblemDefinitionPromptName()` |
| **MODIFY** | `apps/api/src/services/llm-orchestrator.ts` | Accept `specialty` and `retrievalContext` in `runProblemDefinition()` |
| **MODIFY** | `apps/api/src/services/problem-definition-service.ts` | Read session specialty, do conditional RAG, pass specialty to orchestrator and store |
| **MODIFY** | `apps/api/src/services/proposal-start-service.ts` | Forward `specialty` to `createSession()` |
| **MODIFY** | `apps/api/src/services/service-types.ts` | Add `specialty` to `StartContextCommand` |
| **MODIFY** | `apps/api/src/repositories/session-store.ts` | Update `SessionRecord`, `AgentRunRecord`, `SnapshotRecord`; update `createSession`, `insertAgentRun`, `createSnapshot` queries; add `updateSessionSpecialty()`; update `listRecentResolvedTurns` to accept context reset filter |
| **MODIFY** | `apps/api/src/domain/problem-definition.ts` | Make `enforceTurnGuardrails` accept specialty; relax legal-topic blocks for `legal` |
| **MODIFY** | `apps/api/src/app.ts` | Extract `specialty` from start-context body; add `POST /internal/sessions/switch-specialty` endpoint |
| **MODIFY** | `apps/web/src/domain/contracts.ts` | Add `specialty` to `ProposalStartRequest`, `SessionRecord` |
| **MODIFY** | `apps/web/src/components/NewProposalPanel.tsx` | Add specialty radio selector |
| **MODIFY** | `apps/web/src/components/SessionWorkspace.tsx` | Add specialty toggle (legal / planner) in conversation toolbar |
| **MODIFY** | `apps/web/src/App.tsx` | Add `handleSwitchSpecialty`, `isSwitchingSpecialty` state, wire toggle to `SessionWorkspace` |
| **MODIFY** | `apps/web/src/lib/api.ts` | Add `switchSessionSpecialty()` function for mid-session specialty switch |
| **MODIFY** | `infra/n8n/workflows/proposal_start_v1.json` | Forward `specialty` from webhook body to API |
| **MODIFY** | `README.md` | Document the legal specialty opt-in |
| **MODIFY** | `README_ORCHESTRATOR_LEGAL.md` | Update status to Implemented |
| **CREATE** | `tests/unit/prompt-routing.test.ts` | Unit tests for prompt name resolution |
| **MODIFY** | `tests/unit/problem-definition-domain.test.ts` | Add specialty-aware guardrail tests |
| **MODIFY** | `tests/unit/llm-orchestrator.test.ts` | Add legal prompt selection test |
| **CREATE** | `tests/integration/legal-specialty.test.ts` | E2E smoke with `specialty=legal` |

---

## 8. Dependency Graph (Execution Order)

```
Phase 1: Foundation
  3.1 Migration ─────────────┐
  3.5 JSON schema update ────┤
  3.6 TS types update ───────┤
  3.2–3.4 Store types ───────┤
  3.7–3.9 Store queries ─────┤
  3.10 Migration smoke ───────┘

Phase 2: Business Logic (requires Phase 1)
  4.1 Legal prompt file ─────────────┐
  4.2 prompt-service.ts ─────────────┤
  4.3 llm-orchestrator.ts ───────────┤
  4.4 problem-definition-service.ts ─┤
  4.5 domain guardrails ─────────────┤
  4.6 audit (comes free from 3.8) ───┤
  4.7 context filtering ─────────────┤
  4.8 unit tests ────────────────────┘

Phase 3: API & n8n (requires Phase 2)
  5.1–5.5 API endpoints ──────────────────┐
  5.6 n8n start workflow ─────────────────┤
  5.7 n8n reply workflow ─────────────────┤
  5.8–5.9 Web UI: creation selector ──────┤
  5.10–5.10e Web UI: mid-session switch ──┤
  5.11 Web UI: specialty badge ───────────┤
  5.12 Smoke test ────────────────────────┘

Phase 4: Polish (requires Phase 3)
  6.1–6.6 Docs, i18n, final QA
```

---

## 9. Risk Assessment

| Risk | Mitigation |
|------|------------|
| Default path regression | Null/undefined specialty resolves to `'problem-definition-agent'` everywhere. All existing tests run without specialty. |
| Legal RAG pack not ingested | Retrieval failure is non-fatal. Legal prompt instructs model to ask user for info when no sources are available. |
| Legal prompt drifts into advice | Prompt has explicit prohibition. Guardrails remain active (except legal-topic detection). Manual review recommended. |
| Mid-session specialty switch complexity | Phase 1 adds `context_reset_at` column. The switch API endpoint (5.10) and workspace toggle (5.10d) are part of this plan. After switching, context resets and only post-reset turns are fed to the model. The user sees a banner confirming the switch. |
| Shared secret in web client for switch endpoint | The switch calls the internal API directly (needs `x-internal-shared-secret`). Either expose the secret via Vite env or route the switch through an n8n webhook like start/reply. |
| n8n workflow update requires re-import | Document the re-import step clearly. The start workflow JSON is committed. |

---

## 10. Verification Commands

```bash
# Run migration
pnpm migrate

# Run all test suites
pnpm test:contracts
pnpm test:unit
pnpm test:web
pnpm test:integration
pnpm test:smoke

# Quick manual test (curl)
curl -X POST http://localhost:5678/webhook/proposal-start-v1 \
  -H "Content-Type: application/json" \
  -d '{
    "project_title": "AI Triage in Emergency",
    "goal": "Clarify legal and regulatory requirements",
    "proposal_text": "We want to use AI to triage patients in the ER...",
    "specialty": "legal"
  }'
```
