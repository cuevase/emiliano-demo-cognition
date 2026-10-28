import { notFound } from "next/navigation";
import { AuditTrail, Badge, Card, CardHeader, MaskedField, RecordDetail, RoleGate, statusTone } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { queryAudit } from "@platform/audit";
import { APPROVAL_THRESHOLD_CENTS, getItem, platform } from "@/lib/actions";
import { Shell } from "../../shell";
import { StatusButtons } from "./status-buttons";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const item = await getItem(user, id);
  if (!item) notFound();
  const audit = await platform.as(user, (tx) => queryAudit(tx, { resourceId: id, limit: 50 }));
  const amount = typeof item.amount_cents === "number" ? item.amount_cents : null;
  return (
    <Shell active="items">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecordDetail
            title={item.title}
            actions={<Badge tone={statusTone(item.status)}>{item.status}</Badge>}
            fields={[
              { label: "Customer", value: <MaskedField value={item.customer_email} /> },
              { label: "Amount", value: amount === null ? <MaskedField value={item.amount_cents} /> : `$${(amount / 100).toFixed(2)}` },
              { label: "Region", value: item.region },
              { label: "Created", value: item.created_at.toLocaleString() },
            ]}
          />
        </div>
        <Card>
          <CardHeader title="Actions" description={`Closing items of $${APPROVAL_THRESHOLD_CENTS / 100} or more needs approval.`} />
          <div className="p-5">
            <RoleGate allowed={platform.registry.can(user, "__TOOL__:update", { owner_id: item.owner_id })} fallback={<p className="text-sm text-slate-500">You can view this item but not change it.</p>}>
              <StatusButtons id={item.id} />
            </RoleGate>
          </div>
        </Card>
        <Card className="lg:col-span-3"><CardHeader title="Audit trail" /><AuditTrail entries={audit} /></Card>
      </div>
    </Shell>
  );
}
