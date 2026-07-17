# PRD: ByteStreams.info Intranet

**Project:** ByteStreams LLC internal platform at `bytestreams.info`
**Author:** Drafted with Claude Code, 2026-05-01
**Status:** Draft v1 — pending review
**Source concept:** `docs/basic-intranet-concept.txt`

---

## 1. Overview & Objectives

`bytestreams.info` is the internal platform ("intranet") for ByteStreams LLC. It serves three audiences from a single SSO-gated domain:

1. **Employees** — manage company resources (apps, secrets, infrastructure)
2. **Workspace guests** — scoped, time-bounded access for prospective clients to view product demos
3. **Hosted internal apps** — small services and tools deployed by the team, plus externally-hosted apps registered through the intranet, all unified behind a single auth wall

The platform is the shared infrastructure backing ByteStreams' two-product portfolio: **dialtone.menu** (restaurant SaaS, currently launching) and **dialtone.med** (healthcare, planned, will handle PHI). Because dialtone.med will require HIPAA compliance and the company is targeting SOC 2, the intranet is designed HIPAA-aligned and SOC 2-ready from day one — even though no PHI flows through the v1 system.

### Primary objectives

- Single SSO entry point at `*.bytestreams.info` for all internal apps
- Secrets management that **never reveals plaintext to humans by default**
- Hybrid hosting model: deploy-target for new internal services *and* registry/reverse-proxy for externally-hosted apps
- Guest-friendly demo surface for sales conversations
- Compliance posture that supports HIPAA and SOC 2 Type 2 without re-platforming

---

## 2. Target Audience & Roles

### Personas
- **ByteStreams employees** (3 at launch) — daily users
- **Workspace guests** (rotating, per-engagement) — prospective clients invited to view demos
- **Auditors** (future) — SOC 2 / HIPAA assessors with read-only access to audit logs and policy evidence

### Roles (RBAC)
Roles are sourced from **Google Workspace groups** — Workspace group membership is the single source of truth.

| Role | Group | Description |
|------|-------|-------------|
| `officer` | `officers@bytestreams.info` | Full access to all resources, secrets, billing |
| `admin` | `admins@bytestreams.info` | Manage users, apps, vault rotations; no finance secrets |
| `engineer` | `engineers@bytestreams.info` | Deploy/manage hosted apps, access infra secrets (dev + prod with justification) |
| `finance` | `finance@bytestreams.info` | Access to finance-tagged secrets (payment, accounting), no infra |
| `operations` | `operations@bytestreams.info` | Operational tooling, ops-tier API keys |
| `guest` | `guests@bytestreams.info` | Scoped per-app allowlist managed in admin console; default 14-day expiry |

A user's effective role is the union of their Workspace group memberships. Conflicts resolve to the most restrictive policy.

---

## 3. Core Features

### MVP (Phase 1)

#### 3.1 SSO & Auth Wall
SAML SSO between Google Workspace (IdP) and Cloudflare Access (SP) protects the entire `*.bytestreams.info` zone. The intranet and any registered/hosted apps trust the signed `CF-Access-JWT-Assertion` header issued by Cloudflare Access — no app handles raw SAML. MFA is enforced at the Workspace level.

**Acceptance criteria:**
- Visiting any `*.bytestreams.info` URL while unauthenticated redirects to Google Workspace login via Cloudflare Access
- Successful login attaches a signed CF-Access JWT; intranet validates signature against CF JWKS
- Logout clears CF Access session
- Sessions expire after 8 hours of inactivity (configurable per app)

#### 3.2 Secrets & Token Vault
A wrapper UI over **AWS Secrets Manager** (HIPAA-eligible, SOC 2-attested). The intranet never stores secret material itself.

**Behavior model:**
- Secrets are **never displayed to humans by default**. Apps consume secrets at runtime via the intranet's secret-fetch API or environment injection at deploy time.
- "Reveal" is treated as a **destructive operation**: the existing secret is rotated/destroyed, a new value generated, displayed **once** in the browser, then never shown again. This forces rotation hygiene and produces a clean audit signal.
- All vault operations (read-by-app, reveal, rotate, create, delete) are logged immutably.
- Per-secret RBAC tags (`finance`, `infra-dev`, `infra-prod`, `ops`, `app:dialtone-menu`, etc.) gate which roles can access.

