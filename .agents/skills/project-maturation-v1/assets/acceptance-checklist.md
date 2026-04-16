# Acceptance checklist

## Functional
- [ ] A proposal can be started from text input.
- [ ] Optional document text can be merged into the same intake path.
- [ ] A structured brief is produced and persisted.
- [ ] A session id is returned.
- [ ] The first question is relevant and problem-focused.
- [ ] The user can continue the same session on later turns.
- [ ] The problem-definition lane reaches a `done` state when appropriate.

## Contract safety
- [ ] Start request/response match schema.
- [ ] Reply request/response match schema.
- [ ] Structured brief matches schema.
- [ ] Agent turn output matches schema.

## Persistence and audit
- [ ] Sessions are stored.
- [ ] Conversation turns are stored in order.
- [ ] Agent runs are stored with prompt/model metadata.
- [ ] Invalid JSON outputs are logged when repair fails.

## Guardrails
- [ ] Only one main question is emitted per turn.
- [ ] No more than three diagnosis items are emitted.
- [ ] Problem-definition lane does not drift into legal/cost topics.
- [ ] Empty or vague answers trigger clarification rather than silent progress.

## Operability
- [ ] Local setup docs exist.
- [ ] Example requests exist.
- [ ] Workflow exports are committed.
- [ ] Tests or smoke checks are present.
