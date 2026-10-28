import { notFound } from "next/navigation";
import { AuditTrail, Badge, Card, CardHeader, PageHeader, RecordDetail, statusTone } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { queryAudit } from "@platform/audit";
import { ConsoleShell } from "@/components/shell";
import { CancelButton, DecisionPanel } from "@/components/client";
import { platform } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function ApprovalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await platform.as(user, async (tx) => {
    const detail = await platform.approvals.get(tx, id);
    if (!detail) return null;
    const audit = await queryAudit(tx, { resourceType: "platform.approval_request", resourceId: id });
    return { ...detail, audit };
  });
  if (!data) notFound();
  const { request: r, decisions, audit } = data;
  const canDecide = r.status === "pending" && r.requested_by !== user.id && platform.registry.can(user, r.approver_permission, r.payload);
  return (
    <ConsoleShell active="approvals">
      <PageHeader title="Approval request" description={<a className="underline" href="/approvals">← All approvals</a>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RecordDetail
            title={r.summary}
            actions={<Badge tone={statusTone(r.status)}>{r.status}</Badge>}
            fields={[
              { label: "Action", value: <span className="font-mono text-xs">{r.app}:{r.action}</span> },
              { label: "Approver permission", value: <span className="font-mono text-xs">{r.approver_permission}</span> },
              { label: "Requested by", value: r.requested_by_email },
              { label: "Approvals", value: `${decisions.filter((d) => d.decision === "approve").length} / ${r.approvals_required}` },
              { label: "Created", value: new Date(r.created_at).toLocaleString() },
              { label: "Expires", value: new Date(r.expires_at).toLocaleString() },
              { label: "Payload hash", value: <span className="font-mono text-xs break-all">{r.payload_hash}</span> },
              ...(r.error ? [{ label: "Error", value: r.error }] : []),
            ]}
          >
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-1 text-xs font-medium uppercase text-slate-500">Payload (locked once requested)</div>
              <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(r.payload, null, 2)}</pre>
            </div>
          </RecordDetail>
          <Card><CardHeader title="Audit trail" /><AuditTrail entries={audit} /></Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Decision" />
            <div className="p-5 text-sm">
              {canDecide ? <DecisionPanel id={r.id} /> :
                r.status !== "pending" ? <p className="text-slate-500">This request is {r.status}.</p> :
                r.requested_by === user.id ? <div className="space-y-3"><p className="text-slate-500">You requested this, so someone else has to approve it.</p><CancelButton id={r.id} /></div> :
                <p className="text-slate-500">You don&apos;t have <span className="font-mono">{r.approver_permission}</span>.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Decisions" />
            <ul className="divide-y divide-slate-100 text-sm">
              {decisions.length === 0 ? <li className="px-5 py-3 text-slate-500">None yet</li> : decisions.map((d) => (
                <li key={d.approver_id} className="px-5 py-3"><Badge tone={d.decision === "approve" ? "green" : "red"}>{d.decision}</Badge> <span className="ml-1">{d.approver_email}</span>{d.comment ? <p className="mt-1 text-slate-500">“{d.comment}”</p> : null}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </ConsoleShell>
  );
}
