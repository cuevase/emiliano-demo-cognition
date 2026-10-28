import type { Tx } from "@platform/db";

export type AuditOutcome = "success" | "denied" | "invalid" | "pending_approval" | "error";

export interface AuditEvent {
  kind: "action" | "auth" | "system";
  action: string;
  outcome: AuditOutcome;
  actor?: { id: string | null; email?: string | null; roles?: string[] };
  resourceType?: string | null;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

const SENSITIVE_KEY = /(ssn|social|tax_?id|dob|birth|card|pan|iban|account_?number|routing|password|secret|token)/i;

/** Masks values of keys that look sensitive, plus any keys the caller lists explicitly. */
export function redact(value: unknown, extraKeys: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v, extraKeys));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) || extraKeys.includes(k) ? "[redacted]" : redact(v, extraKeys);
    }
    return out;
  }
  return value;
}

export async function writeAuditEvent(tx: Tx, e: AuditEvent): Promise<void> {
  await tx.query(
    `insert into platform.audit_log
       (request_id, kind, app, actor_id, actor_email, actor_roles, action, outcome,
        resource_type, resource_id, before, after, reason, metadata, ip, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      tx.ctx.requestId,
      e.kind,
      tx.ctx.app,
      e.actor?.id ?? tx.ctx.userId,
      e.actor?.email ?? null,
      e.actor?.roles ?? tx.ctx.roles,
      e.action,
      e.outcome,
      e.resourceType ?? null,
      e.resourceId ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      e.reason ?? null,
      e.metadata ? JSON.stringify(e.metadata) : null,
      e.ip ?? null,
      e.userAgent ?? null,
    ],
  );
}
