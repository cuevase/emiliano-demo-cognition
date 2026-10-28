---
name: add-role-or-permission
description: Add a permission to a tool or grant it to a role; change who can do what.
---
# Add a role or permission

- Tool permissions live in `apps/console/tools/<tool>/manifest.ts` (`permissions` + `roles`). `pnpm db:migrate` mirrors role→permission grants into `platform.role_permissions`, which RLS policies read via `app.has_permission`.
- Platform roles are fixed in `packages/permissions/src/roles.ts`. Adding a new role is a platform change: don't do it on a tool ticket; flag it in the PR.
- Use `conditions` for attribute rules (ownership, amount limits via `user.attributes.refund_limit_cents`, region) instead of new roles.
- Granting a role to a user happens in the console (`/admin/roles`); `admin` and `finance_approver` need a second admin's approval.
- Every permission must be used by an action or RLS policy (`pnpm check:permissions`). Call out every change to role grants in the PR description.
