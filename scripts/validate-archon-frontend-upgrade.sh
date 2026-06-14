#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== Validating Chrome DevTools MCP JSON =="
if command -v python3 >/dev/null 2>&1; then
  python3 -m json.tool .archon/mcp/chrome-devtools.json >/dev/null
else
  cat .archon/mcp/chrome-devtools.json >/dev/null
fi

echo "== Checking project-local skill shims =="
for skill in emil-kowalski taste impeccable react-doctor; do
  test -f ".claude/skills/$skill/SKILL.md" || {
    echo "Missing .claude/skills/$skill/SKILL.md" >&2
    exit 1
  }
  echo "ok: $skill"
done

echo "== Validating Archon workflows, if archon is available =="
if command -v archon >/dev/null 2>&1; then
  archon validate workflows archon-upgrade-existing-frontend-premium-v1
  archon validate workflows archon-upgrade-existing-frontend-premium-v1-codex-compatible
else
  echo "archon not found in PATH; skipping archon validate."
fi

echo "Done."
