import type { Tx } from "@platform/db";

export interface AuditRow {
  id: string;
  seq: string;
  occurred_at: Date;
  request_id: string;
  kind: string;
  app: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_roles: string[] | null;
  action: string | null;
  outcome: string | null;
  resource_type: string | null;
  resource_id: string | null;
  before: unknown;
  after: unknown;
  changed: string[] | null;
  reason: string | null;
  metadata: unknown;
}

export interface AuditFilter {
  resourceType?: string;
  resourceId?: string;
  actor?: string;
  action?: string;
  app?: string;
  kind?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function queryAudit(tx: Tx, f: AuditFilter = {}): Promise<AuditRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (f.resourceType) add("resource_type = ?", f.resourceType);
  if (f.resourceId) add("resource_id = ?", f.resourceId);
  if (f.actor) {
    params.push(`%${f.actor}%`, f.actor);
    where.push(`(actor_email ilike $${params.length - 1} or actor_id = $${params.length})`);
  }
  if (f.action) add("action ilike ?", `%${f.action}%`);
  if (f.app) add("app = ?", f.app);
  if (f.kind) add("kind = ?", f.kind);
  if (f.from) add("occurred_at >= ?", f.from);
  if (f.to) add("occurred_at <= ?", f.to);
  params.push(Math.min(f.limit ?? 200, 1000));
  return tx.query<AuditRow & Record<string, unknown>>(
    `select id, seq, occurred_at, request_id, kind, app, actor_id, actor_email, actor_roles, action, outcome,
            resource_type, resource_id, before, after, changed, reason, metadata
     from platform.audit_log ${where.length ? `where ${where.join(" and ")}` : ""}
     order by seq desc limit $${params.length}`,
    params,
  );
}

export interface ChainStatus {
  ok: boolean;
  checked: number;
  brokenSeq: string | null;
  brokenId: string | null;
}

export async function verifyChain(tx: Tx): Promise<ChainStatus> {
  const [r] = await tx.query<{ ok: boolean; checked: string; broken_seq: string | null; broken_id: string | null }>(
    "select * from platform.verify_audit_chain()",
  );
  return { ok: !!r?.ok, checked: Number(r?.checked ?? 0), brokenSeq: r?.broken_seq ?? null, brokenId: r?.broken_id ?? null };
}

export function toCsv(rows: AuditRow[]): string {
  const cols = ["seq", "occurred_at", "kind", "app", "actor_email", "actor_id", "action", "outcome", "resource_type", "resource_id", "changed", "reason", "request_id"] as const;
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("|") : v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
