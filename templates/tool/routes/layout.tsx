import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@platform/auth";
import { platform } from "@/tools/__TOOL__/lib/actions";

/** Users without __TOOL__:read get "not found" for every page of this tool. */
export default async function ToolLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (!platform.registry.can(user, "__TOOL__:read")) notFound();
  return children;
}
