import { randomUUID } from "node:crypto";
import pg from "pg";
import { withSystemTx } from "@platform/db";
import type { ToolManifest, User } from "@platform/permissions";
import { syncRolePermissions } from "../packages/db/scripts/sync-permissions";

export function testDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set by global setup");
  return url;
}

/** Owner connection, for assertions that must bypass RLS. */
export async function ownerQuery<R extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<R[]> {
  const c = new pg.Client({ connectionString: testDbUrl() });
  await c.connect();
  try {
    return (await c.query<R>(text, params)).rows;
  } finally {
    await c.end();
  }
}

export async function makeUser(roles: string[], attributes: Record<string, unknown> = {}): Promise<User> {
  const id = `test-${randomUUID()}`;
  const user: User = { id, email: `${id}@test.internal`, name: id, roles, attributes };
  await withSystemTx("test", randomUUID(), async (tx) => {
    await tx.query("insert into platform.users (id, email, name, attributes) values ($1,$2,$3,$4)", [id, user.email, id, JSON.stringify(attributes)]);
    for (const r of roles) await tx.query("insert into platform.user_roles (user_id, role) values ($1,$2)", [id, r]);
  });
  return user;
}

const testManifests = new Map<string, ToolManifest>();

/** Mirrors test-only tool manifests into platform.role_permissions so RLS sees them. */
export async function registerManifests(...manifests: ToolManifest[]): Promise<void> {
  for (const m of manifests) testManifests.set(m.name, m);
  const c = new pg.Client({ connectionString: testDbUrl() });
  await c.connect();
  try {
    await syncRolePermissions(c, [...testManifests.values()]);
  } finally {
    await c.end();
  }
}
