/**
 * SAML Configuration — Google Workspace IdP
 * ByteStreams LLC Intranet (bytestreams.info)
 */

const fs = require('fs');
const path = require('path');

function loadCert(filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[SAML] Certificate not found: ${fullPath}`);
    console.error('[SAML] Run: npm run generate-certs');
    process.exit(1);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function getSamlConfig() {
  const idpCert = loadCert(process.env.SAML_IDP_CERT_PATH || './certs/google-idp-cert.pem');
  const spKey = loadCert(process.env.SAML_SP_KEY_PATH || './certs/sp-key.pem');
  const spCert = loadCert(process.env.SAML_SP_CERT_PATH || './certs/sp-cert.pem');

  return {
    // --- Identity Provider (Google Workspace) ---
    entryPoint: process.env.SAML_ENTRY_POINT,
    logoutUrl: process.env.SAML_LOGOUT_URL || process.env.SAML_ENTRY_POINT,
    cert: idpCert,

    // --- Service Provider (bytestreams.info) ---
    issuer: process.env.SAML_ISSUER || 'https://bytestreams.info',
    callbackUrl: process.env.SAML_CALLBACK_URL || 'https://bytestreams.info/auth/sso/acs',
    privateKey: spKey,
    decryptionPvk: spKey,
    signingCert: spCert,

    // --- Security Settings ---
    signatureAlgorithm: 'sha256',
    digestAlgorithm: 'sha256',
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,

    // --- Attribute Mapping (Google Workspace defaults) ---
    // Google sends these in the SAML assertion:
    //   - nameID          → user email (primary identifier)
    //   - firstName        → mapped from Google first name
    //   - lastName         → mapped from Google last name
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',

    // --- Session ---
    // Max time (seconds) between auth request and response
    requestIdExpirationPeriodMs: 3600000, // 1 hour
    // Accept responses up to 5 minutes old (clock skew tolerance)
    acceptedClockSkewMs: 300000,
  };
}

module.exports = { getSamlConfig };
