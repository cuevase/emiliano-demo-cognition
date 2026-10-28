import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@platform/db";
import { makeUser, ownerQuery, registerManifests } from "../../../../../tests/helpers";
import { manifest } from "../manifest";
import { computeMetrics, getMetrics, listRefunds, platform } from "../lib/actions";
import { submitted } from "./fixtures";

beforeAll(async () => {
  await registerManifests(manifest);
  await submitted(4_200);
  await submitted(80_000);
});
afterAll(closePool);

async function truth(where = "true", params: unknown[] = []) {
  const [t] = await ownerQuery<{ total: number; pending: number; issued: number; rejected: number; sum: number; avg: number }>(
    `select count(*)::int total, count(*) filter (where status = 'pending_approval')::int pending,
            count(*) filter (where status = 'issued')::int issued, count(*) filter (where status = 'rejected')::int rejected,
            coalesce(sum(amount_cents) filter (where status = 'issued'), 0)::float8 sum,
            round(avg(amount_cents) filter (where status = 'issued'))::float8 avg
     from tool_refunds.refund_requests where ${where}`, params);
  return t!;
}

describe("refund metrics (SQL aggregates under RLS)", () => {
  it("match the database for a role that can see amounts", async () => {
    const t = await truth();
    expect(t.total).toBeGreaterThanOrEqual(40);
    const m = await getMetrics(await makeUser(["finance_approver"]));
    expect(m).toMatchObject({ total: t.total, pending_approval: t.pending, issued: t.issued, rejected: t.rejected, total_refunded_cents: t.sum, avg_refund_cents: t.avg });
    expect(m?.approval_rate).toBeCloseTo((100 * t.issued) / (t.issued + t.rejected), 1);
  });

  it("hide amount totals from roles that can't see the amount field", async () => {
    for (const role of ["support_agent", "ops_analyst"]) {
      const m = await getMetrics(await makeUser([role]));
      expect(m?.total).toBeGreaterThan(0);
      expect(m?.total_refunded_cents).toBeNull();
      expect(m?.avg_refund_cents).toBeNull();
    }
    for (const role of ["auditor", "admin"]) expect((await getMetrics(await makeUser([role])))?.total_refunded_cents).not.toBeNull();
  });

  it("null amount totals in SQL itself when the session lacks the permission", async () => {
    const u = await makeUser(["ops_analyst"]);
    const m = await platform.as(u, (tx) => computeMetrics(tx));
    expect(m.total).toBeGreaterThan(0);
    expect(m.total_refunded_cents).toBeNull();
  });

  it("give nothing to users without refunds:read", async () => {
    for (const roles of [[], ["viewer"]]) {
      const u = await makeUser(roles);
      expect(await getMetrics(u)).toBeNull();
      expect(await listRefunds(u)).toEqual([]);
      // Even bypassing the app-level check, RLS leaves the aggregates empty.
      const raw = await platform.as(u, (tx) => computeMetrics(tx));
      expect(raw).toMatchObject({ total: 0, issued: 0, pending_approval: 0, total_refunded_cents: null });
    }
  });

  it("apply the same filters as the table", async () => {
    const u = await makeUser(["finance_approver"]);
    const f = { region: "EU" as const, status: "issued" as const };
    const t = await truth("region = 'EU' and status = 'issued'");
    expect(await getMetrics(u, f)).toMatchObject({ total: t.total, total_refunded_cents: t.sum });
    expect(await listRefunds(u, f)).toHaveLength(t.total);
  });

  it("filter by date range", async () => {
    const u = await makeUser(["ops_analyst"]);
    const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const t = await truth("created_at >= $1::date", [from]);
    expect((await getMetrics(u, { from }))?.total).toBe(t.total);
    expect((await listRefunds(u, { from })).every((r) => r.created_at >= new Date(from))).toBe(true);
  });
});
