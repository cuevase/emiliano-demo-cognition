# __TITLE__

Generated with `pnpm new-tool __TOOL__`. Owner: TODO-team. Lives inside the console at `/t/__TOOL__`.

Sign-in, permissions, audit and approvals come from the platform packages. See the root `AGENTS.md` for the rules.

| File | What to change |
|---|---|
| `apps/console/tools/__TOOL__/manifest.ts` | Description, owner team, permissions, role grants, conditions |
| `apps/console/tools/__TOOL__/db/migrations/*.sql` | Tables. Every table: `platform.secure_table`, policies, `platform.classify` for every column |
| `apps/console/tools/__TOOL__/lib/schema.ts` | Drizzle table + field classification (must match the migration) |
| `apps/console/tools/__TOOL__/lib/actions.ts` | Reads (masked) and writes (`defineAction` only) |
| `apps/console/tools/__TOOL__/tests/` | Allowed + denied test for every action, RLS tests |
| `apps/console/app/t/__TOOL__/` | Pages, built from `@platform/ui` |

Run: `pnpm --filter console dev`, then open http://localhost:3000/t/__TOOL__. Check: `pnpm verify`.
