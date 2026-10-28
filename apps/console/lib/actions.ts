import { z } from "zod";
import { PLATFORM_ROLES, PRIVILEGED_ROLES, type PlatformRole } from "@platform/permissions";
import { platform } from "./platform";

export const grantRole = platform.defineAction({
  name: "platform.roles.grant",
  permission: "platform:roles.manage",
  input: z.object({ userId: z.string().min(1), role: z.enum(PLATFORM_ROLES), reason: z.string().min(3, "Give a reason") }),
  resource: async (input, tx) => {
    const [u] = await tx.query<{ id: string; email: string }>("select id, email from platform.users where id = $1", [input.userId]);
    return u ? { type: "platform.user", id: u.id, data: { email: u.email } } : null;
  },
  approval: {
    when: (input) => PRIVILEGED_ROLES.includes(input.role as PlatformRole),
    approverPermission: "platform:roles.approve",
    summary: (input) => `Grant ${input.role} to user ${input.userId}: ${input.reason}`,
    ttlHours: 24,
  },
  handler: async ({ input, tx, user }) => {
    await tx.query(
      "insert into platform.user_roles (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing",
      [input.userId, input.role, user.attributes.approved_by ? `${user.email} (approved by ${String(user.attributes.approved_by)})` : user.email],
    );
    return { userId: input.userId, role: input.role };
  },
});

export const revokeRole = platform.defineAction({
  name: "platform.roles.revoke",
  permission: "platform:roles.manage",
  input: z.object({ userId: z.string().min(1), role: z.enum(PLATFORM_ROLES) }),
  resource: async (input, tx) => {
    const [r] = await tx.query<{ user_id: string }>("select user_id from platform.user_roles where user_id = $1 and role = $2", [input.userId, input.role]);
    return r ? { type: "platform.user", id: r.user_id } : null;
  },
  handler: async ({ input, tx, user }) => {
    if (input.userId === user.id && input.role === "admin") throw new Error("You cannot remove your own admin role");
    await tx.query("delete from platform.user_roles where user_id = $1 and role = $2", [input.userId, input.role]);
    return { userId: input.userId, role: input.role };
  },
});
