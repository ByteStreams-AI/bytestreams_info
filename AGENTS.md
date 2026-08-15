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