**Secret types in scope:**
- AWS access keys / role credentials
- Supabase service-role + anon keys, DB connection strings
- Third-party API tokens (Stripe, OpenAI, GitHub, Twilio, etc.)
- OAuth client secrets for hosted apps
- TLS certs and SSH keys (later phase)

**Acceptance criteria:**
- Creating a secret stores it in AWS Secrets Manager under a namespaced ARN; only metadata (name, tags, created-by, last-rotated) lives in intranet DB
- Hosted apps can fetch secrets via SDK/API using their app identity (IAM role assumed by ECS task)
- "Reveal" UI requires elevated MFA challenge, rotates the underlying secret, returns the new value once, then marks it consumed
- Every read, reveal, rotate is written to the immutable audit log within 1s

#### 3.3 Admin Console
- User list (synced from Workspace) with role badges
- Guest invitation flow: select Workspace guest, scope to one or more registered apps, set expiry (default 14d, max 90d)
- App registry CRUD (see 3.4)
- Audit log viewer with filter by user/action/time
- Access review export (CSV) for SOC 2 evidence

**Acceptance criteria:**
- Admin can revoke a guest in <30s; revocation is reflected at Cloudflare Access within 60s
- Audit log entries cannot be edited or deleted via UI or API
- All admin actions are themselves audited

#### 3.4 Hybrid App Hosting (Deploy + Registry)

**Mode A — Deploy target:**
- Engineer registers a new app via intranet UI: name, GitHub repo, runtime (Node/Python/Go container), env-secret bindings
- Intranet provisions an ECS Fargate task definition + ALB target group + Route 53 record at `<app>.bytestreams.info`
- Cloudflare DNS proxies traffic; Cloudflare Access policy auto-attached using the app's role allowlist
- Engineer triggers deploys via UI or by pushing to the `main` branch (GitHub Actions → ECR → ECS update-service)
- Secrets are injected at task launch from AWS Secrets Manager via task-role IAM

**Mode B — Reverse-proxy registry:**
- Admin/engineer registers an externally-hosted app: target URL, hostname (`<name>.bytestreams.info`), allowed roles
- Intranet writes a Cloudflare Worker route or Tunnel that proxies the public hostname to the upstream, with Cloudflare Access enforcing SSO + role check before proxying

**Acceptance criteria:**
- A new Mode-A app goes from "register" to "live at `<name>.bytestreams.info`" in under 10 minutes
- A new Mode-B app goes live in under 2 minutes
- Removing an app deprovisions ECS resources (Mode A) or removes the proxy route (Mode B) within 5 minutes
- Both modes inherit the same SSO + RBAC + audit logging without per-app configuration

#### 3.5 Audit Log
- Append-only sink for all auth, vault, admin, and app-lifecycle events
- Storage: AWS CloudWatch Logs → S3 with **Object Lock in Compliance Mode** (WORM, ≥6-year retention for HIPAA)
- Every event includes: actor (Workspace user ID), action, resource, timestamp (UTC), source IP, CF-Access ray ID, success/failure
- Searchable from admin console; full export available for auditors

### Phase 2+ (deferred)
- App launcher dashboard (unified home page listing all apps a user can access)
- File storage / docs (initially: pointers into Google Drive; later: native upload)
- Cost / ops dashboards (AWS Cost Explorer + Supabase usage rollups for officer/finance)

---

## 4. Technical Stack

### Implementation status note (2026-05-19)

