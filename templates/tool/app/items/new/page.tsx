import { redirect } from "next/navigation";
import { Card, CardHeader, PageHeader } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { platform } from "@/lib/actions";
import { Shell } from "../../shell";
import { NewItemForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const user = await requireUser();
  if (!platform.registry.can(user, "__TOOL__:create")) redirect("/");
  return (
    <Shell active="new">
      <PageHeader title="New item" />
      <Card className="max-w-xl"><CardHeader title="Details" /><div className="p-5"><NewItemForm /></div></Card>
    </Shell>
  );
}
