"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, MaskedField, statusTone } from "@platform/ui";
import { QueueView } from "@platform/ui/client";

type Row = { id: string; title: string; customer_email: string; amount_cents: number | string; status: string; created_at: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "customer_email", header: "Customer", cell: (c) => <MaskedField value={c.getValue()} /> },
  { accessorKey: "amount_cents", header: "Amount", cell: (c) => { const v = c.getValue(); return typeof v === "number" ? `$${(v / 100).toFixed(2)}` : <MaskedField value={v} />; } },
  { accessorKey: "status", header: "Status", cell: (c) => <Badge tone={statusTone(String(c.getValue()))}>{String(c.getValue())}</Badge> },
  { accessorKey: "created_at", header: "Created", cell: (c) => new Date(String(c.getValue())).toLocaleString() },
];

export function ItemsTable({ rows }: { rows: Row[] }) {
  return <QueueView data={rows} columns={columns} statuses={["open", "in_progress", "closed"]} rowHref={(r) => `/items/${r.id}`} />;
}
