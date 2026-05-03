# ByteStreams Intranet — SAML SSO

**bytestreams.info** — Node.js/Express intranet with Google Workspace SAML SSO

## Project Structure

```
bytestreams-sso/
├── server.js                 # Express app entry point
├── package.json
├── .env.example              # Environment config template
├── .gitignore
├── config/
│   └── saml.js               # SAML strategy configuration
├── middleware/
│   └── auth.js               # Auth guards & domain restriction
├── routes/
│   └── auth.js               # SSO login, ACS, logout, metadata
├── views/
│   ├── login.ejs             # Login page (Google SSO button)
│   ├── home.ejs              # Authenticated intranet home
│   └── error.ejs             # Error/403/404 page
├── certs/                    # SP certs & IdP cert (gitignored)
│   ├── sp-cert.pem           # Generated — your SP public cert
│   ├── sp-key.pem            # Generated — your SP private key
│   └── google-idp-cert.pem   # Downloaded from Google Workspace
└── public/                   # Static assets
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate SP Certificates

```bash
npm run generate-certs
```

This creates `certs/sp-cert.pem` and `certs/sp-key.pem` (self-signed, valid 10 years).

### 3. Configure Google Workspace SAML App

Follow the **Google Workspace Setup** section below, then:

1. Download the Google IdP certificate and save it as `certs/google-idp-cert.pem`
2. Copy `.env.example` to `.env` and fill in your values

```bash
cp .env.example .env
```

### 4. Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Visit `http://localhost:3000` → redirects to `/login` → click "Sign in with Google" → authenticates via Google Workspace → lands on intranet home.

---

## Google Workspace SAML App Setup

### Step 1: Open Google Admin Console

1. Go to [admin.google.com](https://admin.google.com)
2. Navigate to **Apps → Web and mobile apps**
3. Click **Add app → Add custom SAML app**

### Step 2: App Details

- **App name:** ByteStreams Intranet
- **Description:** Internal intranet — bytestreams.info
- **App icon:** (optional — upload ByteStreams logo)
- Click **Continue**

### Step 3: Download Google IdP Information

Google will show you:
- **SSO URL** — this is your `SAML_ENTRY_POINT` in `.env`
- **Entity ID** — Google's IdP entity ID
- **Certificate** — click **Download Certificate**

Save the downloaded certificate as:
```
certs/google-idp-cert.pem
```

Copy the **SSO URL** into your `.env` as `SAML_ENTRY_POINT`.

Click **Continue**.

### Step 4: Service Provider Details

Enter the following:

| Field | Value |
|-------|-------|
| **ACS URL** | `https://bytestreams.info/auth/sso/acs` |
| **Entity ID** | `https://bytestreams.info` |
| **Start URL** | `https://bytestreams.info/auth/sso/login` |
| **Signed response** | ✅ Checked |
| **Name ID format** | `EMAIL` |
| **Name ID** | Basic Information → Primary email |

Click **Continue**.

### Step 5: Attribute Mapping

Map these Google directory attributes to SAML attributes:

| Google Directory | App Attribute |
|-----------------|---------------|
| First name | `firstName` |
| Last name | `lastName` |
| Primary email | `email` |

Click **Finish**.

### Step 6: Enable the App

1. On the app details page, click **User access**
2. Select **ON for everyone** (or specific OUs)
3. Click **Save**

The app takes up to 24 hours to propagate, but usually works within minutes.

---

## Auth Flow Summary

```
User visits bytestreams.info
        │
        ▼
  ensureAuthenticated()
  middleware checks session
        │
   Not authenticated?
        │
        ▼
  Redirect → /auth/sso/login
        │
        ▼
  passport-saml generates AuthnRequest
  Redirect → Google Workspace SSO URL
        │
        ▼
  User authenticates with Google
  (password + MFA if configured)
        │
        ▼
  Google POSTs SAML assertion → /auth/sso/acs
        │
        ▼
  passport-saml validates assertion:
  ✓ Signature valid (IdP cert)
  ✓ Audience matches (Entity ID)
  ✓ Not expired
        │
        ▼
  ensureDomain() checks @bytestreams.ai
        │
        ▼
  Session created → redirect to intranet home
```

## Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/login` | GET | Login page with Google SSO button |
| `/auth/sso/login` | GET | Initiates SAML flow → redirects to Google |
| `/auth/sso/acs` | POST | Assertion Consumer Service — Google posts here |
| `/auth/sso/logout` | GET | Destroys session, redirects to Google logout |
| `/auth/sso/metadata` | GET | SP metadata XML — give this URL to your IdP admin |
| `/auth/me` | GET | Returns current user JSON (API) |
| `/health` | GET | Health check (public) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | No | Default: `3000` |
| `BASE_URL` | Yes | `https://bytestreams.info` |
| `SESSION_SECRET` | Yes | Random 64+ char string |
| `MONGO_URI` | No | MongoDB connection string (falls back to memory store) |
| `SAML_ENTRY_POINT` | Yes | Google SSO URL from Step 3 |
| `SAML_ISSUER` | Yes | `https://bytestreams.info` |
| `SAML_CALLBACK_URL` | Yes | `https://bytestreams.info/auth/sso/acs` |
| `SAML_IDP_CERT_PATH` | Yes | Path to Google's IdP cert |
| `SAML_SP_CERT_PATH` | Yes | Path to your SP cert |
| `SAML_SP_KEY_PATH` | Yes | Path to your SP private key |

## Security Notes

- **Domain restriction:** Only `@bytestreams.ai` emails are allowed (configurable in `middleware/auth.js`)
- **Sessions:** 8-hour expiry, HTTP-only cookies, secure flag in production
- **Helmet:** CSP, HSTS, X-Frame-Options, and other security headers enabled
- **Certificates:** SP certs are gitignored — never commit private keys
- **HTTPS:** Required in production — SAML assertions must be transmitted over TLS

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Use a reverse proxy (nginx/Caddy) with TLS termination
3. Point `bytestreams.info` DNS to your server
4. Set up MongoDB for persistent sessions (`MONGO_URI`)
5. Use a process manager (PM2, systemd) for reliability

```bash
# Example with PM2
pm2 start server.js --name bytestreams-intranet
```

---

**ByteStreams LLC** — bytestreams.info
