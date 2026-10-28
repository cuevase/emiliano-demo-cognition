"use server";
import { redirect } from "next/navigation";
import { signInAsPersona } from "@platform/auth";

export async function personaSignIn(key: string): Promise<void> {
  const r = await signInAsPersona(key);
  if (r.ok) redirect("/");
}
