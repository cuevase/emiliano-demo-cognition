import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withSystemTx, withTx } from "@platform/db";
import { verifyChain, writeAuditEvent } from "@platform/audit";
import { ownerQuery } from "../helpers";

afterAll(closePool);

describe("audit log", () => {
  it("chains hashes and verifies", async () => {
    await withSystemTx("test", randomUUID(), async (tx) => {
      await writeAuditEvent(tx, { kind: "system", action: "test.a", outcome: "success" });
      await writeAuditEvent(tx, { kind: "system", action: "test.b", outcome: "success" });
    });
    const status = await withSystemTx("test", randomUUID(), verifyChain);
    expect(status.ok).toBe(true);
    expect(status.checked).toBeGreaterThanOrEqual(2);
  });

  it("is append-only for the app role", async () => {
    const ctx = { userId: "u1", roles: ["admin"], requestId: randomUUID(), app: "test" };
    await expect(withTx(ctx, (tx) => tx.query("update platform.audit_log set reason = 'x'"))).rejects.toThrow();
    await expect(withTx(ctx, (tx) => tx.query("delete from platform.audit_log"))).rejects.toThrow();
  });

  it("is append-only even for the owner, and detects tampering when triggers are bypassed", async () => {
    await expect(ownerQuery("update platform.audit_log set reason = 'x'")).rejects.toThrow(/append-only/);
    await ownerQuery(`
      alter table platform.audit_log disable trigger audit_no_update_delete;
      update platform.audit_log set reason = 'tampered' where seq = (select min(seq) from platform.audit_log);
      alter table platform.audit_log enable trigger audit_no_update_delete;`);
    const status = await withSystemTx("test", randomUUID(), verifyChain);
    expect(status.ok).toBe(false);
    expect(status.brokenSeq).not.toBeNull();
    // restore a clean chain for later tests
    await ownerQuery(`
      alter table platform.audit_log disable trigger user;
      delete from platform.audit_log;
      alter table platform.audit_log enable trigger user;`);
  });

  it("serializes concurrent writers into one valid chain", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        withSystemTx("test", randomUUID(), (tx) => writeAuditEvent(tx, { kind: "system", action: `test.concurrent.${i}`, outcome: "success" })),
      ),
    );
    expect((await withSystemTx("test", randomUUID(), verifyChain)).ok).toBe(true);
  });
});
