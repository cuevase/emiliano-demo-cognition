// Workaround: packages/db/scripts/sync-permissions.ts only loads apps/<app>/manifest.ts, not
// apps/console/tools/<tool>/manifest.ts, so tool grants never reach platform.role_permissions
// (RLS would hide every row). Re-exporting here gets the refunds grants mirrored on migrate.
// Remove once the platform scans apps/console/tools/*/manifest.ts.
export { manifest } from "./tools/refunds/manifest";
