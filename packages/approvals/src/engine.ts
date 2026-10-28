import type { Tx } from "@platform/db";
import { redact, writeAuditEvent } from "@platform/audit";
import { Forbidden, type PermissionRegistry, type User } from "@platform/permissions";
import { payloadHash } from "./hash";

export type ApprovalStatus = "pending" | "approved" | "executed" | "rejected" | "expired" | "cancelled" | "failed";

export interface ApprovalRequest {
  id: string;
  app: string;
  action: string;
  approver_permission: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  resource_type: string | null;
  resource_id: string | null;
  summary: string | null;
  requested_by: string;
  requested_by_email: string | null;
  status: ApprovalStatus;
  approvals_required: number;
  created_at: Date;
  expires_at: Date;
  decided_at: Date | null;
  executed_at: Date | null;
  result: unknown;
  error: string | null;
}

export interface ApprovalDecision {
  approver_id: string;
  approver_email: string | null;
  decision: "approve" | "reject";
  comment: string | null;
  decided_at: Date;
}

export interface ExecuteContext {
  tx: Tx;
  payload: Record<string, unknown>;
  request: ApprovalRequest;
  approver: User;
}

export type ApprovalHandler = (ctx: ExecuteContext) => Promise<unknown>;

export class ApprovalError extends Error {
  constructor(message: string, public code: "not_found" | "not_pending" | "already_decided" | "expired" | "tampered") {
    super(message);
    this.name = "ApprovalError";
  }
}

export interface HandlerOptions {
  /** Payload keys to redact from the audit record written on execution. */
  redactInput?: string[];
}

export class ApprovalEngine {
  private handlers = new Map<string, { handler: ApprovalHandler; options: HandlerOptions }>();

  constructor(private registry: PermissionRegistry) {}

  register(app: string, action: string, handler: ApprovalHandler, options: HandlerOptions = {}): void {
    this.handlers.set(`${app}:${action}`, { handler, options });
  }

  async request(
    tx: Tx,
    user: User,
    input: {
      app: string;
      action: string;
      approverPermission: string;
      payload: Record<string, unknown>;
      summary: string;
      resourceType?: string;
      resourceId?: string;
      approvalsRequired?: number;
      ttlHours?: number;
    },
  ): Promise<ApprovalRequest> {
    if (!this.registry.permissions.has(input.approverPermission)) throw new Error(`unknown approver permission ${input.approverPermission}`);
    const [row] = await tx.query<ApprovalRequest & Record<string, unknown>>(
      `insert into platform.approval_requests
         (app, action, approver_permission, payload, payload_hash, resource_type, resource_id, summary,
          requested_by, requested_by_email, approvals_required, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() + make_interval(hours => $12))
       returning *`,
      [
        input.app, input.action, input.approverPermission, JSON.stringify(input.payload), payloadHash(input.payload),
        input.resourceType ?? null, input.resourceId ?? null, input.summary, user.id, user.email,
        input.approvalsRequired ?? 1, input.ttlHours ?? 72,
      ],
    );
    if (!row) throw new Error("approval request insert failed");
    await writeAuditEvent(tx, {
      kind: "action", action: "approval.requested", outcome: "pending_approval",
      actor: { id: user.id, email: user.email, roles: user.roles },
      resourceType: "platform.approval_request", resourceId: row.id,
      metadata: { for_action: `${input.app}:${input.action}`, resource_type: input.resourceType, resource_id: input.resourceId },
      reason: input.summary,
    });
    return row;
  }

  /** Lazy expiry: overdue pending requests visible in this transaction become `expired`, with an audit row each. */
  async expireOverdue(tx: Tx, id?: string): Promise<number> {
    const expired = await tx.query<{ id: string; requested_by: string }>(
      `update platform.approval_requests set status = 'expired', decided_at = now()
       where status = 'pending' and expires_at <= now() ${id ? "and id = $1" : ""}
       returning id, requested_by`,
      id ? [id] : [],
    );
    for (const r of expired) {
      await writeAuditEvent(tx, {
        kind: "system", action: "approval.expired", outcome: "success",
        actor: { id: "system", email: null, roles: [] },
        resourceType: "platform.approval_request", resourceId: r.id,
        reason: "expired before a decision (checked lazily on read)",
      });
    }
    return expired.length;
  }

  async get(tx: Tx, id: string): Promise<{ request: ApprovalRequest; decisions: ApprovalDecision[] } | null> {
    await this.expireOverdue(tx, id);
    const [request] = await tx.query<ApprovalRequest & Record<string, unknown>>("select * from platform.approval_requests where id = $1", [id]);
    if (!request) return null;
    const decisions = await tx.query<ApprovalDecision & Record<string, unknown>>(
      "select approver_id, approver_email, decision, comment, decided_at from platform.approval_decisions where request_id = $1 order by decided_at",
      [id],
    );
    return { request, decisions };
  }

  /** Requests this user can act on (approver permission, not their own) plus their own. */
  async inbox(tx: Tx, user: User, opts: { status?: ApprovalStatus | "all"; app?: string } = {}) {
    await this.expireOverdue(tx);
    const rows = await tx.query<ApprovalRequest & Record<string, unknown>>(
      `select * from platform.approval_requests
       where ($1::text = 'all' or status = $1) and ($2::text is null or app = $2)
       order by created_at desc limit 200`,
      [opts.status ?? "pending", opts.app ?? null],
    );
    return rows.map((r) => ({
      ...r,
      canDecide: r.status === "pending" && r.requested_by !== user.id && this.registry.can(user, r.approver_permission, r.payload),
      isMine: r.requested_by === user.id,
    }));
  }

