import { Badge, Card, EmptyState, PageHeader, statusTone } from "@platform/ui";
import { requireUser } from "@platform/auth";
import type { ApprovalStatus } from "@platform/approvals";
import { ConsoleShell } from "@/components/shell";
import { platform } from "@/lib/platform";

export const dynamic = "force-dynamic";
const STATUSES = ["pending", "executed", "rejected", "expired", "cancelled", "failed", "all"] as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const status = (STATUSES as readonly string[]).includes((await searchParams).status ?? "") ? ((await searchParams).status as ApprovalStatus | "all") : "pending";
  const rows = await platform.as(user, (tx) => platform.approvals.inbox(tx, user, { status }));
  return (
    <ConsoleShell active="approvals">
      <PageHeader title="Approvals" description="One inbox for every tool. Requesters can't approve their own requests, and overdue requests expire automatically when viewed." />
      <Card>
        <div className="flex gap-1 border-b border-slate-100 px-4 pt-3">
          {STATUSES.map((s) => (
            <a key={s} href={`/approvals?status=${s}`} className={`rounded-t-md px-3 py-1.5 text-sm capitalize ${s === status ? "border-b-2 border-slate-900 font-medium" : "text-slate-500"}`}>{s}</a>
          ))}
        </div>
        {rows.length === 0 ? <EmptyState title={`No ${status} requests you can see`} /> : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-2.5">Request</th><th className="px-5 py-2.5">Tool</th><th className="px-5 py-2.5">Requested by</th><th className="px-5 py-2.5">Expires</th><th className="px-5 py-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3"><a className="font-medium underline-offset-2 hover:underline" href={`/approvals/${r.id}`}>{r.summary}</a></td>
                  <td className="px-5 py-3 font-mono text-xs">{r.app}:{r.action}</td>
                  <td className="px-5 py-3">{r.requested_by_email}</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(r.expires_at).toLocaleString()}</td>
                  <td className="px-5 py-3"><Badge tone={statusTone(r.status)}>{r.canDecide ? "needs your decision" : r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </ConsoleShell>
  );
}
