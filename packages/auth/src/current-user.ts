import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { withSystemTx, type Tx } from "@platform/db";
import { writeAuditEvent } from "@platform/audit";
import type { User } from "@platform/permissions";
import { getIdentity, type Identity } from "./identity";
import { isDemoMode, personaByEmail } from "./personas";

export interface RequestMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

export const getRequestMeta = cache(async (): Promise<RequestMeta> => {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? randomUUID(),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
});

/** Upserts the platform user, assigns starting roles on first sign-in and audits new sessions. */
export async function syncUser(tx: Tx, identity: Identity, meta: Partial<RequestMeta> = {}): Promise<User> {
  await tx.query(
    `insert into platform.users (id, email, name) values ($1, $2, $3)
     on conflict (id) do update set email = excluded.email, name = coalesce(excluded.name, platform.users.name), last_seen_at = now()`,
    [identity.userId, identity.email, identity.name],
  );

  let roles = (await tx.query<{ role: string }>("select role from platform.user_roles where user_id = $1", [identity.userId])).map((r) => r.role);
  if (roles.length === 0) {
    const persona = isDemoMode() ? personaByEmail(identity.email) : undefined;
    roles = persona?.roles ?? ["viewer"];
    for (const role of roles) {
      await tx.query("insert into platform.user_roles (user_id, role, granted_by) values ($1, $2, 'system:bootstrap') on conflict do nothing", [identity.userId, role]);
    }
    if (persona) await tx.query("update platform.users set attributes = $2 where id = $1", [identity.userId, JSON.stringify(persona.attributes)]);
    await writeAuditEvent(tx, {
      kind: "auth",
      action: "role.bootstrap",
      outcome: "success",
      actor: { id: identity.userId, email: identity.email, roles },
      resourceType: "platform.user",
      resourceId: identity.userId,
      after: { roles },
      reason: persona ? "demo persona" : "default role for new users",
    });
  }

  const seen = await tx.query(
    "insert into platform.auth_sessions_seen (session_id, user_id) values ($1, $2) on conflict do nothing returning session_id",
    [identity.sessionId, identity.userId],
  );
  if (seen.length > 0) {
    await writeAuditEvent(tx, {
      kind: "auth",
      action: "auth.sign_in",
      outcome: "success",
      actor: { id: identity.userId, email: identity.email, roles },
      metadata: { provider: identity.provider },
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  const [row] = await tx.query<{ attributes: Record<string, unknown> }>("select attributes from platform.users where id = $1", [identity.userId]);
  return { id: identity.userId, email: identity.email, name: identity.name, roles: roles.sort(), attributes: row?.attributes ?? {} };
}

/** The signed-in user with platform roles, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const identity = await getIdentity();
  if (!identity) return null;
  const meta = await getRequestMeta();
  return withSystemTx("platform", meta.requestId, (tx) => syncUser(tx, identity, meta));
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
