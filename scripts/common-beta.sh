#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BETA_ENV_FILE="${SOKRAI_BETA_ENV_FILE:-$REPO_ROOT/.env.beta}"
COMPOSE_PROJECT_NAME="${SOKRAI_BETA_PROJECT_NAME:-sokrai-beta}"
WORKFLOW_MARKER_FILE="/home/node/.n8n/.sokrai_workflows_bootstrapped_v2"
BETA_WORKFLOW_FILES=(
  proposal_start_v1.json
  proposal_reply_v1.json
  agent_problem_definition_v1.json
  solution_start_v1.json
  solution_reply_v1.json
  agent_solution_definition_v1.json
  data_ai_privacy_start_v1.json
  data_ai_privacy_reply_v1.json
  agent_data_ai_privacy_gap_v1.json
  medical_device_triage_start_v1.json
  medical_device_triage_reply_v1.json
  agent_medical_device_triage_v1.json
  resources_pilot_viability_start_v1.json
  resources_pilot_viability_reply_v1.json
  agent_resources_pilot_viability_v1.json
)
DOCKER_INSTALL_URL="https://docs.docker.com/get-started/introduction/get-docker-desktop/"

COMPOSE_ARGS=(
  --env-file "$BETA_ENV_FILE"
  -p "$COMPOSE_PROJECT_NAME"
  -f "$REPO_ROOT/docker-compose.yml"
  -f "$REPO_ROOT/docker-compose.beta.yml"
)

docker_compose() {
  SOKRAI_ENV_FILE="$BETA_ENV_FILE" docker compose "${COMPOSE_ARGS[@]}" "$@"
}

log_step() {
  printf '\n[%s] %s\n' "$COMPOSE_PROJECT_NAME" "$1"
}

