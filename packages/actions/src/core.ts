import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { withTx, type DbContext, type Tx } from "@platform/db";
import { redact, writeAuditEvent } from "@platform/audit";
import { ApprovalEngine, ApprovalError } from "@platform/approvals";
import { Forbidden, PermissionRegistry, type ToolManifest, type User } from "@platform/permissions";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: true; pending: true; approvalId: string; message: string }
  | { ok: false; code: "unauthenticated" | "forbidden" | "invalid" | "error"; error: string; issues?: Record<string, string[]> };

export interface RequestMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

export interface ActionContext<I> {
  input: I;
  user: User;
  tx: Tx;
  platform: Platform;
}

export interface ResourceRef {
  type: string;
  id: string;
  /** Fields used by conditional permissions (owner, amount, region) */
  data?: Record<string, unknown>;
}

export interface ActionDefinition<S extends z.ZodType, R> {
  /** Unique within the app, e.g. `refunds.issue` */
  name: string;
  /** Every action declares the permission it requires. */
  permission: string;
  input: S;
  /** Loads the target so conditions (ownership, amount, region) can be checked. */
  resource?: (input: z.infer<S>, tx: Tx) => Promise<ResourceRef | null>;
  /** When `when` returns true the action is queued for approval instead of running. */
  approval?: {
    /** `resource` is the server-loaded target; base thresholds on it, never on client-supplied amounts. */
    when: (input: z.infer<S>, user: User, resource: ResourceRef | null) => boolean;
    approverPermission: string;
    summary: (input: z.infer<S>, user: User, resource: ResourceRef | null) => string;
    approvalsRequired?: number;
    ttlHours?: number;
  };
  /** Keys in the input to redact from the audit record. */
  redactInput?: string[];
  handler: (ctx: ActionContext<z.infer<S>>) => Promise<R>;
}

export type RunnableAction<S extends z.ZodType, R> = ((user: User | null, raw: unknown, meta?: Partial<RequestMeta>) => Promise<ActionResult<R>>) & {
  definition: ActionDefinition<S, R>;
};

export function ctxFor(user: User | null, app: string, requestId: string): DbContext {
  return { userId: user?.id ?? null, roles: user?.roles ?? [], requestId, app };
}

/**
 * Platform instance for one app. Holds the permission registry (platform roles +
 * the app's manifest), the approval engine, and the list of declared actions,
 * which CI uses for permission coverage.
 */
export class Platform {
  readonly registry: PermissionRegistry;
  readonly approvals: ApprovalEngine;
  readonly actions: ActionDefinition<z.ZodType, unknown>[] = [];

  constructor(readonly app: string, manifests: ToolManifest[] = []) {
    this.registry = new PermissionRegistry(manifests);
    this.approvals = new ApprovalEngine(this.registry);
  }

  /** Read helper: runs `fn` as the user with RLS context set. */
  as<T>(user: User | null, fn: (tx: Tx) => Promise<T>, requestId: string = randomUUID()): Promise<T> {
    return withTx(ctxFor(user, this.app, requestId), fn);
  }

  /** Audited read of a sensitive record (e.g. revealing PII). */
  async auditRead(tx: Tx, user: User, resourceType: string, resourceId: string, reason?: string): Promise<void> {
    await writeAuditEvent(tx, {
      kind: "action", action: `${resourceType}.read`, outcome: "success",
      actor: { id: user.id, email: user.email, roles: user.roles }, resourceType, resourceId, reason: reason ?? null,
    });
  }

  private async auditDenied(user: User | null, name: string, permission: string, reason: string, meta: RequestMeta, resource?: ResourceRef | null) {
    await withTx(ctxFor(user, this.app, meta.requestId), (tx) =>
      writeAuditEvent(tx, {
        kind: "action", action: name, outcome: "denied",
        actor: { id: user?.id ?? null, email: user?.email ?? null, roles: user?.roles ?? [] },
        resourceType: resource?.type ?? null, resourceId: resource?.id ?? null,
        reason: `${permission}: ${reason}`, ip: meta.ip, userAgent: meta.userAgent,
      }),
    );
  }

