# AGENTS.md

## Active Repository Instructions

### DialTone Cold-Call Template

- The canonical editorial source is `../dialtone_sm/DialTone_Cold_Call_Template.md`.
- The application bundles a synchronized copy at `src/lib/server/prompts/DialTone_Cold_Call_Template.md`. Do not maintain this copy independently.
- After changing the canonical template, run `pnpm run sync:call-script` from this repository and verify that the two files are byte-for-byte identical.
- Update `tests/unit/call-script.test.ts` whenever a template change adds, removes, renames, or changes behavior for a ranked value statement, observation opener, follow-up email, placeholder, generation boundary, or canonical section.
- If a new provider-specific follow-up section must be selected automatically, update `followUpEmailHeading()` in `src/lib/server/call-script.ts` and add a matching selection test. A template section is not reachable until the routing function returns its exact heading.
- Run `pnpm exec vitest run tests/unit/call-script.test.ts` after every template or routing change.
- Run `pnpm test:coverage` before completion. CI enforces global thresholds of 85% for lines, statements, branches, and functions.
- For the full synchronization and release-readiness workflow, run `pnpm run update:call-script`. This syncs the template and runs lint, Svelte/TypeScript checks, tests, a production build, and a Wrangler dry run. It does not commit, push, or deploy.

## feat/sveltekit-sso-landing — SvelteKit SSO + Landing Page

**Date:** 2026-05-03
**Agent:** Oz (Warp)

### Summary

Scaffolded the ByteStreams intranet as a SvelteKit + TypeScript application with Cloudflare Access SAML SSO authentication and a branded landing page.

### Changes

- Initialized SvelteKit project with `@sveltejs/adapter-cloudflare` for Cloudflare Pages deployment
- Implemented Cloudflare Access JWT validation (`jose` library) with dev mode mock auth bypass
- Created branded login page (`/login`) with Google SSO button following ByteStreams Brand Kit v1.0
- Created protected dashboard (`/`) with nav, user greeting, and product card grid (DialTone.Menu, DialTone.Med, Documentation)
- Built reusable components: `Nav.svelte`, `ProductCard.svelte`
- Established brand design system in `src/app.css` — CSS custom properties for colors, typography, spacing, radius, motion from Brand Kit
- Set up Vitest with 85% coverage thresholds — 63 tests across 7 files (unit + component)
- Added GitHub Actions CI/CD pipeline (lint → typecheck → test+coverage → build → deploy)
- Added ESLint flat config for SvelteKit + TypeScript

### Architecture

- **Auth:** Cloudflare Access (SP) ↔ Google Workspace SAML (IdP). App validates `Cf-Access-Jwt-Assertion` JWT headers — no in-app SAML.
- **Deploy:** Cloudflare Pages via `wrangler pages deploy`
- **Stack:** SvelteKit 2, Svelte 5, TypeScript, Vite 6, Vitest 3

## 2026-05-03 — Auth Architecture Evaluation

**Date:** 2026-05-03
**Agent:** Oz (Warp)

### Summary

Evaluated switching from Cloudflare Access JWT auth to direct Google Workspace SAML SSO. Decided to stay with Cloudflare Access.

### Decision

- Cloudflare Access remains the auth layer — handles SAML with Google Workspace at the edge, passes JWT to app
- Direct SAML (`@node-saml/node-saml`) would require `adapter-node` and self-hosted infra, incompatible with Cloudflare Pages/Workers
- No code changes made — current auth implementation is the correct approach
- See `developer/developer-journal.md` for full rationale

### Status

Pending: `.env` configuration, Cloudflare Access application setup in Zero Trust dashboard, Cloudflare Pages deployment

## fix/cloudflare-access-auth-alignment — CF Access Auth Alignment

**Date:** 2026-05-05
**Agent:** Oz (Warp)

### Summary

Aligned auth implementation with Cloudflare Access JWT spec per `developer/sveltekit-cloudflare-access-auth.md`. Fixed team domain, switched to platform bindings, and adopted soft-fail auth pattern.

### Changes

