import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, withTx } from "@platform/db";
import { makeUser, registerManifests } from "../../../tests/helpers";
import { manifest } from "../manifest";
import { createItem } from "../lib/actions";

beforeAll(() => registerManifests(manifest));
afterAll(closePool);

const ctx = (userId: string | null, roles: string[]) => ({ userId, roles, requestId: randomUUID(), app: "__TOOL__" });

describe("__SCHEMA__.items row-level security (as app_rw)", () => {
  it("returns zero rows to users without __TOOL__:read", async () => {
    const owner = await makeUser(["support_agent"]);
    await createItem(owner, { title: "rls", customer_email: "a@b.co", amount_cents: 1 });
    const none = await withTx(ctx("nobody", []), (tx) => tx.query("select * from __SCHEMA__.items"));
    expect(none).toHaveLength(0);
    const some = await withTx(ctx(owner.id, ["support_agent"]), (tx) => tx.query("select * from __SCHEMA__.items"));
    expect(some.length).toBeGreaterThan(0);
  });
  it("blocks direct inserts that bypass permissions", async () => {
    await expect(
      withTx(ctx("x", ["viewer"]), (tx) => tx.query("insert into __SCHEMA__.items (title, customer_email, owner_id) values ('x','x@y.z','x')")),
    ).rejects.toThrow(/row-level security/);
  });
  it("writes a row-level audit entry for every change", async () => {
    const u = await makeUser(["support_agent"]);
    await createItem(u, { title: "audited", customer_email: "c@d.co", amount_cents: 5 });
    const rows = await withTx(ctx(u.id, ["auditor"]), (tx) =>
      tx.query<{ after: Record<string, unknown> }>("select after from platform.audit_log where kind = 'row' and resource_type = '__SCHEMA__.items' and actor_id = $1", [u.id]));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.after.customer_email).toBe("[redacted]");
  });
});
