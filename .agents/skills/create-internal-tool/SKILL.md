---
name: create-internal-tool
description: Scaffold and build a new internal tool on the platform from a ticket (queue, dashboard, admin panel). Use for any "build a tool for X" request.
---
# Create an internal tool

1. Read `AGENTS.md`. Identify from the ticket: entities and fields, who can read/create/change/approve, which fields are PII or sensitive, what needs approval and at what threshold.
2. `pnpm new-tool <name>` (kebab-case). It creates `apps/<name>`, registers it in the console and installs deps.
3. `manifest.ts`: real description and owner team; permissions as `<name>:<verb>`; map them to existing roles (`viewer`, `support_agent`, `ops_analyst`, `finance_approver`, `admin`, `auditor`). Add `conditions` for ownership/amount/region rules.
4. `db/migrations/0001_<name>.sql`: replace `items` with the real tables in schema `tool_<snake>`. For each table: `platform.secure_table`, policies with `app.has_permission`, `platform.classify` for every column.
5. `lib/schema.ts`: Drizzle tables + `FieldClassification` matching the migration.
6. `lib/actions.ts`: masked reads via `platform.as`; every write as `platform.defineAction` (see `add-audited-action`, `add-approval-flow`).
7. UI from `@platform/ui`: `QueueView`/`DataTable` for lists, `RecordDetail` + `AuditTrail` for detail, `Form` for input, `RoleGate` to hide controls the user can't use (the server still enforces).
8. Tests in `apps/<name>/tests`: allowed + denied per action, approval path, masking, RLS zero-rows for an unauthorized role. Update `e2e/smoke.spec.ts`.
9. `pnpm db:migrate && pnpm verify`. Fix until green. Open a PR listing permissions, role grants, PII fields and approval rules.
