#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BETA_ENV_FILE="${SOKRAI_BETA_ENV_FILE:-$REPO_ROOT/.env.beta}"
COMPOSE_PROJECT_NAME="${SOKRAI_BETA_PROJECT_NAME:-sokrai-beta}"
WORKFLOW_MARKER_FILE="/home/node/.n8n/.sokrai_workflows_bootstrapped"
DOCKER_INSTALL_URL="https://docs.docker.com/get-started/introduction/get-docker-desktop/"
WEB_UI_URL="http://localhost:3000"

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
  log_step "Opening SokrAI in the browser"
  open_url "$WEB_UI_URL" || printf '[%s] Open this URL manually: %s\n' "$COMPOSE_PROJECT_NAME" "$WEB_UI_URL"
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

ensure_beta_env_file() {
  if [[ ! -f "$BETA_ENV_FILE" ]]; then
    log_step "Creating $(basename "$BETA_ENV_FILE") from .env.example"
    cp "$REPO_ROOT/.env.example" "$BETA_ENV_FILE"
  fi

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
  curl -fsS http://localhost:3001/healthz >/dev/null 2>&1
}

n8n_ready() {
  local user password

  user="$(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_USER")"
  password="$(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_PASSWORD")"

  curl -fsS -u "${user}:${password}" http://localhost:5678 >/dev/null 2>&1
}

web_ready() {
  curl -fsS http://localhost:3000 >/dev/null 2>&1
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

pull_ollama_model() {
  local model
  local retry_count
  local attempt

  model="$(read_env_value "$BETA_ENV_FILE" "OLLAMA_MODEL")"
  [[ -n "$model" ]] || fail "OLLAMA_MODEL is empty in $(basename "$BETA_ENV_FILE")"

  if [[ "${SOKRAI_BETA_SKIP_OLLAMA_PULL:-0}" == "1" ]]; then
    log_step "Skipping Ollama model pull because SOKRAI_BETA_SKIP_OLLAMA_PULL=1"
    return 0
  fi

  if docker_compose exec -T ollama ollama show "$model" >/dev/null 2>&1; then
    log_step "Ollama model already present: $model"
    return 0
  fi

  retry_count="${SOKRAI_BETA_OLLAMA_PULL_RETRIES:-3}"

  for (( attempt=1; attempt<=retry_count; attempt++ )); do
    log_step "Pulling Ollama model: $model (attempt ${attempt}/${retry_count})"

    if docker_compose exec -T ollama ollama pull "$model"; then
      return 0
    fi

    if (( attempt < retry_count )); then
      sleep 5
    fi
  done

  fail "Could not pull Ollama model '$model'. The Ollama container could not resolve or reach the model registry. Check Docker DNS/outbound network, retry later, or rerun with SOKRAI_BETA_SKIP_OLLAMA_PULL=1 if the model is already cached."
}

run_database_migrations() {
  log_step "Running database migrations"
  docker_compose run --rm api pnpm --filter @sokrai/api migrate
}

bootstrap_workflows() {
  local workflow_files=(
    proposal_start_v1.json
    proposal_reply_v1.json
    agent_problem_definition_v1.json
  )
  local workflow_file

  if docker_compose exec -T -u node n8n test -f "$WORKFLOW_MARKER_FILE" >/dev/null 2>&1; then
    log_step "Skipping workflow import: already bootstrapped in this beta environment"
    return
  fi

  log_step "Importing n8n workflows"
  for workflow_file in "${workflow_files[@]}"; do
    docker_compose exec -T -u node n8n n8n import:workflow --input="/workflows/${workflow_file}"
  done

  log_step "Publishing imported workflows"
  for workflow_file in "${workflow_files[@]}"; do
    publish_workflow "$REPO_ROOT/infra/n8n/workflows/$workflow_file"
  done

  docker_compose exec -T -u node n8n touch "$WORKFLOW_MARKER_FILE"

  log_step "Restarting n8n so active workflow state is applied"
  docker_compose restart n8n >/dev/null
  wait_for "n8n" 60 n8n_ready
}

print_beta_endpoints() {
  cat <<EOF

SokrAI beta is ready.

- Web UI: http://localhost:3000
- API health: http://localhost:3001/healthz
- n8n: http://localhost:5678
- n8n user: $(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_USER")
- n8n password: $(read_env_value "$BETA_ENV_FILE" "N8N_BASIC_AUTH_PASSWORD")

Next commands:
- Start again later: ./scripts/start-beta.sh
- Stop while keeping data: ./scripts/stop-beta.sh
- Tail logs: SOKRAI_ENV_FILE=${BETA_ENV_FILE} docker compose --env-file ${BETA_ENV_FILE} -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml -f docker-compose.beta.yml logs -f

EOF
}
