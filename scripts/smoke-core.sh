#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
INTERNAL_SHARED_SECRET="${INTERNAL_SHARED_SECRET:-replace-with-a-random-32-char-secret}"
REQUEST_TIMEOUT_SECONDS="${REQUEST_TIMEOUT_SECONDS:-480}"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "smoke-core: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

log_step() {
  echo "[smoke-core] $*"
}

request_id() {
  node -e 'process.stdout.write("smoke-" + Date.now() + "-" + require("crypto").randomUUID())'
}

json_assert() {
  local file="$1"
  local expression="$2"
  local message="$3"

  node - "$file" "$expression" "$message" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const expression = process.argv[3];
const message = process.argv[4];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const ok = Function('data', `return (${expression});`)(data);

if (!ok) {
  console.error(message);
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}
NODE
}

json_value() {
  local file="$1"
  local expression="$2"

  node - "$file" "$expression" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const expression = process.argv[3];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const value = Function('data', `return (${expression});`)(data);

if (value === undefined || value === null || value === '') {
  process.exit(1);
}

process.stdout.write(String(value));
NODE
}

http_json() {
  local method="$1"
  local url="$2"
  local output="$3"
  local payload="${4:-}"
  local extra_args=()

  if (($# > 4)); then
    extra_args=("${@:5}")
  fi

  local status
  if [[ -n "$payload" ]]; then
    status="$(
      curl -sS --max-time "$REQUEST_TIMEOUT_SECONDS" -o "$output" -w "%{http_code}" \
        -X "$method" "$url" \
        -H 'content-type: application/json' \
        "${extra_args[@]}" \
        --data-binary "@$payload"
    )"
  else
    status="$(
      curl -sS --max-time "$REQUEST_TIMEOUT_SECONDS" -o "$output" -w "%{http_code}" \
        -X "$method" "$url" \
        "${extra_args[@]}"
    )"
  fi

  [[ "$status" =~ ^2[0-9][0-9]$ ]] || fail "$method $url returned HTTP $status: $(cat "$output")"
}

build_start_payload() {
  local request_id_value="$1"
  local output="$2"

  node - "$request_id_value" "$output" <<'NODE'
const fs = require('node:fs');
const requestId = process.argv[2];
const output = process.argv[3];
const payload = JSON.parse(fs.readFileSync('examples/proposal-start.payload.json', 'utf8'));
payload.request_id = requestId;
fs.writeFileSync(output, JSON.stringify(payload));
NODE
}

build_reply_payload() {
  local request_id_value="$1"
  local session_id="$2"
  local output="$3"

  node - "$request_id_value" "$session_id" "$output" <<'NODE'
const fs = require('node:fs');
const requestId = process.argv[2];
const sessionId = process.argv[3];
const output = process.argv[4];
const payload = JSON.parse(fs.readFileSync('examples/proposal-reply.payload.json', 'utf8'));
payload.request_id = requestId;
payload.session_id = sessionId;
fs.writeFileSync(output, JSON.stringify(payload));
NODE
}

build_recovery_payload() {
  local request_id_value="$1"
  local output="$2"

  node - "$request_id_value" "$output" <<'NODE'
const fs = require('node:fs');
const requestId = process.argv[2];
const output = process.argv[3];
const proposal = JSON.parse(fs.readFileSync('examples/proposal-start.payload.json', 'utf8'));
const payload = {
  request_id: requestId,
  workflow_version: 'proposal_start_v1',
  payload: proposal,
};
fs.writeFileSync(output, JSON.stringify(payload));
NODE
}

build_report_compose_payload() {
  local request_id_value="$1"
  local session_id="$2"
  local output="$3"

  node - "$request_id_value" "$session_id" "$output" <<'NODE'
const fs = require('node:fs');
const requestId = process.argv[2];
const sessionId = process.argv[3];
const output = process.argv[4];
const payload = {
  request_id: requestId,
  workflow_version: 'basic_alpha_report_v1',
  session_id: sessionId,
};
fs.writeFileSync(output, JSON.stringify(payload));
NODE
}

require_command curl
require_command node

health_response="$TMP_DIR/health.json"
log_step "Checking API health"
http_json GET "$API_BASE_URL/healthz" "$health_response"
json_assert "$health_response" 'data.status === "ok"' 'healthz did not return ok'

start_request_id="$(request_id)"
start_payload="$TMP_DIR/start.json"
start_response="$TMP_DIR/start-response.json"
build_start_payload "$start_request_id" "$start_payload"

log_step "Starting proposal through n8n webhook"
http_json POST "$N8N_BASE_URL/webhook/proposal-start-v1" "$start_response" "$start_payload" \
  -H "x-request-id: $start_request_id"
json_assert "$start_response" 'typeof data.session_id === "string" && data.session_id.length > 0' 'start response missing session_id'
json_assert "$start_response" 'data.structured_brief && typeof data.structured_brief === "object"' 'start response missing structured_brief'
json_assert "$start_response" 'typeof data.next_question === "string"' 'start response missing next_question'
json_assert "$start_response" '["continue", "done", "blocked"].includes(data.agent_status)' 'start response has invalid agent_status'
session_id="$(json_value "$start_response" 'data.session_id')"

