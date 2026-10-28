"use client";
import { useMemo, useState } from "react";
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Input } from "./primitives";

export function DataTable<T>({ data, columns, searchPlaceholder = "Search…", rowHref, empty = "No rows" }: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  searchPlaceholder?: string;
  rowHref?: (row: T) => string;
  empty?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useReactTable({
    data, columns: useMemo(() => columns, [columns]),
    state: { sorting, globalFilter },
    onSortingChange: setSorting, onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(),
  });
  return (
    <div>
      <div className="border-b border-slate-100 px-5 py-3">
        <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="max-w-xs" />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()} className="cursor-pointer select-none px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-5 py-10 text-center text-slate-500">{empty}</td></tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={rowHref ? "cursor-pointer hover:bg-slate-50" : undefined} onClick={rowHref ? () => (window.location.href = rowHref(row.original)) : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-5 py-3 text-slate-700">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A DataTable with status tabs, for work queues (KYC cases, refund requests, approvals). */
export function QueueView<T extends { status: string }>({ data, columns, statuses, rowHref }: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  statuses: string[];
  rowHref?: (row: T) => string;
}) {
  const [status, setStatus] = useState(statuses[0] ?? "all");
  const rows = status === "all" ? data : data.filter((d) => d.status === status);
  return (
    <div>
      <div className="flex gap-1 border-b border-slate-100 px-4 pt-3">
        {[...statuses, "all"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-t-md px-3 py-1.5 text-sm capitalize ${s === status ? "border-b-2 border-slate-900 font-medium text-slate-900" : "text-slate-500"}`}>
            {s} <span className="text-xs text-slate-400">({s === "all" ? data.length : data.filter((d) => d.status === s).length})</span>
          </button>
        ))}
      </div>
      <DataTable data={rows} columns={columns} rowHref={rowHref} />
    </div>
  );
}
