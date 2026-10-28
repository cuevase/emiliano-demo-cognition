# Internal Tools Platform (demo)

Build internal tools by handing Devin a ticket. Every tool gets **sign-in, permissions, an audit log and approvals** from the shared platform, so each tool is just its domain logic. Tools live inside one console app, with one URL and shared sign-in.

**Live demo:** https://internal-tools-console.vercel.app. Pick a persona on the sign-in page. Example tool: [`/t/refunds`](https://internal-tools-console.vercel.app/t/refunds).

> Demo only: fake data, no real PII, not SOC 2 ready. See [docs/production-path.md](docs/production-path.md) for how this would run in production.

---

## Create a new tool with Devin (step by step)

You don't need to clone anything. Devin works on its own machine, and its environment (Node, pnpm, Postgres, the checks) is set up automatically for this repo.

### 1. Write the ticket
Describe the tool in plain language. The more of the checklist below you cover, the fewer questions Devin will ask:

| Cover | Example |
|---|---|
| **Data**: what records and fields, and which are PII or sensitive | customer email (PII), amount (sensitive), status, region |
| **Who can do what**, using the existing roles: `support_agent`, `ops_analyst`, `finance_approver`, `auditor`, `admin` (`viewer` means every signed-in user) | support can view and request; finance can approve and see PII |
| **Approvals**: what needs a second person, and above what threshold | refunds of $500 or more need a finance approver |
| **Screens** | summary cards, filterable table, detail page, "New" form |
| **Fake data** | seed ~40 records in a migration |

<details><summary>Example ticket (the refunds dashboard)</summary>

```
Build a refunds dashboard as a new tool inside the console (pnpm new-tool refunds), using the platform as-is (don't modify packages/*).

Data: refund requests with customer name, customer email (PII), order id, amount (sensitive), reason, region, status (requested, pending_approval, issued, rejected), requested_by, created/updated timestamps. Seed ~40 fake requests across regions and statuses in a migration. No real payments: "issuing" a refund just sets status=issued and stores a fake reference like SIM-xxxxxx.

Permissions:
- support_agent: view, request refunds
- ops_analyst: view only
- finance_approver: view, approve refunds, see PII unmasked
- auditor: view everything, change nothing
- admin: everything

Approvals: refunds of $500 or more need a finance approver (use defineAction approval; requester can't approve). Under $500 is issued immediately.

UI at /t/refunds: summary cards (total refunded, count pending approval, approval rate, average refund), a filterable requests table (status, region, date range, search), a detail page with the audit trail, and a "New refund" form.

Metrics must be computed in SQL from the database, through platform.as so row-level security applies to the aggregates too. Users without refunds:read get nothing. Amount totals are hidden from roles that can't see the amount field.

Tests: allowed + denied per action, the approval path, aggregates respecting RLS, and masking. pnpm verify must pass.
```
</details>

### 2. Start a Devin session and paste the ticket
In Devin, start a new session with the repo **`cuevase/emiliano-demo-cognition`** selected and paste the ticket. Devin reads [`AGENTS.md`](AGENTS.md) and follows the [`create-internal-tool`](.agents/skills/create-internal-tool/SKILL.md) skill. It:
1. runs `pnpm new-tool <name>`, which creates `apps/console/tools/<name>/` (manifest, migrations, logic, tests) and pages at `apps/console/app/t/<name>/`, and registers the tool with the console;
2. writes the tables, permissions, actions, approval rules, screens and seed data;
3. runs `pnpm verify` locally and fixes it until it passes;
4. opens a PR that lists the new permissions, role grants, PII fields and approval rules.