audit_response="$TMP_DIR/audit.json"
log_step "Checking persisted session audit"
http_json GET "$API_BASE_URL/api/v1/sessions/$session_id" "$audit_response"
json_assert "$audit_response" 'Array.isArray(data.turns) && data.turns.length >= 1' 'audit response missing persisted turn'
json_assert "$audit_response" 'data.session && data.session.id === data.turns[0].session_id' 'audit response missing session/turn linkage'

reply_request_id="$(request_id)"
reply_payload="$TMP_DIR/reply.json"
reply_response="$TMP_DIR/reply-response.json"
build_reply_payload "$reply_request_id" "$session_id" "$reply_payload"

log_step "Appending reply through n8n webhook"
http_json POST "$N8N_BASE_URL/webhook/proposal-reply-v1" "$reply_response" "$reply_payload" \
  -H "x-request-id: $reply_request_id"
SESSION_ID="$session_id" json_assert "$reply_response" 'data.session_id === process.env.SESSION_ID' 'reply response session_id mismatch'
json_assert "$reply_response" '["continue", "done", "blocked"].includes(data.agent_status)' 'reply response has invalid agent_status'

post_reply_audit="$TMP_DIR/post-reply-audit.json"
http_json GET "$API_BASE_URL/api/v1/sessions/$session_id" "$post_reply_audit"

if node - "$post_reply_audit" <<'NODE'
const fs = require('node:fs');
const audit = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const kinds = new Set((audit.generated_sections || []).map((section) => section.section_kind));
process.exit(kinds.has('problem') && kinds.has('solution') ? 0 : 1);
NODE
then
  report_request_id="$(request_id)"
  report_payload="$TMP_DIR/report-compose.json"
  report_response="$TMP_DIR/report-compose-response.json"
  report_get_response="$TMP_DIR/report-get-response.json"
  build_report_compose_payload "$report_request_id" "$session_id" "$report_payload"

  log_step "Composing and reading Basic Alpha report"
  http_json POST "$API_BASE_URL/internal/reports/basic-alpha/compose" "$report_response" "$report_payload" \
    -H "x-internal-shared-secret: $INTERNAL_SHARED_SECRET" \
    -H "x-request-id: $report_request_id"
  json_assert "$report_response" '["ready", "needs_revision", "draft"].includes(data.report_status)' 'report response has invalid status'
  json_assert "$report_response" 'data.problem_section && data.problem_section.section_kind === "problem"' 'report missing problem section'
  json_assert "$report_response" 'data.solution_section && data.solution_section.section_kind === "solution"' 'report missing solution section'
  json_assert "$report_response" 'Array.isArray(data.warnings) && data.warnings.join(" ").includes("does not approve")' 'report missing no-decision warning'
  json_assert "$report_response" '!JSON.stringify(data).includes("raw_model_output")' 'report exposed raw model output'

  http_json GET "$API_BASE_URL/api/v1/sessions/$session_id/report" "$report_get_response"
  json_assert "$report_get_response" 'typeof data.report_id === "string" && data.report_id.length > 0' 'report GET missing report_id'
  json_assert "$report_get_response" '!JSON.stringify(data).includes("validated_output_json")' 'report GET exposed raw validated output'
else
  log_step "Skipping report smoke because the current smoke flow has not generated both Alpha sections"
fi

start_status="$TMP_DIR/start-status.json"
reply_status="$TMP_DIR/reply-status.json"
log_step "Checking request execution status"
http_json GET "$API_BASE_URL/api/v1/requests/$start_request_id" "$start_status"
http_json GET "$API_BASE_URL/api/v1/requests/$reply_request_id" "$reply_status"
json_assert "$start_status" 'data.status === "completed"' 'start request did not complete'
json_assert "$reply_status" 'data.status === "completed"' 'reply request did not complete'

recovery_request_id="$(request_id)"
recovery_payload="$TMP_DIR/recovery.json"
recovery_context="$TMP_DIR/recovery-context.json"
recovery_pending="$TMP_DIR/recovery-pending.json"
recovery_response="$TMP_DIR/recovery-response.json"
build_recovery_payload "$recovery_request_id" "$recovery_payload"

log_step "Creating partial start request and recovering it"
http_json POST "$API_BASE_URL/internal/sessions/start-context" "$recovery_context" "$recovery_payload" \
  -H "x-internal-shared-secret: $INTERNAL_SHARED_SECRET" \
  -H "x-request-id: $recovery_request_id"
http_json GET "$API_BASE_URL/api/v1/requests/$recovery_request_id" "$recovery_pending"
json_assert "$recovery_pending" 'data.status === "pending"' 'partial start request should be pending before recovery'
http_json POST "$API_BASE_URL/api/v1/requests/$recovery_request_id/recover" "$recovery_response"
json_assert "$recovery_response" 'data.status === "completed"' 'recovery did not complete the partial start request'
json_assert "$recovery_response" 'data.request_kind === "proposal_start"' 'recovery response has wrong request kind'
json_assert "$recovery_response" 'data.session_id && typeof data.session_id === "string"' 'recovery response missing session_id'

log_step "Core smoke completed"
