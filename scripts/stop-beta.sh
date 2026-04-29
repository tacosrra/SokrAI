#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common-beta.sh"

require_command docker
require_docker_access

if [[ ! -f "$BETA_ENV_FILE" ]]; then
  fail "$(basename "$BETA_ENV_FILE") does not exist yet. Nothing to stop."
fi

log_step "Stopping beta stack"
docker_compose stop

cat <<EOF

SokrAI beta was stopped.

- Data was kept in Docker volumes for the project: $COMPOSE_PROJECT_NAME
- Start it again with: ./scripts/start-beta.sh

EOF