### 3. Review the PR
On the PR, three things happen automatically:
- **CI** (`verify`) runs every check on a fresh database (see [CI](#ci)).
- **Devin Review** reviews the code and posts any findings.
- **A preview deploy** posts a comment with a URL. The preview runs on its **own copy of the database** (see [Isolation](#isolation)).

In the PR description, check that the listed permissions, role grants and approval thresholds match the ticket. Those rules are what you're reviewing; sign-in, audit and approvals are platform code that was reviewed once.

### 4. Test the preview as different people
Open the preview URL and sign in with the personas:

| Persona | Role | Try |
|---|---|---|
| Alice | `support_agent` | Create things. Large requests should go to "pending approval" |
| Bob | `ops_analyst` | Read-only. PII should be masked |
| Carol | `finance_approver` | Approve Alice's request in the console's **Approvals** inbox |
| Dave | `admin` | Everything, including role grants (privileged roles need a second admin) |
| Erin | `auditor` | Read-only. Check the **Audit log** and click **Verify chain** |

If something's wrong, comment on the PR or tell the session. Devin pushes a fix and the preview redeploys.

### 5. Merge
Merge with **"Create a merge commit"**. GitHub Actions then deploys production, migrations run on the production database, the preview's database copy is deleted, and the tool shows up in the console menu at `/t/<name>` for the roles that have `<name>:read`.

---

## What the platform gives every tool

| Piece | Where | What it does |
|---|---|---|
| Sign-in | `packages/auth` | Neon Auth (Google / email) plus one-click demo personas (`DEMO_MODE=true`). Tools call only `getCurrentUser()` / `requireUser()` |
| Permissions | `packages/permissions` | `<tool>:<verb>` permissions, role grants per tool manifest, conditions (owner, amount, region), server-side masking of `pii` / `sensitive` fields |
| Actions | `packages/actions` | `defineAction()` is the only way to write data: sign-in → validate input → permission → approval? → transaction → audit |
| Approvals | `packages/approvals` | Generic second-person approval: the requester can't approve, the payload is hashed and can't change, the action executes exactly once, requests expire lazily, and the requester's access is re-checked at execution |
| Audit | `packages/audit` | Append-only, hash-chained log of every action, denial, invalid input, approval and row change. Viewer, filters, CSV export, "Verify chain" |
| Console | `apps/console` | Home, tool menu, approvals inbox, audit log, roles; hosts every tool under `/t/<tool>` |
| Template | `templates/tool`, `pnpm new-tool` | A working tool: list, detail, form, an approval-gated action, permission/RLS tests |
| Devin layer | `AGENTS.md`, `.agents/skills/`, `docs/playbooks/` | The rules and step-by-step skills Devin follows |

---

## Isolation

### Who can see what (enforced on the server, in layers)
1. **Tools are hidden by default.** Only roles granted `<tool>:read` in the tool's manifest see it in the menu or on the home page, and every `/t/<tool>` page returns "not found" for everyone else. New sign-ins get only `viewer`.
2. **Every write goes through `defineAction`**, which checks the permission and its conditions on the server.
3. **Row-level security in Postgres.** The app connects as `app_rw`, a role that **cannot bypass RLS**, and every tool table has policies like `app.has_permission('refunds:read')`. Reads, writes and **aggregate queries** (sums, counts) only ever see permitted rows, even if app code has a bug.
4. **Masking on the server.** `pii` and `sensitive` columns are masked before data reaches the browser for roles without the unmask permission, and they're redacted in the audit log.
5. **Lint guardrails for tool code.** Tool code can't import `pg`, `withSystemTx` (privileged connection) or `writeAuditEvent`.
6. **Tamper-evident audit.** The audit log rejects updates and deletes, and each row is hash-chained to the previous one. "Verify chain" detects any edit.

### Where code runs, and against which database
| Stage | Database | Notes |
|---|---|---|
| Devin session / local dev | Local Postgres on the VM | `pnpm verify` recreates a throwaway `<db>_test` database for each test run |
| CI (`verify` job) | Fresh Postgres 17 container | Nothing shared between runs |
| **PR preview** | **Neon branch `preview/pr-<n>`**, a copy of the production database made when the PR is opened | Migrations from the PR run on the copy, so testing never touches the live demo data. Reused across pushes; **deleted when the PR closes** |
| Production | Neon `main` branch | Migrated during the production deploy |

Previews use the demo personas only. Neon Auth's Google/email sign-in is limited to the production URL.

---

## CI

Defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml); runs on every PR and on every push to `main`.

`pnpm verify`:
- `lint`: ESLint, including the tool guardrails
- `typecheck`
- `db:migrate`: platform and tool migrations, then syncs role grants into `platform.role_permissions`
- `test`: Vitest, covering the platform and every tool's tests
- `check:permissions`: every action has a permission and a test block with an allowed and a denied case, and every declared permission is used
- `check:rls`: every tool table has RLS on, the audit trigger, at least one policy, and every column classified; `app_rw` can't bypass RLS
- `build`

`pnpm check:template` generates a throwaway tool (`ci-smoke`) from the template, then migrates it, checks that its role grants reached the database, runs the RLS and permission checks, its tests, lint and typecheck, and removes it. This proves new tools start out passing.

## Deploys

Defined in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

| Event | What happens |
|---|---|
| PR opened / updated | Create or reuse Neon branch `preview/pr-<n>` → deploy a Vercel preview pointed at it → comment the URL on the PR |
| PR closed | Delete the Neon branch |
| Push to `main` | `vercel deploy --prod`: migrations on the production database, then build |

Deploys go through GitHub Actions instead of Vercel's Git integration because the Vercel Hobby plan blocks deploys of commits whose author isn't on the team, such as the Devin bot. The workflow removes `.git` before deploying, so no commit author is sent. Required repo secrets: `NEON_API_KEY` and `VERCEL_TOKEN`; without them the jobs skip with a warning.

---

## Repo layout
```
apps/console/                 the console (Next.js): home, approvals, audit log, roles
  tools/<tool>/               a tool's manifest, db/migrations, lib/ (schema, actions), tests/
  app/t/<tool>/               a tool's pages (+ layout.tsx read guard)
  lib/tools.ts                tool registry (pnpm new-tool adds entries)
packages/                     auth, permissions, actions, approvals, audit, db, ui, config
packages/db/migrations/       platform schema, RLS, audit log, approvals
templates/tool/               what pnpm new-tool copies (module/ → tools/<tool>, routes/ → app/t/<tool>)
scripts/                      new-tool, check-permissions, check-rls, check-template
AGENTS.md, .agents/skills/    instructions Devin follows
.github/workflows/            ci.yml, deploy.yml
docs/                         production path, review checklist
```

## Run locally (optional)
```bash
pnpm install
cp .env.example .env            # local Postgres URL + secrets
pnpm db:migrate
pnpm --filter console dev       # http://localhost:3000
pnpm new-tool my-tool           # scaffold a tool, then pnpm db:migrate; it's at /t/my-tool
pnpm verify                     # everything CI runs
pnpm check:template             # template smoke test
```

## Demo limits
- No company SSO or MFA. Sign-in is Neon Auth plus personas; switching to Okta or Entra would only change `packages/auth`.
- Google sign-in on the live URL needs your own OAuth client, which isn't configured.
- All tools ship as one app, so a broken tool blocks the console build. CI catches that before merge.
- Approvals expire when they're next opened or acted on; there are no background jobs or reminders.
