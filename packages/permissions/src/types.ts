export interface User {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  /** Attributes used by conditions, e.g. { refund_limit_cents: 50000 } */
  attributes: Record<string, unknown>;
}

/** `<tool>:<verb>`, e.g. `refunds:issue`, `platform:audit.read` */
export type Permission = `${string}:${string}`;

export type Classification = "public" | "sensitive" | "pii";
export type FieldClassification = Record<string, Classification>;

export type Condition = (user: User, resource: Record<string, unknown>) => boolean;

export interface ToolManifest {
  name: string;
  title: string;
  description: string;
  ownerTeam: string;
  icon: string;
  /** Permission -> human description */
  permissions: Record<Permission, string>;
  /** Role -> permissions this tool grants to that role */
  roles: Record<string, Permission[]>;
  /** Optional attribute-based checks attached to a permission */
  conditions?: Partial<Record<Permission, { description: string; check: Condition }>>;
}
