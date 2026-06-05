#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
INTERNAL_SHARED_SECRET="${INTERNAL_SHARED_SECRET:-replace-with-a-random-32-char-secret}"
REQUEST_TIMEOUT_SECONDS="${REQUEST_TIMEOUT_SECONDS:-480}"
MAX_CLINIC_TURNS="${MAX_CLINIC_TURNS:-4}"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "smoke-clinic-demo: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

log_step() {
  echo "[smoke-clinic-demo] $*"
}

request_id() {
  node -e 'process.stdout.write("clinic-smoke-" + Date.now() + "-" + require("crypto").randomUUID())'
}

json_summary() {
  local file="$1"

  node - "$file" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];

try {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sections = Array.isArray(data.generated_sections)
    ? data.generated_sections.map((section) => section.section_kind)
    : undefined;
  const summary = {
    top_level_keys: Object.keys(data).slice(0, 24),
    session_id: data.session_id || data.session?.id,
    request_id: data.request_id,
    stage: data.stage || data.session?.current_stage,
    agent_status: data.agent_status,
    activation_result: data.activation_result,
    error_code: data.error_code,
    safe_message: data.safe_message,
    status: data.status || data.session?.status || data.report_status,
    next_question_present: typeof data.next_question === 'string' && data.next_question.length > 0,
    section_kinds: sections,
    counts: Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, value.length]),
    ),
  };
  process.stdout.write(JSON.stringify(summary));
} catch {
  const stats = fs.statSync(file);
  process.stdout.write(JSON.stringify({ parse_error: 'non_json_response', bytes: stats.size }));
}
NODE
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
  const sections = Array.isArray(data.generated_sections)
    ? data.generated_sections.map((section) => section.section_kind)
    : undefined;
  const summary = {
    top_level_keys: Object.keys(data).slice(0, 24),
    session_id: data.session_id || data.session?.id,
    request_id: data.request_id,
    stage: data.stage || data.session?.current_stage,
    agent_status: data.agent_status,
    activation_result: data.activation_result,
    error_code: data.error_code,
    safe_message: data.safe_message,
    status: data.status || data.session?.status || data.report_status,
    next_question_present: typeof data.next_question === 'string' && data.next_question.length > 0,
    section_kinds: sections,
    counts: Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, value.length]),
    ),
  };
  console.error(message);
  console.error(JSON.stringify(summary, null, 2));
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

  [[ "$status" =~ ^2[0-9][0-9]$ ]] || fail "$method $url returned HTTP $status: $(json_summary "$output")"
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
payload.document_text = [
  'Datos ficticios para demo local Clinic.',
  'En una semana simulada se observaron esperas de 27 minutos en admision entre las 10:00 y las 14:00.',
  'No contiene datos reales de pacientes ni identificadores asistenciales.',
].join(' ');
payload.metadata = {
  demo: 'clinic-local',
  data_policy: 'fake-only',
};

fs.writeFileSync(output, JSON.stringify(payload));
NODE
}

build_session_payload() {
  local request_id_value="$1"
  local session_id="$2"
  local output="$3"
  local include_profile="${4:-false}"

  node - "$request_id_value" "$session_id" "$output" "$include_profile" <<'NODE'
const fs = require('node:fs');
const requestId = process.argv[2];
const sessionId = process.argv[3];
const output = process.argv[4];
const includeProfile = process.argv[5] === 'true';
const payload = {
  request_id: requestId,
  session_id: sessionId,
};

if (includeProfile) {
  payload.profile_id = 'hospital_clinic_v1';
}

fs.writeFileSync(output, JSON.stringify(payload));
NODE
}

build_reply_payload() {
  local request_id_value="$1"
  local session_id="$2"
  local answer="$3"
  local output="$4"

  node - "$request_id_value" "$session_id" "$answer" "$output" <<'NODE'
const fs = require('node:fs');
const requestId = process.argv[2];
const sessionId = process.argv[3];
const answer = process.argv[4];
const output = process.argv[5];

fs.writeFileSync(output, JSON.stringify({
  request_id: requestId,
  session_id: sessionId,
  answer,
}));
NODE
}