fail() {
  printf '\n[%s] Error: %s\n' "$COMPOSE_PROJECT_NAME" "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

open_url() {
  local url="$1"

  if has_command open; then
    open "$url" >/dev/null 2>&1 || true
    return 0
  fi

  if has_command xdg-open; then
    xdg-open "$url" >/dev/null 2>&1 || true
    return 0
  fi

  return 1
}

open_web_ui() {
  local url

  url="$(web_ui_url)"
  log_step "Opening SokrAI in the browser"
  open_url "$url" || printf '[%s] Open this URL manually: %s\n' "$COMPOSE_PROJECT_NAME" "$url"
}

detect_docker_desktop_installation() {
  if [[ -d "/Applications/Docker.app" ]]; then
    return 0
  fi

  return 1
}

start_docker_desktop() {
  if has_command docker && docker desktop version >/dev/null 2>&1; then
    log_step "Starting Docker Desktop"
    docker desktop start >/dev/null 2>&1 || true
    return 0
  fi

  if detect_docker_desktop_installation && has_command open; then
    log_step "Starting Docker Desktop"
    open -a Docker >/dev/null 2>&1 || true
    return 0
  fi

  return 1
}

ensure_docker_available() {
  if has_command docker; then
    return 0
  fi

  open_url "$DOCKER_INSTALL_URL" || true
  fail "Docker CLI was not found. Install Docker Desktop and reopen the terminal before retrying."
}

generate_secret() {
  hexdump -vn 24 -e '1/1 "%02x"' /dev/urandom
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  tmp_file="$(mktemp)"

  awk -v key="$key" -v value="$value" '
    BEGIN {
      updated = 0;
    }
    $0 ~ "^" key "=" {
      print key "=" value;
      updated = 1;
      next;
    }
    {
      print $0;
    }
    END {
      if (updated == 0) {
        print key "=" value;
      }
    }
  ' "$file" >"$tmp_file"

  mv "$tmp_file" "$file"
}

read_env_value() {
  local file="$1"
  local key="$2"

  awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$file"
}

read_env_value_or_default() {
  local file="$1"
  local key="$2"
  local default_value="$3"
  local value

  value="$(read_env_value "$file" "$key")"

  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return
  fi

  printf '%s' "$default_value"
}

set_beta_default_value() {
  local key="$1"
  local value="$2"
  local replace_value="${3:-}"
  local current_value

  current_value="$(read_env_value "$BETA_ENV_FILE" "$key")"

  if [[ -z "$current_value" || ( -n "$replace_value" && "$current_value" == "$replace_value" ) ]]; then
    set_env_value "$BETA_ENV_FILE" "$key" "$value"
  fi
}

api_host_port() {
  read_env_value_or_default "$BETA_ENV_FILE" "API_HOST_PORT" "3301"
}

n8n_host_port() {
  read_env_value_or_default "$BETA_ENV_FILE" "N8N_HOST_PORT" "5679"
}

web_host_port() {
  read_env_value_or_default "$BETA_ENV_FILE" "WEB_HOST_PORT" "3300"
}

api_base_url() {
  printf 'http://localhost:%s' "$(api_host_port)"
}

n8n_base_url() {
  printf 'http://localhost:%s' "$(n8n_host_port)"
}

web_ui_url() {
  printf 'http://localhost:%s' "$(web_host_port)"
}

ensure_beta_env_file() {
  if [[ ! -f "$BETA_ENV_FILE" ]]; then
    log_step "Creating $(basename "$BETA_ENV_FILE") from .env.example"
    cp "$REPO_ROOT/.env.example" "$BETA_ENV_FILE"
  fi

  set_beta_default_value "POSTGRES_HOST_PORT" "55433" "5433"
  set_beta_default_value "API_HOST_PORT" "3301" "3001"
  set_beta_default_value "WEB_HOST_PORT" "3300" "3000"
  set_beta_default_value "N8N_HOST_PORT" "5679" "5678"
  set_beta_default_value "OLLAMA_HOST_PORT" "11435" "11434"
  set_beta_default_value "APP_BASE_URL" "http://localhost:3301" "http://localhost:3001"
  set_beta_default_value "API_PROXY_TARGET" "http://localhost:3301" "http://localhost:3001"
  set_beta_default_value "WEBHOOK_PROXY_TARGET" "http://localhost:5679" "http://localhost:5678"
  set_beta_default_value "OLLAMA_BASE_URL" "http://localhost:11435" "http://ollama:11434"

  if [[ "$(read_env_value "$BETA_ENV_FILE" "INTERNAL_SHARED_SECRET")" == "replace-with-a-random-32-char-secret" ]]; then
    set_env_value "$BETA_ENV_FILE" "INTERNAL_SHARED_SECRET" "$(generate_secret)"
  fi

  if [[ "$(read_env_value "$BETA_ENV_FILE" "N8N_ENCRYPTION_KEY")" == "replace-with-a-random-32-char-secret" ]]; then
    set_env_value "$BETA_ENV_FILE" "N8N_ENCRYPTION_KEY" "$(generate_secret)"
  fi
}

require_docker_access() {
  ensure_docker_available

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if start_docker_desktop; then
    log_step "Waiting for Docker Desktop"
    wait_for "docker" 90 docker_ready
    return 0
  fi

  open_url "$DOCKER_INSTALL_URL" || true
  fail "Docker Desktop is not running and could not be started automatically. Start Docker Desktop and retry."
}

docker_ready() {
  docker info >/dev/null 2>&1
}

wait_for() {
  local label="$1"
  local max_attempts="$2"
  shift 2

  local attempt=1
  until "$@"; do
    if (( attempt >= max_attempts )); then
      fail "Timed out while waiting for ${label}"
    fi

    sleep 2
    attempt=$((attempt + 1))
  done
}

postgres_ready() {
  docker_compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1
}

ollama_ready() {
  docker_compose exec -T ollama ollama list >/dev/null 2>&1
}

api_ready() {
  curl -fsS "$(api_base_url)/healthz" >/dev/null 2>&1
}

n8n_ready() {
  local user password

  user="$(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_USER")"
  password="$(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_PASSWORD")"

  curl -fsS -u "${user}:${password}" "$(n8n_base_url)" >/dev/null 2>&1
}

