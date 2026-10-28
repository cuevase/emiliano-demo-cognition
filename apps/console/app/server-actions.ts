"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, getRequestMeta, signInAsPersona, signInWithEmail, signInWithGoogleUrl, signOut, signUpWithEmail } from "@platform/auth";
import { serverAction } from "@platform/actions";
import { writeAuditEvent } from "@platform/audit";
import { ApprovalError } from "@platform/approvals";
import { Forbidden } from "@platform/permissions";
import { platform, platformFor } from "@/lib/platform";
import { grantRole as grantRoleAction, revokeRole as revokeRoleAction } from "@/lib/actions";

type Result = { ok: true; message?: string; pending?: boolean } | { ok: false; error: string };

export async function personaSignIn(key: string): Promise<Result> {
  const r = await signInAsPersona(key);
  if (!r.ok) return r;
  redirect("/");
}

export async function emailSignIn(form: { email: string; password: string; mode: "sign-in" | "sign-up"; name?: string }): Promise<Result> {
  const r = form.mode === "sign-up"
    ? await signUpWithEmail(form.name || form.email, form.email, form.password)
    : await signInWithEmail(form.email, form.password);
  if (!r.ok) return { ok: false, error: r.error ?? "Sign-in failed" };
  redirect("/");
}

export async function googleSignIn(): Promise<Result> {
  const url = await signInWithGoogleUrl("/");
  if (!url) return { ok: false, error: "Google sign-in is not configured" };
  redirect(url);
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/sign-in");
}

const grant = serverAction(grantRoleAction);
const revoke = serverAction(revokeRoleAction);

export async function grantRole(input: { userId: string; role: string; reason: string }): Promise<Result> {
  const r = await grant(input);
  revalidatePath("/admin/roles");
  return r.ok ? { ok: true, pending: "pending" in r, message: "pending" in r ? r.message : undefined } : r;
}

export async function revokeRole(input: { userId: string; role: string }): Promise<Result> {
  const r = await revoke(input);
  revalidatePath("/admin/roles");
  return r.ok ? { ok: true } : r;
}

export async function decideApproval(id: string, decision: "approve" | "reject", comment?: string): Promise<Result> {
  const user = await getCurrentUser();
  const meta = await getRequestMeta();
  if (!user) return { ok: false, error: "Sign in required" };
  try {
    const app = (await platform.as(user, (tx) => platform.approvals.get(tx, id)))?.request.app;
    if (!app) throw new ApprovalError("Approval request not found", "not_found");
    const owner = platformFor(app);
    const r = await owner.as(user, (tx) => owner.approvals.decide(tx, user, id, decision, comment), meta.requestId);
    revalidatePath("/approvals");
    revalidatePath(`/approvals/${id}`);
    if (r.status === "expired") return { ok: false, error: "This request has expired" };
    if (r.status === "failed") return { ok: false, error: `Approved, but execution failed: ${"error" in r ? r.error : ""}` };
    return { ok: true, message: r.status };
  } catch (err) {
    if (err instanceof Forbidden || (err instanceof ApprovalError && err.code === "not_found")) {
      await platform.as(user, (tx) => writeAuditEvent(tx, {
        kind: "action", action: `approval.${decision}`, outcome: "denied",
        actor: { id: user.id, email: user.email, roles: user.roles },
        resourceType: "platform.approval_request", resourceId: id, reason: err.message,
      }), meta.requestId);
      return { ok: false, error: err instanceof Forbidden ? `Not allowed: ${err.reason}` : "Request not found" };
    }
    if (err instanceof ApprovalError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function cancelApproval(id: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in required" };
  try {
    await platform.as(user, (tx) => platform.approvals.cancel(tx, user, id));
    revalidatePath(`/approvals/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
