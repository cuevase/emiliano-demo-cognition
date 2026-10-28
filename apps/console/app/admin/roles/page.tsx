import { redirect } from "next/navigation";
import { Badge, Card, CardHeader, PageHeader } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { PLATFORM_ROLES, PRIVILEGED_ROLES } from "@platform/permissions";
import { ConsoleShell } from "@/components/shell";
import { GrantRoleForm, RevokeRoleButton } from "@/components/client";
import { platform } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await requireUser();
  const canManage = platform.registry.can(user, "platform:roles.manage");
  if (!canManage && !platform.registry.can(user, "platform:audit.read")) redirect("/");
  const users = await platform.as(user, (tx) =>
    tx.query<{ id: string; email: string; name: string | null; roles: string[] | null; last_seen_at: Date }>(
      `select u.id, u.email, u.name, u.last_seen_at, array_remove(array_agg(r.role order by r.role), null) as roles
       from platform.users u left join platform.user_roles r on r.user_id = u.id
       group by u.id order by u.email`,
    ),
  );
  return (
    <ConsoleShell active="roles">
      <PageHeader title="Users & roles" description={`Granting ${PRIVILEGED_ROLES.join(" or ")} needs a second admin's approval. Every change is audited.`} />
      <Card>
        <CardHeader title="Role catalog" description="Roles map to permissions in code (packages/permissions + each tool's manifest) and are mirrored into Postgres for row-level security." />
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {PLATFORM_ROLES.map((r) => (
            <div key={r} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center gap-2"><Badge tone="purple">{r}</Badge>{PRIVILEGED_ROLES.includes(r) ? <Badge tone="yellow">needs approval</Badge> : null}</div>
              <ul className="mt-2 font-mono text-xs text-slate-600">{[...(platform.registry.rolePermissions.get(r) ?? [])].map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Users" />
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">User</th><th className="px-5 py-2">Roles</th>{canManage ? <th className="px-5 py-2">Grant</th> : null}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3"><div className="font-medium">{u.name ?? u.email}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                <td className="px-5 py-3"><div className="flex flex-wrap items-center gap-1">{(u.roles ?? []).map((r) => canManage ? <RevokeRoleButton key={r} userId={u.id} role={r} /> : <Badge key={r} tone="purple">{r}</Badge>)}</div></td>
                {canManage ? <td className="px-5 py-3"><GrantRoleForm userId={u.id} roles={PLATFORM_ROLES.filter((r) => !(u.roles ?? []).includes(r))} /></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </ConsoleShell>
  );
}