web_ready() {
  curl -fsS "$(web_ui_url)" >/dev/null 2>&1
}

read_workflow_id() {
  local workflow_file="$1"

  awk -F'"' '/^[[:space:]]*"id":[[:space:]]*"/ { print $4; exit }' "$workflow_file"
}

publish_workflow() {
  local workflow_file="$1"
  local workflow_id

  workflow_id="$(read_workflow_id "$workflow_file")"
  [[ -n "$workflow_id" ]] || fail "Workflow file $(basename "$workflow_file") is missing a top-level id"

  docker_compose exec -T -u node n8n n8n publish:workflow --id="$workflow_id"
}

repair_duplicate_n8n_workflows() {
  local workflow_file workflow_name canonical_id workflow_id duplicate_ids repaired=0

  if ! n8n_ready; then
    return 1
  fi

  duplicate_ids=()

  while IFS='|' read -r workflow_id workflow_name; do
    [[ -n "$workflow_id" && -n "$workflow_name" ]] || continue

    canonical_id=""
    for workflow_file in "${BETA_WORKFLOW_FILES[@]}"; do
      if [[ "$(awk -F'"' '/^[[:space:]]*"name":[[:space:]]*"/ { print $4; exit }' "$REPO_ROOT/infra/n8n/workflows/$workflow_file")" == "$workflow_name" ]]; then
        canonical_id="$(read_workflow_id "$REPO_ROOT/infra/n8n/workflows/$workflow_file")"
        break
      fi
    done

    [[ -n "$canonical_id" ]] || continue

    if [[ "$canonical_id" != "$workflow_id" ]]; then
      duplicate_ids+=("$workflow_id")
    fi
  done < <(docker_compose exec -T -u node n8n n8n list:workflow 2>/dev/null)

  if ((${#duplicate_ids[@]} == 0)); then
    return 1
  fi

  log_step "Removing ${#duplicate_ids[@]} duplicate n8n workflow(s)"

  local id_list
  printf -v id_list "'%s'," "${duplicate_ids[@]}"
  id_list="${id_list%,}"

  {
    printf 'DELETE FROM webhook_entity WHERE "workflowId" IN (%s);\n' "$id_list"
    printf 'DELETE FROM workflow_entity WHERE id IN (%s);\n' "$id_list"
  } | docker_compose exec -T postgres psql -U sokrai_n8n -d sokrai_n8n -v ON_ERROR_STOP=1 >/dev/null

  return 0
}

pull_ollama_model() {
  local model
  local ollama_model
  local ai_model
  local models=()
  local retry_count
  local attempt

  ollama_model="$(read_env_value "$BETA_ENV_FILE" "OLLAMA_MODEL")"
  ai_model="$(read_env_value "$BETA_ENV_FILE" "AI_MODEL")"
  [[ -n "$ollama_model" ]] || fail "OLLAMA_MODEL is empty in $(basename "$BETA_ENV_FILE")"

  if [[ -n "$ai_model" ]]; then
    models+=("$ai_model")

    if [[ "$ai_model" != "$ollama_model" ]]; then
      models+=("$ollama_model")
    fi
  else
    models+=("$ollama_model")
  fi

  if [[ "${SOKRAI_BETA_SKIP_OLLAMA_PULL:-0}" == "1" ]]; then
    log_step "Skipping Ollama model pull because SOKRAI_BETA_SKIP_OLLAMA_PULL=1"
    return 0
  fi

  retry_count="${SOKRAI_BETA_OLLAMA_PULL_RETRIES:-3}"

  for model in "${models[@]}"; do
    if docker_compose exec -T ollama ollama show "$model" >/dev/null 2>&1; then
      log_step "Ollama model already present: $model"
      continue
    fi

    for (( attempt=1; attempt<=retry_count; attempt++ )); do
      log_step "Pulling Ollama model: $model (attempt ${attempt}/${retry_count})"

      if docker_compose exec -T ollama ollama pull "$model"; then
        break
      fi

      if (( attempt >= retry_count )); then
        fail "Could not pull Ollama model '$model'. The Ollama container could not resolve or reach the model registry. Check Docker DNS/outbound network, retry later, or rerun with SOKRAI_BETA_SKIP_OLLAMA_PULL=1 if the model is already cached."
      fi

      sleep 5
    done
  done
}

run_database_migrations() {
  log_step "Running database migrations"
  docker_compose run --rm api pnpm --filter @sokrai/api migrate
}

workflow_file_hash() {
  local file="$1"

  if has_command sha256sum; then
    sha256sum "$file"
    return
  fi

  shasum -a 256 "$file"
}

workflow_bundle_hash() {
  local workflow_file

  {
    for workflow_file in "${BETA_WORKFLOW_FILES[@]}"; do
      workflow_file_hash "$REPO_ROOT/infra/n8n/workflows/$workflow_file"
    done
  } | if has_command sha256sum; then sha256sum; else shasum -a 256; fi | awk '{ print $1 }'
}

workflow_marker_matches() {
  local expected_hash="$1"

  docker_compose exec -T -u node n8n sh -c \
    'test -f "$1" && test "$(cat "$1")" = "$2"' \
    sh "$WORKFLOW_MARKER_FILE" "$expected_hash" >/dev/null 2>&1
}

workflow_marker_exists() {
  docker_compose exec -T -u node n8n test -f "$WORKFLOW_MARKER_FILE" >/dev/null 2>&1
}

write_workflow_marker() {
  local hash="$1"

  docker_compose exec -T -u node n8n sh -c \
    'printf "%s\n" "$2" > "$1"' \
    sh "$WORKFLOW_MARKER_FILE" "$hash"
}

bootstrap_workflows() {
  local workflow_file
  local repaired_duplicates=0
  local current_workflows_hash

  if repair_duplicate_n8n_workflows; then
    repaired_duplicates=1
  fi

  current_workflows_hash="$(workflow_bundle_hash)"

  if workflow_marker_matches "$current_workflows_hash"; then
    if [[ "$repaired_duplicates" -eq 1 ]]; then
      log_step "Restarting n8n after removing duplicate workflows"
      docker_compose restart n8n >/dev/null
      wait_for "n8n" 60 n8n_ready
    else
      log_step "Skipping workflow import: already bootstrapped in this beta environment"
    fi

    return
  fi

  if workflow_marker_exists; then
    log_step "Workflow files changed; reimporting n8n workflows"
  fi

  log_step "Importing n8n workflows"
  for workflow_file in "${BETA_WORKFLOW_FILES[@]}"; do
    docker_compose exec -T -u node n8n n8n import:workflow --input="/workflows/${workflow_file}"
  done

  repair_duplicate_n8n_workflows >/dev/null || true

  log_step "Publishing imported workflows"
  for workflow_file in "${BETA_WORKFLOW_FILES[@]}"; do
    publish_workflow "$REPO_ROOT/infra/n8n/workflows/$workflow_file"
  done

  write_workflow_marker "$current_workflows_hash"

  log_step "Restarting n8n so active workflow state is applied"
  docker_compose restart n8n >/dev/null
  wait_for "n8n" 60 n8n_ready
}

print_beta_endpoints() {
  cat <<EOF

SokrAI beta is ready.

- Web UI: $(web_ui_url)
- API health: $(api_base_url)/healthz
- n8n: $(n8n_base_url)
- n8n user: $(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_USER")
- n8n password: $(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_PASSWORD")

Next commands:
- Start again later: ./scripts/start-beta.sh
- Stop while keeping data: ./scripts/stop-beta.sh
- Tail logs: SOKRAI_ENV_FILE=${BETA_ENV_FILE} docker compose --env-file ${BETA_ENV_FILE} -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml -f docker-compose.beta.yml logs -f

EOF
}