  defineAction<S extends z.ZodType, R>(def: ActionDefinition<S, R>): RunnableAction<S, R> {
    if (!this.registry.permissions.has(def.permission)) throw new Error(`${def.name}: unknown permission ${def.permission}`);
    if (this.actions.some((a) => a.name === def.name)) throw new Error(`duplicate action ${def.name}`);
    this.actions.push(def as unknown as ActionDefinition<z.ZodType, unknown>);

    if (def.approval) {
      this.approvals.register(this.app, def.name, async ({ tx, payload, request, approver }) => {
        const [requester] = await tx.query<{ id: string; email: string; name: string | null; attributes: Record<string, unknown> }>(
          "select id, email, name, attributes from platform.users where id = $1",
          [request.requested_by],
        );
        const roles = (await tx.query<{ role: string }>("select role from platform.user_roles where user_id = $1", [request.requested_by])).map((r) => r.role);
        const user: User = requester ? { ...requester, roles } : { id: request.requested_by, email: request.requested_by_email ?? "", name: null, roles, attributes: {} };
        // Re-check the requester's current access: roles may have been revoked since they asked.
        const input = def.input.parse(payload);
        const resource = def.resource ? await def.resource(input, tx) : null;
        if (def.resource && !resource) throw new Forbidden(def.permission, "resource no longer exists");
        this.registry.assert(user, def.permission, { ...(resource?.data ?? {}), ...(input as Record<string, unknown>) });
        return def.handler({ input, user: { ...user, attributes: { ...user.attributes, approved_by: approver.email } }, tx, platform: this });
      }, { redactInput: def.redactInput });
    }

    const run = async (user: User | null, raw: unknown, metaIn: Partial<RequestMeta> = {}): Promise<ActionResult<R>> => {
      const meta: RequestMeta = { requestId: metaIn.requestId ?? randomUUID(), ip: metaIn.ip ?? null, userAgent: metaIn.userAgent ?? null };
      if (!user) {
        await this.auditDenied(null, def.name, def.permission, "not signed in", meta);
        return { ok: false, code: "unauthenticated", error: "Sign in required" };
      }
      const parsed = def.input.safeParse(raw);
      if (!parsed.success) {
        const issues: Record<string, string[]> = {};
        for (const i of parsed.error.issues) (issues[i.path.join(".") || "_"] ??= []).push(i.message);
        await withTx(ctxFor(user, this.app, meta.requestId), (tx) =>
          writeAuditEvent(tx, {
            kind: "action", action: def.name, outcome: "invalid",
            actor: { id: user.id, email: user.email, roles: user.roles },
            reason: `invalid input: ${Object.keys(issues).join(", ")}`, ip: meta.ip, userAgent: meta.userAgent,
          }),
        ).catch(() => undefined);
        return { ok: false, code: "invalid", error: "Invalid input", issues };
      }
      const input = parsed.data as z.infer<S>;
      let resource: ResourceRef | null = null;
      try {
        return await withTx(ctxFor(user, this.app, meta.requestId), async (tx) => {
          resource = def.resource ? await def.resource(input, tx) : null;
          if (def.resource && !resource) throw new Forbidden(def.permission, "resource not found or not visible");
          this.registry.assert(user, def.permission, { ...(resource?.data ?? {}), ...(input as Record<string, unknown>) });
          const actor = { id: user.id, email: user.email, roles: user.roles };

          if (def.approval?.when(input, user, resource)) {
            const summary = def.approval.summary(input, user, resource);
            const req = await this.approvals.request(tx, user, {
              app: this.app, action: def.name, approverPermission: def.approval.approverPermission,
              payload: input as Record<string, unknown>, summary,
              resourceType: resource?.type, resourceId: resource?.id,
              approvalsRequired: def.approval.approvalsRequired, ttlHours: def.approval.ttlHours,
            });
            return { ok: true as const, pending: true as const, approvalId: req.id, message: `Sent for approval: ${summary}` };
          }

          const data = await def.handler({ input, user, tx, platform: this });
          await writeAuditEvent(tx, {
            kind: "action", action: def.name, outcome: "success", actor,
            resourceType: resource?.type ?? null, resourceId: resource?.id ?? (data as { id?: string } | null)?.id ?? null,
            after: redact(input, def.redactInput), ip: meta.ip, userAgent: meta.userAgent,
          });
          return { ok: true as const, data };
        });
      } catch (err) {
        if (err instanceof Forbidden) {
          await this.auditDenied(user, def.name, def.permission, err.reason, meta, resource);
          return { ok: false, code: "forbidden", error: `You don't have permission to do this (${err.reason}).` };
        }
        if (err instanceof ApprovalError) return { ok: false, code: "invalid", error: err.message };
        await withTx(ctxFor(user, this.app, meta.requestId), (tx) =>
          writeAuditEvent(tx, {
            kind: "action", action: def.name, outcome: "error",
            actor: { id: user.id, email: user.email, roles: user.roles }, reason: (err as Error).message.slice(0, 500),
          }),
        ).catch(() => undefined);
        console.error(`[${this.app}] action ${def.name} failed`, err);
        return { ok: false, code: "error", error: "Something went wrong. The error was logged." };
      }
    };
    return Object.assign(run, { definition: def });
  }
}

export function createPlatform(app: string, manifests: ToolManifest[] = []): Platform {
  return new Platform(app, manifests);
}
