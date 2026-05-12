# Developer Journal — ByteStreams Intranet

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
