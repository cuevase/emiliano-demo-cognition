import { describe, expect, it } from "vitest";
import { Forbidden, PermissionRegistry, type ToolManifest, type User } from "./index";

const manifest: ToolManifest = {
  name: "demo", title: "Demo", description: "", ownerTeam: "platform", icon: "box",
  permissions: { "demo:read": "Read", "demo:write": "Write", "demo:pii.read": "See PII" },
  roles: { support_agent: ["demo:read", "demo:write"], admin: ["demo:read", "demo:write", "demo:pii.read"] },
  conditions: {
    "demo:write": { description: "amount within your limit", check: (u, r) => Number(r.amount ?? 0) <= Number(u.attributes.limit ?? 0) },
  },
};
const user = (roles: string[], attributes: Record<string, unknown> = {}): User => ({ id: "u", email: "u@x", name: null, roles, attributes });

describe("PermissionRegistry", () => {
  const reg = new PermissionRegistry([manifest]);

  it("grants by role", () => {
    expect(reg.can(user(["support_agent"]), "demo:read")).toBe(true);
    expect(reg.can(user(["viewer"]), "demo:read")).toBe(false);
    expect(reg.can(null, "demo:read")).toBe(false);
  });

  it("applies conditions", () => {
    const u = user(["support_agent"], { limit: 500 });
    expect(reg.can(u, "demo:write", { amount: 400 })).toBe(true);
    expect(reg.can(u, "demo:write", { amount: 600 })).toBe(false);
    expect(() => reg.assert(u, "demo:write", { amount: 600 })).toThrow(Forbidden);
    expect(reg.explain(u, "demo:write", { amount: 600 })).toMatch(/condition failed/);
  });

  it("masks classified fields server-side", () => {
    const rec = { id: "1", email: "jane@example.com", ssn: "123-45-6789", note: "hi" };
    const cls = { email: "pii", ssn: "pii", note: "public" } as const;
    const masked = reg.mask(user(["support_agent"]), "demo", rec, cls);
    expect(masked.ssn).toBe("•••6789");
    expect(masked.email).toBe("j•••@example.com");
    expect(masked.note).toBe("hi");
    expect(reg.mask(user(["admin"]), "demo", rec, cls).ssn).toBe("123-45-6789");
  });

  it("rejects unprefixed or unknown permissions", () => {
    expect(() => new PermissionRegistry([{ ...manifest, permissions: { "other:x": "x" }, roles: {} }])).toThrow(/prefixed/);
    expect(() => new PermissionRegistry([{ ...manifest, roles: { admin: ["demo:nope"] } }])).toThrow(/unknown permission/);
  });
});
