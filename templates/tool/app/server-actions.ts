"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverAction } from "@platform/actions";
import { signOut } from "@platform/auth";
import { createItem as createItemAction, updateStatus as updateStatusAction } from "@/lib/actions";

const create = serverAction(createItemAction);
const update = serverAction(updateStatusAction);

export async function createItem(input: unknown) {
  const r = await create(input);
  revalidatePath("/");
  return r;
}

export async function updateStatus(input: unknown) {
  const r = await update(input);
  revalidatePath("/");
  return r;
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/sign-in");
}
