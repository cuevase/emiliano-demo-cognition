# __TITLE__

Generated with `pnpm new-tool __TOOL__`. Owner: TODO-team.

Sign-in, permissions, audit and approvals come from the platform packages. See the root `AGENTS.md` for the rules.

| File | What to change |
|---|---|
| `manifest.ts` | Description, owner team, permissions, role grants, conditions |
| `db/migrations/*.sql` | Tables. Every table: `platform.secure_table`, policies, `platform.classify` for every column |
| `lib/schema.ts` | Drizzle table + field classification (must match the migration) |
| `lib/actions.ts` | Reads (masked) and writes (`defineAction` only) |
| `tests/` | Allowed + denied test for every action, RLS tests |

Run: `pnpm --filter __TOOL__ dev` (port __PORT__). Check: `pnpm verify`.
