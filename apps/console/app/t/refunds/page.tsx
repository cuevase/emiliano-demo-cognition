import { Button, Card, CardHeader, EmptyState, Input, Label, PageHeader, RoleGate, Select } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { REFUND_STATUSES, REGIONS } from "@/tools/refunds/lib/schema";
import { canSeeAmounts, canSeePii, getMetrics, listRefunds, parseFilters, platform } from "@/tools/refunds/lib/actions";
import { ConsoleShell as Shell } from "@/components/shell";
import { RefundsTable } from "./refunds-table";
import { statusLabel, usd } from "./format";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}

export default async function RefundsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  if (!platform.registry.can(user, "refunds:read")) {
    return (
      <Shell active="refunds">
        <PageHeader title="Refunds" />
        <Card><EmptyState title="No access" description="You need refunds:read to see refund requests and metrics." /></Card>
      </Shell>
    );
  }
  const [metrics, rows] = await Promise.all([getMetrics(user, filters), listRefunds(user, filters)]);
  const amountsHidden = !canSeeAmounts(user);
  const hidden = "Hidden for your role";
  const filtered = Object.values(filters).some(Boolean);
  return (
    <Shell active="refunds">
      <PageHeader
        title="Refunds"
        description="Refund requests across regions. Refunds of $500 or more need a finance approver; issuing is simulated (no real payments)."
        actions={<RoleGate allowed={platform.registry.can(user, "refunds:request")}><a href="/t/refunds/new"><Button>New refund</Button></a></RoleGate>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total refunded" value={metrics?.total_refunded_cents == null ? "••••" : usd(metrics.total_refunded_cents)} hint={amountsHidden ? hidden : `${metrics?.issued ?? 0} issued`} />
        <Stat label="Pending approval" value={String(metrics?.pending_approval ?? 0)} hint="$500+ awaiting a finance approver" />
        <Stat label="Approval rate" value={metrics?.approval_rate == null ? "—" : `${metrics.approval_rate}%`} hint={`${metrics?.issued ?? 0} issued · ${metrics?.rejected ?? 0} rejected`} />
        <Stat label="Average refund" value={metrics?.avg_refund_cents == null ? "••••" : usd(metrics.avg_refund_cents)} hint={amountsHidden ? hidden : "Across issued refunds"} />
      </div>
      <Card>
        <CardHeader title="Requests" description={`${rows.length} shown${filtered ? " (filtered; cards use the same filters)" : ""}. Rows filtered by row-level security; PII and amounts masked on the server for your role.`} />
        <form method="get" className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">All</option>
              {REFUND_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="region">Region</Label>
            <Select id="region" name="region" defaultValue={filters.region ?? ""}>
              <option value="">All</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} /></div>
          <div><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} /></div>
          <div>
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" defaultValue={filters.q ?? ""} placeholder={canSeePii(user) ? "Order, customer, reason, ref" : "Order, reason, reference"} />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Apply</Button>
            {filtered ? <a href="/t/refunds"><Button type="button" variant="secondary">Clear</Button></a> : null}
          </div>
        </form>
        <RefundsTable rows={rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))} />
      </Card>
    </Shell>
  );
}
