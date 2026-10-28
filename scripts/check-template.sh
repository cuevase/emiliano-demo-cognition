#!/usr/bin/env bash
# Scaffolds a throwaway tool from the template and runs its checks, then removes it.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=ci-smoke
MODULE=apps/console/tools/$NAME
ROUTES=apps/console/app/t/$NAME
for d in $MODULE $ROUTES; do
  if [ -e "$d" ]; then echo "$d already exists; remove it first" >&2; exit 1; fi
done
BACKUP=$(mktemp -d)
cp apps/console/lib/tools.ts "$BACKUP/tools.ts"
cleanup() {
  node -e "require(\"dotenv/config\");const c=new (require(\"pg\").Client)(process.env.DATABASE_URL);c.connect().then(()=>c.query(\"drop schema if exists tool_ci_smoke cascade; delete from public._platform_migrations where name like \x27ci-smoke/%\x27\")).finally(()=>c.end())" 2>/dev/null || true
  rm -rf "$MODULE" "$ROUTES"
  # Restore exactly what was there before the check, including uncommitted edits.
  cp "$BACKUP/tools.ts" apps/console/lib/tools.ts
  rm -rf "$BACKUP"
}
trap cleanup EXIT
pnpm new-tool $NAME
pnpm db:migrate
# The tool's role grants must reach platform.role_permissions, or RLS hides its rows in the real app.
node -e "require(\"dotenv/config\");const c=new (require(\"pg\").Client)(process.env.DATABASE_URL);c.connect().then(()=>c.query(\"select count(*)::int n from platform.role_permissions where permission like \x27ci-smoke:%\x27\")).then(r=>{if(!r.rows[0].n){console.error(\"ci-smoke role grants missing from platform.role_permissions\");process.exit(1)}console.log(\"role grants synced: \"+r.rows[0].n)}).finally(()=>c.end())"
pnpm check:rls
pnpm check:permissions
pnpm vitest run $MODULE
pnpm eslint $MODULE $ROUTES apps/console/lib/tools.ts
pnpm --filter console typecheck
echo "template smoke test passed"
