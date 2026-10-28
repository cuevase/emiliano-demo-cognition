import { Badge, Card, CardHeader, PageHeader, statusTone } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { listItems, platform } from "@/tools/__TOOL__/lib/actions";
import { ItemsTable } from "./items-table";
import { ConsoleShell as Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const user = await requireUser();
  const rows = await listItems(user);
  return (
    <Shell active="__TOOL__">
      <PageHeader title="__TITLE__" description="Generated from the platform template. Edit tools/__TOOL__/lib/actions.ts and db/migrations to make it yours." actions={platform.registry.can(user, "__TOOL__:create") ? <a href="/t/__TOOL__/items/new"><Badge tone={statusTone("success")}>+ New item</Badge></a> : null} />
      <Card>
        <CardHeader title="Items" description="Rows filtered by row-level security; PII masked on the server for your role." />
        <ItemsTable rows={rows.map((r) => ({ ...r, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString() }))} />
      </Card>
    </Shell>
  );
}
