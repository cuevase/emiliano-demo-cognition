import { Badge, Card, CardHeader, EmptyState, PageHeader, statusTone } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { ConsoleShell } from "@/components/shell";
import { platform, visibleTools } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const inbox = await platform.as(user, (tx) => platform.approvals.inbox(tx, user, { status: "pending" }));
  const toDecide = inbox.filter((r) => r.canDecide);
  const mine = inbox.filter((r) => r.isMine);
  const perms = platform.registry.permissionsFor(user);
  const tools = visibleTools(user);
  return (
    <ConsoleShell active="home">
      <PageHeader title={`Welcome, ${user.name ?? user.email}`} description="Everything below comes from the shared platform: your roles, permissions, approvals and tools." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Tools" description="Every tool is generated from the same template and registered here." />
          {tools.length === 0 ? (
            <EmptyState title="No tools yet" description="Run `pnpm new-tool <name>` to scaffold one. It will appear here, at /t/<name>, with sign-in, permissions, audit and approvals already wired." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {tools.map((t) => (
                <li key={t.name}><a href={`/t/${t.name}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <div><div className="font-medium">{t.title}</div><div className="text-sm text-slate-500">{t.description}</div></div>
                  <Badge>{t.ownerTeam}</Badge>
                </a></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Your access" />
          <div className="space-y-3 p-5 text-sm">
            <div><div className="text-xs uppercase text-slate-500">Roles</div><div className="mt-1 flex flex-wrap gap-1">{user.roles.map((r) => <Badge key={r} tone="purple">{r}</Badge>)}</div></div>
            <div><div className="text-xs uppercase text-slate-500">Permissions</div><ul className="mt-1 space-y-0.5 font-mono text-xs text-slate-600">{perms.map((p) => <li key={p}>{p}</li>)}</ul></div>
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Approvals" description={`${toDecide.length} waiting for you · ${mine.length} you requested`} actions={<a className="text-sm underline" href="/approvals">Open inbox</a>} />
          {toDecide.length + mine.length === 0 ? <EmptyState title="Nothing pending" /> : (
            <ul className="divide-y divide-slate-100">
              {[...toDecide, ...mine].slice(0, 6).map((r) => (
                <li key={r.id}><a href={`/approvals/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <span className="text-sm">{r.summary}</span><Badge tone={statusTone(r.status)}>{r.canDecide ? "needs your decision" : r.status}</Badge>
                </a></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </ConsoleShell>
  );
}
