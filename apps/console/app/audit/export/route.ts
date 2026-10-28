import { getCurrentUser } from "@platform/auth";
import { queryAudit, toCsv, writeAuditEvent } from "@platform/audit";
import { platform } from "@/lib/platform";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !platform.registry.can(user, "platform:audit.read")) return new Response("Forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  const csv = await platform.as(user, async (tx) => {
    const rows = await queryAudit(tx, {
      actor: p.get("actor") ?? undefined, action: p.get("action") ?? undefined, app: p.get("app") ?? undefined,
      kind: p.get("kind") ?? undefined, resourceId: p.get("resource") ?? undefined, limit: 1000,
    });
    await writeAuditEvent(tx, { kind: "action", action: "platform.audit.export", outcome: "success", actor: user, metadata: { rows: rows.length, filters: Object.fromEntries(p) } });
    return toCsv(rows);
  });
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
