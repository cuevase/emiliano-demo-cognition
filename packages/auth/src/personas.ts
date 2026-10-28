export interface Persona {
  key: string;
  name: string;
  email: string;
  title: string;
  roles: string[];
  attributes: Record<string, unknown>;
}

/** Seeded demo users. Sign-in buttons for these only render when DEMO_MODE=true. */
export const PERSONAS: Persona[] = [
  { key: "alice", name: "Alice Support", email: "alice@demo.internal", title: "Support agent", roles: ["support_agent"], attributes: { refund_limit_cents: 50_000, region: "US" } },
  { key: "bob", name: "Bob Ops", email: "bob@demo.internal", title: "Ops analyst", roles: ["ops_analyst"], attributes: { region: "US" } },
  { key: "carol", name: "Carol Finance", email: "carol@demo.internal", title: "Finance approver", roles: ["finance_approver"], attributes: { refund_limit_cents: 1_000_000 } },
  { key: "dave", name: "Dave Admin", email: "dave@demo.internal", title: "Platform admin", roles: ["admin"], attributes: {} },
  { key: "erin", name: "Erin Auditor", email: "erin@demo.internal", title: "Auditor", roles: ["auditor"], attributes: {} },
];

export function personaByEmail(email: string): Persona | undefined {
  return PERSONAS.find((p) => p.email === email.toLowerCase());
}

export function personaByKey(key: string): Persona | undefined {
  return PERSONAS.find((p) => p.key === key);
}

export const isDemoMode = (): boolean => process.env.DEMO_MODE === "true";
