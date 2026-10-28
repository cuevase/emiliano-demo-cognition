import { cookies } from "next/headers";
import { decodeLocalSession, LOCAL_COOKIE } from "./local-session";
import { neonAuth, neonAuthEnabled } from "./neon";

export interface Identity {
  sessionId: string;
  userId: string;
  email: string;
  name: string | null;
  provider: "neon" | "local";
}

/** Who is signed in, according to the identity provider. Roles come from the platform, not from here. */
export async function getIdentity(): Promise<Identity | null> {
  const local = decodeLocalSession((await cookies()).get(LOCAL_COOKIE)?.value);
  if (local) return { sessionId: local.sid, userId: local.userId, email: local.email, name: local.name, provider: "local" };
  if (!neonAuthEnabled()) return null;
  const { data } = await neonAuth().getSession();
  if (!data?.user) return null;
  return {
    sessionId: data.session.id,
    userId: data.user.id,
    email: data.user.email.toLowerCase(),
    name: data.user.name ?? null,
    provider: "neon",
  };
}
