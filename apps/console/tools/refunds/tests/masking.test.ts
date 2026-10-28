import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@platform/db";
import { makeUser, ownerQuery, registerManifests } from "../../../../../tests/helpers";
import { manifest } from "../manifest";
import { getRefund, listRefunds, submitRefund } from "../lib/actions";
import { input } from "./fixtures";

beforeAll(() => registerManifests(manifest));
afterAll(closePool);

describe("masking", () => {
  it.each(["support_agent", "ops_analyst"])("masks customer PII and amounts for %s", async (role) => {
    const rows = await listRefunds(await makeUser([role]));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.customer_email).toMatch(/^.•••@example\.com$/);
      expect(r.customer_name).toContain("•");
      expect(typeof r.amount_cents).toBe("string");
      expect(String(r.amount_cents)).toContain("•");
    }
  });

  it.each(["finance_approver", "auditor", "admin"])("shows PII and amounts unmasked to %s", async (role) => {
    const rows = await listRefunds(await makeUser([role]));
    expect(rows.every((r) => !r.customer_email.includes("•") && typeof r.amount_cents === "number")).toBe(true);
  });

  it("masks the detail view too, and audits unmasked views", async () => {
    const requester = await makeUser(["support_agent"]);
    const i = input();
    const r = await submitRefund(requester, i);
    if (!r.ok) throw new Error("submit failed");
    const own = await getRefund(requester, r.id);
    expect(own?.refund.customer_email).not.toBe(i.customer_email);
    const approver = await makeUser(["finance_approver"]);
    expect((await getRefund(approver, r.id))?.refund.customer_email).toBe(i.customer_email);
    const reads = await ownerQuery("select 1 from platform.audit_log where actor_id = $1 and action = 'tool_refunds.refund_requests.read'", [approver.id]);
    expect(reads).toHaveLength(1);
  });

  it("doesn't let masked roles search by customer PII", async () => {
    const requester = await makeUser(["support_agent"]);
    const i = input();
    await submitRefund(requester, i);
    expect(await listRefunds(requester, { q: i.customer_email })).toHaveLength(0);
    expect(await listRefunds(await makeUser(["finance_approver"]), { q: i.customer_email })).toHaveLength(1);
  });
});
