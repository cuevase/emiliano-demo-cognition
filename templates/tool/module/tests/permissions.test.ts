import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@platform/db";
import { makeUser, ownerQuery, registerManifests } from "../../../../../tests/helpers";
import { manifest } from "../manifest";
import { APPROVAL_THRESHOLD_CENTS, createItem, listItems, platform, updateStatus } from "../lib/actions";

beforeAll(() => registerManifests(manifest));
afterAll(closePool);

const input = { title: "Test item", customer_email: "jane@example.com", amount_cents: 1000 };

describe("__TOOL__.create", () => {
  it("allows support_agent", async () => {
    const u = await makeUser(["support_agent"]);
    expect((await createItem(u, input)).ok).toBe(true);
  });
  it("denies viewer and audits the denial", async () => {
    const u = await makeUser(["viewer"]);
    expect(await createItem(u, input)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await ownerQuery("select 1 from platform.audit_log where actor_id = $1 and outcome = 'denied'", [u.id])).toHaveLength(1);
  });
  it("redacts PII in the audit log", async () => {
    const u = await makeUser(["support_agent"]);
    await createItem(u, input);
    const rows = await ownerQuery<{ after: string }>("select after::text from platform.audit_log where actor_id = $1", [u.id]);
    expect(rows.every((r) => !String(r.after).includes("jane@example.com"))).toBe(true);
  });
});

describe("__TOOL__.update_status", () => {
  async function newItem(amount_cents = 1000) {
    const owner = await makeUser(["support_agent"]);
    const r = await createItem(owner, { ...input, amount_cents });
    if (!r.ok || !("data" in r)) throw new Error("create failed");
    return { owner, id: r.data.id };
  }
  it("allows the owner", async () => {
    const { owner, id } = await newItem();
    expect(await updateStatus(owner, { id, status: "in_progress" })).toMatchObject({ ok: true });
  });
  it("denies a support agent who is not the owner", async () => {
    const { id } = await newItem();
    const other = await makeUser(["support_agent"]);
    expect(await updateStatus(other, { id, status: "in_progress" })).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("ignores client-supplied amounts when deciding on approval", async () => {
    const { owner, id } = await newItem(APPROVAL_THRESHOLD_CENTS);
    const r = await updateStatus(owner, { id, status: "closed", amount_cents: 0 });
    expect(r).toMatchObject({ ok: true, pending: true });
  });
  it("routes high-value closes to approval, and an approver executes it", async () => {
    const { owner, id } = await newItem(APPROVAL_THRESHOLD_CENTS);
    const r = await updateStatus(owner, { id, status: "closed" });
    if (!r.ok || !("pending" in r)) throw new Error("expected approval");
    const approver = await makeUser(["finance_approver"]);
    const d = await platform.as(approver, (tx) => platform.approvals.decide(tx, approver, r.approvalId, "approve"));
    expect(d.status).toBe("executed");
    const [row] = await ownerQuery<{ status: string }>("select status from __SCHEMA__.items where id = $1", [id]);
    expect(row?.status).toBe("closed");
  });
});

describe("visibility", () => {
  it("hides the tool from users without __TOOL__:read (default viewer role)", async () => {
    const owner = await makeUser(["support_agent"]);
    await createItem(owner, input);
    const viewer = await makeUser(["viewer"]);
    expect(platform.registry.can(viewer, "__TOOL__:read")).toBe(false);
    expect(await listItems(viewer)).toHaveLength(0);
    expect((await listItems(owner)).length).toBeGreaterThan(0);
  });
});

describe("masking", () => {
  it("masks PII for roles without __TOOL__:pii.read", async () => {
    const u = await makeUser(["support_agent"]);
    const masked = platform.registry.mask(u, "__TOOL__", { customer_email: "jane@example.com" }, { customer_email: "pii" });
    expect(masked.customer_email).not.toContain("jane");
  });
});
