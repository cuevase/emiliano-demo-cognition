"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, MaskedField, statusTone } from "@platform/ui";
import { DataTable } from "@platform/ui/client";
import { statusLabel, usd } from "./format";

export type RefundTableRow = {
  id: string; customer_name: string; customer_email: string; order_id: string; amount_cents: number | string;
  region: string; status: string; reason: string; reference: string | null; created_at: string;
};

const columns: ColumnDef<RefundTableRow, unknown>[] = [
  { accessorKey: "order_id", header: "Order", cell: (c) => <span className="font-mono text-xs">{String(c.getValue())}</span> },
  { accessorKey: "customer_name", header: "Customer", cell: (c) => (
    <div><MaskedField value={c.getValue()} /><div className="text-xs text-slate-500"><MaskedField value={c.row.original.customer_email} /></div></div>
  ) },
  { accessorKey: "amount_cents", header: "Amount", cell: (c) => { const v = c.getValue(); return typeof v === "number" ? usd(v) : <MaskedField value={v} />; } },
  { accessorKey: "reason", header: "Reason" },
  { accessorKey: "region", header: "Region" },
  { accessorKey: "status", header: "Status", cell: (c) => <Badge tone={c.getValue() === "issued" ? "green" : statusTone(String(c.getValue()))}>{statusLabel(String(c.getValue()))}</Badge> },
  { accessorKey: "reference", header: "Reference", cell: (c) => <span className="font-mono text-xs">{(c.getValue() as string | null) ?? "—"}</span> },
  { accessorKey: "created_at", header: "Created", cell: (c) => new Date(String(c.getValue())).toLocaleDateString() },
];

export function RefundsTable({ rows }: { rows: RefundTableRow[] }) {
  return <DataTable data={rows} columns={columns} searchPlaceholder="Narrow these results…" rowHref={(r) => `/t/refunds/${r.id}`} empty="No refunds match these filters" />;
}
