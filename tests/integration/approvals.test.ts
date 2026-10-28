import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { closePool, withSystemTx } from "@platform/db";
import { verifyChain } from "@platform/audit";
import { createPlatform } from "@platform/actions/core";
import type { ToolManifest } from "@platform/permissions";
import { makeUser, ownerQuery, registerManifests } from "../helpers";

afterAll(closePool);

const manifest: ToolManifest = {
  name: "payouts", title: "Payouts", description: "test tool", ownerTeam: "platform", icon: "box",
  permissions: { "payouts:send": "Send payouts", "payouts:approve": "Approve large payouts" },
  roles: { support_agent: ["payouts:send"], finance_approver: ["payouts:approve"] },
};

let executions = 0;
const platform = createPlatform("payouts", [manifest]);
const send = platform.defineAction({
  name: "payouts.send",
  permission: "payouts:send",
  input: z.object({ amount: z.number().int().positive(), to: z.string() }),
  approval: { when: (i) => i.amount > 500, approverPermission: "payouts:approve", summary: (i) => `Pay ${i.amount} to ${i.to}` },
  handler: async ({ input }) => {
    executions += 1;
    return { id: randomUUID(), ...input };
  },
});

async function queue(amount = 900) {
  const requester = await makeUser(["support_agent"]);
  const res = await send(requester, { amount, to: "acct" });
  if (!res.ok || !("pending" in res)) throw new Error("expected pending approval");
  return { requester, id: res.approvalId };
}

beforeAll(() => registerManifests(manifest));

describe("approvals engine", () => {
  it("runs small actions directly and queues large ones", async () => {
    const u = await makeUser(["support_agent"]);
    const small = await send(u, { amount: 100, to: "a" });
    expect(small.ok && "data" in small).toBe(true);
    const big = await send(u, { amount: 900, to: "a" });
    expect(big.ok && "pending" in big).toBe(true);
  });

  it("forbids self-approval and approvers without permission", async () => {
    const { requester, id } = await queue();
    const outsider = await makeUser(["support_agent"]);
    await expect(platform.as(requester, (tx) => platform.approvals.decide(tx, requester, id, "approve"))).rejects.toThrow(/own request/);
    await expect(platform.as(outsider, (tx) => platform.approvals.decide(tx, outsider, id, "approve"))).rejects.toThrow(/Forbidden|not found/);
  });

  it("executes exactly once under concurrent approvals", async () => {
    const { id } = await queue();
    const approvers = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser(["finance_approver"])));
    const before = executions;
    const results = await Promise.allSettled(
      approvers.map((a) => platform.as(a, (tx) => platform.approvals.decide(tx, a, id, "approve"))),
    );
    expect(results.filter((r) => r.status === "fulfilled" && r.value.status === "executed")).toHaveLength(1);
    expect(executions - before).toBe(1);
    const [row] = await ownerQuery<{ status: string }>("select status from platform.approval_requests where id = $1", [id]);
    expect(row?.status).toBe("executed");
  });

  it("rejects and keeps state", async () => {
    const { id } = await queue();
    const approver = await makeUser(["finance_approver"]);
    const r = await platform.as(approver, (tx) => platform.approvals.decide(tx, approver, id, "reject", "no"));
    expect(r.status).toBe("rejected");
    await expect(platform.as(approver, (tx) => platform.approvals.decide(tx, approver, id, "approve"))).rejects.toThrow(/already/);
  });

  it("expires lazily on read and audits it", async () => {
    const { id } = await queue();
    await ownerQuery("update platform.approval_requests set expires_at = now() - interval '1 minute' where id = $1", [id]);
    const approver = await makeUser(["finance_approver"]);
    await expect(platform.as(approver, (tx) => platform.approvals.decide(tx, approver, id, "approve"))).rejects.toThrow(/expired/);
    const detail = await platform.as(approver, (tx) => platform.approvals.get(tx, id));
    expect(detail?.request.status).toBe("expired");
    const audits = await ownerQuery("select 1 from platform.audit_log where action = 'approval.expired' and resource_id = $1", [id]);
    expect(audits).toHaveLength(1);
  });

  it("blocks payload changes after the request is created", async () => {
    const { id } = await queue();
    await expect(ownerQuery("update platform.approval_requests set payload = '{\"amount\":1}' where id = $1", [id])).rejects.toThrow(/payload/);
  });

  it("leaves a valid audit chain", async () => {
    expect((await withSystemTx("test", randomUUID(), verifyChain)).ok).toBe(true);
  });
});
