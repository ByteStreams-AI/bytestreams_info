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

1. Copy `.env.example` to `.env` and fill in `CF_ACCESS_AUD`
2. Configure Cloudflare Access application in Zero Trust dashboard with Google Workspace as IdP
3. Set Access Policy to allow `@bytestreams.ai` domain
4. Deploy to Cloudflare Pages with env vars configured
