import { makeUser } from "../../../../../tests/helpers";
import { submitRefund } from "../lib/actions";

export const input = (amount_cents = 2_500, extra: Record<string, unknown> = {}) => ({
  customer_name: "Pat Fakeperson",
  customer_email: `pat.${Math.random().toString(36).slice(2, 8)}@example.com`,
  order_id: `ORD-T${Math.floor(Math.random() * 1e6)}`,
  amount_cents,
  reason: "Item arrived damaged",
  region: "US",
  ...extra,
});

/** A support agent submits a refund; returns the requester, refund id and (if any) approval id. */
export async function submitted(amount_cents = 2_500) {
  const requester = await makeUser(["support_agent"]);
  const r = await submitRefund(requester, input(amount_cents));
  if (!r.ok) throw new Error(`submit failed: ${r.error}`);
  return { requester, id: r.id, approvalId: "approvalId" in r ? r.approvalId : null };
}
