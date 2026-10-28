import { randomInt } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@platform/db";
import type { User } from "@platform/permissions";
import { platform } from "./platform";
import { REGIONS, refundRequests } from "./schema";

export { platform };
export * from "./queries";

/** Refunds at or above this amount need a finance approver (refunds:approve). */
export const APPROVAL_THRESHOLD_CENTS = 50_000;
export const RESOURCE_TYPE = "tool_refunds.refund_requests";

/** Fake payout reference; issuing never moves real money. */
export function simulatedReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `SIM-${Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("")}`;
}

const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Latest issue-approval request for a refund (visible to the requester, approvers and auditors). */
export async function latestApproval(tx: Tx, refundId: string) {
  const [row] = await tx.query<{ id: string; status: string }>(
    `select id, status from platform.approval_requests
     where app = 'refunds' and action = 'refunds.issue' and resource_id = $1
     order by created_at desc limit 1`,
    [refundId],
  );
  return row ?? null;
}

async function loadRefund(tx: Tx, id: string) {
  const [row] = await tx.db.select().from(refundRequests).where(eq(refundRequests.id, id));
  return row ?? null;
}

const refundRef = (row: NonNullable<Awaited<ReturnType<typeof loadRefund>>>) => ({
  type: RESOURCE_TYPE,
  id: row.id,
  data: { requested_by: row.requested_by, amount_cents: Number(row.amount_cents), status: row.status, order_id: row.order_id, region: row.region },
});

// ---- writes: always defineAction ----

/** Records a refund request. Use `submitRefund` to request and issue in one go. */
export const requestRefund = platform.defineAction({
  name: "refunds.request",
  permission: "refunds:request",
  input: z.object({
    customer_name: z.string().trim().min(2).max(200),
    customer_email: z.email(),
    order_id: z.string().trim().min(3).max(64),
    amount_cents: z.number().int().min(1).max(10_000_000),
    reason: z.string().trim().min(3).max(500),
    region: z.enum(REGIONS),
  }),
  redactInput: ["customer_name", "customer_email"],
  handler: async ({ input, user, tx }) => {
    const status = input.amount_cents >= APPROVAL_THRESHOLD_CENTS ? "pending_approval" : "requested";
    const [row] = await tx.db
      .insert(refundRequests)
      .values({ ...input, status, requested_by: user.id } as typeof refundRequests.$inferInsert)
      .returning({ id: refundRequests.id, status: refundRequests.status });
    return { id: row!.id, status: row!.status };
  },
});

/** Issues a refund (simulated). $500+ goes to a finance approver first; the requester can't approve. */
export const issueRefund = platform.defineAction({
  name: "refunds.issue",
  permission: "refunds:request",
  input: z.object({ id: z.uuid() }),
  resource: async (input, tx) => {
    const row = await loadRefund(tx, input.id);
    if (!row || (row.status !== "requested" && row.status !== "pending_approval")) return null;
    // One open approval per refund.
    if ((await latestApproval(tx, row.id))?.status === "pending") return null;
    return refundRef(row);
  },
  approval: {
    // Threshold uses the stored amount, never a client-supplied one.
    when: (_input, _user, resource) => Number(resource?.data?.amount_cents ?? 0) >= APPROVAL_THRESHOLD_CENTS,
    approverPermission: "refunds:approve",
    // No amount here: summaries show in the inbox and audit trail to roles that can't see amounts.
    summary: (_input, _user, resource) => `Refund of ${formatUsd(APPROVAL_THRESHOLD_CENTS)}+ for order ${String(resource?.data?.order_id ?? "")}`,
  },
  handler: async ({ input, user, tx }) => {
    const reference = simulatedReference();
    const approvedBy = user.attributes.approved_by ? String(user.attributes.approved_by) : null;
    const [row] = await tx.db
      .update(refundRequests)
      .set({ status: "issued", reference, decided_by: approvedBy, updated_at: new Date() })
      .where(and(eq(refundRequests.id, input.id), inArray(refundRequests.status, ["requested", "pending_approval"])))
      .returning({ id: refundRequests.id });
    if (!row) throw new Error("Refund is no longer open");
    return { id: row.id, status: "issued" as const, reference };
  },
});

/** Rejects a pending refund, and its open approval request if there is one. */
export const rejectRefund = platform.defineAction({
  name: "refunds.reject",
  permission: "refunds:approve",
  input: z.object({ id: z.uuid(), note: z.string().trim().max(500).optional() }),
  resource: async (input, tx) => {
    const row = await loadRefund(tx, input.id);
    return row && row.status === "pending_approval" ? refundRef(row) : null;
  },
  handler: async ({ input, user, tx, platform: p }) => {
    const approval = await latestApproval(tx, input.id);
    if (approval?.status === "pending") await p.approvals.decide(tx, user, approval.id, "reject", input.note);
    await tx.db
      .update(refundRequests)
      .set({ status: "rejected", decided_by: user.email, updated_at: new Date() })
      .where(and(eq(refundRequests.id, input.id), eq(refundRequests.status, "pending_approval")));
    return { id: input.id, status: "rejected" as const };
  },
});

type SubmitResult = Awaited<ReturnType<typeof issueRefund>> | Awaited<ReturnType<typeof requestRefund>>;

/** "New refund": records the request, then issues it (directly under $500, via approval at $500+). */
export async function submitRefund(
  user: User | null,
  raw: unknown,
  meta?: Parameters<typeof requestRefund>[2],
): Promise<Extract<SubmitResult, { ok: false }> | (Extract<SubmitResult, { ok: true }> & { id: string })> {
  const created = await requestRefund(user, raw, meta);
  if (!created.ok) return created;
  if (!("data" in created)) throw new Error("refunds.request never needs approval");
  const issued = await issueRefund(user, { id: created.data.id }, meta);
  return issued.ok ? { ...issued, id: created.data.id } : issued;
}
