"use client";
import { useState, useTransition } from "react";
import { Button, Input, Label, Select, Textarea } from "@platform/ui";
import { ActionButton, ResultMessage, type ActionResultLike } from "@platform/ui/client";
import { cancelApproval, decideApproval, emailSignIn, googleSignIn, grantRole, personaSignIn, revokeRole } from "@/app/server-actions";

export function PersonaButton({ personaKey, name, title }: { personaKey: string; name: string; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <button
      data-testid={`persona-${personaKey}`}
      disabled={pending}
      onClick={() => start(async () => { const r = await personaSignIn(personaKey); if (r && !r.ok) setError(r.error); })}
      className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
    >
      <span>
        <span className="block text-sm font-medium text-slate-900">{name}</span>
        <span className="block text-xs text-slate-500">{title}</span>
      </span>
      <span className="text-xs text-slate-400">{pending ? "Signing in…" : error ?? "Sign in →"}</span>
    </button>
  );
}

export function EmailSignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResultLike | null>(null);
  return (
    <div className="space-y-4">
      {googleEnabled ? (
        <Button variant="secondary" className="w-full" disabled={pending} onClick={() => start(async () => { const r = await googleSignIn(); if (r && !r.ok) setResult(r); })}>
          Continue with Google
        </Button>
      ) : null}
      <form
        className="space-y-3"
        action={(fd) => start(async () => {
          const r = await emailSignIn({ mode, email: String(fd.get("email")), password: String(fd.get("password")), name: String(fd.get("name") ?? "") });
          if (r && !r.ok) setResult(r);
        })}
      >
        {mode === "sign-up" ? <div><Label htmlFor="name">Name</Label><Input id="name" name="name" /></div> : null}
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" minLength={8} required /></div>
        <Button type="submit" className="w-full" disabled={pending}>{mode === "sign-in" ? "Sign in" : "Create account"}</Button>
      </form>
      <button className="text-xs text-slate-500 underline" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>
        {mode === "sign-in" ? "No account? Sign up (you'll start as a viewer)" : "Have an account? Sign in"}
      </button>
      {result ? <ResultMessage result={result} /> : null}
    </div>
  );
}

export function DecisionPanel({ id }: { id: string }) {
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResultLike | null>(null);
  const decide = (d: "approve" | "reject") => start(async () => setResult(await decideApproval(id, d, comment || undefined)));
  return (
    <div className="space-y-3">
      <Textarea placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => decide("approve")} data-testid="approve">Approve</Button>
        <Button variant="danger" disabled={pending} onClick={() => decide("reject")} data-testid="reject">Reject</Button>
      </div>
      {result ? <ResultMessage result={result} /> : null}
    </div>
  );
}

export function CancelButton({ id }: { id: string }) {
  return <ActionButton variant="secondary" label="Cancel request" confirm="Cancel this request?" action={() => cancelApproval(id)} />;
}

export function GrantRoleForm({ userId, roles }: { userId: string; roles: string[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResultLike | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={(fd) => start(async () => setResult(await grantRole({ userId, role: String(fd.get("role")), reason: String(fd.get("reason")) })))}
    >
      <Select name="role" className="w-44">{roles.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
      <Input name="reason" placeholder="Reason" className="w-52" required minLength={3} />
      <Button type="submit" variant="secondary" disabled={pending}>Grant</Button>
      {result ? <div className="basis-full"><ResultMessage result={result} /></div> : null}
    </form>
  );
}

export function RevokeRoleButton({ userId, role }: { userId: string; role: string }) {
  return <ActionButton variant="ghost" label={`× ${role}`} confirm={`Revoke ${role}?`} action={() => revokeRole({ userId, role })} />;
}
