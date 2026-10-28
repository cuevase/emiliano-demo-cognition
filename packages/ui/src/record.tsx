import type { ReactNode } from "react";
import { Badge, Card, CardHeader } from "./primitives";

/** Renders a value the server already masked; shows a lock hint when masked. */
export function MaskedField({ value, masked }: { value: unknown; masked?: boolean }) {
  const text = value == null || value === "" ? "—" : String(value);
  const isMasked = masked ?? text.includes("•");
  return (
    <span className={isMasked ? "font-mono text-slate-500" : undefined} title={isMasked ? "Masked for your role" : undefined}>
      {text}
      {isMasked ? <span className="ml-1 text-xs">🔒</span> : null}
    </span>
  );
}

export function RecordDetail({ title, fields, actions, children }: { title: ReactNode; fields: { label: string; value: ReactNode }[]; actions?: ReactNode; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} actions={actions} />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{f.label}</dt>
            <dd className="mt-1 text-sm text-slate-900">{f.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </Card>
  );
}

/** Server-side gate: renders children only when `allowed`. The real check lives in the action. */
export function RoleGate({ allowed, children, fallback = null }: { allowed: boolean; children: ReactNode; fallback?: ReactNode }) {
  return <>{allowed ? children : fallback}</>;
}

export function ApprovalBanner({ status, summary, href }: { status: string; summary: string; href?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span>
        <Badge tone="yellow">{status}</Badge> <span className="ml-2">{summary}</span>
      </span>
      {href ? <a className="font-medium underline" href={href}>View approval</a> : null}
    </div>
  );
}

export interface AuditEntry {
  seq: string;
  occurred_at: Date | string;
  actor_email: string | null;
  action: string | null;
  outcome: string | null;
  kind: string;
  reason?: string | null;
  changed?: string[] | null;
}

export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="px-5 py-4 text-sm text-slate-500">No audit events yet.</p>;
  return (
    <ol className="divide-y divide-slate-100">
      {entries.map((e) => (
        <li key={e.seq} className="flex items-start gap-3 px-5 py-3 text-sm">
          <Badge tone={e.outcome === "success" ? "green" : e.outcome === "denied" || e.outcome === "error" ? "red" : "yellow"}>{e.outcome ?? e.kind}</Badge>
          <div className="flex-1">
            <div className="font-medium text-slate-900">{e.action}</div>
            <div className="text-xs text-slate-500">
              {e.actor_email ?? "system"} · {new Date(e.occurred_at).toLocaleString()}
              {e.changed?.length ? ` · changed ${e.changed.join(", ")}` : ""}
              {e.reason ? ` · ${e.reason}` : ""}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
