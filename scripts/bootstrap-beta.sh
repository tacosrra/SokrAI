#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common-beta.sh"

require_command curl
require_command awk
require_command hexdump
require_command mktemp
require_docker_access
ensure_beta_env_file

log_step "Building beta images"
docker_compose build api web

log_step "Starting beta stack"
docker_compose up -d postgres ollama api n8n web

log_step "Waiting for PostgreSQL"
wait_for "postgres" 60 postgres_ready

log_step "Waiting for Ollama"
wait_for "ollama" 60 ollama_ready

log_step "Waiting for API"
wait_for "api" 60 api_ready

log_step "Waiting for n8n"
wait_for "n8n" 60 n8n_ready

log_step "Waiting for Web UI"
wait_for "web" 60 web_ready

pull_ollama_model
run_database_migrations
bootstrap_workflows

log_step "Running final health checks"
wait_for "api" 10 api_ready
wait_for "n8n" 10 n8n_ready
wait_for "web" 10 web_ready

print_beta_endpoints
open_web_ui
