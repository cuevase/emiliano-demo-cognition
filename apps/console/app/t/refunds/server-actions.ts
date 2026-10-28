"use server";
import { revalidatePath } from "next/cache";
import { serverAction } from "@platform/actions";
import { getCurrentUser, getRequestMeta } from "@platform/auth";
import { issueRefund as issueRefundAction, rejectRefund as rejectRefundAction, submitRefund as submit } from "@/tools/refunds/lib/actions";

const issue = serverAction(issueRefundAction);
const reject = serverAction(rejectRefundAction);

export async function submitRefund(input: unknown) {
  const r = await submit(await getCurrentUser(), input, await getRequestMeta());
  revalidatePath("/t/refunds", "layout");
  return r;
}

export async function issueRefund(input: { id: string }) {
  const r = await issue(input);
  revalidatePath("/t/refunds", "layout");
  return r;
}

export async function rejectRefund(input: { id: string; note?: string }) {
  const r = await reject(input);
  revalidatePath("/t/refunds", "layout");
  return r;
}
