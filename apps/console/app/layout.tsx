import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Internal Tools Platform", description: "Sign-in, permissions, audit and approvals for every internal tool" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900">{children}</body>
    </html>
  );
}
