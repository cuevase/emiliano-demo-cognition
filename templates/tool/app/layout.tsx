import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "__TITLE__" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body className="antialiased text-slate-900">{children}</body></html>;
}