- Current production code in this repo is auth-first (Cloudflare Access JWT validation) and does not yet include a wired application database for KPI reads.
- Supabase Postgres remains the planned system of record for intranet application data once data features are implemented.
- The separate DialTone Outreach FastAPI app (`dialtone_outreach/web/app.py`) already reads KPI-related operational data from Supabase via `outreach/db.py`.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend + server | **SvelteKit** (TypeScript, Vite) | User preference; SSR for auth-aware routing; mature; good security primitives (CSP, CSRF) |
| Hosting (intranet) | **AWS App Runner** (or ECS Fargate if needed) | HIPAA-eligible; managed; in BAA perimeter |
| Edge auth | **Cloudflare Access** (SAML to Google Workspace) | Existing footprint; offloads SAML handling; identity headers consumed by apps |
| IdP | **Google Workspace** (Business Standard+, with BAA) | Existing; group-based RBAC source of truth |
| Database | **Supabase Postgres** (Pro tier at launch) | Existing comfort; RLS for tenant isolation; **must migrate to Team tier + BAA before any PHI-bearing app deploys** |
| Secrets | **AWS Secrets Manager** | HIPAA-eligible; built-in rotation; offloads compliance burden |
| Hosted-app runtime | **AWS ECS Fargate** + ALB | HIPAA-eligible; per-task IAM roles for clean secret access |
| Object storage | **AWS S3** (Object Lock for audit logs) | WORM retention required for compliance |
| CI/CD (Phase 0) | **GitHub Actions** → **Cloudflare Pages** | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` stored as GitHub secrets; deploy triggered on push to `main` |
| CI/CD (Phase 1+) | **GitHub Actions** → **ECR** → ECS deploy | OIDC to AWS (no long-lived keys) |
| Observability | **CloudWatch Logs + Metrics**, **AWS X-Ray** for traces | In BAA perimeter |
| Testing | **Vitest** (unit + component) + **Playwright** (E2E) | Minimum **85% code coverage** enforced in CI; coverage gate blocks merge if threshold not met |
| IaC | **Terraform** | Reviewable, auditable, evidence for SOC 2 |

### Account architecture (recommended)
AWS Organization with separate sub-accounts:
- `bytestreams-shared` — intranet, vault, audit log
- `dialtone-menu-prod` / `dialtone-menu-staging`
- `dialtone-med-prod` / `dialtone-med-staging` (PHI boundary; only this account holds PHI when launched)

This isolation simplifies HIPAA scoping and SOC 2 evidence collection.

---

## 5. Conceptual Data Model

All tables live in Supabase Postgres unless noted. RLS enabled on every table.

### `users`
| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid (pk) | |
| `workspace_user_id` | text (unique) | Google Workspace user ID |
| `email` | text (unique) | |
| `display_name` | text | |
| `is_guest` | boolean | |
| `created_at` | timestamptz | |
| `last_login_at` | timestamptz | |

### `roles` (effective role cache, refreshed on login)
| Field | Type | Notes |
|-------|------|-------|
| `user_id` | uuid (fk → users) | |
| `role` | enum (`officer`,`admin`,`engineer`,`finance`,`operations`,`guest`) | |
| `granted_via_group` | text | Workspace group that conferred this role |

### `apps` (registry)
| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid (pk) | |
| `slug` | text (unique) | becomes `<slug>.bytestreams.info` |
| `mode` | enum (`deployed`,`proxied`) | A or B |
| `repo_url` | text (nullable) | for Mode A |
| `upstream_url` | text (nullable) | for Mode B |
| `allowed_roles` | text[] | which roles can access |
| `secret_bindings` | jsonb | `{env_var: secret_arn}` mapping |
| `owner_user_id` | uuid (fk) | |
| `created_at` | timestamptz | |
| `status` | enum (`provisioning`,`active`,`disabled`,`error`) | |

### `secrets_metadata` (no plaintext stored here — only ARN + tags)
| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid (pk) | |
| `aws_arn` | text | pointer to AWS Secrets Manager |
| `name` | text | |
| `tags` | text[] | RBAC tags (e.g. `infra-prod`, `app:dialtone-menu`) |
| `created_by` | uuid (fk) | |
| `last_rotated_at` | timestamptz | |
| `last_revealed_at` | timestamptz (nullable) | |

### `guest_invitations`
| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid (pk) | |
| `guest_user_id` | uuid (fk) | |
| `app_ids` | uuid[] | scoped allowlist |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz (nullable) | |
| `invited_by` | uuid (fk) | |

### `audit_events` (mirrored to S3 Object Lock — Postgres copy is for query convenience)
| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid (pk) | |
| `actor_user_id` | uuid (nullable for system events) | |
| `action` | text | e.g. `vault.reveal`, `app.deploy`, `guest.invite` |
| `resource_type` | text | |
| `resource_id` | text | |
| `outcome` | enum (`success`,`failure`) | |
| `metadata` | jsonb | action-specific detail |
| `source_ip` | inet | |
| `cf_ray_id` | text | |
| `occurred_at` | timestamptz | |

---

## 6. UI Design Principles

- **Polished landing page** at `bytestreams.info` — this is a sales-touch surface (prospects land here after guest invitation), so it carries ByteStreams brand and feels production-grade
- **Function-first admin console** — internal pages prioritize density and speed over flourish (Linear / Stripe Dashboard idiom)
- **Dangerous actions are friction-heavy** — vault reveal, app deletion, and role changes require typed confirmation and re-MFA
- **Guest experience is minimal** — guests see only the apps they're scoped to; no admin surface, no internal navigation
- **Accessibility:** WCAG 2.1 AA targets (compliance-adjacent and broadly good practice)

---

## 7. Security & Compliance

### Compliance targets
- **HIPAA** — design-aligned at launch; BAAs queued; PHI not actually flowing until dialtone.med is wired up
- **SOC 2 Type 2** — controls designed-in from day one; audit window starts when the business is ready (likely tied to dialtone.med launch)
- **PHI** — segregated to `dialtone-med-*` AWS sub-accounts when applicable; intranet itself never stores PHI

### Required vendor BAAs (queue at launch, execute before any PHI handling)
- AWS — via Artifact (free)
- Google Workspace — Business Standard+ (confirm tier)
- Supabase — Team tier (~$599/mo) before PHI workloads
- Cloudflare — Enterprise tier required for BAA; **decision needed before dialtone.med launch** (Enterprise vs. AWS-native fallback)

### Controls
- **Encryption at rest:** AES-256 (Supabase, S3, Secrets Manager all default)
- **Encryption in transit:** TLS 1.2+ enforced; HSTS preload on `bytestreams.info`
- **MFA:** Required on all Google Workspace accounts; enforced via Workspace policy
- **Session management:** 8-hour inactivity timeout; absolute 12-hour max session
- **Least privilege:** Roles narrowly scoped; per-secret tag gates; ECS task IAM roles per app
- **Audit log immutability:** S3 Object Lock in Compliance Mode, ≥6-year retention
- **Access reviews:** Quarterly export from admin console; documented sign-off
- **Incident response:** Documented runbook (drafted Phase 1, exercised before SOC 2 window)
- **Backups:** Supabase PITR enabled; tested quarterly restore
- **Vulnerability management:** Dependabot + GitHub Advanced Security on all repos
- **Change management:** All infra via Terraform PRs with two-person review on production

### Threat model highlights
- **Stolen Workspace credential** → mitigated by mandatory MFA + Cloudflare Access device posture (later phase)
- **Compromised hosted-app container** → blast radius limited to that app's IAM role + scoped secrets; cannot read other apps' secrets
- **Insider exfiltration of secrets via "reveal"** → reveal triggers rotation + alert; old value invalidated immediately
- **Audit log tampering** → impossible at storage layer (Object Lock)

---

## 8. Development Phases / Milestones

### Phase 0 — Landing Page (this weekend, 2026-05-01 → 2026-05-03)
**Scope:** Static SvelteKit landing page deployed to `bytestreams.info`. **No functionality.** No SSO, no DB, no apps.
- Branded "ByteStreams LLC" landing page with placeholder marketing copy
- Deployed to AWS (App Runner) or Cloudflare Pages — Pages is fine here since no PHI is in scope
- DNS via existing Cloudflare zone
- Repo scaffolded with TypeScript + Vite + SvelteKit; CI builds clean
- **Deliverable:** Reviewable URL by Sunday evening

### Phase 1 — Auth + Admin + Vault MVP (target: 4–6 weeks after Phase 0)
- Cloudflare Access SAML wired to Google Workspace
- Workspace-group → role sync
- Admin console: user list, audit log viewer
- Vault wrapper over AWS Secrets Manager (create, read-by-app, rotate-on-reveal)
- Audit log pipeline (CloudWatch → S3 Object Lock)

### Phase 2 — Hosted Apps (target: 4 weeks after Phase 1)
- App registry data model + UI
- Mode B (proxy registry) — easier, ship first
- Mode A (deploy target) — ECS Fargate + ALB + Route 53 automation via Terraform

### Phase 3 — Guest Flow + Polish (target: 2 weeks after Phase 2)
- Guest invitation UI, scoped allowlists, auto-expiry
- Branded guest landing page
- First demo prospect onboarded

### Phase 4 — SOC 2 / HIPAA readiness (continuous, gating dialtone.med launch)
- Vendor BAAs executed
- Supabase migrated to Team tier
- Cloudflare Enterprise decision finalized
- Quarterly access review process running
- Penetration test
- SOC 2 Type 1 → observation window → Type 2

### Future / Phase 5+
- App launcher dashboard
- File storage (Drive integration → native)
- Cost & ops dashboards
- Internal status page
- Mobile-responsive optimizations beyond baseline

---

## 9. Challenges & Mitigations

| Risk | Mitigation |
|------|------------|
| Cloudflare Enterprise cost shock when PHI launch nears | Document AWS-native fallback path (ALB + Cognito or oauth2-proxy) up front; price both options well before dialtone.med launch |
| Supabase tier migration disruption when adding PHI workload | Design schemas and RLS now to be portable; test Team-tier migration in staging early |
| Workspace group sync drift (cached roles vs. real groups) | Refresh on every login; periodic background sync; hard cap of 1 hour staleness |
| "Reveal = rotate" UX surprises engineers | Strong in-UI warning; require typed confirmation; document as a feature in onboarding |
| Single-developer key-person risk (3 employees) | Officer + admin both hold break-glass access; documented runbooks; AWS root account credentials in physical safe |
| Audit log volume costs at scale | Tiered retention: hot (CloudWatch, 30d) → warm (S3, 1y) → glacier (5y+); Object Lock applies to S3 tier |

---

## 10. Future Expansion

- **dialtone.med integration** — primary driver for the compliance posture; intranet hosts admin tooling for the medical product
- **Customer-facing portals** — same auth/host platform, expanded RBAC for end-customer accounts
- **Internal LLM / agent tools** — hosted apps that wrap Claude/OpenAI APIs for internal use, with vault-managed keys
- **Compliance evidence automation** — auto-generate SOC 2 evidence packets from audit log + Terraform state
- **Multi-region / DR** — once PHI is live, secondary AWS region for failover

---

## 11. Open Questions for Review

These were not fully resolved in the discovery conversation; please confirm or correct in your next-week review:

1. Confirm Google Workspace tier is **Business Standard or higher** (BAA-eligible). If not, upgrade is gating.
2. Confirm AWS account structure — single account today, or already an Organization? If single, schedule the multi-account migration before Phase 1.
3. SOC 2 audit firm preference — any existing relationship, or open?
4. Who is the **HIPAA Security Officer / Privacy Officer** (a HIPAA requirement once PHI is in play)? Often the company officer in a small org.
5. Domain strategy for hosted apps — flat (`<app>.bytestreams.info`) or grouped (`apps.bytestreams.info/<app>`)? Flat is cleaner for SSO scoping; grouped is cheaper on TLS certs (single wildcard).
6. Phase 1 team — is this you solo, or are you bringing in contractors? Affects timeline realism.

---

## Appendix A — Phase 0 Concrete Checklist (Weekend)

- [ ] `pnpm create svelte@latest` — TS + Vite + SvelteKit
- [ ] Add Tailwind (or your preferred styling) for landing-page polish
- [ ] Draft landing page: hero, brief blurb on ByteStreams LLC, "Get in touch" link (mailto or existing FormSubmit endpoint)
- [ ] Configure `bytestreams.info` apex + `www` in Cloudflare DNS
- [ ] Deploy to Cloudflare Pages (fastest path; not in HIPAA scope yet — landing page has no PHI)
- [ ] **GitHub Actions CI/CD pipeline for Cloudflare Pages:**
  - Workflow triggers on push to `main`
  - Steps: install deps → lint → typecheck → test (with coverage) → deploy via `wrangler pages deploy`
  - Secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  - Coverage gate: fail build if Vitest coverage drops below **85%**
- [ ] Write initial Vitest unit/component tests; verify coverage ≥ 85% locally before first deploy
- [ ] Verify HTTPS, HSTS, baseline security headers (CSP, X-Frame-Options, Referrer-Policy)
- [ ] Commit IaC scaffolding (Terraform skeleton) for later phases — even if empty modules

---

*End of PRD v1 draft. Ready for review.*
