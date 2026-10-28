"use client";
import { ActionButton } from "@platform/ui/client";
import { issueRefund, rejectRefund } from "../server-actions";

export function IssueButton({ id }: { id: string }) {
  return <ActionButton label="Issue refund" action={() => issueRefund({ id })} />;
}

export function RejectButton({ id }: { id: string }) {
  return <ActionButton label="Reject refund" variant="danger" confirm="Reject this refund?" action={() => rejectRefund({ id })} />;
}
