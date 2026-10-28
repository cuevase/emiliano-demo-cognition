import type { ToolManifest } from "@platform/permissions";

export const manifest = {
  name: "__TOOL__",
  title: "__TITLE__",
  description: "TODO: one line on what this tool is for",
  ownerTeam: "TODO-team",
  icon: "box",
  permissions: {
    "__TOOL__:read": "View items",
    "__TOOL__:create": "Create items",
    "__TOOL__:update": "Change item status",
    "__TOOL__:approve": "Approve high-value changes",
    "__TOOL__:pii.read": "See customer PII unmasked",
  },
  // Tools are hidden by default: only roles listed here can open /t/__TOOL__. Everyone who signs in
  // starts as `viewer`, so grant it "__TOOL__:read" only if every employee should see this tool.
  roles: {
    support_agent: ["__TOOL__:read", "__TOOL__:create", "__TOOL__:update"],
    ops_analyst: ["__TOOL__:read", "__TOOL__:update"],
    finance_approver: ["__TOOL__:read", "__TOOL__:approve", "__TOOL__:pii.read"],
    admin: ["__TOOL__:read", "__TOOL__:create", "__TOOL__:update", "__TOOL__:approve", "__TOOL__:pii.read"],
    auditor: ["__TOOL__:read"],
  },
  conditions: {
    "__TOOL__:update": {
      description: "only the owner or an ops analyst/admin can change an item",
      check: (user, item) => item.owner_id === undefined || item.owner_id === user.id || user.roles.some((r) => r === "ops_analyst" || r === "admin"),
    },
  },
} satisfies ToolManifest;
