import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { closePool } from "@platform/db";
import { createPlatform } from "@platform/actions/core";
import type { ToolManifest } from "@platform/permissions";
import { makeUser, ownerQuery, registerManifests } from "../helpers";

afterAll(closePool);

const manifest: ToolManifest = {
  name: "notes", title: "Notes", description: "", ownerTeam: "platform", icon: "box",
  permissions: { "notes:write": "Write notes" },
  roles: { support_agent: ["notes:write"] },
};
const platform = createPlatform("notes", [manifest]);
const write = platform.defineAction({
  name: "notes.write",
  permission: "notes:write",
  input: z.object({ text: z.string().min(1), ssn: z.string().optional() }),
  handler: async ({ input }) => ({ id: "n1", text: input.text }),
});

beforeAll(() => registerManifests(manifest));

describe("defineAction", () => {
  it("allows permitted users and audits the success with redaction", async () => {
    const u = await makeUser(["support_agent"]);
    const res = await write(u, { text: "hello", ssn: "123-45-6789" });
    expect(res.ok).toBe(true);
    const [row] = await ownerQuery<{ outcome: string; after: Record<string, unknown> }>(
      "select outcome, after from platform.audit_log where actor_id = $1 and action = 'notes.write'", [u.id]);
    expect(row?.outcome).toBe("success");
    expect(row?.after.ssn).toBe("[redacted]");
  });

  it("denies and audits the denial", async () => {
    const u = await makeUser(["viewer"]);
    const res = await write(u, { text: "hello" });
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
    const rows = await ownerQuery("select 1 from platform.audit_log where actor_id = $1 and outcome = 'denied'", [u.id]);
    expect(rows).toHaveLength(1);
  });

  it("rejects unauthenticated calls and invalid input", async () => {
    expect(await write(null, { text: "x" })).toMatchObject({ ok: false, code: "unauthenticated" });
    const u = await makeUser(["support_agent"]);
    expect(await write(u, { text: "" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses to define an action with an undeclared permission", () => {
    expect(() => platform.defineAction({ name: "x", permission: "notes:nope", input: z.object({}), handler: async () => null })).toThrow(/unknown permission/);
  });
});
