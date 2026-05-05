# AGENTS.md

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
