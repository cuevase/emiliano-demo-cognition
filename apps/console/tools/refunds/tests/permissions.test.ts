import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@platform/db";
import { makeUser, ownerQuery, registerManifests } from "../../../../../tests/helpers";
import { manifest } from "../manifest";
import { APPROVAL_THRESHOLD_CENTS, issueRefund, platform, rejectRefund, requestRefund, submitRefund } from "../lib/actions";
import { input, submitted } from "./fixtures";

beforeAll(() => registerManifests(manifest));
afterAll(closePool);

const refund = async (id: string) =>
  (await ownerQuery<{ status: string; reference: string | null; decided_by: string | null }>(
    "select status, reference, decided_by from tool_refunds.refund_requests where id = $1", [id]))[0];
const deniedAudits = (actorId: string) =>
  ownerQuery("select 1 from platform.audit_log where actor_id = $1 and outcome = 'denied'", [actorId]);

describe("refunds.request", () => {
  it("allows support_agent and admin", async () => {
    for (const role of ["support_agent", "admin"]) {
      const u = await makeUser([role]);
      expect(await requestRefund(u, input())).toMatchObject({ ok: true, data: { status: "requested" } });
    }
  });
  it.each(["ops_analyst", "auditor", "finance_approver", "viewer"])("denies %s and audits the denial", async (role) => {
    const u = await makeUser([role]);
    expect(await requestRefund(u, input())).toMatchObject({ ok: false, code: "forbidden" });
    expect(await deniedAudits(u.id)).toHaveLength(1);
  });
  it("denies anonymous callers", async () => {
    expect(await requestRefund(null, input())).toMatchObject({ ok: false, code: "unauthenticated" });
  });
  it("rejects invalid input", async () => {
    const u = await makeUser(["support_agent"]);
    expect(await requestRefund(u, input(0, { region: "MARS" }))).toMatchObject({ ok: false, code: "invalid" });
  });
  it("starts $500+ requests in pending_approval", async () => {
    const u = await makeUser(["support_agent"]);
    expect(await requestRefund(u, input(APPROVAL_THRESHOLD_CENTS))).toMatchObject({ ok: true, data: { status: "pending_approval" } });
  });
  it("redacts customer PII in the audit log", async () => {
    const u = await makeUser(["support_agent"]);
    const i = input();
    await requestRefund(u, i);
    const rows = await ownerQuery<{ t: string }>("select concat(before::text, after::text) t from platform.audit_log where actor_id = $1", [u.id]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r.t.includes(i.customer_email) && !r.t.includes(i.customer_name))).toBe(true);
  });
});