post_webhook() {
  local path="$1"
  local payload="$2"
  local output="$3"
  local request_id_value="$4"

  http_json POST "$N8N_BASE_URL/webhook/$path" "$output" "$payload" \
    -H "x-request-id: $request_id_value"
}

reply_until_done() {
  local label="$1"
  local path="$2"
  local session_id="$3"
  local start_response="$4"
  shift 4
  local answers=("$@")
  local current_response="$start_response"
  local status

  status="$(json_value "$current_response" 'data.agent_status')"

  for answer in "${answers[@]}"; do
    if [[ "$status" == "done" || "$status" == "blocked" ]]; then
      break
    fi

    local req_id payload response
    req_id="$(request_id)"
    payload="$TMP_DIR/$label-reply-$req_id.json"
    response="$TMP_DIR/$label-reply-response-$req_id.json"
    build_reply_payload "$req_id" "$session_id" "$answer" "$payload"
    post_webhook "$path" "$payload" "$response" "$req_id"
    json_assert "$response" 'data.session_id && ["continue", "done", "blocked"].includes(data.agent_status)' "$label reply response has invalid contract"
    current_response="$response"
    status="$(json_value "$current_response" 'data.agent_status')"
    log_step "$label status=$status"
  done

  if [[ "$status" != "done" ]]; then
    fail "$label did not reach done within $MAX_CLINIC_TURNS turns: $(json_summary "$current_response")"
  fi
}

