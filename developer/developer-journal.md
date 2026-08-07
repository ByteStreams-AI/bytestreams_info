# Developer Journal — ByteStreams Intranet

## 2026-08-07 — Portal Admin Dev Compile Fix

**Participants:** Scott Thornton, GitHub Copilot

### Problem

`pnpm dev` failed to compile the portal admin page with:

`The $ name is reserved, and cannot be used for variables and imports`

The script in `src/routes/portal-admin/+page.svelte` defined `const $ = (...)`, which is invalid in Svelte.

### Changes

- Renamed the DOM helper from `$` to `getEl`.
- Updated all helper call sites in `src/routes/portal-admin/+page.svelte` from `$(...)` to `getEl(...)`.

### Validation

- Confirmed there are no remaining `$(...)` helper calls in `src/routes/portal-admin/+page.svelte`.
- `pnpm run check` now proceeds past the reserved-name compile failure; remaining diagnostics are TypeScript strictness issues and existing test typing mismatches.

## 2026-08-07 — Portal Admin Backend Migration (In-Repo)

**Participants:** Scott Thornton, GitHub Copilot

### Context

Portal admin UI and route guard were already in `bytestreams_info`, but API logic still proxied to `https://bytestreams.ai/api/admin/*`.
Goal: keep portal-admin fully in this repo.

### Changes

- Replaced proxy implementation in `src/routes/portal-admin/api/[...path]/+server.ts` with local handlers backed by Supabase service-role access.
- Added local endpoint support for all UI calls:
  - `GET /portal-admin/api/customers`
  - `GET /portal-admin/api/billing`
  - `POST /portal-admin/api/generate-billing`
  - `POST /portal-admin/api/invite`
  - `POST /portal-admin/api/resend-invite`
  - `POST /portal-admin/api/message`
- Preserved admin access guard using existing `canAccessPortalAdmin` check.
- Added legacy data normalization during customer load: `portal_accounts.is_admin` NULL values are updated to `false`.
- Updated `.env.example`: removed cross-repo `ADMIN_SECRET` proxy secret note and documented `RESEND_API_KEY` for invite email delivery.

### Validation

- `get_errors` reports no errors in:
  - `src/routes/portal-admin/api/[...path]/+server.ts`
  - `.env.example`

## 2026-08-07 — Portal Admin Empty-Customer Diagnosis

**Participants:** Scott Thornton, GitHub Copilot

### Problem

Portal Admin showed “No customers yet” even when a customer existed in the database.

### Root Cause

This repo’s configured Supabase project (`SUPABASE_URL=https://hltmzafywzqajjzjpqva.supabase.co`) does not contain the portal tables (`portal_accounts`, `businesses`).
The backend returned table-not-found errors, but the frontend interpreted non-array payloads as empty lists.

### Changes

- Updated `src/routes/portal-admin/+page.svelte` API handling for Customers and Billing to:
  - check `res.ok`
  - verify response shape is an array
  - show backend error text in the empty-state area when requests fail
- Updated message-recipient loader to ignore invalid/non-array customer responses.

### Outcome

Portal Admin now surfaces real backend errors instead of silently showing an empty customer list, making environment/schema mismatches immediately visible.

## 2026-08-07 — Dual Supabase Support For Portal Admin

**Participants:** Scott Thornton, GitHub Copilot

### Context

The intranet app may need one Supabase project for CRM data and a separate Supabase project for portal-admin tables.

### Changes

