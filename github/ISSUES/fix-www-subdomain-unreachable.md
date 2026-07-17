# fix(dns, cloudflare): www.bytestreams.info returns "cannot reach" error

## Summary

Navigating to `https://www.bytestreams.info` triggers the Cloudflare Access SSO flow, but the post-auth callback to `https://www.bytestreams.info/cdn-cgi/access/authorized` fails with a "cannot reach" error. The apex domain `bytestreams.info` works correctly.

---

## Problem

After authenticating via Google Workspace SSO, Cloudflare Access redirects to:

```
https://www.bytestreams.info/cdn-cgi/access/authorized?nonce=...&state=...
```

This URL is unreachable. The decoded `state` parameter confirms:
- `hostname`: `bytestreams.info` (apex, no `www`)
- `authDomain`: `bytestreamsai.cloudflareaccess.com`

The mismatch between the request URL (`www.bytestreams.info`) and the configured hostname (`bytestreams.info`) causes the callback to fail.

---

## Root Cause

The `www` subdomain is not configured in Cloudflare DNS or as a route/custom domain on the Worker. The Worker deployment (`bytestreams-intranet.cottonbytes.workers.dev`) and Cloudflare Access application are only set up for the apex domain `bytestreams.info`.

When a user visits `www.bytestreams.info`, Cloudflare Access may still intercept and initiate auth, but the callback has no Worker to respond — resulting in "cannot reach."

---

## Proposed Fix

**Option A — Redirect (recommended):**
Add a Cloudflare Redirect Rule to redirect all `www.bytestreams.info` traffic to `bytestreams.info`:
- **Rule:** `www.bytestreams.info/*` → `https://bytestreams.info/$1` (301 permanent)
- Requires a proxied DNS record for `www` (CNAME to `bytestreams.info` or a dummy `AAAA 100::` record, orange-clouded)

**Option B — Add www as Worker route:**
- Add a `www` CNAME in Cloudflare DNS pointing to `bytestreams-intranet.cottonbytes.workers.dev` (proxied)
- Add `www.bytestreams.info/*` as a Worker route
- Add `www.bytestreams.info` to the Cloudflare Access application's allowed hostnames

Option A is simpler — single domain to maintain in both Worker config and Cloudflare Access.

---

## Files Changed

None — this is a Cloudflare dashboard configuration change (DNS + Redirect Rules or Worker Routes).

---

## Acceptance Criteria

- `https://www.bytestreams.info` redirects to `https://bytestreams.info` (or serves the app directly)
- Post-auth callback completes successfully regardless of whether the user visits `www` or apex
- SSO login → dashboard flow works end-to-end from both URLs

---

## Labels

- `bug`
- `cloudflare`
- `dns`
- `auth`
