import { notFound } from "next/navigation";
import { ApprovalBanner, AuditTrail, Badge, Card, CardHeader, MaskedField, PageHeader, RecordDetail, statusTone } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { queryAudit } from "@platform/audit";
import { APPROVAL_THRESHOLD_CENTS, getRefund, platform } from "@/tools/refunds/lib/actions";
import { ConsoleShell as Shell } from "@/components/shell";
import { statusLabel, usd } from "../format";
import { IssueButton, RejectButton } from "./decision-buttons";

export const dynamic = "force-dynamic";

export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getRefund(user, id);
  if (!data) notFound();
  const { refund: r, approval } = data;
  const audit = await platform.as(user, async (tx) => {
    const own = await queryAudit(tx, { resourceId: id, limit: 100 });
    const viaApproval = approval ? await queryAudit(tx, { resourceType: "platform.approval_request", resourceId: approval.id, limit: 50 }) : [];
    return [...own, ...viaApproval].sort((a, b) => Number(BigInt(b.seq) - BigInt(a.seq)));
  });
  const amount = typeof r.amount_cents === "number" ? r.amount_cents : null;
  const ctx = { requested_by: r.requested_by };
  const canIssue = r.status === "requested" && platform.registry.can(user, "refunds:request", ctx);
  const canReject = r.status === "pending_approval" && platform.registry.can(user, "refunds:approve", ctx);
  return (
    <Shell active="refunds">
      <PageHeader title={`Refund for ${r.order_id}`} description={<a className="underline" href="/t/refunds">← All refunds</a>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {approval && r.status === "pending_approval" ? (
            <ApprovalBanner status={approval.status} summary={`Refunds of ${usd(APPROVAL_THRESHOLD_CENTS)} or more need a finance approver. The requester can't approve.`} href={`/approvals/${approval.id}`} />
          ) : null}
          <RecordDetail
            title={r.order_id}
            actions={<Badge tone={r.status === "issued" ? "green" : statusTone(r.status)}>{statusLabel(r.status)}</Badge>}
            fields={[
              { label: "Customer", value: <MaskedField value={r.customer_name} /> },
              { label: "Customer email", value: <MaskedField value={r.customer_email} /> },
              { label: "Amount", value: amount === null ? <MaskedField value={r.amount_cents} /> : usd(amount) },
              { label: "Region", value: r.region },
              { label: "Reason", value: r.reason },
              { label: "Reference", value: r.reference ? <span className="font-mono text-xs">{r.reference}</span> : "—" },
              { label: "Requested by", value: r.requested_by_email ?? r.requested_by },
              { label: "Decided by", value: r.decided_by ?? "—" },
              { label: "Created", value: r.created_at.toLocaleString() },
              { label: "Updated", value: r.updated_at.toLocaleString() },
            ]}
          />
          <Card><CardHeader title="Audit trail" description="Row changes, actions and approval events for this refund." /><AuditTrail entries={audit} /></Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Actions" />
          <div className="space-y-3 p-5 text-sm text-slate-600">
            {canIssue ? <IssueButton id={r.id} /> : null}
            {canReject ? <RejectButton id={r.id} /> : null}
            {approval?.status === "pending" && r.status === "pending_approval" ? <p>Approve from the <a className="underline" href={`/approvals/${approval.id}`}>approval request</a>; approving issues the refund.</p> : null}
            {!canIssue && !canReject && r.status !== "pending_approval" ? <p>This refund is {statusLabel(r.status)}. Nothing to do.</p> : null}
            {!canReject && r.status === "pending_approval" && r.requested_by === user.id ? <p>You requested this, so a finance approver has to decide.</p> : null}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
