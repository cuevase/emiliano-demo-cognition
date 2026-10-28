import { redirect } from "next/navigation";
import { Card, CardHeader, PageHeader } from "@platform/ui";
import { requireUser } from "@platform/auth";
import { APPROVAL_THRESHOLD_CENTS, platform } from "@/tools/refunds/lib/actions";
import { ConsoleShell as Shell } from "@/components/shell";
import { usd } from "../format";
import { NewRefundForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewRefundPage() {
  const user = await requireUser();
  if (!platform.registry.can(user, "refunds:request")) redirect("/t/refunds");
  return (
    <Shell active="refunds">
      <PageHeader title="New refund" description={<a className="underline" href="/t/refunds">← All refunds</a>} />
      <Card className="max-w-xl">
        <CardHeader title="Details" description={`Under ${usd(APPROVAL_THRESHOLD_CENTS)} is issued immediately (simulated SIM- reference). ${usd(APPROVAL_THRESHOLD_CENTS)} or more goes to a finance approver.`} />
        <div className="p-5"><NewRefundForm /></div>
      </Card>
    </Shell>
  );
}
