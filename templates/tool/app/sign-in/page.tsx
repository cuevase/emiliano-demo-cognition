import { redirect } from "next/navigation";
import { Card, CardHeader } from "@platform/ui";
import { PERSONAS, getCurrentUser, isDemoMode } from "@platform/auth";
import { PersonaButton } from "./persona-button";

export const dynamic = "force-dynamic";

export default async function SignIn() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader title="Sign in to __TITLE__" description="Same accounts and roles as every other internal tool." />
        <div className="space-y-2 p-5">
          {isDemoMode() ? PERSONAS.map((p) => <PersonaButton key={p.key} personaKey={p.key} label={`${p.name} · ${p.roles.join(", ")}`} />) : <p className="text-sm text-slate-500">Sign in through the console.</p>}
        </div>
      </Card>
    </div>
  );
}
