# AGENTS.md — Internal Tools Platform

You are working in a paved-road monorepo. Every internal tool gets sign-in, permissions, audit and approvals from `packages/*`. Your job on a tool ticket is the tool's domain logic, not those four things.

## Layout
- `packages/auth`: `getCurrentUser()` / `requireUser()`. Neon Auth (Google/email) plus demo personas when `DEMO_MODE=true`. Never read cookies or sessions directly.
- `packages/permissions`: roles, permissions (`<tool>:<verb>`), conditions, `registry.mask()` for PII/sensitive fields.
- `packages/audit`: append-only, hash-chained `platform.audit_log`. Row triggers + action events.
- `packages/approvals`: generic approval requests. Lazy expiry (no cron).
- `packages/actions`: `defineAction()`. The only way to write data.
- `packages/db`: `withTx` (runs as `app_rw`, which can't bypass RLS) and migrations.
- `packages/ui`: `AppShell`, `DataTable`, `QueueView`, `RecordDetail`, `Form`, `MaskedField`, `RoleGate`, `ApprovalBanner`, `AuditTrail`.
- `apps/console`: platform console (approvals inbox, audit viewer, roles).
- `apps/<tool>`: one Next.js app per tool, created from `templates/tool`.

## Hard rules (CI enforces them)
1. **Every write is a `defineAction`** with a declared `permission`. Never call `tx.db.insert/update/delete` outside a handler. Never import `pg` or `withSystemTx` in a tool.
2. **Every read goes through `platform.as(user, …)`** so RLS applies, and every returned record goes through `platform.registry.mask(...)`.
3. **Every table**: `select platform.secure_table('<schema>', '<table>')`, explicit RLS policies using `app.has_permission(...)`, and `platform.classify(...)` for **every column** (`public` | `sensitive` | `pii`). `pnpm check:rls` fails otherwise.
4. **Every action has tests**: a `describe("<action name>")` block with at least one allowed and one denied case. `pnpm check:permissions` fails otherwise.
5. **Money movement, privileged changes or anything irreversible above a threshold uses `approval`** in `defineAction`. The requester can never approve; the engine enforces it.
6. Don't edit `packages/*` or `packages/db/migrations` on a tool ticket. If the platform is missing something, stop and say so in the PR.
7. Never put secrets, real customer data or real PII in code, fixtures or tests.

## Workflow
- New tool: `pnpm new-tool <name>` → see `.agents/skills/create-internal-tool`.
- Local DB: Postgres on `localhost:5432` (`DATABASE_URL` in `.env`). `pnpm db:migrate` applies `packages/db/migrations` then `apps/*/db/migrations`.
- Before every PR: `pnpm verify` (lint, typecheck, migrate, tests, permission + RLS coverage, build).
- PR description: list new permissions, which roles get them, new PII/sensitive fields, and which actions need approval.

## Skills
`create-internal-tool`, `add-audited-action`, `add-approval-flow`, `add-role-or-permission`, `debug-rls-denial` in `.agents/skills/`.