- Fixed team domain: `bytestreams.cloudflareaccess.com` → `bytestreamsai.cloudflareaccess.com`
- Switched env config from `.env` to `.dev.vars` (Cloudflare convention); created `.dev.vars.example`
- Rewrote `auth.ts`: platform bindings (`event.platform.env`), JWKS caching with cooldown/TTL, soft-fail (returns null instead of throwing), cookie fallback for `CF_Authorization`
- Updated `User` type: replaced `firstName`/`lastName` (not in CF Access JWT) with `displayName` (derived from email prefix), added `sub`, `iat`, `exp`
- Updated `hooks.server.ts`: soft-fail pattern — sets `locals.user = null`, page-level guards handle redirects
- Fixed dev mode logout: `logged_out` cookie mechanism so Sign Out works locally
- Updated Nav and dashboard UI to use `displayName`
- Added `Platform` interface to `app.d.ts` for CF env bindings
- Gitignored auth reference doc and `.wrangler/`
- Updated all tests (67 passing)

## 2026-05-06 — Cloudflare Pages Deployment

**Date:** 2026-05-06
**Agent:** Oz (Warp)

### Summary

Connected GitHub repo to Cloudflare Pages via the unified Workers & Pages dashboard. Resolved build and deploy configuration issues.

### Changes

- Added `packageManager: "pnpm@10.33.0"` to `package.json` — Cloudflare was auto-detecting pnpm but using wrong version
- Added `wrangler` as devDependency — not pre-installed in Cloudflare build environment
- Added `wrangler.jsonc` — configures asset directory for deploy step
- Build command: `pnpm run build`
- Deploy command: `npx wrangler pages deploy .svelte-kit/cloudflare --project-name=bytestreams-intranet`

### Deployment Configuration

