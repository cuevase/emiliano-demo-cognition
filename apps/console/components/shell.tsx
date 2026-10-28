import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AppShell, Button } from "@platform/ui";
import { getCurrentUser, isDemoMode } from "@platform/auth";
import { platform } from "@/lib/platform";
import { TOOLS } from "@/lib/tools";
import { signOutAction } from "@/app/server-actions";

export async function ConsoleShell({ children, active }: { children: ReactNode; active: string }) {
  await headers();
  const user = await getCurrentUser();
  const can = (p: string) => !!user && platform.registry.can(user, p);
  const nav = [
    { href: "/", label: "Home", active: active === "home" },
    ...TOOLS.filter((t) => can(`${t.name}:read`)).map((t) => ({ href: `/t/${t.name}`, label: t.title, active: active === t.name })),
    { href: "/approvals", label: "Approvals", active: active === "approvals" },
    ...(can("platform:audit.read") ? [{ href: "/audit", label: "Audit log", active: active === "audit" }] : []),
    ...(can("platform:roles.manage") || can("platform:audit.read") ? [{ href: "/admin/roles", label: "Roles", active: active === "roles" }] : []),
  ];
  return (
    <AppShell
      appTitle="Internal Tools"
      nav={nav}
      user={user}
      demoMode={isDemoMode()}
      signOut={<form action={signOutAction}><Button variant="secondary" type="submit">Sign out</Button></form>}
    >
      {children}
    </AppShell>
  );
}