describe("refunds.issue", () => {
  it("allows the requester to issue under $500 immediately with a simulated reference", async () => {
    const { id, approvalId } = await submitted(APPROVAL_THRESHOLD_CENTS - 1);
    expect(approvalId).toBeNull();
    const row = await refund(id);
    expect(row?.status).toBe("issued");
    expect(row?.reference).toMatch(/^SIM-[A-Z0-9]{6}$/);
  });
  it("denies a support agent who didn't request it", async () => {
    const owner = await makeUser(["support_agent"]);
    const r = await requestRefund(owner, input());
    if (!r.ok || !("data" in r)) throw new Error("request failed");
    const other = await makeUser(["support_agent"]);
    expect(await issueRefund(other, { id: r.data.id })).toMatchObject({ ok: false, code: "forbidden" });
    expect((await refund(r.data.id))?.status).toBe("requested");
  });
  it.each(["ops_analyst", "auditor", "finance_approver"])("denies %s", async (role) => {
    const owner = await makeUser(["support_agent"]);
    const r = await requestRefund(owner, input());
    if (!r.ok || !("data" in r)) throw new Error("request failed");
    const u = await makeUser([role]);
    expect(await issueRefund(u, { id: r.data.id })).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("denies issuing a refund twice", async () => {
    const { requester, id } = await submitted();
    expect(await issueRefund(requester, { id })).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("approval path ($500+)", () => {
  it("sends exactly $500 for approval instead of issuing", async () => {
    const { id, approvalId } = await submitted(APPROVAL_THRESHOLD_CENTS);
    expect(approvalId).toBeTruthy();
    expect(await refund(id)).toMatchObject({ status: "pending_approval", reference: null });
  });
  it("doesn't open a second approval while one is pending", async () => {
    const { requester, id } = await submitted(APPROVAL_THRESHOLD_CENTS);
    expect(await issueRefund(requester, { id })).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("forbids the requester from approving, even as admin", async () => {
    const requester = await makeUser(["admin"]);
    const r = await submitRefund(requester, input(75_000));
    if (!r.ok || !("approvalId" in r)) throw new Error("expected approval");
    await expect(platform.as(requester, (tx) => platform.approvals.decide(tx, requester, r.approvalId, "approve"))).rejects.toThrow(/own request/);
  });
  it("forbids roles without refunds:approve", async () => {
    const { approvalId } = await submitted(75_000);
    for (const role of ["support_agent", "ops_analyst", "auditor"]) {
      const u = await makeUser([role]);
      await expect(platform.as(u, (tx) => platform.approvals.decide(tx, u, approvalId!, "approve"))).rejects.toThrow(/Forbidden|not found/);
    }
  });
  it("issues the refund once a finance approver approves", async () => {
    const { id, approvalId } = await submitted(75_000);
    const approver = await makeUser(["finance_approver"]);
    const d = await platform.as(approver, (tx) => platform.approvals.decide(tx, approver, approvalId!, "approve"));
    expect(d.status).toBe("executed");
    const row = await refund(id);
    expect(row).toMatchObject({ status: "issued", decided_by: approver.email });
    expect(row?.reference).toMatch(/^SIM-/);
  });
  it("lets an approver approve a seeded pending refund", async () => {
    const [seed] = await ownerQuery<{ id: string; refund_id: string }>(
      `select a.id, r.id::text refund_id from platform.approval_requests a
       join tool_refunds.refund_requests r on r.id::text = a.resource_id
       where a.app = 'refunds' and a.status = 'pending' and r.requested_by like 'seed-%' limit 1`);
    const approver = await makeUser(["finance_approver"]);
    const d = await platform.as(approver, (tx) => platform.approvals.decide(tx, approver, seed!.id, "approve"));
    expect(d.status).toBe("executed");
    expect((await refund(seed!.refund_id))?.status).toBe("issued");
  });
});

describe("refunds.reject", () => {
  it("allows a finance approver and rejects the open approval too", async () => {
    const { id, approvalId } = await submitted(60_000);
    const approver = await makeUser(["finance_approver"]);
    expect(await rejectRefund(approver, { id, note: "Outside policy" })).toMatchObject({ ok: true });
    expect(await refund(id)).toMatchObject({ status: "rejected", decided_by: approver.email });
    const [a] = await ownerQuery<{ status: string }>("select status from platform.approval_requests where id = $1", [approvalId]);
    expect(a?.status).toBe("rejected");
  });
  it("allows closing a refund whose approval was rejected in the inbox", async () => {
    const { id, approvalId } = await submitted(60_000);
    const approver = await makeUser(["finance_approver"]);
    await platform.as(approver, (tx) => platform.approvals.decide(tx, approver, approvalId!, "reject"));
    expect(await rejectRefund(approver, { id })).toMatchObject({ ok: true });
    expect((await refund(id))?.status).toBe("rejected");
  });
  it.each(["support_agent", "ops_analyst", "auditor"])("denies %s", async (role) => {
    const { id } = await submitted(60_000);
    const u = await makeUser([role]);
    expect(await rejectRefund(u, { id })).toMatchObject({ ok: false, code: "forbidden" });
    expect((await refund(id))?.status).toBe("pending_approval");
  });
  it("denies an admin rejecting their own request", async () => {
    const admin = await makeUser(["admin"]);
    const r = await submitRefund(admin, input(60_000));
    if (!r.ok) throw new Error("submit failed");
    expect(await rejectRefund(admin, { id: r.id })).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("denies rejecting an already-issued refund", async () => {
    const { id } = await submitted();
    const approver = await makeUser(["finance_approver"]);
    expect(await rejectRefund(approver, { id })).toMatchObject({ ok: false, code: "forbidden" });
  });
});
