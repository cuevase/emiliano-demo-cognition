# Playbook: build an internal tool from a ticket

**Input:** a ticket describing the tool (users, data, actions, approvals).

1. Read `AGENTS.md`. Restate the ticket as: entities + fields (with classification), permissions × roles, actions, approval rules. Put this in the PR description.
2. Follow `.agents/skills/create-internal-tool`.
3. Don't change `packages/*`. If the platform can't express a requirement, note it in the PR and stop that part.
4. `pnpm verify` must pass locally. Run the tool and click through as Alice (support), Carol (approver) and Erin (auditor).
5. PR checklist: new permissions + role grants; PII/sensitive fields; approval-gated actions + thresholds; tests for allowed/denied/approval/RLS; screenshots.

## Reviewer checklist (humans and Devin Review)
- Any write not inside `defineAction`? Any `pg`/`withSystemTx` import in a tool?
- Any column without a classification, or PII shown without `mask()`?
- Role grants widened? Conditions removed? Approval thresholds raised?
- Denied-case tests present and meaningful (not just `expect(true)`)?
- RLS policies match the manifest (no `using (true)`)?
