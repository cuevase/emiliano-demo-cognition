import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@platform/auth";
import { platform } from "@/tools/refunds/lib/actions";

/** Users without refunds:read get "not found" for every page of this tool. */
export default async function ToolLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (!platform.registry.can(user, "refunds:read")) notFound();
  return children;
}
