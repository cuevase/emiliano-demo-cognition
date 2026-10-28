import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, withTx } from "@platform/db";
import { makeUser, registerManifests } from "../../../../../tests/helpers";
import { manifest } from "../manifest";
import { submitted } from "./fixtures";

beforeAll(() => registerManifests(manifest));
afterAll(closePool);

const ctx = (userId: string | null, roles: string[]) => ({ userId, roles, requestId: randomUUID(), app: "refunds" });
const insert = `insert into tool_refunds.refund_requests (customer_name, customer_email, order_id, amount_cents, reason, region, status, reference, requested_by)
                values ('X', 'x@example.com', 'ORD-1', $1, 'r', 'US', $2, $3, $4)`;

describe("tool_refunds.refund_requests row-level security (as app_rw)", () => {
  it("returns zero rows to users without refunds:read", async () => {
    expect(await withTx(ctx("nobody", []), (tx) => tx.query("select * from tool_refunds.refund_requests"))).toHaveLength(0);
    expect(await withTx(ctx("v", ["viewer"]), (tx) => tx.query("select * from tool_refunds.refund_requests"))).toHaveLength(0);
    expect((await withTx(ctx("o", ["ops_analyst"]), (tx) => tx.query("select * from tool_refunds.refund_requests"))).length).toBeGreaterThan(0);
  });
  it("blocks direct inserts that skip approval or claim to be issued", async () => {
    const u = await makeUser(["support_agent"]);
    await expect(withTx(ctx(u.id, u.roles), (tx) => tx.query(insert, [90_000, "requested", null, u.id]))).rejects.toThrow(/row-level security/);
    await expect(withTx(ctx(u.id, u.roles), (tx) => tx.query(insert, [100, "issued", "SIM-AAAAAA", u.id]))).rejects.toThrow(/row-level security/);
    await expect(withTx(ctx("v", ["viewer"]), (tx) => tx.query(insert, [100, "requested", null, "v"]))).rejects.toThrow(/row-level security/);
  });
  it("blocks a requester from issuing a $500+ refund directly", async () => {
    const { requester, id } = await submitted(70_000);
    await expect(withTx(ctx(requester.id, requester.roles), (tx) =>
      tx.query("update tool_refunds.refund_requests set status = 'issued', reference = 'SIM-BBBBBB' where id = $1", [id]))).rejects.toThrow(/row-level security/);
  });
  it("writes a redacted row-level audit entry for every change", async () => {
    const { requester, id } = await submitted();
    const rows = await withTx(ctx(requester.id, ["auditor"]), (tx) =>
      tx.query<{ action: string; after: Record<string, unknown> }>("select action, after from platform.audit_log where kind = 'row' and resource_id = $1 order by seq", [id]));
    expect(rows.map((r) => r.action)).toEqual(["insert", "update"]);
    expect(rows[0]?.after.customer_email).toBe("[redacted]");
    expect(rows[0]?.after.customer_name).toBe("[redacted]");
  });
});
