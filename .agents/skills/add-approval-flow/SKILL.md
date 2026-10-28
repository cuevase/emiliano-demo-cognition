---
name: add-approval-flow
description: Require a second person to approve an action (e.g. refunds over a threshold, privileged changes).
---
# Add an approval flow

Add `approval` to the action's `defineAction`:
```ts
approval: {
  when: (input, user) => input.amount_cents >= 50_000,   // or always: () => true
  approverPermission: "<tool>:approve",                    // declare it + grant to an approver role
  summary: (input) => `Refund $${input.amount_cents / 100} to ${input.order_id}`,
  approvalsRequired: 1,   // optional
  ttlHours: 72,           // optional; expiry is lazy (checked on read/act)
},
```
- When `when` is true the handler does not run; a request with a hashed, immutable payload is created. An approver decides in the console inbox (`/approvals`) or via `platform.approvals.decide`; the handler then runs exactly once with the original payload.
- The requester can't approve; approver permission (and conditions) are checked at decision time.
- Tests: below threshold executes directly; above threshold returns `pending`; requester can't approve; approver executes; the record changed.
