---
name: add-audited-action
description: Add a write operation (create/update/delete/state change) to a tool so it is permission-checked, validated, transactional and audited.
---
# Add an audited action

```ts
export const doThing = platform.defineAction({
  name: "<tool>.<verb>",              // unique; appears in the audit log
  permission: "<tool>:<verb>",        // must be declared in manifest.permissions
  input: z.object({ ... }),           // validated server-side
  resource: (input, tx) => load(tx, input.id), // optional: enables conditions + resource ids in audit
  redactInput: ["customer_email"],    // input fields never written to the audit log
  handler: async ({ input, user, tx }) => { /* tx.db writes here only */ },
});
```
- Expose it to the UI with `serverAction(doThing)` from `@platform/actions` inside a `"use server"` file.
- Returns `{ ok: true, data }`, `{ ok: true, pending, approvalId }` or `{ ok: false, code }`. Denials and errors are audited automatically; row changes are captured by the DB trigger.
- Add `describe("<tool>.<verb>")` tests with an allowed case and a denied case (and a condition-denied case if `conditions` apply).
