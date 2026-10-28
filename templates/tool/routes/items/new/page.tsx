import { redirect } from "next/navigation";
import { Card, CardHeader, PageHeader } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { platform } from "@/tools/__TOOL__/lib/actions";
import { ConsoleShell as Shell } from "@/components/shell";
import { NewItemForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const user = await requireUser();
  if (!platform.registry.can(user, "__TOOL__:create")) redirect("/t/__TOOL__");
  return (
    <Shell active="__TOOL__">
      <PageHeader title="New item" />
      <Card className="max-w-xl"><CardHeader title="Details" /><div className="p-5"><NewItemForm /></div></Card>
    </Shell>
  );
}
