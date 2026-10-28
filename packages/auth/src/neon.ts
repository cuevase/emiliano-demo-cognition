import { createNeonAuth } from "@neondatabase/auth/next/server";

export const neonAuthEnabled = (): boolean => !!process.env.NEON_AUTH_BASE_URL && process.env.AUTH_MODE !== "local";

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function neonAuth(): ReturnType<typeof createNeonAuth> {
  if (!instance) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl || !secret) throw new Error("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required");
    instance = createNeonAuth({ baseUrl, cookies: { secret } });
  }
  return instance;
}