- **Platform:** Cloudflare Workers & Pages (unified), connected via Import Repository
- **Environment variables:** `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `NODE_PACKAGE_MANAGER`, `CLOUDFLARE_API_TOKEN`
- **API Token:** Custom token with Workers Scripts Edit, Cloudflare Pages Edit, Workers Builds Configuration Edit permissions
- **Non-production branches:** Builds enabled for preview deployments

### Status

In progress: Resolving API token permissions for deploy step

## 2026-08-24 — Live Stripe Payments Cutover

**Date:** 2026-08-24
**Agent:** Claude (Claude Code)

### Summary

Switched the DialTone customer billing flow from Stripe test mode to live mode, and
closed four correctness gaps that were harmless in test but not with real money.
Payments are **live and collecting**. Tax assessment is wired but **switched off** at
`app_settings.enable_tax_assessment`, so live charges currently carry $0.00 tax — see
Status.

### Architecture (who does what)

Payment handling spans two repos. Neither is complete on its own:

- **`bytestreams_info` (this repo) — assessment.** Portal Admin creates
  `billing_schedule` rows and calls Stripe Tax `/v1/tax/calculations` via
  `src/lib/server/stripe-tax.ts` to compute what to charge. Deploys as the
  `bytestreams-intranet` Worker.
- **`bytestreams_ai` — collection.** `worker.js` creates PaymentIntents, serves the
  customer portal, and reconciles via the Stripe webhook at `/api/stripe-webhook`.
  Deploys as the `ancient-mountain-5dad` Worker.

Both read the same Supabase project, `mxhyvvgjtqllohpvrwon`. They must stay in
lockstep: if one is repointed, the webhook cannot find the bill and customers are
charged against rows that stay `pending` forever.

### Stripe accounts — the names mislead

- **`acct_1TPSsg2KmwBSXLwC`** — BYTESTREAMS LLC, **live**. All live keys and the live
  webhook destination.
- `acct_1TPSsrRzkaQaekRa` — BYTESTREAMS LLC **sandbox**. A separate account under
  Stripe's Sandboxes model, not a test view of live. Needs its own webhook
  destination; its keys will never validate against the live signing secret.
- `acct_1TUZtORrmddnOdHk` — a third, stale account. Still referenced by `.dev.vars`
  in both repos. Not live, not the sandbox.

### Changes — this repo

- Added `developer/migrations/portal/009_add_payment_lifecycle.sql`: seven lifecycle
  columns on `billing_schedule` (`stripe_tax_transaction_id`, `last_payment_error`,
  `last_payment_failed_at`, `refunded_cents`, `refunded_at`, `disputed_at`,
  `dispute_reason`) plus a partial index on `stripe_payment_intent_id`, which the
  webhook needs to resolve a bill from a charge or dispute. **Applied to
  `mxhyvvgjtqllohpvrwon` on 2026-08-24.**
- Portal Admin billing table: added a **Tax Filed** column. A paid row showing
  "Not filed" means the Stripe Tax transaction was never committed — this is the
  only visible signal for a missing `Tax Transactions: write` scope, which fails
  silently otherwise.
- Added `refunded` and `disputed` status badges; surfaced `last_payment_error`.

### Changes — `bytestreams_ai`

- **Stripe Tax transactions are now recorded.** `recordTaxTransaction()` commits the
  calculation via `/tax/transactions/create_from_calculation` after payment clears.
  Previously tax was collected but never reported to Stripe Tax — a filing gap.
  Refunds reverse it, using the delta so repeated partial refunds do not
  double-reverse.
- **Idempotency keys** on PaymentIntent creation (`bill-{id}-{amount}`), so retries
  cannot double-charge while a genuine re-quote still creates a new intent.
- **Stale intent reuse fixed.** The intent is fetched with GET (it was a POST, which
  silently doubled as an update), reused only in `requires_payment_method` /
  `requires_confirmation`, and its amount re-checked against the bill.
- **Webhook coverage completed**: `payment_intent.payment_failed`, `charge.refunded`,
  `charge.dispute.created` added alongside `payment_intent.succeeded`. Charge and
  dispute objects do not reliably carry our metadata, so `resolveBillId()` falls back
  to matching the stored intent id.
- Payment gated to an allowlist (`pending` / `overdue`) on both server and portal.

### Build bug found and fixed (`bytestreams_ai`)

`build:public` and the CI "Stage deploy artifact" step both run `rm -rf public` then
`cp *.html public/`. `portal.html` and `admin.html` lived **only** inside `public/`
(tracked via gitignore negations), so every CI deploy shipped a site with **no
customer portal**. Confirmed by triggering it. Fixed by moving both files to the repo
root and adding `test -f public/portal.html` / `admin.html` guards to `build:public`
and `deploy.yml`.

Also note `npm run build` is `sass && build:public && blog:build` — eleventy writes
into `public/` too. Running `build:public` alone drops the blog from the artifact.
Always run the full build before deploying.

### Tax is assessed at payment time (`bytestreams_ai`) — written, NOT yet deployed

Portal Admin's assessment at bill-creation is now an **estimate for display only**.
The authoritative figure is recalculated in `handlePortalPay` immediately before the
PaymentIntent is created or updated.

The reason is not expiry. Calculations stay committable for 90 days
([API reference](https://docs.stripe.com/api/tax/transactions/create_from_calculation)),
which comfortably covers a setup fee. The reason is that a calculation's **rates are
frozen at creation** while the transaction posts as effective on the day it is
committed — so a bill quoted weeks earlier would file stale rates against the current
period and miss any registration added in between. Stripe's own
[PaymentIntents guidance](https://docs.stripe.com/tax/payment-intent/custom) is
calculate → create intent → record transaction on success.

New helpers in `worker.js`:

- `getTaxConfig()` — reads the same `app_settings.enable_tax_assessment` flag Portal
  Admin uses, with an `ENABLE_TAX_ASSESSMENT` env override. One flag across both
  services, so they cannot disagree about whether a bill carries tax.
- `getBillingAddress()` — linked `locations` row for restaurants, `businesses.address_*`
  otherwise. Returns null on an incomplete address; Stripe rejects partials.
- `calculateTax()` — same call shape as this repo's `assessStripeTax()`.

A calculation failure returns **502 and charges nothing**. Never bill an amount whose
tax could not be verified.

**Requires `Tax Calculations: write` on the worker's restricted key.** The block is
gated on the enable flag, so while tax is off the code is inert and the scope is not
yet needed — but the flag cannot be flipped until the scope exists, or every payment
attempt 502s.

**Intent reuse now also compares the calculation id**, and updates it alongside the
amount. `recordTaxTransaction()` prefers the bill row over intent metadata, since the
row is always at least as fresh once tax is re-assessed at payment.

### Tax reversals are full-only (`bytestreams_ai`) — written, NOT yet deployed

Bills are single-line-item, and Stripe recommends full reversals for that shape.
Partial reversals make reporting unreliable once reversed tax stops being proportional
to the subtotal, and a later full reversal does **not** supersede earlier partials —
the two double-count.

A partial refund therefore reverses no tax. It logs and writes an explanatory note to
`last_payment_error` for manual handling.

### Status

**Live:** `ancient-mountain-5dad` version `fcf7ece4-5165-46e8-897a-5528924b314a`.
`/api/portal/config` serves `pk_live_…CtOB`; the webhook returns 400 (invalid
signature) rather than 503, confirming `STRIPE_WEBHOOK_SECRET` is set.

`bytestreams-intranet` now carries `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, and
`COBALT_API_KEY` (added 2026-08-24), so tax assessment *can* run.