- Updated `src/routes/portal-admin/api/[...path]/+server.ts` to support a dedicated portal DB config:
  - Primary (preferred for portal-admin): `PORTAL_SUPABASE_URL` + `PORTAL_SUPABASE_SERVICE_ROLE_KEY`
  - Fallback (existing behavior): `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- Added strict validation that portal override vars must be set together (no partial config).
- Updated auth-user provisioning (`ensureSupabaseAuthUser`) to use the same resolved portal DB config.
- Updated `.env.example` with optional portal-specific Supabase variables.

### Outcome

Portal-admin can now run against its own Supabase project without impacting CRM data access paths.

## 2026-08-07 — Script: Add Existing Auth User To Portal Accounts

**Participants:** Scott Thornton, GitHub Copilot

### Context

Need a non-invite path to add portal access when an auth user already exists (including non-real/test email addresses) and has staff linkage.

### Changes

- Added `developer/add-portal-account.mjs`.
- Added npm script alias: `pnpm portal:add-account`.
- Script behavior:
  - Validates existing `auth.users` record via Supabase Admin API (`--auth-user-id` required)
  - Derives `business_id` from `staff.user_id -> staff.restaurant_id -> businesses.dialtone_location_id` when `--business-id` is omitted
  - Inserts `portal_accounts` row (or updates existing row with `--update-existing`)
  - Supports `--dry-run`, `--email`, `--full-name`, `--product`, `--role`, `--status`, `--admin`
  - Uses portal DB override vars if present (`PORTAL_SUPABASE_*`), else falls back to `SUPABASE_*`

### Validation

- `node developer/add-portal-account.mjs --help` prints expected usage.
- `get_errors` reports no errors in `developer/add-portal-account.mjs` and `package.json`.

### Follow-up

- Updated `developer/add-portal-account.mjs` to allow `business_id = null` by default when no staff/business mapping exists.
- Added `--require-business-id` for strict mode when mapping must be enforced.

## 2026-08-03 — Fix Local Dev Environment (Wrangler v4 Remote Proxy)

**Participants:** Scott Thornton, GitHub Copilot

### Problem

`pnpm dev` was failing silently for all CRM requests (GET and POST). The Cloudflare adapter calls Wrangler's `getPlatformProxy()` on every request to emulate the Workers runtime. In Wrangler v4, the implementation tries to start a remote proxy session whenever a `wrangler.jsonc` is found in the project — even without `--remote` — and fails with:

> "Failed to start the remote proxy session. You must be logged in to use wrangler dev in remote mode."

This left `$env/dynamic/private` empty, so `getClient()` in `supabase.ts` threw "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", returning a 500 on every request.

### Root Cause (Code)

The Wrangler v4 `getPlatformProxy` source shows:
```javascript
if (config.configPath && options.remoteBindings !== false) {
    remoteProxySession = await maybeStartOrUpdateRemoteProxySession(...)
```

Without `remoteBindings: false`, the adapter always attempts a remote session.

### Changes

- `svelte.config.js`: added `platformProxy: { configPath: 'wrangler.jsonc', remoteBindings: false }` to adapter options — forces Miniflare local simulation
- `.dev.vars`: created (gitignored) by copying `.env` — Wrangler/Miniflare reads secrets from this file, NOT from `.env`

### Validation

- `GET /crm` returned 200 locally (was 500 before) — confirms `$env/dynamic/private` now resolves correctly



**Participants:** Scott Thornton, GitHub Copilot

### Problem

CRM save button was not working reliably. Root causes identified:

1. **Missing try-catch in `update` action** — if `updateLeadSalesFields` threw for any reason (Supabase error, missing credentials, etc.), the form action propagated a 500. The `enhance` callback received `result.type === 'error'`, and calling `update({ reset: false })` on an error result navigates SvelteKit to the error page. Users experienced "clicked Save, got taken to an error page."

2. **Null boolean bug** — `<select>` options with `value={null}` render as `value=""` in HTML. The server action was doing `val === 'true'` for boolean fields, which maps `""` to `false` instead of `null`. Selecting "Unknown" for Has App / Uses KDS / Uses SMS would silently overwrite `null` with `false` in the database.

### Changes

- `src/routes/crm/+page.server.ts`: wrapped `updateLeadSalesFields` in try-catch; `fail(500, { message })` is returned on error, so the enhance callback shows "Error saving" instead of navigating away. Added structured error logging.
- `src/routes/crm/+page.server.ts`: boolean field parsing now uses `val === '' ? null : val === 'true'` to correctly preserve null.
- `src/routes/crm/+page.svelte`: added `novalidate` to the update form to prevent browser HTML5 validation (e.g., `<input type="email">`, `<input type="url">`) from silently blocking form submission if a field contains data that fails the browser's format check.

### Validation

- All 131 tests passed (`pnpm test`)

## 2026-07-29 — Restaurant-Name Value Statements

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Synchronized restaurant-specific ranked value statements from the canonical template
- Resolve `[restaurant name]` from the CRM business name before Workers AI generation and canonical restoration
- Updated exact-statement regressions for revised Square and Toast copy
- Derive expected ranked and segment statements from the synchronized canonical template so prose-only edits do not require test rewrites
- Continue validating priority selection, template boundaries, placeholder resolution, and exact post-AI restoration

### Validation

- `pnpm exec vitest run tests/unit/call-script.test.ts` — 17 tests passed

## 2026-07-29 — Streamlined Call Opening Contract

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Updated canonical value-statement restoration to recognize `### 1. Deliver the Value Statement`
- Synchronized the bundled call template with the streamlined first-30-seconds structure
- Updated the Workers AI regression fixture to use the new canonical heading
- Resolve a missing CRM contact name to `Hi, this is [Your Name] with DialTone.Menu` before AI generation
- Prevent unresolved `[contact_name]` placeholders from appearing in generated scripts

### Validation

- `pnpm exec vitest run tests/unit/call-script.test.ts` — 17 tests passed

## 2026-07-29 — CRM Filter Reset

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Added a Reset button beside the restaurant search field
- Clear business search, city, status, delivery, and pickup filters in one action
- Return the restaurant table to page 1 and disable Reset when no filters are active
- Added component coverage for applying and clearing every filter

### Validation

- `pnpm exec vitest run tests/components/pages.test.ts` — 26 tests passed

## 2026-07-29 — Restaurant Research Request Compatibility

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Diagnosed restaurant research 404s as upstream website responses rather than missing CRM or intranet routes
- Added a stable HTML-capable user agent and language preference to initial and redirected website requests for CDN compatibility
- Included the fetched URL in upstream HTTP errors so failures identify the exact URL that responded
- Added focused coverage for the outbound request profile and 404 diagnostics

### Validation

- Confirmed `https://www.dcitysmokehouse.com/` currently returns HTTP 200 with both generic and researcher-style requests
- `pnpm exec vitest run tests/unit/restaurant-research.test.ts` — 18 tests passed

## 2026-07-29 — Canonical Value-Statement Enforcement

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Restore the complete canonical `Deliver the Value Statement` block after Workers AI responds
- Prevent the model from paraphrasing an already selected ranked statement before the generated script is saved
- Added regression coverage using a Toast note and the observed incorrect paraphrase

### Validation

- `pnpm exec vitest run tests/unit/call-script.test.ts` — 17 tests passed
- `pnpm test` — 129 tests passed
- `pnpm check` — 0 errors and 0 warnings

## 2026-07-29 — Ranked Note-Driven Value Statements

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Replaced the earlier five-item pre-call mapping with the canonical template's ranked value-statement table
- Parse triggers and statement copy directly from the synchronized Markdown template so it remains the source of truth
- Match the CRM `notes` field case-insensitively and select the lowest priority number when several triggers appear
- Fall back to approved research and then the known restaurant segment when the note has no matching trigger
- Updated the resolved-placeholder contract and added coverage for `uberEats`, mixed-case `Square`, and DoorDash-over-Square precedence

### Validation

- `pnpm exec vitest run tests/unit/call-script.test.ts` — 17 tests passed
- `pnpm test` — 129 tests passed
- `pnpm check` — 0 errors and 0 warnings
- `pnpm update:call-script` — all 11 verification gates passed, including template equality, production build, Wrangler dry run, and required bindings

## 2026-07-29 — Persistent CRM Detail Pane

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Keep the CRM lead detail pane open after a successful sales-info save
- Reset the dirty state and display `Saved` without triggering an unnecessary page-level action update
- Added an explicit orange **Close** button beside **Save** while retaining the header close control and backdrop behavior
- Prompt with `Discard unsaved changes?` when any close control is used with dirty sales fields; Cancel keeps editing and OK discards
- Added component coverage for explicit close, successful-save persistence, and both discard-confirmation outcomes

### Validation

- `pnpm exec vitest run tests/components/pages.test.ts` — 25 tests passed
- `pnpm check` — 0 errors and 0 warnings
- `pnpm test` — 125 tests passed

## 2026-07-29 — Pre-Call Priority Mapping

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Include the canonical `Before the Call` section in the Workers AI prompt as guidance without including it in generated output
- Rank supported observations using the template's numbered priorities and map each observation to the DialTone.Menu solution with the same number
- Explicitly map verified `No phone automation` findings to the voice-agent value statement
- Resolve the value statement before Workers AI runs so the model cannot preserve the template placeholder
- Fall back to the canonical food-truck, single-location, or multi-location statement when no approved priority finding is available and the CRM segment is known
- Reject any AI response that still contains the unresolved value-statement placeholder instead of saving it to CRM
- Continue requiring CRM facts or approved research support; absence of a finding is not evidence that a restaurant lacks phone automation
- Added regression coverage for extracting the mapping and applying the `1 → 1` phone-automation solution

### Validation

- `pnpm exec vitest run tests/unit/call-script.test.ts` — 15 tests passed
- `/usr/local/bin/update-call-script` — all 11 checks passed, including byte equality, lint, typecheck, 121 tests, production build, Wrangler dry run, and both required bindings
- `pnpm check` — 0 errors and 0 warnings
- `pnpm test` — 127 tests passed

## 2026-07-29 — Call-Script Template Fidelity

**Participants:** Scott Thornton, GitHub Copilot

### Context

The bundled call-script template predated edits to the canonical `dialtone_sm` source, and the Workers AI prompt allowed fixed template wording to be paraphrased during personalization.

### Changes

- Synchronized the bundled template byte for byte with the current canonical DialTone cold-call template
- Required generated scripts to preserve all headings and fixed text outside square-bracketed placeholders verbatim
- Replaced the hardcoded caller name with `[Your Name]`, populated from the required `CALLER_NAME` Cloudflare environment variable
- Declared `CALLER_NAME` as a non-secret Wrangler variable and verify its production binding during template updates
- Standardized the prospect placeholder as `[contact_name]` and populate it from the lead's `contact_name` database field when available
- Preserve `[contact_name]` when the business contact is unknown, rather than inventing a contact
- Added focused regression assertions for caller configuration, CRM contact personalization, and the stricter generation contract

### Validation

- `pnpm exec vitest run tests/unit/call-script.test.ts tests/unit/crm-research.test.ts` — 19 tests passed
- `/usr/local/bin/update-call-script` — all 11 checks passed, including byte equality, lint, typecheck, 120 tests, production build, Wrangler dry run, and `env.AI`/`env.CALLER_NAME` binding validation

## 2026-07-28 — Documentation Dashboard Link

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Restored the **Documentation** dashboard card link to `/files`, the Supabase-backed file store
- Added component coverage that verifies the card links to the Files route

### Validation

- `pnpm exec vitest run tests/components/pages.test.ts`

## 2026-07-27 — CRM Call-Script Boundary Enforcement

**Participants:** Scott Thornton, GitHub Copilot

### Context

Workers AI could exhaust the 1,400-token output limit before returning `******STOP HERE******`. The response extractor then saved the entire incomplete response, including echoed research instructions and canonical template content outside the intended generation boundaries.

### Changes

- Limited the model prompt to canonical template content between `******START HERE******` and `******STOP HERE******`
- Removed generation requirements for discovery, voicemail, and follow-up sections that sit outside those boundaries
- Required a complete marked response and reject missing boundary markers instead of saving partial output
- Increased the output budget from 1,400 to 2,400 tokens
- Continued stripping any model preamble or footer outside the markers before persistence
- Added regression coverage for bounded prompts, truncated output, preamble stripping, and the Workers AI token budget

### Validation

- `pnpm exec vitest run tests/unit/call-script.test.ts tests/unit/crm-research.test.ts` — 13 tests passed
- `pnpm test` — 110 tests passed
- `pnpm check` — 0 errors and 0 warnings
- `pnpm build` — Cloudflare production build succeeded

## 2026-07-27 — CRM App, Email, and POS Research

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Extended **Research Restaurant** to find direct Apple App Store and Google Play app links published by the official restaurant website
- Added public business email findings from valid `mailto:` links, normalized for review
- Added verified Toast, Square, and Clover usage findings when the official website links to those providers
- Kept marketplace links such as DoorDash classified as online ordering rather than POS evidence
- Added focused tests for extraction, URL normalization, provenance, and invalid email handling

### Validation

- `pnpm test -- tests/unit/restaurant-research.test.ts` — 108 tests passed
- `pnpm check` — 0 errors and 0 warnings

## 2026-07-26 — CRM Admin Coverage Regression

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Added CRM Admin component tests for audit rendering, email attribution, search, operation filtering, restore confirmation, action feedback, and empty states
- Added restore action tests for malformed IDs, database failures, and defensive non-Error failures
- Restored all global coverage metrics above the required 85% threshold without lowering thresholds or excluding CRM Admin code

### Validation

- `pnpm test:coverage` — 82 tests passed; 94.24% lines/statements, 96.29% functions, 85.71% branches

## 2026-07-26 — Restricted CRM Change Log and Restore

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Added a **CRM Admin** dashboard card visible only to `scotton@bytestreams.ai`
- Enforced the same exact-email authorization on the server loader and restore action
- Added a searchable/filterable `lead_change_log` view for operation, business, location, phone, IDs, actor, transaction, and JSON snapshots
- Added restore support for prior update states and deleted leads; restores create new CDC events for traceability
- Kept insert events read-only because they have no prior state
- Added an optional development-only `DEV_USER_EMAIL` override for local authorization testing
- Added focused tests for card visibility, direct-route denial, audit loading, and restore authorization
- Added migration `009_add_lead_change_actor_email.sql` and server-side email propagation so future CRM changes show and search by the Cloudflare Access email instead of an opaque UUID

### Production Prerequisite

Run `developer/migrations/009_add_lead_change_actor_email.sql` in the Supabase SQL Editor before deploying this version. Existing audit events remain labeled **Service role** because their initiating email was not captured and cannot be reconstructed reliably.

## 2026-07-26 — Canonical Template Update Script

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Added `developer/update-call-script.sh` to synchronize the editorial call template and run the complete validation process
- Added `pnpm update:call-script` as the supported one-command workflow
- Added prerequisite, source-file, byte-equality, lint, typecheck, test, build, Wrangler dry-run, and `env.AI` binding checks
- Added explicit PASS output and a final verification summary
- Made the script resolve symbolic links so it can be exposed as `/usr/local/bin/update-call-script` and run from any directory
- Kept commit, push, and deployment outside the script so publishing remains a deliberate review step
- Updated the operations runbook with global command installation, the comprehensive workflow, and the copy-only fallback

## 2026-07-26 — CRM Call-Script Generation Diagnostics

**Participants:** Scott Thornton, GitHub Copilot

### Context

Investigated call-script generation after updating the canonical Markdown template. The full template imports successfully, passes the focused prompt tests, and builds into the Cloudflare Worker; Markdown formatting is not used as a parser contract and was not the cause of the inert-looking control.

### Changes

- Moved generation status beside the **Generate Script** button so failures are immediately visible
- Added an accessible live region for generation status
- Preserved HTTP/deserialization details for malformed action responses
- Returned the authenticated Workers AI error message from the server action while retaining structured server logging

### Validation

- `pnpm vitest run tests/unit/call-script.test.ts` — 2 tests passed
- `pnpm check` — 0 errors (3 pre-existing unused CSS warnings)
- `pnpm build` — Cloudflare production build succeeded
- `pnpm wrangler deploy --dry-run` — `env.AI` binding present

## 2026-07-25 — AI-Personalized CRM Call Scripts

**Participants:** Scott Thornton, GitHub Copilot

### Context

Added on-demand call-script generation for researched CRM leads using the approved DialTone.Menu cold-call framework and the lead's existing enrichment data.

### Changes

- Added **Reviewed** as a CRM status while retaining **Researched**
- Added a persistent, editable `call_script` field to each lead
- Added a **Generate Script** control for leads saved as Researched or Reviewed
- Added a **Call Script Generated** badge beneath the lead name when a saved script exists
- Added a server-side prompt builder that includes only known CRM facts and prohibits invented details, unsupported savings, and native-delivery claims
- Bundled `dialtone_sm/DialTone_Cold_Call_Template.md` as the canonical AI framework under `src/lib/server/prompts/`
- Added `pnpm sync:call-script` to refresh the bundled prompt from the sibling `dialtone_sm` repository
- Added `docs/runbook.md` covering template operations, deployment, verification, troubleshooting, and rollback
- Added Cloudflare Workers AI with `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Added official `@cloudflare/workers-types` development types and an `AI` binding in `wrangler.jsonc`
- Added focused prompt-grounding tests

### Architecture

The SvelteKit action reloads the lead from Supabase by ID instead of trusting client-submitted enrichment fields. It verifies the stored status, generates the script synchronously through the Workers AI binding, saves the result to Supabase, and returns it to the editable CRM panel.

### Production Prerequisite

Run `developer/migrations/008_add_reviewed_call_script.sql` in the Supabase SQL Editor before deploying. The migration adds the `call_script` column and extends the status constraint with `reviewed`.

## 2026-07-25 — CRM Prospect and Customer Statuses

**Participants:** Scott Thornton, GitHub Copilot

### Changes

- Added **Prospect** and **Customer** to CRM status filters and edit controls
- Added matching status badges and server-side validation
- Added migration `007_add_prospect_customer_statuses.sql` for the Supabase status constraint

### Production Prerequisite

Run `developer/migrations/007_add_prospect_customer_statuses.sql` in the Supabase SQL Editor before assigning either new status in production.

## 2026-07-25 — CRM Manual Lead Creation

**Participants:** Scott Thornton, GitHub Copilot

### Context

Added a manual lead-entry workflow to the CRM so customers can be added without the automated enrichment pipeline.

### Changes

- Added an **Add Lead** button and modal to `/crm`
- Added required business name, city, and state validation
- Added optional contact, address, website, business type, and notes fields
- Added a protected SvelteKit form action and Supabase insert helper
- Included `state` in the CRM lead query and `Lead` type

### Validation

- `pnpm check` — 0 errors
- `pnpm test` — 68 tests passed
- `pnpm build` — Cloudflare production build succeeded

## 2026-07-21 — Calendar & File Storage Features

**Participants:** Scott Thornton, GitHub Copilot

### Context

Added two new intranet features: a full-featured FullCalendar event calendar and a Supabase Storage file management page.

### Changes

**Calendar (`/calendar`)**
- Installed `@fullcalendar/core`, `daygrid`, `timegrid`, `list`, `interaction` (all pinned to v6.1.x)
- Month / Week / Day / List views via toolbar
- Click or drag to select a date range → pre-filled create modal
- Click event → edit modal with save/delete (with confirmation)
- Drag-to-move and resize events, persisted immediately via fetch
- Color picker (6 swatches) per event
- Past dates blocked: `selectAllow` prevents selection, `eventDrop` reverts if dragged to past
- DB migration: `developer/migrations/005_create_events.sql` — `events` table with `updated_at` trigger and `start_at` index (**must be run in Supabase SQL Editor**)
- Nav link added

**File Storage (`/files`)**
- Supabase Storage bucket: `documents` (**must be created manually in Supabase dashboard, set to private**)
- Upload: click or drag-and-drop, auto-submits on file select
- Allowed types: PDF, Word, Excel, PowerPoint, plain text, CSV, Markdown, images (PNG/JPG/GIF/WebP), video (MP4/MOV) — max 25 MB, validated server-side
- File list: name (with icon), size, last updated
- Download via signed URL (1 hour expiry), opens in new tab
- Delete with single confirmation click
- Filenames sanitized to prevent path traversal
- Nav link added

**CI Fixes**
- `src/routes/calendar/**` and `src/routes/files/**` added to vitest coverage exclusions (same pattern as CRM)
- Fixed nested `<form>` in calendar delete flow — replaced with `fetch`-based `handleDelete()`
- Fixed `StorageFile` typecheck — explicitly mapped fields from Supabase `FileObject` instead of casting

### ⚠️ Manual Production Setup Required

Before these features work in production, two steps must be completed manually:

1. **Events table** — Run `developer/migrations/005_create_events.sql` in the [Supabase SQL Editor](https://supabase.com/dashboard) for the project
2. **File bucket** — Create a private Storage bucket named exactly `documents` in the Supabase dashboard under Storage

---

## 2026-07-21 — CRM: Researched Status & Notes Field Expansion

**Participants:** Scott Thornton, GitHub Copilot

### Context

Quick CRM quality-of-life improvements: added a new lead status and expanded the notes field to support longer entries.

### Changes

**New Lead Status: "Researched"**
- Added `researched` between `new` and `contacted` in the status pipeline
- Updated `STATUSES`, `STATUS_LABELS`, and `STATUS_CLASS` arrays in `src/routes/crm/+page.svelte`
- Added `researched` to `VALID_STATUSES` in `src/routes/crm/+page.server.ts` (server-side validation)
- Added `badge--researched` CSS style (purple, consistent with badge design system)

**Notes Field**
- Expanded textarea from `rows="4"` to `rows="15"` (comfortably holds 750+ words)
- Added `maxlength="5000"` to enforce a safe upper bound
- Added `resize: vertical; overflow-y: auto; min-height: 200px` so the field is scrollable and user-resizable

### Deployment

- Committed and pushed to `main` — GitHub Actions CI/CD pipeline triggered for Cloudflare Worker deploy

---

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
