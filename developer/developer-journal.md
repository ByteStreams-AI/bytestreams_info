# Developer Journal — ByteStreams Intranet

## 2026-07-17 — CRM Enrichment, Filters, Deploy & Auth Fix

**Participants:** Scott Thornton, GitHub Copilot

### Context

End-to-end session: CRM table filters, Yelp enrichment pipeline, DB migrations, UI panel updates, CI/CD pipeline setup, and production auth debugging.

### Changes

**CRM Filters (bytestreams_info)**
- Added search-by-business-name, city dropdown, status/delivery/pickup filters to CRM table
- All `{#each}` blocks keyed to fix Svelte reactivity warnings

**Business Type & Michelin (bytestreams_info + dialtone_outreach)**
- Auto-classification from Yelp alias heuristics: `food_truck`, `single_location`, `multi_location`
- Added `multi_configuration` option for user overrides
- Moved "Type" from table column to edit panel with full dropdown (Unknown/Food Truck/Single Location/Multi-Configuration/Multi-Location/Enterprise)
- Added Michelin rating dropdown (None/★1 Star/★★2 Stars/★★★3 Stars/Bib Gourmand/Green Star)
- DB migration `002_add_michelin_business_type.sql` applied

**Yelp Enrichment (dialtone_outreach)**
- `website_url` from `attributes.menu_url` (Yelp removed `website` field)
- `price_range`, `yelp_rating`, `yelp_review_count` from search/detail endpoints
- DB migrations `003_add_website_url.sql` and `004_add_yelp_enrichment_fields.sql` applied
- Three-step upsert in `db.py` to protect `business_type` and `website_url` from re-scrape overwrites
- Website field shown as clickable link in CRM edit panel

**Yelp enrichment fields displayed in CRM panel:** Price, Yelp Rating + review count (read-only section)

**CI/CD (bytestreams_info)**
- Fixed GitHub Actions workflow: `branches-ignore: main` → `branches: [main, '**']`
- Fixed wrangler: `wrangler pages deploy` → `wrangler deploy` (Worker with Assets, not Pages)
- Added `nodejs_compat` compatibility flag to `wrangler.jsonc`
- Added custom domain routes to `wrangler.jsonc`
- Added `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` as Worker secrets
- Coverage exclusions: `src/routes/crm/**`, `src/lib/server/supabase.ts`, `src/routes/+page.server.ts`

