# Opción recomendada: no crear archivos de issues

Usa un prompt genérico que le diga a Archon que lea directamente la PR.

Ejemplo:

```bash
cat > /tmp/resolve-pr-review-issues.prompt.txt <<'EOF'
Resolve selected review issues from the current GitHub PR.

Important:
- Do not ask me to paste the review issue text manually.
- Use GitHub CLI to read the PR comments/review comments.
- Locate the review section containing Medium Issues / Low Issues / Options for User.
- Identify issues by their visible issue number/order in the PR review comments.
- Only act on the selected issue numbers below.

Current PR:
PR_NUMBER_PLACEHOLDER

Selected actions:
- FIX_NOW: FIX_NOW_PLACEHOLDER
- CREATE_ISSUE_IF_OPEN: CREATE_ISSUE_PLACEHOLDER
- SKIP: SKIP_PLACEHOLDER

Process:
For each selected issue:
1. Read the full issue text from GitHub PR comments/review comments.
2. Inspect the current codebase.
3. Determine whether the issue is already resolved, partially resolved, still open, no longer applicable, or intentionally deferred.
4. If already resolved:
   - do not modify code.
   - report evidence.
5. If partially resolved and marked FIX_NOW:
   - implement only the missing part.
6. If still open and marked FIX_NOW:
   - implement the smallest focused fix.
7. If marked CREATE_ISSUE_IF_OPEN:
   - do not implement it.
   - create a GitHub issue or provide an exact gh issue create command if direct issue creation is unavailable.
8. If marked SKIP:
   - do not implement it.
   - document that it was skipped intentionally.

Rules:
- Do not broaden the PR scope.
- Do not implement unrelated features.
- Do not refactor broadly.
- Do not merge or cherry-pick branches.
- Do not touch RAG/legal/remote AI/auth/PDF unless the current PR explicitly allows it.
- Do not add secrets, real patient data, or non-anonymized fixtures.

Validation:
Run the relevant checks for this PR. Prefer:
- pnpm run type-check
- pnpm run lint
- pnpm run format:check
- pnpm test:contracts if contracts are touched
- pnpm test:unit
- pnpm test:web if frontend is touched
- pnpm test:integration if persistence/integration is touched and services are available
- pnpm run build
- pnpm verify if available and environment supports it

Deliverable:
- Commit fixes to the current PR branch if changes are needed.
- If no changes are needed, do not create an empty commit.
- Provide a summary table:
  Issue | Decision | Status | Action taken | Evidence | Validation
EOF
```

# Cómo usarlo en la práctica

Supongamos que estás en la PR2A y quieres:

```text
Fix now: 1,2,3
Create issue: 4,5,6
Skip: ninguno
```

Haces:

```bash
PR_NUMBER=5
FIX_NOW="5,11,12,13,15"
CREATE_ISSUE="none"
SKIP="none"

PROMPT="$(cat ~/.archon/prompts/resolve-pr-review-issues.md)"
PROMPT="${PROMPT//\{\{PR_NUMBER\}\}/$PR_NUMBER}"
PROMPT="${PROMPT//\{\{FIX_NOW\}\}/$FIX_NOW}"
PROMPT="${PROMPT//\{\{CREATE_ISSUE\}\}/$CREATE_ISSUE}"
PROMPT="${PROMPT//\{\{SKIP\}\}/$SKIP}"

archon continue <BRANCH_NAME> \
  --workflow archon-assist \
  "$PROMPT"
```

Cambia `<BRANCH_NAME>` por la rama real del worktree, por ejemplo:

```bash
archon continue archon/task-feat-alpha-data-persistence \
  --workflow archon-assist \
  "$PROMPT"
```