assert_audit_redacted() {
  local session_id="$1"
  local output="$TMP_DIR/audit-final.json"

  http_json GET "$API_BASE_URL/api/v1/sessions/$session_id" "$output"
  json_assert "$output" '(data.runs || []).every((run) => (run.raw_model_output === null || run.raw_model_output === undefined) && (run.validated_output_json === null || run.validated_output_json === undefined))' 'public audit exposed raw agent run output'
  json_assert "$output" '!JSON.stringify(data).includes("content_base64") && !JSON.stringify(data).includes("INTERNAL_SHARED_SECRET")' 'public audit exposed sensitive marker'
  json_assert "$output" '["problem", "solution", "data_ai_privacy", "resources_pilot_viability"].every((kind) => (data.generated_sections || []).some((section) => section.section_kind === kind))' 'audit missing expected Clinic section kinds'
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

log_step "Starting fake Clinic proposal"
post_webhook "proposal-start-v1" "$start_payload" "$start_response" "$start_request_id"
json_assert "$start_response" 'typeof data.session_id === "string" && data.session_id.length > 0' 'start response missing session_id'
json_assert "$start_response" 'data.structured_brief && typeof data.structured_brief === "object"' 'start response missing structured_brief'
session_id="$(json_value "$start_response" 'data.session_id')"
log_step "session_id=$session_id"

reply_until_done "problem" "proposal-reply-v1" "$session_id" "$start_response" \
  "El owner principal es coordinacion de urgencias y la responsable operativa es enfermeria de admision. El problema es el retraso en clasificacion inicial durante picos de entrada. La evidencia ficticia incluye esperas medias de 27 minutos, quejas simuladas y variabilidad entre turnos. El alcance es urgencias de adultos, sin diagnostico automatico. La alternativa actual es protocolo manual con hoja de cribado y llamada a medico si hay dudas." \
  "La medicion ficticia sale de una semana simulada: 120 admisiones, 34 esperas por encima de 30 minutos y 11 reclamaciones simuladas por demora. La hipotesis principal es que falta informacion estructurada al inicio, no que el personal no conozca el protocolo." \
  "Quedan como ambiguedades la cobertura exacta de turnos, criterios de escalado y quien valida los cambios. La demo debe cerrar solo la definicion del problema y dejar esas dudas como supuestos auditables."

solution_start_id="$(request_id)"
solution_start_payload="$TMP_DIR/solution-start.json"
solution_start_response="$TMP_DIR/solution-start-response.json"
build_session_payload "$solution_start_id" "$session_id" "$solution_start_payload"
log_step "Starting solution lane"
post_webhook "solution-start-v1" "$solution_start_payload" "$solution_start_response" "$solution_start_id"
json_assert "$solution_start_response" 'data.stage === "solution_definition"' 'solution start response has invalid stage'

reply_until_done "solution" "solution-reply-v1" "$session_id" "$solution_start_response" \
  "La solucion de demo es un asistente local que guia a enfermeria con preguntas estructuradas, resume los datos recogidos y propone un resumen para revision humana. No prioriza pacientes, no diagnostica y no sustituye el protocolo vigente. Se usaria solo en simulacion con datos ficticios durante el piloto." \
  "El flujo cambia al pedir datos minimos antes de cerrar la clasificacion manual: motivo, tiempo de espera, informacion faltante y si hay duda de escalado. La persona revisora confirma o corrige el resumen antes de continuar." \
  "Los limites son explicitos: sin integracion hospitalaria, sin respuesta automatica al paciente, sin scoring clinico, sin decisiones regulatorias y sin uso fuera del entorno local."

data_start_id="$(request_id)"
data_start_payload="$TMP_DIR/data-start.json"
data_start_response="$TMP_DIR/data-start-response.json"
build_session_payload "$data_start_id" "$session_id" "$data_start_payload" true
log_step "Starting data/AI/privacy lane"
post_webhook "data-ai-privacy-start-v1" "$data_start_payload" "$data_start_response" "$data_start_id"
json_assert "$data_start_response" 'data.stage === "data_ai_privacy" && data.profile_id === "hospital_clinic_v1"' 'data/AI/privacy start response has invalid contract'

reply_until_done "data-ai-privacy" "data-ai-privacy-reply-v1" "$session_id" "$data_start_response" \
  "La demo usa solo datos ficticios: edad en rangos, motivo de consulta simulado, hora de llegada y prioridad manual simulada. No hay integracion con sistemas hospitalarios. Las salidas se revisan por personal competente, quedan auditadas localmente y no se usan para decisiones clinicas, legales o regulatorias." \
  "Los controles esperados para un piloto real serian minimizacion, trazabilidad, acceso restringido, revision humana competente, separacion de datos de entrenamiento y validacion local antes de cualquier uso sensible." \
  "Las incertidumbres son base juridica, DPIA, responsable del tratamiento, periodo de conservacion, gestion de errores y como retirar datos si un usuario pega informacion real por error."

med_start_id="$(request_id)"
med_start_payload="$TMP_DIR/medical-start.json"
med_start_response="$TMP_DIR/medical-start-response.json"
build_session_payload "$med_start_id" "$session_id" "$med_start_payload" true
log_step "Starting medical-device triage lane"
post_webhook "medical-device-triage-start-v1" "$med_start_payload" "$med_start_response" "$med_start_id"
json_assert "$med_start_response" 'data.stage === "medical_device_triage" && ["applicable", "not_applicable", "uncertain"].includes(data.activation_result)' 'medical-device start response has invalid contract'

med_status="$(json_value "$med_start_response" 'data.agent_status')"
if [[ "$med_status" != "done" ]]; then
  reply_until_done "medical-device" "medical-device-triage-reply-v1" "$session_id" "$med_start_response" \
    "El uso previsto de la demo es administrativo y de maduracion de propuesta, no asistencial. No genera prioridad clinica ni recomendacion individual. La incertidumbre se documenta para revision humana competente antes de cualquier piloto real." \
    "Si el alcance cambiara hacia soporte de triaje real, haria falta revisar intended purpose, usuarios, claims, validacion clinica, integracion, supervision y posible encaje MDR antes de piloto." \
    "Para esta demo el resultado aceptable es registrar gaps y preguntas; no se debe emitir clase MDR, aprobacion, cumplimiento ni decision de producto sanitario."
else
  log_step "medical-device status=done activation=$(json_value "$med_start_response" 'data.activation_result')"
fi

resources_start_id="$(request_id)"
resources_start_payload="$TMP_DIR/resources-start.json"
resources_start_response="$TMP_DIR/resources-start-response.json"
build_session_payload "$resources_start_id" "$session_id" "$resources_start_payload"
log_step "Starting resources/pilot/viability lane"
post_webhook "resources-pilot-viability-start-v1" "$resources_start_payload" "$resources_start_response" "$resources_start_id"
json_assert "$resources_start_response" 'data.stage === "resources_pilot_viability"' 'resources/pilot start response has invalid stage'

reply_until_done "resources" "resources-pilot-viability-reply-v1" "$session_id" "$resources_start_response" \
  "El piloto ficticio requiere un portatil local, Ollama, n8n, PostgreSQL, dos revisores de urgencias, sesiones semanales y datos sinteticos. Las metricas son tiempo de entrevista, completitud del brief y numero de gaps aclarados. Riesgos: expectativas clinicas indebidas, datos reales por error y dependencia de disponibilidad local." \
  "Las dependencias son disponibilidad de sala, responsable de demo, checklist de datos ficticios, workflows importados, modelo descargado y reset local antes de repetir la sesion." \
  "La viabilidad se revisaria por capacidad operativa, tiempo de respuesta local, claridad del brief, numero de dudas restantes y ausencia de datos reales en logs o auditoria publica."

report_request_id="$(request_id)"
report_payload="$TMP_DIR/report-compose.json"
report_response="$TMP_DIR/report-compose-response.json"
build_session_payload "$report_request_id" "$session_id" "$report_payload"
node - "$report_payload" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
payload.workflow_version = 'basic_alpha_report_v1';
fs.writeFileSync(file, JSON.stringify(payload));
NODE

log_step "Composing Basic Alpha report"
http_json POST "$API_BASE_URL/internal/reports/basic-alpha/compose" "$report_response" "$report_payload" \
  -H "x-internal-shared-secret: $INTERNAL_SHARED_SECRET" \
  -H "x-request-id: $report_request_id"
json_assert "$report_response" '["ready", "needs_revision", "draft"].includes(data.report_status)' 'report response has invalid status'
json_assert "$report_response" '!JSON.stringify(data).includes("raw_model_output") && !JSON.stringify(data).includes("validated_output_json")' 'report exposed raw model output'

report_get_response="$TMP_DIR/report-get-response.json"
http_json GET "$API_BASE_URL/api/v1/sessions/$session_id/report" "$report_get_response"
json_assert "$report_get_response" 'typeof data.report_id === "string" && data.problem_section.section_kind === "problem" && data.solution_section.section_kind === "solution"' 'report GET missing expected Alpha sections'

pdf_headers="$TMP_DIR/report-pdf.headers"
pdf_body="$TMP_DIR/report.pdf"
pdf_status="$(
  curl -sS --max-time "$REQUEST_TIMEOUT_SECONDS" -D "$pdf_headers" -o "$pdf_body" -w "%{http_code}" \
    "$API_BASE_URL/api/v1/sessions/$session_id/report.pdf"
)"
[[ "$pdf_status" =~ ^2[0-9][0-9]$ ]] || fail "PDF GET returned HTTP $pdf_status"
grep -qi '^content-type: application/pdf' "$pdf_headers" || fail "PDF response missing application/pdf content type"
head -c 4 "$pdf_body" | grep -q '%PDF' || fail "PDF body missing PDF header"

assert_audit_redacted "$session_id"

final_audit="$TMP_DIR/audit-final.json"
http_json GET "$API_BASE_URL/api/v1/sessions/$session_id" "$final_audit"
section_kinds="$(json_value "$final_audit" '(data.generated_sections || []).map((section) => section.section_kind).join(",")')"
log_step "section_kinds=$section_kinds"
log_step "Clinic demo smoke completed"
