import type { ReactNode } from "react";
import { cn } from "./cn";

export interface NavItem {
  href: string;
  label: string;
  active?: boolean;
  badge?: number;
}

export interface ShellUser {
  name: string | null;
  email: string;
  roles: string[];
}

/** Shared chrome for every internal tool: nav, current user and roles, sign-out. */
export function AppShell({
  appTitle, nav, user, signOut, children, demoMode,
}: {
  appTitle: string;
  nav: NavItem[];
  user: ShellUser | null;
  signOut?: ReactNode;
  children: ReactNode;
  demoMode?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {demoMode ? (
        <div className="bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-900">Demo environment: synthetic data, demo personas enabled</div>
      ) : null}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-xs text-white">IT</span>
            {appTitle}
          </a>
          <nav className="flex flex-1 items-center gap-1">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className={cn("rounded-md px-3 py-1.5 text-sm", n.active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:text-slate-900")}>
                {n.label}
                {n.badge ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">{n.badge}</span> : null}
              </a>
            ))}
          </nav>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-slate-900" data-testid="current-user">{user.name ?? user.email}</div>
                <div className="text-xs text-slate-500">{user.roles.join(", ")}</div>
              </div>
              {signOut}
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
