# n8n workflow specification for v1

This is a repo-owned specification that workflow exports should follow.

## Workflow 1: `proposal_start_v1`

### Purpose
Start a session from the initial proposal and return the first socratic question.

### Inputs
- `project_title`
- `goal`
- `proposal_text` or extracted document text
- optional metadata

### Suggested nodes
1. `Webhook`
2. `Validate Input`
3. `Extract From File` (only if binary upload path is supported)
4. `Normalize Text`
5. `Structured Brief Extraction`
6. `Persist Session`
7. `Execute Sub-workflow -> agent_problem_definition_v1`
8. `Respond to Webhook`

### Rules
- reject empty submissions
- if both raw text and extracted text exist, merge them deterministically
- write normalized text before calling the agent
- persist the first snapshot before asking the first question

## Workflow 2: `agent_problem_definition_v1`

### Purpose
Run one bounded problem-definition turn.

### Inputs
- `session_id`
- `latest_user_answer` (optional on first call)

### Suggested nodes
1. `Execute Sub-workflow Trigger`
2. `Load Session`
3. `Load Recent Turns`
4. `Build Agent Context`
5. `Call Ollama`
6. `Validate JSON`
7. `Repair JSON Once` (conditional)
8. `Persist Agent Run`
9. `Persist Agent Turn`
10. `Decide Continue vs Done`
11. `Return Result`

### Rules
- one main question per turn
- max three diagnosis items
- no legal/cost/solution drift
- if invalid JSON after repair: controlled error + raw log
- update `structured_brief_json` or equivalent snapshot after each successful turn

## Workflow 3: `proposal_reply_v1`

### Purpose
Continue an existing session after a user answer.

### Inputs
- `session_id`
- `answer`

### Suggested nodes
1. `Webhook`
2. `Validate Reply`
3. `Persist User Turn`
4. `Execute Sub-workflow -> agent_problem_definition_v1`
5. `Respond to Webhook`

### Rules
- reject unknown sessions
- reject empty answers
- preserve turn ordering
- never silently create a new session from a reply endpoint

## Workflow export discipline

- commit workflow exports to the repo
- give stable names to workflows and nodes
- document import steps
- avoid hidden logic that only exists in the live n8n UI
