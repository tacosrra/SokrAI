Audit and resolve selected review/follow-up issues for the current PR branch.

You will receive:
- a review issues file
- a list of selected issue numbers
- the current PR context

Core instruction:
For each selected issue, first audit whether it is already resolved in the current codebase. Do not assume it is still open.

For each selected issue:
1. Inspect the current codebase.
2. Determine whether the issue is:
   - already resolved,
   - partially resolved,
   - still open,
   - no longer applicable,
   - intentionally deferred.
3. If already resolved:
   - do not modify code for that issue.
   - document evidence: files, tests, schemas, code paths, or docs proving it is resolved.
4. If partially resolved:
   - implement only the missing part.
5. If still open and marked FIX_NOW:
   - implement the smallest focused fix.
6. If marked CREATE_ISSUE_IF_OPEN:
   - do not implement unless explicitly instructed.
   - report whether it is still open.
   - provide a proposed GitHub issue title/body.
7. If marked SKIP:
   - do not implement.
   - document that it was intentionally skipped.
8. Do not duplicate work.
9. Do not broaden scope beyond the selected issues.

Restrictions:
- Do not implement unrelated features.
- Do not refactor broadly.
- Do not modify product scope.
- Do not touch modules outside the current PR scope unless the issue explicitly requires it.
- Do not merge other branches.
- Do not cherry-pick unrelated commits.
- Do not introduce RAG/legal/remote AI/auth/PDF/etc. unless the current PR explicitly allows it.
- Do not add real patient data, secrets, or non-anonymized fixtures.

Validation:
Run the relevant checks for this repository and PR scope. Prefer:
- pnpm install
- pnpm run type-check
- pnpm run lint
- pnpm run format:check
- pnpm test:contracts if contracts are touched
- pnpm test:unit
- pnpm test:web if frontend is touched
- pnpm test:integration if persistence/integration is touched and services are available
- pnpm run build
- pnpm verify if available and environment supports it

If a validation command is blocked by environment, document:
- the exact command,
- the blocker,
- whether it is environment-only or code-related,
- what was validated instead.

Deliverable:
- If fixes are needed, commit them to the current branch.
- If no fixes are needed, do not create an empty commit.
- Provide a summary table:
  Issue | Status | Action taken | Evidence | Validation
