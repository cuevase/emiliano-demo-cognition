import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

/**
 * Signed-cookie sessions used when NEON_AUTH_BASE_URL is not set (CI, tests,
 * offline Devin sessions). Only persona sign-in is available in this mode.
 */
export const LOCAL_COOKIE = "platform_local_session";

export interface LocalSession {
  sid: string;
  userId: string;
  email: string;
  name: string;
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_LOCAL_SECRET ?? process.env.NEON_AUTH_COOKIE_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_LOCAL_SECRET must be at least 32 characters");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeLocalSession(input: Omit<LocalSession, "sid" | "exp">, ttlSeconds = 60 * 60 * 8): string {
  const session: LocalSession = { ...input, sid: randomUUID(), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeLocalSession(token: string | undefined): LocalSession | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as LocalSession;
  return session.exp > Date.now() / 1000 ? session : null;
}
