import type { ReactNode } from "react";
import { AppShell, Button } from "@platform/ui";
import { getCurrentUser, isDemoMode } from "@platform/auth";
import { signOutAction } from "./server-actions";

const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL ?? "http://localhost:3000";

export async function Shell({ children, active }: { children: ReactNode; active: string }) {
  const user = await getCurrentUser();
  return (
    <AppShell
      appTitle="__TITLE__"
      demoMode={isDemoMode()}
      user={user}
      nav={[
        { href: "/", label: "Items", active: active === "items" },
        { href: "/items/new", label: "New item", active: active === "new" },
        { href: `${CONSOLE_URL}/approvals`, label: "Approvals" },
      ]}
      signOut={<form action={signOutAction}><Button variant="secondary" type="submit">Sign out</Button></form>}
    >
      {children}
    </AppShell>
  );
}
