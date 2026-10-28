#!/usr/bin/env bash
# Scaffolds a throwaway tool from the template and runs its checks, then removes it.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=ci-smoke
if [ -e apps/$NAME ]; then echo "apps/$NAME already exists; remove it first" >&2; exit 1; fi
BACKUP=$(mktemp -d)
cp apps/console/package.json "$BACKUP/package.json"
cp apps/console/lib/tools.ts "$BACKUP/tools.ts"
cp pnpm-lock.yaml "$BACKUP/pnpm-lock.yaml"
cleanup() {
  node -e "require(\"dotenv/config\");const c=new (require(\"pg\").Client)(process.env.DATABASE_URL);c.connect().then(()=>c.query(\"drop schema if exists tool_ci_smoke cascade; delete from public._platform_migrations where name like \x27ci-smoke/%\x27\")).finally(()=>c.end())" 2>/dev/null || true
  rm -rf apps/$NAME
  # Restore exactly what was there before the check, including uncommitted edits.
  cp "$BACKUP/package.json" apps/console/package.json
  cp "$BACKUP/tools.ts" apps/console/lib/tools.ts
  cp "$BACKUP/pnpm-lock.yaml" pnpm-lock.yaml
  rm -rf "$BACKUP"
  pnpm install --no-frozen-lockfile >/dev/null
}
trap cleanup EXIT
pnpm new-tool $NAME
pnpm db:migrate
pnpm check:rls
pnpm check:permissions
pnpm vitest run apps/$NAME
pnpm --filter $NAME typecheck
pnpm --filter console typecheck
echo "template smoke test passed"
