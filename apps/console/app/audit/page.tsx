import { redirect } from "next/navigation";
import { Badge, Button, Card, Input, PageHeader, Select, statusTone } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { queryAudit, verifyChain } from "@platform/audit";
import { ConsoleShell } from "@/components/shell";
import { platform } from "@/lib/platform";

export const dynamic = "force-dynamic";
type SP = { actor?: string; action?: string; kind?: string; app?: string; resource?: string; verify?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!platform.registry.can(user, "platform:audit.read")) redirect("/");
  const sp = await searchParams;
  const { rows, chain } = await platform.as(user, async (tx) => ({
    rows: await queryAudit(tx, { actor: sp.actor || undefined, action: sp.action || undefined, kind: sp.kind || undefined, app: sp.app || undefined, resourceId: sp.resource || undefined, limit: 300 }),
    chain: sp.verify ? await verifyChain(tx) : null,
  }));
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "verify") as [string, string][]).toString();
  return (
    <ConsoleShell active="audit">
      <PageHeader
        title="Audit log"
        description="Append-only and hash-chained. Every action, denial, sign-in, approval and row change across every tool."
        actions={<div className="flex gap-2">
          <a href={`/audit?${qs}${qs ? "&" : ""}verify=1`}><Button variant="secondary" data-testid="verify-chain">Verify chain</Button></a>
          <a href={`/audit/export?${qs}`}><Button variant="secondary">Export CSV</Button></a>
        </div>}
      />
      {chain ? (
        <div data-testid="chain-status" className={`mb-4 rounded-md px-4 py-3 text-sm ${chain.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {chain.ok ? `Chain intact: ${chain.checked} entries verified.` : `Chain broken at entry #${chain.brokenSeq}: a row was modified or removed after it was written.`}
        </div>
      ) : null}
      <Card>
        <form className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 md:grid-cols-6">
          <Input name="actor" placeholder="Actor email" defaultValue={sp.actor} />
          <Input name="action" placeholder="Action" defaultValue={sp.action} />
          <Input name="app" placeholder="Tool" defaultValue={sp.app} />
          <Input name="resource" placeholder="Resource ID" defaultValue={sp.resource} />
          <Select name="kind" defaultValue={sp.kind ?? ""}>
            <option value="">All kinds</option><option value="action">action</option><option value="row">row</option><option value="auth">auth</option><option value="system">system</option>
          </Select>
          <Button type="submit">Filter</Button>
        </form>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">When</th><th className="px-4 py-2">Kind</th><th className="px-4 py-2">Actor</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Outcome</th><th className="px-4 py-2">Resource</th><th className="px-4 py-2">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2 text-slate-400">{r.seq}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{new Date(r.occurred_at).toLocaleString()}</td>
                  <td className="px-4 py-2"><Badge>{r.kind}</Badge></td>
                  <td className="px-4 py-2">{r.actor_email ?? r.actor_id ?? "system"}<div className="text-xs text-slate-400">{r.actor_roles?.join(", ")}</div></td>
                  <td className="px-4 py-2 font-mono text-xs">{r.app}/{r.action}</td>
                  <td className="px-4 py-2"><Badge tone={statusTone(r.outcome ?? "")}>{r.outcome}</Badge></td>
                  <td className="px-4 py-2 text-xs">{r.resource_type}<div className="font-mono text-slate-400">{r.resource_id}</div></td>
                  <td className="max-w-sm px-4 py-2 text-xs text-slate-600">
                    {r.reason ? <div>{r.reason}</div> : null}
                    {r.changed?.length ? <div>changed: {r.changed.join(", ")}</div> : null}
                    {r.before || r.after ? (
                      <details><summary className="cursor-pointer text-slate-400">before / after</summary>
                        <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify({ before: r.before, after: r.after }, null, 1)}</pre>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </ConsoleShell>
  );
}
