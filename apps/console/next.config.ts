import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@platform/ui", "@platform/auth", "@platform/actions", "@platform/approvals", "@platform/audit", "@platform/db", "@platform/permissions"],
  serverExternalPackages: ["pg"],
};

export default config;
