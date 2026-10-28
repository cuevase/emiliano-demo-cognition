import { existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type pg from "pg";
import { PermissionRegistry, type ToolManifest } from "@platform/permissions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function loadManifests(): Promise<ToolManifest[]> {
  const manifests: ToolManifest[] = [];
  // Tools live in apps/console/tools/<tool>; apps/<app>/manifest.ts is kept for standalone apps.
  for (const base of [join(root, "apps"), join(root, "apps/console/tools")]) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base).sort()) {
      const file = join(base, dir, "manifest.ts");
      if (existsSync(file)) manifests.push((await import(pathToFileURL(file).href)).manifest as ToolManifest);
    }
  }
  return manifests;
}

/** Mirrors the code-defined role -> permission map into Postgres for RLS policies. */
export async function syncRolePermissions(client: pg.Client, extra: ToolManifest[] = []): Promise<void> {
  const registry = new PermissionRegistry([...(await loadManifests()), ...extra]);
  const rows = registry.rolePermissionRows();
  await client.query("begin");
  try {
    await client.query("delete from platform.role_permissions");
    await client.query(
      `insert into platform.role_permissions (role, permission)
       select * from unnest($1::text[], $2::text[])`,
      [rows.map((r) => r.role), rows.map((r) => r.permission)],
    );
    await client.query("commit");
    console.log(`synced ${rows.length} role permissions`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
