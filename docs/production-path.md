# From demo to production (talking points)

This repo is a demo. The patterns carry over; the hosting and identity choices would change.

| Demo | Production |
|---|---|
| Vercel + Neon | Their cloud (e.g. ECS/EKS + RDS/Aurora Postgres) in private subnets, behind VPN/zero-trust access |
| Neon Auth (Google/email) + personas | Company SSO (Entra ID / Okta via OIDC), MFA and Conditional Access; roles from IdP groups. Only `packages/auth` changes |
| Lazy approval expiry | Scheduled job for expiry + Slack/email reminders |
| Audit log in Postgres | Also streamed to SIEM / WORM storage (S3 Object Lock); retention set by compliance |
| Manual role grants | Access reviews, JIT elevation, offboarding hooks from the IdP |
| Demo data | Real data sources via read replicas / internal APIs; field-level encryption for high-risk PII |

Ongoing ownership: platform owner (~0.25–0.5 engineer), dependency patching (Renovate + Devin), SOC 2 scope expands to cover the platform. Costs: see `cost-model.md` in the evaluation folder.
