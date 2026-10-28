import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_PERMISSIONS } from "./roles";
import type { Classification, Condition, FieldClassification, Permission, ToolManifest, User } from "./types";

export class Forbidden extends Error {
  constructor(public permission: string, public reason = "missing permission") {
    super(`Forbidden: ${permission} (${reason})`);
    this.name = "Forbidden";
  }
}

export class PermissionRegistry {
  readonly rolePermissions = new Map<string, Set<string>>();
  readonly permissions = new Map<string, string>();
  readonly conditions = new Map<string, { description: string; check: Condition }>();
  readonly tools: ToolManifest[] = [];

  constructor(manifests: ToolManifest[] = []) {
    this.addRoles(PLATFORM_ROLE_PERMISSIONS, PLATFORM_PERMISSIONS);
    for (const m of manifests) this.register(m);
  }

  register(manifest: ToolManifest): void {
    for (const p of Object.keys(manifest.permissions)) {
      if (!p.startsWith(`${manifest.name}:`)) throw new Error(`${manifest.name}: permission ${p} must be prefixed with the tool name`);
    }
    this.tools.push(manifest);
    this.addRoles(manifest.roles, manifest.permissions);
    for (const [p, c] of Object.entries(manifest.conditions ?? {})) if (c) this.conditions.set(p, c);
  }

  private addRoles(roles: Record<string, Permission[]>, perms: Record<string, string>): void {
    for (const [p, d] of Object.entries(perms)) this.permissions.set(p, d);
    for (const [role, ps] of Object.entries(roles)) {
      const set = this.rolePermissions.get(role) ?? new Set<string>();
      for (const p of ps) {
        if (!this.permissions.has(p)) throw new Error(`role ${role} references unknown permission ${p}`);
        set.add(p);
      }
      this.rolePermissions.set(role, set);
    }
  }

  permissionsFor(user: Pick<User, "roles">): string[] {
    const out = new Set<string>();
    for (const r of user.roles) for (const p of this.rolePermissions.get(r) ?? []) out.add(p);
    return [...out].sort();
  }

  /** Role-based check, then the permission's condition (if any) against the resource. */
  can(user: User | null, permission: string, resource: Record<string, unknown> = {}): boolean {
    if (!user) return false;
    if (!this.permissionsFor(user).includes(permission)) return false;
    const condition = this.conditions.get(permission);
    return condition ? condition.check(user, resource) : true;
  }

  explain(user: User | null, permission: string, resource: Record<string, unknown> = {}): string | null {
    if (!user) return "not signed in";
    if (!this.permissionsFor(user).includes(permission)) return "missing permission";
    const condition = this.conditions.get(permission);
    if (condition && !condition.check(user, resource)) return `condition failed: ${condition.description}`;
    return null;
  }

  assert(user: User | null, permission: string, resource: Record<string, unknown> = {}): void {
    const reason = this.explain(user, permission, resource);
    if (reason) throw new Forbidden(permission, reason);
  }

  /** Server-side masking by field classification. `<tool>:pii.read` reveals pii and sensitive fields. */
  mask<T extends Record<string, unknown>>(user: User | null, tool: string, record: T, classification: FieldClassification): T {
    const canPii = this.can(user, `${tool}:pii.read`);
    const canSensitive = canPii || this.can(user, `${tool}:sensitive.read`);
    const out: Record<string, unknown> = { ...record };
    for (const [field, cls] of Object.entries(classification) as [string, Classification][]) {
      if (!(field in out) || out[field] == null) continue;
      if ((cls === "pii" && !canPii) || (cls === "sensitive" && !canSensitive)) out[field] = maskValue(out[field]);
    }
    return out as T;
  }

  /** Flattened rows for the DB mirror (platform.role_permissions). */
  rolePermissionRows(): { role: string; permission: string }[] {
    const rows: { role: string; permission: string }[] = [];
    for (const [role, ps] of this.rolePermissions) for (const permission of ps) rows.push({ role, permission });
    return rows;
  }
}

export function maskValue(value: unknown): string {
  const s = String(value);
  if (s.includes("@")) {
    const [local = "", domain = ""] = s.split("@");
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return s.length <= 4 ? "••••" : `•••${s.slice(-4)}`;
}