**But `app_settings.enable_tax_assessment` is `"false"`.** Every live charge books
`tax_cents: 0` with no calculation id, which also means nothing is filed to Stripe
Tax. Flipping it is a tax decision — confirm sales-tax registration and that Stripe
Tax is configured in the live account first.

**See `developer/developer-journal.md`, same date, for the full open list** —
including uncommitted work in both repos, unverified restricted-key scopes, and the
smoke test that has not been run.

## 2026-08-31 — Invoice Pay Links, Tier Pricing, Cross-Platform Dial Bridge

**Date:** 2026-08-31
**Agent:** Claude (Claude Code)

### Summary

Customers can now pay an invoice from the emailed link without signing in. Tier
pricing was realigned with the published price list, a tier that could never be sold
was removed, and the CRM's dial bridge was made to run on Windows and macOS.

Shipped as `bytestreams_info` PRs #9, #10, #11 and `bytestreams_ai` PR #3. All merged
to `main` and deployed by CI.

### Changes

- **Signed one-click pay links.** The invoice email's CTA pointed at bare `/portal`, a
  sign-in wall that cost the customer a second magic-link email before they could reach
  the bill. It now opens the invoice itself, which carries a Stripe card form.
  `sendInvoiceEmail` signs the link with the same HMAC construction the worker already
  verified for receipt emails; `/api/portal/pay` accepts `exp`+`sig` as an alternative
  to a session token, scoped by the signature to one bill.
- **`INVOICE_LINK_SECRET`** must hold the identical value here and in the bytestreams.ai
  worker. Unset, invoice emails fall back to the portal sign-in link rather than mailing
  a link that 401s. Documented in `.env.example`.
- **`developer/remove-portal-customer.mjs`** — removes one portal customer and
  everything created for them, keyed by email. Dry run by default;
  `pnpm portal:remove-customer --email <email> --apply`. Replaces hand-editing
  `developer/cleanup-test-data.sql`, which remains as the SQL-editor fallback.
- **Tier pricing realigned** with `dialtone_menu/public/pricing.html`: Food Truck
  $199 → $249, Single Location $279 → $299. Multi-Location ($399) and the $100 setup
  fee were already correct. Both the server table that prices the bill and the client
  table that renders the preview are updated and cross-referenced.
- **Multi-Configuration tier removed.** It is not a value of the `restaurants.tier`
  enum, so choosing it failed customer creation with `22P02`. It remains a valid *lead*
  `business_type` in the CRM, which is a different field.
- **Recurring monthly email** now carries the same one-click invoice link and reads as
  an invoice rather than a reminder.
- **Portal dashboard**: a signed-in user with no portal account rendered every card
  empty, which read as "you have no invoice"; it now names the address they signed in
  with. A failed payment setup went to the console, leaving a bill on screen with no
  button and no reason. The placeholder logo is now the ByteStreams mark.
- **Dial bridge runs on all three platforms.** `developer/kdeconnect-bridge.mjs`
  resolves `kdeconnect-cli` per platform with a `KDECONNECT_CLI` override, adds
  `/health`, and is documented in `developer/dial-bridge.md`. The CRM's click handler
  called `preventDefault()` after awaiting the bridge — too late to stop the
  navigation, invisible on Linux only because `tel:` has no handler there.

### Open

- **`ensureSupabaseAuthUser()` links the wrong auth user on re-invite.** This project's
  GoTrue ignores the `?email=` filter on `/auth/v1/admin/users` and returns an arbitrary
  user, which that function trusts as its fallback when creation reports "already
  registered". Unfixed. It matters most for importing existing customers, who all
  already have auth users.
- **Existing customers pay outside the portal.** Onboarding them through the New
  Customer form would duplicate their restaurant and invoice them $100 — and the setup
  fee cannot simply be skipped, because paying a `bill_type: 'setup'` bill is the only
  thing that ever sets `businesses.billing_cycle_start`, the anchor recurring billing
  is scheduled from. An import path is deferred.
- Dial bridge is verified on Linux only; Windows and macOS paths are the documented
  install locations, to be confirmed on real hardware.
