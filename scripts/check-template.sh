#!/usr/bin/env bash
# Scaffolds a throwaway tool from the template and runs its checks, then removes it.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=ci-smoke
trap 'rm -rf apps/$NAME; git checkout -- apps/console/package.json apps/console/lib/tools.ts pnpm-lock.yaml 2>/dev/null || true; pnpm install >/dev/null' EXIT
pnpm new-tool $NAME
pnpm db:migrate
pnpm check:rls
pnpm check:permissions
pnpm vitest run apps/$NAME
pnpm --filter $NAME typecheck
pnpm --filter console typecheck
echo "template smoke test passed"
