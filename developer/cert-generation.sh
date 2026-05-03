
npm install
npm run generate-certs
cp .env.example .env
# Fill in SAML_ENTRY_POINT from Google Admin Console
# Drop google-idp-cert.pem into /certs/
npm run dev