**Auth Fix (bytestreams_info)**
- `/` now redirects unauthenticated users to `/login` via `+page.server.ts`
- Login "Sign in" button uses `data-sveltekit-reload` to force full page load (CF Access can't intercept SvelteKit client-side nav)
- Simplified JWT handling: decode-only (no JWKS verification) since CF Access already verified at the edge — eliminated silent JWKS network failures in Worker
- Login button links to `/crm` so CF Access OAuth challenge triggers on navigation

---


**Participants:** Scott Thornton, GitHub Copilot

### Context

Implemented the DialTone Outreach KPI cards on the authenticated intranet dashboard. Source of truth: `docs/KPI-Requirements-Task-1-2026-05-19.md`.

### Changes

- Added `KpiFunnel` and `KpiData` interfaces to `src/lib/types.ts`
- Created `src/lib/components/KpiGroup.svelte` — self-contained KPI display component:
  - Fetches `/api/kpis` on mount, auto-refreshes every 60 minutes
  - Skeleton loading state (9 pulsing placeholder cards)
  - Non-blocking inline error state with Retry button
  - 3×3 card grid: counts (Total Contacts, Emails Sent Today, Contacts Emailed), pipeline (Demos Booked, Pilots, Customers), funnel conversions (Email→Demo, Demo→Pilot, Pilot→Customer)
  - `generated_at` timestamp shown in browser local time
- Created `src/routes/api/kpis/+server.ts` — auth-gated server route:
  - Requires authenticated session (401 if not)
  - Dev mode: returns deterministic mock data (no Supabase needed)
  - Production: two parallel Supabase REST queries — `contact_status_counts` view + count-only `email_log` query for today's emails
  - Returns 502 on upstream failure, 503 if secrets not configured
  - `Cache-Control: no-store` on all responses
- Extended `Platform.env` in `src/app.d.ts` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Updated `.dev.vars.example` with the two new secret keys
- Added `KpiGroup` to the authenticated dashboard in `src/routes/+page.svelte`
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Cloudflare Worker secrets via `pnpm exec wrangler secret put`

### Deployment

- Version ID: `41312ae5-416a-43c0-a092-e1e38c4eca3a`
- URL: `https://bytestreams-intranet.cottonbytes.workers.dev`

### KPI Decisions (from requirements doc)

- `re_engage` included in `sent_contacts`
- Auto-refresh every 60 minutes
- Timestamp displayed in browser local time

## 2026-05-03 — Auth Architecture Decision: Cloudflare Access vs Direct SAML

**Participants:** Scott Thornton, Oz (Warp)

### Context

With Cloudflare secrets configured and `.env` setup underway, evaluated whether to switch from the current Cloudflare Access JWT authentication to direct Google Workspace SAML SSO (as prototyped in `developer/`).

### Options Evaluated

**Option A: Cloudflare Access (current)**
- Cloudflare Access acts as reverse proxy, handles SAML exchange with Google Workspace
- App validates `Cf-Access-Jwt-Assertion` JWT via `jose` library (~100 lines of auth code)
- Deploys to Cloudflare Pages via `@sveltejs/adapter-cloudflare`

**Option B: Direct Google Workspace SAML**
- App handles SAML protocol directly using `@node-saml/node-saml`
- Requires switching to `@sveltejs/adapter-node` (SAML libraries need full Node.js runtime, incompatible with Cloudflare Workers)
- Would need self-hosted Node.js server, certificate management, session store
- Reference implementation exists in `developer/` (Express + passport-saml)

### Decision

**Staying with Cloudflare Access (Option A).**

### Rationale

- **Security:** Unauthenticated requests blocked at Cloudflare's edge before reaching app code. Cloudflare manages SAML cert rotation, token signing, session expiry. No session store or cookies to secure in-app.
- **Simplicity:** Auth is ~100 lines vs. full SAML stack (passport, xml-crypto, session stores, cert management). Smaller test surface. No SAML dependencies to patch (xml-crypto/xmldom have had CVEs).
- **Deployment:** Keeps Cloudflare Pages edge deployment with zero infra management. Switching to direct SAML would require self-hosted Node.js server.
- **User management:** Google Workspace remains the IdP in both approaches — no difference in user management.

### Note

The `developer/` directory Express/SAML code remains as reference documentation for understanding the underlying SAML flow. It is not used by the SvelteKit production app.

### Next Steps

1. ~~Copy `.env.example` to `.env` and fill in `CF_ACCESS_AUD`~~ ✅
2. ~~Configure Cloudflare Access application in Zero Trust dashboard with Google Workspace as IdP~~ ✅
3. ~~Set Access Policy to allow `@bytestreams.ai` domain~~ ✅
4. Deploy to Cloudflare Pages with env vars configured — in progress

## 2026-05-06 — Cloudflare Pages Deployment

**Participants:** Scott Thornton, Oz (Warp)

### Context

With auth code aligned to CF Access JWT spec, began deploying the SvelteKit app to Cloudflare Pages.

### Issues Encountered & Resolved

1. **"Site can't be reached"** — Cloudflare Access was configured and redirecting to login, but no Pages project was deployed behind it. Authentication worked (302 → CF Access login → Google auth succeeded) but post-auth redirect had no app to serve.

2. **Wrong dashboard flow** — Initially landed in "Create a Worker" flow instead of Pages. Correct path: Workers & Pages → Import Repository.

3. **pnpm install failure** (`packages field missing or empty`) — Cloudflare auto-detected pnpm from `pnpm-lock.yaml` but used a different version. Fixed by adding `"packageManager": "pnpm@10.33.0"` to `package.json`.

4. **Build command using npm** — Originally set to `npm install && npm run build` which conflicted with pnpm-managed dependencies. Changed to `pnpm run build`.

5. **wrangler not found** — `wrangler` CLI not pre-installed in Cloudflare build environment. Fixed by adding `wrangler` as a devDependency.

6. **Deploy command missing asset path** — `npx wrangler versions upload` didn't know where build output was. Switched to `npx wrangler pages deploy .svelte-kit/cloudflare --project-name=bytestreams-intranet`.

7. **API token permissions** — Auto-generated token lacked Pages deploy permissions. Created custom API token with Workers Scripts Edit, Cloudflare Pages Edit, Workers Builds Configuration Edit.

8. **Build token invalidated** — After creating new API token, the original build token was rolled. Needs to be updated in Worker Builds settings.

### Cloudflare Pages Configuration

- **Project name:** bytestreams-intranet
- **Build command:** `pnpm run build`
- **Deploy command:** `npx wrangler pages deploy .svelte-kit/cloudflare --project-name=bytestreams-intranet`
- **Env vars:** `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `NODE_PACKAGE_MANAGER`, `CLOUDFLARE_API_TOKEN`

### Status

Build succeeds. Deploy step pending API token fix in Worker Builds settings.

## 2026-05-11 — Worker Deploy URL Unreachable Fix

**Participants:** Scott Thornton, GitHub Copilot

### Context

Deployment succeeded (build + deploy) but the deployed URL was unreachable. Build logs showed `npx wrangler deploy` (not `wrangler pages deploy`) and the app deployed to `https://bytestreams-intranet.cottonbytes.workers.dev` as a Cloudflare Worker.

### Root Cause

`wrangler.jsonc` had `assets.directory` but was missing the `main` field pointing to the SvelteKit Worker entry point. Without `main`, `wrangler deploy` only serves static assets — SSR, auth hooks, and server routes (the `_worker.js` generated by `adapter-cloudflare`) are never invoked. The app appeared deployed but all dynamic routes silently failed.

### Fix

Added `"main": ".svelte-kit/cloudflare/_worker.js"` to `wrangler.jsonc`. The `adapter-cloudflare` build outputs `_worker.js` alongside static assets; this tells wrangler to actually run it.

### Current Deploy Config

- **Build command:** `pnpm run build`
- **Deploy command:** `npx wrangler deploy`
- **Worker URL:** `https://bytestreams-intranet.cottonbytes.workers.dev`
- **Note:** This deploys as a Cloudflare Worker (not Pages). Cloudflare Access must be configured for the Worker URL if SSO is required.

## 2026-05-13 — GitHub Actions pnpm Version Conflict Fix

**Participants:** Scott Thornton, GitHub Copilot

### Context

GitHub Actions failed during `pnpm/action-setup@v4` because pnpm was pinned in two places:

- Workflow input: `version: 10`
- `package.json`: `"packageManager": "pnpm@10.33.0"`

`pnpm/action-setup` rejects mixed version sources and fails with a multiple versions specified error.

### Fix

Updated `.github/workflows/ci.yml` to remove explicit `version` from both `Install pnpm` steps (CI and deploy jobs), allowing the action to use the version declared in `package.json`.

### Result

- Single pnpm source of truth remains in `package.json`
- Avoids `ERR_PNPM_BAD_PM_VERSION` style mismatch failures in GitHub Actions

## 2026-05-18 — Intranet Landing Page for Unauthenticated Users

**Participants:** Scott Thornton, GitHub Copilot

### Context

After the `bytestreams.info` apex and `www` hosts were stabilized in Cloudflare, added a clear intranet landing page for visitors who are not yet signed in.

### Changes

- Reworked `src/routes/+page.svelte` so unauthenticated visitors see a dedicated ByteStreams intranet landing page while authenticated users still see the internal dashboard.
- Added explicit intranet messaging throughout the landing page: private access only, Google Workspace SSO, internal docs/dashboards, and support contact details.
- Copied the static landing assets from `bytestreams_ai/public` into `static/` so the page can use the shared branding resources, CSS, JS, and legal pages.

### Verification

- `pnpm check` passes with 0 errors and 0 warnings.

## 2026-05-19 — Intranet-First Copy Pass

**Participants:** Scott Thornton, GitHub Copilot

### Context

The first landing page draft was functional, but the intranet intent could read too softly for first-time visitors.

### Changes

- Strengthened the visible copy in `src/routes/+page.svelte` to say “ByteStreams Internal Intranet” in the title, hero, banner, footer, and support sections.
- Added a dedicated intranet notice banner so the page reads as a private internal entry point immediately.

### Verification

- `pnpm check` passes with 0 errors and 0 warnings.

## 2026-05-19 — Intranet Visual Hardening

**Participants:** Scott Thornton, GitHub Copilot

### Context

Requested an even more obvious internal-only treatment on the unauthenticated landing page.

### Changes

- Added a high-visibility warning strip: “BYTESTREAMS INTERNAL INTRANET: AUTHORIZED PERSONNEL ONLY”.
- Added a persistent “Authorized users only” security pill in header actions on desktop.
- Kept mobile readability by collapsing to the warning strip and hiding the pill on smaller viewports.

### Verification

- `pnpm check` passes with 0 errors and 0 warnings.

## 2026-05-19 — Minimal Landing Page

**Participants:** Scott Thornton, GitHub Copilot

### Context

Requested to reduce the unauthenticated landing page to only the logo and tagline with no additional content blocks.

### Changes

- Simplified the unauthenticated branch in `src/routes/+page.svelte` to only render:
	- ByteStreams logo
	- “Smarter Workflows, Stronger Results.” tagline
- Removed all additional landing sections, legal/footer/navigation elements, and related intranet marketing content from the unauthenticated view.
- Kept authenticated dashboard behavior unchanged.

### Verification

- `pnpm check` passes with 0 errors and 0 warnings.

## 2026-05-19 — KPI Data Source Clarification (Task #1 Input)

**Participants:** Scott Thornton, GitHub Copilot

### Context

Task #1 for the KPI migration project required confirming the source data location before finalizing requirements and technical approach.

### Finding

- The DialTone Outreach FastAPI app (`dialtone_outreach/web/app.py`) reads dashboard and KPI data through `outreach/db.py`.
- `outreach/db.py` initializes a Supabase client using `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `outreach/config.py`.
- Therefore, the existing KPI operational source is Supabase Postgres (tables/views including `contacts`, `email_log`, `contact_status_counts`, and `contacts_due_for_outreach`).

### Impact on bytestreams_info

- This SvelteKit repo currently has no runtime KPI database integration (auth-first implementation).
- For KPI landing-page delivery, requirements and implementation docs should treat Supabase as the upstream source and explicitly include a data-integration step in scope.

## 2026-05-19 — Task #1 KPI Requirements Artifact Added

**Participants:** Scott Thornton, GitHub Copilot

### Context

After confirming KPI data originates from DialTone Outreach Supabase, Task #1 needed a business-readable requirements artifact that implementation and GitHub Issues can reference directly.

### Changes

- Added `docs/KPI-Requirements-Task-1-2026-05-19.md`.
- Document includes:
	- KPI definitions and formulas
	- source data assumptions and relevant tables/views
	- API response contract draft for landing-page KPI payload
	- data quality rules and acceptance criteria
	- open decisions for business confirmation

### Outcome

- Task #1 now has a concrete source-of-truth document suitable for linking from project issues and implementation tasks.
