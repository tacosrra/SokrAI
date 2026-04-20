#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common-beta.sh"

require_command curl
require_command awk
require_docker_access

if [[ ! -f "$BETA_ENV_FILE" ]]; then
  fail "$(basename "$BETA_ENV_FILE") does not exist yet. Run ./scripts/bootstrap-beta.sh first."
fi

log_step "Starting isolated beta stack"
docker_compose up -d postgres ollama api n8n web
wait_for "postgres" 60 postgres_ready
wait_for "ollama" 60 ollama_ready
wait_for "api" 60 api_ready
wait_for "n8n" 60 n8n_ready
wait_for "web" 60 web_ready
print_beta_endpoints
open_web_ui
