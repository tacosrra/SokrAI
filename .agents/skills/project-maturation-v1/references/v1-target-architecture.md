# V1 target architecture

## Recommended runtime components

The MVP should be buildable around:

- `n8n` for orchestration
- `Ollama` for local inference
- `PostgreSQL` for persistence
- optional UI or API wrapper for demo usability

## Minimum workflows

### 1. proposal_start_v1
Responsibilities:
- receive title, goal, proposal text and/or extracted document text
- validate request
- normalize text
- create structured brief
- persist session
- call the problem-definition subflow
- return session id, structured brief, next question, agent status

### 2. agent_problem_definition_v1
Responsibilities:
- load current session state
- load recent conversation turns
- build bounded context
- call model with problem-definition prompt
- validate JSON result
- repair JSON once if needed
- persist run and turn artifacts
- decide continue vs done
- return updated state and next question

### 3. proposal_reply_v1
Responsibilities:
- receive session id and user answer
- validate request
- persist the user answer turn
- call problem-definition flow
- return updated turn result

## Persistence

Minimum tables:
- `proposal_sessions`
- `conversation_turns`
- `agent_runs`

## State boundaries

### Source-of-truth state
Keep these in storage:
- current stage
- current agent
- normalized input
- latest structured brief
- latest completion status

### Derived state
These can be recomputed if needed:
- completion percentage
- UI progress hints
- summary views

## Versioning

Version these artifacts explicitly:
- prompts
- schema contracts
- workflow exports
- db migrations

## Extension posture

Prepare interfaces or folders for future lanes, but fully implement only:
- intake
- problem-definition lane
- persistence
- auditability
