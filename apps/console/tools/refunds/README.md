# Refunds

Generated with `pnpm new-tool refunds`. Owner: payments-ops. Lives inside the console at `/t/refunds`.

Sign-in, permissions, audit and approvals come from the platform packages. See the root `AGENTS.md` for the rules.

| File | What to change |
|---|---|
| `apps/console/tools/refunds/manifest.ts` | Description, owner team, permissions, role grants, conditions |
| `apps/console/tools/refunds/db/migrations/*.sql` | Tables. Every table: `platform.secure_table`, policies, `platform.classify` for every column |
| `apps/console/tools/refunds/lib/schema.ts` | Drizzle table + field classification (must match the migration) |
| `apps/console/tools/refunds/lib/actions.ts` | Reads (masked) and writes (`defineAction` only) |
| `apps/console/tools/refunds/tests/` | Allowed + denied test for every action, RLS tests |
| `apps/console/app/t/refunds/` | Pages, built from `@platform/ui` |

Run: `pnpm --filter console dev`, then open http://localhost:3000/t/refunds. Check: `pnpm verify`.

## Behaviour
- **Request + issue:** "New refund" calls `refunds.request` then `refunds.issue`. Under $500 issues immediately; $500+ opens an approval (`refunds:approve`) that a finance approver decides in the approvals inbox. Issuing only sets `status=issued` and a fake `SIM-XXXXXX` reference.
- **Metrics:** `computeMetrics` runs one SQL aggregate inside `platform.as`, so RLS limits it to readable rows; amount totals come back `null` unless the session has `refunds:pii.read`.
- **Seed data:** 40 fake requests (and approval requests for the pending ones) from two seed agents in `0001_refunds.sql`.
- **Permission sync:** `apps/console/manifest.ts` re-exports this manifest so `pnpm db:migrate` mirrors the grants into `platform.role_permissions` (the sync script only scans `apps/*/manifest.ts`).
