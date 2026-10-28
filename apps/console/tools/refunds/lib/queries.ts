import { z } from "zod";
import type { Tx } from "@platform/db";
import type { User } from "@platform/permissions";
import { platform } from "./platform";
import { REFUND_STATUSES, REGIONS, refundClassification, type RefundStatus } from "./schema";

const TOOL = "refunds";

export const filtersSchema = z.object({
  status: z.enum(REFUND_STATUSES).optional().catch(undefined),
  region: z.enum(REGIONS).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type RefundFilters = z.infer<typeof filtersSchema>;

export const parseFilters = (raw: Record<string, unknown>): RefundFilters =>
  filtersSchema.parse(Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v !== "")));

export type RefundRow = {
  id: string;
  customer_name: string;
  customer_email: string;
  order_id: string;
  /** A number, or a masked string for roles that can't see amounts. */
  amount_cents: number | string;
  reason: string;
  region: string;
  status: RefundStatus;
  reference: string | null;
  requested_by: string;
  requested_by_email: string | null;
  decided_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export interface RefundMetrics {
  total: number;
  pending_approval: number;
  issued: number;
  rejected: number;
  /** issued / (issued + rejected), as a percentage; null when nothing was decided yet. */
  approval_rate: number | null;
  /** Null for roles that can't see the amount field. */
  total_refunded_cents: number | null;
  avg_refund_cents: number | null;
}

export const canSeePii = (user: User | null) => platform.registry.can(user, `${TOOL}:pii.read`);
export const canSeeAmounts = (user: User | null) => canSeePii(user) || platform.registry.can(user, `${TOOL}:sensitive.read`);

/** Shared WHERE clause. Free-text search only covers PII columns for roles that can see PII. */
function whereClause(f: RefundFilters, piiSearch: boolean, params: unknown[]): string {
  const where: string[] = [];
  const add = (sql: (n: string) => string, v: unknown) => {
    params.push(v);
    where.push(sql(`$${params.length}`));
  };
  if (f.status) add((n) => `r.status = ${n}`, f.status);
  if (f.region) add((n) => `r.region = ${n}`, f.region);
  if (f.from) add((n) => `r.created_at >= ${n}::date`, f.from);
  if (f.to) add((n) => `r.created_at < ${n}::date + 1`, f.to);
  if (f.q) {
    const cols = ["r.order_id", "r.reason", "r.reference", ...(piiSearch ? ["r.customer_name", "r.customer_email"] : [])];
    add((n) => `(${cols.map((c) => `${c} ilike ${n}`).join(" or ")})`, `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }
  return where.length ? `where ${where.join(" and ")}` : "";
}

/**
 * Aggregates computed in SQL, inside the caller's RLS context: rows the user can't read don't
 * count, and amount totals come back null unless the session has refunds:pii.read (or sensitive.read).
 */
export async function computeMetrics(tx: Tx, f: RefundFilters = {}, piiSearch = false): Promise<RefundMetrics> {
  const params: unknown[] = [];
  const [m] = await tx.query<{
    total: number; pending_approval: number; issued: number; rejected: number;
    approval_rate: number | null; total_refunded_cents: number | null; avg_refund_cents: number | null;
  }>(
    `with v as (select app.has_permission('refunds:pii.read') or app.has_permission('refunds:sensitive.read') as amounts)
     select count(*)::int as total,
            count(*) filter (where r.status = 'pending_approval')::int as pending_approval,
            count(*) filter (where r.status = 'issued')::int as issued,
            count(*) filter (where r.status = 'rejected')::int as rejected,
            round(100.0 * count(*) filter (where r.status = 'issued')
                  / nullif(count(*) filter (where r.status in ('issued', 'rejected')), 0), 1)::float8 as approval_rate,
            case when (select amounts from v) then coalesce(sum(r.amount_cents) filter (where r.status = 'issued'), 0)::float8 end as total_refunded_cents,
            case when (select amounts from v) then round(avg(r.amount_cents) filter (where r.status = 'issued'))::float8 end as avg_refund_cents
     from tool_refunds.refund_requests r ${whereClause(f, piiSearch, params)}`,
    params,
  );
  return m!;
}

/** Dashboard metrics. Users without refunds:read get nothing. */
export async function getMetrics(user: User, f: RefundFilters = {}): Promise<RefundMetrics | null> {
  if (!platform.registry.can(user, `${TOOL}:read`)) return null;
  const m = await platform.as(user, (tx) => computeMetrics(tx, f, canSeePii(user)));
  return canSeeAmounts(user) ? m : { ...m, total_refunded_cents: null, avg_refund_cents: null };
}

const SELECT = `select r.id, r.customer_name, r.customer_email, r.order_id, r.amount_cents::float8 as amount_cents, r.reason,
                       r.region, r.status, r.reference, r.requested_by, u.email as requested_by_email, r.decided_by,
                       r.created_at, r.updated_at
                from tool_refunds.refund_requests r left join platform.users u on u.id = r.requested_by`;

const mask = (user: User, row: RefundRow) => platform.registry.mask(user, TOOL, row, refundClassification);

export async function listRefunds(user: User, f: RefundFilters = {}, limit = 200): Promise<RefundRow[]> {
  if (!platform.registry.can(user, `${TOOL}:read`)) return [];
  return platform.as(user, async (tx) => {
    const params: unknown[] = [];
    const where = whereClause(f, canSeePii(user), params);
    params.push(Math.min(limit, 500));
    const rows = await tx.query<RefundRow>(`${SELECT} ${where} order by r.created_at desc limit $${params.length}`, params);
    return rows.map((r) => mask(user, r));
  });
}

export async function getRefund(user: User, id: string) {
  if (!platform.registry.can(user, `${TOOL}:read`) || !z.uuid().safeParse(id).success) return null;
  return platform.as(user, async (tx) => {
    const [row] = await tx.query<RefundRow>(`${SELECT} where r.id = $1`, [id]);
    if (!row) return null;
    if (canSeePii(user)) await platform.auditRead(tx, user, "tool_refunds.refund_requests", id, "viewed unmasked");
    const [approval] = await tx.query<{ id: string; status: string }>(
      `select id, status from platform.approval_requests
       where app = 'refunds' and action = 'refunds.issue' and resource_id = $1 order by created_at desc limit 1`,
      [id],
    );
    return { refund: mask(user, row), approval: approval ?? null };
  });
}
