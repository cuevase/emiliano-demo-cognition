# Internal Tools Platform (demo)

A paved road for building internal tools with Devin: shared **sign-in**, **permissions**, **audit log** and **approvals**, plus a template so every new tool gets all four from the first commit.

> Demo only. Mock data, no real PII, not SOC 2 ready. See [docs/production-path.md](docs/production-path.md).

## What's here
| Piece | Where | What it gives every tool |
|---|---|---|
| Sign-in | `packages/auth` | Neon Auth (Google / email) + one-click demo personas (`DEMO_MODE=true`). One function: `getCurrentUser()` |
| Permissions | `packages/permissions`, `packages/db` | `<tool>:<verb>` permissions, role grants, conditions (amount, owner, region), server-side PII masking, Postgres row-level security as a second layer |
| Audit | `packages/audit` | Append-only, hash-chained log of every action, denial, sign-in, approval and row change. Viewer, filters, CSV export, "Verify chain" |
| Approvals | `packages/approvals` | Generic maker-checker requests: no self-approval, immutable hashed payload, executes exactly once, lazy expiry |
| Actions | `packages/actions` | `defineAction()`: auth → validate → permission → approval? → transaction → audit |
| Template | `templates/tool`, `pnpm new-tool` | A working tool (list, detail, form, approval-gated action, tests, Playwright smoke, Vercel config) |
| Devin layer | `AGENTS.md`, `.agents/skills`, `docs/playbooks` | Rules and skills so Devin builds tools the platform way |
| Guardrails | `pnpm verify`, `.github/workflows/ci.yml` | Lint bans raw DB access; `check:permissions` (allowed + denied test per action); `check:rls` (RLS, audit trigger, classified columns); template smoke test |

## Personas (demo mode)
| Persona | Role | Can |
|---|---|---|
| Alice | support_agent | Work items she owns; request approvals |
| Bob | ops_analyst | Change any item |
| Carol | finance_approver | Approve; see PII unmasked |
| Dave | admin | Everything; role grants (privileged ones need a second admin) |
| Erin | auditor | Read-only, audit log |

## Run locally
```bash
pnpm install
cp .env.example .env          # local Postgres URL + secrets
pnpm db:migrate
pnpm --filter console dev     # http://localhost:3000
pnpm new-tool my-tool         # scaffold a tool, then: pnpm db:migrate && pnpm --filter my-tool dev
pnpm verify                   # everything CI runs
```