  async decide(tx: Tx, user: User, id: string, decision: "approve" | "reject", comment?: string) {
    await this.expireOverdue(tx, id);
    const [req] = await tx.query<ApprovalRequest & Record<string, unknown>>(
      "select * from platform.approval_requests where id = $1 for update",
      [id],
    );
    if (!req) throw new ApprovalError("Approval request not found", "not_found");
    // Returned rather than thrown so the lazy expiry above commits with this transaction.
    if (req.status === "expired") return { status: "expired" as ApprovalStatus };
    if (req.status !== "pending") throw new ApprovalError(`Request is already ${req.status}`, "not_pending");
    if (req.requested_by === user.id) throw new Forbidden(req.approver_permission, "requester cannot approve their own request");
    this.registry.assert(user, req.approver_permission, req.payload);
    if (payloadHash(req.payload) !== req.payload_hash) throw new ApprovalError("Payload hash mismatch", "tampered");

    const inserted = await tx.query(
      `insert into platform.approval_decisions (request_id, approver_id, approver_email, decision, comment)
       values ($1,$2,$3,$4,$5) on conflict (request_id, approver_id) do nothing returning id`,
      [id, user.id, user.email, decision, comment ?? null],
    );
    if (inserted.length === 0) throw new ApprovalError("You already decided on this request", "already_decided");

    const actor = { id: user.id, email: user.email, roles: user.roles };
    await writeAuditEvent(tx, {
      kind: "action", action: `approval.${decision === "approve" ? "approved" : "rejected"}`, outcome: "success", actor,
      resourceType: "platform.approval_request", resourceId: id, reason: comment ?? null,
      metadata: { for_action: `${req.app}:${req.action}`, payload_hash: req.payload_hash },
    });

    if (decision === "reject") {
      await tx.query("update platform.approval_requests set status = 'rejected', decided_at = now() where id = $1 and status = 'pending'", [id]);
      return { status: "rejected" as ApprovalStatus };
    }

    const [{ n } = { n: "0" }] = await tx.query<{ n: string }>(
      "select count(*)::text as n from platform.approval_decisions where request_id = $1 and decision = 'approve'",
      [id],
    );
    if (Number(n) < req.approvals_required) return { status: "pending" as ApprovalStatus };

    const claimed = await tx.query(
      "update platform.approval_requests set status = 'approved', decided_at = now() where id = $1 and status = 'pending' returning id",
      [id],
    );
    if (claimed.length === 0) throw new ApprovalError("Request was decided concurrently", "not_pending");
    return this.execute(tx, user, { ...req, status: "approved" });
  }

  private async execute(tx: Tx, approver: User, req: ApprovalRequest) {
    const entry = this.handlers.get(`${req.app}:${req.action}`);
    const handler = entry?.handler;
    await tx.query("savepoint approval_execute");
    try {
      if (!handler) throw new Error(`no handler registered for ${req.app}:${req.action}`);
      // The approval itself authorizes the write, so it runs with the platform system role.
      await tx.query("select set_config('app.roles', $1, true), set_config('app.app', $2, true)", [`{${[...approver.roles, "platform_system"].join(",")}}`, req.app]);
      const result = await handler({ tx, payload: req.payload, request: req, approver });
      await tx.query("select set_config('app.roles', $1, true)", [`{${approver.roles.join(",")}}`]);
      await tx.query("release savepoint approval_execute");
      await tx.query(
        "update platform.approval_requests set status = 'executed', executed_at = now(), result = $2 where id = $1 and status = 'approved'",
        [req.id, JSON.stringify(result ?? null)],
      );
      await writeAuditEvent(tx, {
        kind: "action", action: `${req.action}`, outcome: "success",
        actor: { id: approver.id, email: approver.email, roles: approver.roles },
        resourceType: req.resource_type, resourceId: req.resource_id,
        after: redact(req.payload, entry?.options.redactInput), metadata: { approval_request_id: req.id, requested_by: req.requested_by_email },
      });
      return { status: "executed" as ApprovalStatus, result };
    } catch (err) {
      await tx.query("rollback to savepoint approval_execute");
      await tx.query("select set_config('app.roles', $1, true)", [`{${approver.roles.join(",")}}`]);
      const message = (err as Error).message;
      await tx.query("update platform.approval_requests set status = 'failed', error = $2 where id = $1 and status = 'approved'", [req.id, message]);
      await writeAuditEvent(tx, {
        kind: "action", action: req.action, outcome: "error",
        actor: { id: approver.id, email: approver.email, roles: approver.roles },
        resourceType: req.resource_type, resourceId: req.resource_id, reason: message,
        metadata: { approval_request_id: req.id },
      });
      return { status: "failed" as ApprovalStatus, error: message };
    }
  }

  async cancel(tx: Tx, user: User, id: string): Promise<void> {
    await this.expireOverdue(tx, id);
    const updated = await tx.query(
      "update platform.approval_requests set status = 'cancelled', decided_at = now() where id = $1 and requested_by = $2 and status = 'pending' returning id",
      [id, user.id],
    );
    if (updated.length === 0) throw new ApprovalError("Only the requester can cancel a pending request", "not_pending");
    await writeAuditEvent(tx, {
      kind: "action", action: "approval.cancelled", outcome: "success",
      actor: { id: user.id, email: user.email, roles: user.roles },
      resourceType: "platform.approval_request", resourceId: id,
    });
  }
}
