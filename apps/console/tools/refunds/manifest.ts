import type { ToolManifest } from "@platform/permissions";

export const manifest = {
  name: "refunds",
  title: "Refunds",
  description: "Refund requests: request, approve ($500+), issue (simulated) and track refund metrics",
  ownerTeam: "payments-ops",
  icon: "receipt",
  permissions: {
    "refunds:read": "View refund requests and metrics",
    "refunds:request": "Request refunds (issued immediately under $500)",
    "refunds:approve": "Approve or reject refunds of $500 or more",
    "refunds:pii.read": "See customer PII and refund amounts unmasked",
  },
  roles: {
    support_agent: ["refunds:read", "refunds:request"],
    ops_analyst: ["refunds:read"],
    finance_approver: ["refunds:read", "refunds:approve", "refunds:pii.read"],
    auditor: ["refunds:read", "refunds:pii.read"],
    admin: ["refunds:read", "refunds:request", "refunds:approve", "refunds:pii.read"],
  },
  conditions: {
    "refunds:request": {
      description: "only the requester (or an admin) can submit a refund for issuing",
      check: (user, r) => r.requested_by === undefined || r.requested_by === user.id || user.roles.includes("admin"),
    },
    "refunds:approve": {
      description: "the requester can't approve or reject their own refund",
      check: (user, r) => r.requested_by === undefined || r.requested_by !== user.id,
    },
  },
} satisfies ToolManifest;
