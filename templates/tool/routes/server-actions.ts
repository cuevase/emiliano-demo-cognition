"use server";
import { revalidatePath } from "next/cache";
import { serverAction } from "@platform/actions";
import { createItem as createItemAction, updateStatus as updateStatusAction } from "@/tools/__TOOL__/lib/actions";

const create = serverAction(createItemAction);
const update = serverAction(updateStatusAction);

export async function createItem(input: unknown) {
  const r = await create(input);
  revalidatePath("/t/__TOOL__", "layout");
  return r;
}

export async function updateStatus(input: unknown) {
  const r = await update(input);
  revalidatePath("/t/__TOOL__", "layout");
  return r;
}
