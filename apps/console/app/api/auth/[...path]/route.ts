import { neonAuth, neonAuthEnabled } from "@platform/auth";

const notConfigured = async () => new Response("Neon Auth is not configured", { status: 404 });

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!neonAuthEnabled()) return notConfigured();
  return neonAuth().handler().GET(req, ctx);
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!neonAuthEnabled()) return notConfigured();
  return neonAuth().handler().POST(req, ctx);
}
