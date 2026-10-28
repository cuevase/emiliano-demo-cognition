import type { Permission } from "./types";

export const PLATFORM_ROLES = ["viewer", "support_agent", "ops_analyst", "finance_approver", "admin", "auditor"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Roles that can only be granted through an approval by a second admin. */
export const PRIVILEGED_ROLES: PlatformRole[] = ["finance_approver", "admin"];

export const PLATFORM_PERMISSIONS: Record<Permission, string> = {
  "platform:console.use": "Open the platform console",
  "platform:audit.read": "Read the full audit log and verify the chain",
  "platform:roles.manage": "Grant and revoke roles",
  "platform:roles.approve": "Approve privileged role grants",
  "platform:approvals.read_all": "See every approval request across tools",
};

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, Permission[]> = {
  viewer: ["platform:console.use"],
  support_agent: ["platform:console.use"],
  ops_analyst: ["platform:console.use"],
  finance_approver: ["platform:console.use"],
  admin: [
    "platform:console.use",
    "platform:audit.read",
    "platform:roles.manage",
    "platform:roles.approve",
    "platform:approvals.read_all",
  ],
  auditor: ["platform:console.use", "platform:audit.read", "platform:approvals.read_all"],
};
