import { redirect } from "next/navigation";
import { Card, CardHeader } from "@platform/ui";
import { PERSONAS, getCurrentUser, isDemoMode, neonAuthEnabled } from "@platform/auth";
import { EmailSignInForm, PersonaButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/");
  const demo = isDemoMode();
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="md:col-span-2 text-center">
          <h1 className="text-2xl font-semibold">Internal Tools Platform</h1>
          <p className="mt-1 text-sm text-slate-500">One sign-in, one permissions model, one audit log and one approvals engine for every internal tool.</p>
        </div>
        {demo ? (
          <Card>
            <CardHeader title="Demo personas" description="One click, pre-assigned roles. Only shown when DEMO_MODE=true." />
            <div className="space-y-2 p-5">
              {PERSONAS.map((p) => <PersonaButton key={p.key} personaKey={p.key} name={p.name} title={`${p.title} · ${p.roles.join(", ")}`} />)}
            </div>
          </Card>
        ) : null}
        <Card className={demo ? undefined : "md:col-span-2"}>
          <CardHeader title="Sign in" description="New accounts start with view-only access. An admin grants roles." />
          <div className="p-5">
            {neonAuthEnabled() ? <EmailSignInForm googleEnabled /> : <p className="text-sm text-slate-500">Neon Auth is not configured in this environment. Use a demo persona.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
