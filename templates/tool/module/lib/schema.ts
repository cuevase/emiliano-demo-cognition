import { bigint, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { FieldClassification } from "@platform/permissions";

export const schema = pgSchema("__SCHEMA__");

export const items = schema.table("items", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  customer_email: text("customer_email").notNull(),
  amount_cents: bigint("amount_cents", { mode: "number" }).notNull(),
  status: text("status").notNull(),
  region: text("region").notNull(),
  owner_id: text("owner_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export type Item = typeof items.$inferSelect;

/** Must match platform.classify(...) in the migration. Drives server-side masking. */
export const itemClassification: FieldClassification = {
  customer_email: "pii",
  amount_cents: "sensitive",
};
