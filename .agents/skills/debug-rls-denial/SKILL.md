---
name: debug-rls-denial
description: Diagnose "not found", empty lists, or "new row violates row-level security policy" errors in a tool.
---
# Debug an RLS denial

1. Check the audit log first: `/audit?actor=<email>` in the console, or `select * from platform.audit_log where outcome = 'denied' order by seq desc limit 20`. App-level denials record the permission and reason.
2. Reproduce as the user: `withTx({ userId, roles, requestId, app }, tx => tx.query(...))`. That runs as `app_rw` with the same session settings (`app.user_id`, `app.roles`) the app uses.
3. Check the grant is mirrored: `select * from platform.role_permissions where permission = '<tool>:read'`. Missing → run `pnpm db:migrate` (tests: `registerManifests(manifest)`).
4. Check the policy: `select * from pg_policies where schemaname = 'tool_<x>'`. Inserts need a `with check` that matches (e.g. `owner_id = app.user_id()`).
5. Never fix by disabling RLS, granting BYPASSRLS, or using `withSystemTx` in a tool. Fix the policy or the grant, and add a test for the case.
