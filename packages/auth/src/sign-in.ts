import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { withSystemTx } from "@platform/db";
import { writeAuditEvent } from "@platform/audit";
import { encodeLocalSession, LOCAL_COOKIE } from "./local-session";
import { neonAuth, neonAuthEnabled } from "./neon";
import { isDemoMode, personaByKey, type Persona } from "./personas";

/** Deterministic per-deployment persona password; never shown or logged. */
export function personaPassword(persona: Persona): string {
  const seed = process.env.DEMO_PERSONA_SECRET ?? process.env.NEON_AUTH_COOKIE_SECRET ?? process.env.AUTH_LOCAL_SECRET ?? "";
  if (seed.length < 16) throw new Error("Set NEON_AUTH_COOKIE_SECRET or DEMO_PERSONA_SECRET");
  return `Demo-${createHmac("sha256", seed).update(persona.email).digest("base64url").slice(0, 24)}`;
}

/** One-click persona sign-in. Only callable when DEMO_MODE=true. */
export async function signInAsPersona(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDemoMode()) return { ok: false, error: "Demo personas are disabled" };
  const persona = personaByKey(key);
  if (!persona) return { ok: false, error: "Unknown persona" };

  if (!neonAuthEnabled()) {
    const token = encodeLocalSession({ userId: `local-${persona.key}`, email: persona.email, name: persona.name });
    (await cookies()).set(LOCAL_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    return { ok: true };
  }

  const auth = neonAuth();
  const password = personaPassword(persona);
  let res = await auth.signIn.email({ email: persona.email, password });
  if (res.error) {
    const created = await auth.signUp.email({ email: persona.email, password, name: persona.name });
    if (created.error) return { ok: false, error: created.error.message ?? "Could not create persona" };
    res = await auth.signIn.email({ email: persona.email, password });
  }
  return res.error ? { ok: false, error: res.error.message ?? "Sign-in failed" } : { ok: true };
}

export async function signInWithEmail(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!neonAuthEnabled()) return { ok: false, error: "Email sign-in needs Neon Auth (NEON_AUTH_BASE_URL)" };
  const res = await neonAuth().signIn.email({ email, password });
  if (res.error) {
    await withSystemTx("platform", randomUUID(), (tx) =>
      writeAuditEvent(tx, { kind: "auth", action: "auth.sign_in", outcome: "denied", actor: { id: null, email: email.toLowerCase(), roles: [] }, reason: "invalid credentials" }),
    );
    return { ok: false, error: "Invalid email or password" };
  }
  return { ok: true };
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!neonAuthEnabled()) return { ok: false, error: "Sign-up needs Neon Auth (NEON_AUTH_BASE_URL)" };
  const res = await neonAuth().signUp.email({ name, email, password });
  return res.error ? { ok: false, error: res.error.message ?? "Sign-up failed" } : { ok: true };
}

export async function signInWithGoogleUrl(callbackURL = "/"): Promise<string | null> {
  if (!neonAuthEnabled()) return null;
  const res = await neonAuth().signIn.social({ provider: "google", callbackURL });
  return (res.data as { url?: string } | null)?.url ?? null;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  if (jar.get(LOCAL_COOKIE)) jar.delete(LOCAL_COOKIE);
  if (neonAuthEnabled()) await neonAuth().signOut();
}
