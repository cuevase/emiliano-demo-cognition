import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { User } from "@platform/permissions";
import type { Tx } from "@platform/db";
import { platform } from "./platform";
import { itemClassification, items, type Item } from "./schema";

export { platform };

/** Changes at or above this amount need a second person with __TOOL__:approve. */
export const APPROVAL_THRESHOLD_CENTS = 50_000;

// ---- reads (RLS-filtered, masked server-side) ----
export async function listItems(user: User): Promise<Item[]> {
  return platform.as(user, async (tx) => {
    const rows = await tx.db.select().from(items).orderBy(desc(items.created_at)).limit(200);
    return rows.map((r) => platform.registry.mask(user, "__TOOL__", r, itemClassification));
  });
}

export async function getItem(user: User, id: string) {
  return platform.as(user, async (tx) => {
    const [row] = await tx.db.select().from(items).where(eq(items.id, id));
    if (!row) return null;
    if (platform.registry.can(user, "__TOOL__:pii.read")) await platform.auditRead(tx, user, "__SCHEMA__.items", id, "viewed unmasked");
    return platform.registry.mask(user, "__TOOL__", row, itemClassification);
  });
}

async function loadItem(tx: Tx, id: string) {
  const [row] = await tx.db.select().from(items).where(eq(items.id, id));
  return row ? { type: "__SCHEMA__.items", id: row.id, data: { owner_id: row.owner_id, amount_cents: row.amount_cents, region: row.region } } : null;
}

// ---- writes: always defineAction ----
export const createItem = platform.defineAction({
  name: "__TOOL__.create",
  permission: "__TOOL__:create",
  input: z.object({
    title: z.string().min(3).max(200),
    customer_email: z.email(),
    amount_cents: z.number().int().min(0).max(100_000_000),
  }),
  redactInput: ["customer_email"],
  handler: async ({ input, user, tx }) => {
    const [row] = await tx.db.insert(items).values({ ...input, owner_id: user.id } as typeof items.$inferInsert).returning({ id: items.id });
    return { id: row!.id };
  },
});

export const updateStatus = platform.defineAction({
  name: "__TOOL__.update_status",
  permission: "__TOOL__:update",
  input: z.object({ id: z.uuid(), status: z.enum(["open", "in_progress", "closed"]), amount_cents: z.number().int().min(0) }),
  resource: (input, tx) => loadItem(tx, input.id),
  approval: {
    when: (input) => input.status === "closed" && input.amount_cents >= APPROVAL_THRESHOLD_CENTS,
    approverPermission: "__TOOL__:approve",
    summary: (input) => `Close __TITLE__ item ${input.id.slice(0, 8)} (${(input.amount_cents / 100).toFixed(2)} USD)`,
  },
  handler: async ({ input, tx }) => {
    await tx.db.update(items).set({ status: input.status, updated_at: new Date() }).where(eq(items.id, input.id));
    return { id: input.id, status: input.status };
  },
});
