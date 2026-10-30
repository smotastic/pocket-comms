#!/usr/bin/env bash
# Runs the fast local checks used by the husky pre-push hook. CI remains the
# authoritative place for the complete pipeline.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Determine the affected range against an already available local base. A
# pre-push hook must not add network latency.
# Without a common history (a fresh repository, or one whose history was rewritten) there is
# no merge base, and every project counts as affected.
if [ -z "${NX_BASE:-}" ] || [ -z "${NX_HEAD:-}" ]; then
  if git show-ref --verify --quiet refs/remotes/origin/master; then
    NX_BASE="$(git merge-base origin/master HEAD || true)"
  else
    NX_BASE="$(git merge-base master HEAD || true)"
  fi
  NX_HEAD="HEAD"
fi
export NX_BASE NX_HEAD

# Runs a target for the affected projects, or for all of them when there is no base.
nx_target() {
  if [ -n "$NX_BASE" ]; then
    pnpm nx affected --target="$1" --base="$NX_BASE" --head="$NX_HEAD"
  else
    pnpm nx run-many --target="$1"
  fi
}

step() {
  echo ""
  echo "▶ [$1/8] $2"
}

step 1 "commit and branch conventions"
pnpm test:conventions
pnpm validate:conventions --branch --unpushed

step 2 "port structure check"
pnpm ports:check
pnpm test:ports

step 3 "design tokens: valid, matching themes, current output"
pnpm tokens:check
pnpm test:tokens

step 4 "local dev tooling tests"
pnpm test:dev

step 5 "affected lint + format check"
nx_target lint
pnpm format:check

step 6 "affected tests"
nx_target test

step 7 "affected build"
nx_target build

step 8 "affected test typecheck"
nx_target test-typecheck

RAN="convention tests, conventions, port structure check, design tokens, dev tooling tests, affected lint + format, affected tests, affected build, affected test-typecheck"

echo ""
echo "CI additionally runs: dep-cruise and test:boundaries, dependency policy (syncpack, dedupe,"
echo "nx sync), the OpenAPI contract gates (openapi:check, openapi:lint, openapi:diff, test:openapi)"
echo "and CI gatekeeper validation."
echo "A green run here does not predict a green CI."
echo ""

# Explicit `--base`/`--head` selection can omit working-tree changes from affected target selection.
# Surface them because the closing line is what an agent reads before opening a pull request.
uncommitted="$(git status --porcelain)"
if [ -n "$uncommitted" ]; then
  echo "$uncommitted" | sed 's/^/   /'
  echo "⚠ The configured local checks passed: $RAN."
  echo "   The entries above may not have been selected by the affected checks."
else
  echo "✅ Local checks passed: $RAN."
fi
