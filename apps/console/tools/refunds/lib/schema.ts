import { bigint, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { FieldClassification } from "@platform/permissions";

export const schema = pgSchema("tool_refunds");

export const REFUND_STATUSES = ["requested", "pending_approval", "issued", "rejected"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const REGIONS = ["US", "EU", "UK", "APAC", "LATAM"] as const;
export type Region = (typeof REGIONS)[number];

export const refundRequests = schema.table("refund_requests", {
  id: uuid("id").primaryKey(),
  customer_name: text("customer_name").notNull(),
  customer_email: text("customer_email").notNull(),
  order_id: text("order_id").notNull(),
  amount_cents: bigint("amount_cents", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  region: text("region").notNull(),
  status: text("status").notNull(),
  reference: text("reference"),
  requested_by: text("requested_by").notNull(),
  decided_by: text("decided_by"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/** Must match platform.classify(...) in the migration. Drives server-side masking. */
export const refundClassification: FieldClassification = {
  customer_name: "pii",
  customer_email: "pii",
  amount_cents: "sensitive",
};
