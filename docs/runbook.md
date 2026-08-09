# ByteStreams Intranet Operations Runbook

## Purpose

This runbook covers routine operation of the ByteStreams intranet, with emphasis on the DialTone.Menu AI call-script workflow. It documents source ownership, database prerequisites, template updates, validation, deployment, production verification, troubleshooting, and rollback.

## System Overview

| Component | Responsibility |
| --- | --- |
| `dialtone_sm` repository | Editorial source for approved DialTone.Menu sales content |
| `bytestreams_info` repository | SvelteKit intranet, CRM UI, server actions, and bundled prompt snapshot |
| Supabase | CRM lead data and persistent generated call scripts |
| Cloudflare Access | Authentication in front of the intranet |
| Cloudflare Worker | Hosts the SvelteKit application and server actions |
| Cloudflare Workers AI | Generates personalized call scripts through the `AI` binding |
| GitHub Actions | Runs CI and deploys successful pushes to `main` |

The production application is a Cloudflare Worker with static assets, not a Cloudflare Pages project. The workflow job still has the display name `Deploy to Cloudflare Pages`, but its actual deployment command is `npx wrangler deploy`.

## Portal Billing And Stripe Tax

DialTone.Menu setup and recurring charges use Stripe Tax Calculations with the PostGrid-verified restaurant address as the billing address. Tax is exclusive and is added to the `$100.00` setup subtotal and each eligible tier subtotal.

Before enabling billing:

1. Apply `developer/migrations/portal/004_add_onboarding_billing_lifecycle.sql` to the portal Supabase project.
2. Apply `developer/migrations/portal/005_add_stripe_tax_assessments.sql` to the portal Supabase project.
3. Enable Stripe Tax and add every jurisdiction where ByteStreams is registered to collect tax. Stripe returns zero collectible tax for locations without an active registration.
4. Store `STRIPE_SECRET_KEY` as a Cloudflare Worker secret. Do not place it in `wrangler.jsonc`.
5. Set `STRIPE_TAX_CODE` to the approved Stripe product tax code. The application defaults to `txcd_10103001` (Software as a service for business use).

Apply `developer/migrations/portal/006_add_structured_business_address.sql` before creating or editing Other customers with the structured Street, City, State, and ZIP fields. DialTone.Menu continues to store these components in `locations`.

Stripe Tax Calculations are assessments, not completed tax transactions. When payment processing is connected, create the corresponding Stripe Tax Transaction after successful payment so Stripe reporting reflects collected tax.

## Important Paths

### Editorial Source

```text
~/dev/projects/bytestreams/dialtone_sm/DialTone_Cold_Call_Template.md
```

This is the human-maintained source for messaging, provider positioning, objections, closes, voicemail, and follow-up email structure.

### Bundled Application Snapshot

```text
src/lib/server/prompts/DialTone_Cold_Call_Template.md
```

The deployed Worker cannot read a sibling repository at runtime. The application therefore bundles a committed snapshot of the editorial source during its Vite build.

Do not edit the bundled snapshot directly. The next synchronization will overwrite it.

### Prompt Builder

```text
src/lib/server/call-script.ts
```

The prompt builder combines:

1. Grounding and output rules maintained by engineering.
2. The bundled canonical sales template.
3. Known CRM facts for the selected lead.

Unknown CRM values are omitted. They are not treated as false.
The caller's name comes from the `CALLER_NAME` environment variable. The prospect's name comes from the lead's `contact_name` database field when available; otherwise the call script retains the `[contact_name]` placeholder.

### Database Migration

```text
developer/migrations/008_add_reviewed_call_script.sql
```

Migration 008 adds:

- The `reviewed` lead status.
- The persistent `call_script` text column.
- An updated `leads_status_check` constraint.

## Initial Production Setup

Complete these steps once before deploying AI call-script generation.

### 1. Apply Migration 008

1. Open the Supabase project.
2. Open **SQL Editor**.
3. Paste the contents of `developer/migrations/008_add_reviewed_call_script.sql`.
4. Run the SQL.
5. Confirm the command succeeds without errors.

Apply the migration before deploying application code that selects `call_script`. Deploying first can cause the CRM lead query to fail because the column does not exist.

### 2. Confirm Cloudflare AI Binding

The binding is declared in `wrangler.jsonc`:

```jsonc
"ai": {
  "binding": "AI"
}
```

Workers AI uses the Cloudflare account binding. It does not require an OpenAI or Anthropic API key.

Validate packaging without deploying:

```bash
pnpm build
pnpm wrangler deploy --dry-run
```

The dry-run output must list:

```text
env.AI    AI
```

### 3. Confirm GitHub Actions Secrets

The deployment job requires these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Do not store these values in source control or application environment files.

### 4. Configure the Call-Script Caller Name

Set the non-secret `CALLER_NAME` environment variable to the representative's spoken name.

For local development, add it to `.dev.vars`:

```text
CALLER_NAME=Steve
```

For production, set `CALLER_NAME` under `vars` in `wrangler.jsonc` and redeploy. Script generation returns a configuration error when it is missing or blank.

## Updating the Canonical Call Template

Install the update command once so it can be run from any directory:

```bash
sudo ln -s \
  ~/dev/projects/bytestreams/bytestreams_info/developer/update-call-script.sh \
  /usr/local/bin/update-call-script
```

The script resolves the symlink back to the repository before locating its files. After installation, run `update-call-script` from any directory.

### 1. Edit the Editorial Source

```bash
cd ~/dev/projects/bytestreams/dialtone_sm
```

Edit `DialTone_Cold_Call_Template.md`. Verify all pricing, feature, delivery, savings, and competitor statements before publishing.

Commit and push the editorial change in `dialtone_sm` according to that repository's normal review process.

### 2. Synchronize the Application Snapshot

Run the comprehensive update command from any directory:

```bash
update-call-script
```

Without the global command, run `pnpm update:call-script` from the `bytestreams_info` repository.

The script:

1. Confirms `pnpm` and the editorial source are available.
2. Copies the editorial source to the bundled application snapshot.
3. Verifies both templates match byte for byte.
4. Runs lint, Svelte/TypeScript checks, the complete test suite, and the production build.
5. Runs a Wrangler dry run and asserts that the `env.AI` binding is present.
6. Prints every verification result and a final PASS summary.

The script stops on the first failure. It does not commit, push, or deploy anything.

The bundled snapshot is written to:

```text
src/lib/server/prompts/DialTone_Cold_Call_Template.md
```

For a copy-only operation without the validation suite, use:

```bash
pnpm sync:call-script
```

### 3. Validate the Update

`pnpm update:call-script` runs all required checks automatically. To rerun them individually:

```bash
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm wrangler deploy --dry-run
```

Expected results:

- ESLint reports no errors.
- Svelte check reports no errors.
- All tests pass.
- The Cloudflare production build completes.
- Wrangler lists the `env.AI` binding.

The repository currently has pre-existing warnings for unused landing-page CSS selectors and an unused ESLint suppression in the login page. These warnings do not block deployment, but new errors must be resolved.

### 4. Review the Diff

```bash
git diff --check
git status --short
git diff -- src/lib/server/prompts/DialTone_Cold_Call_Template.md
```

Confirm that unrelated local files, editor settings, credentials, and dotfiles are not staged.

### 5. Commit and Push

```bash
git add \
  src/lib/server/prompts/DialTone_Cold_Call_Template.md \
  developer/developer-journal.md

git commit -m "content(crm): update canonical call script"
git push origin main
```

Include other application files only when the prompt-building behavior or CRM feature also changed.

A successful push to `main` runs lint, typecheck, coverage tests, build, and `wrangler deploy`. Running `pnpm build` locally creates an artifact but does not deploy it.

## CRM User Workflow

### Eligible Leads

AI generation is available only when the lead's saved database status is:

- **Researched**
- **Reviewed**

If a user changes the status in the detail pane, they must click **Save** before generating. The server reloads the lead from Supabase and checks the stored status rather than trusting browser-submitted CRM facts.

### Generate a Script

1. Open **CRM**.
2. Click **Edit** for a lead.
3. Review and correct the lead's enrichment and sales data.
4. Set the status to **Researched** or **Reviewed**.
5. Click **Save** if the status or CRM facts changed.
6. Reopen the lead.
7. Click **Generate Script** in the **AI Call Script** section.
8. Wait for the button to change from **Generating...** back to **Generate Script**.

On success:

- The generated text appears in the editable script field.
- The script is saved immediately to Supabase.
- **Generated and saved** appears below the field.
- **Call Script Generated** appears beneath the restaurant name.

### Edit a Generated Script

The generated script remains editable. After making manual changes, click the normal **Save** button to persist those edits.

### Regenerate a Script

Clicking **Generate Script** again replaces the currently saved script. Existing scripts are not automatically updated when the canonical template changes. Regenerate each lead that should use the new template.

## AI Grounding and Data Handling

The model receives only known values from these CRM fields when available:

- Business and contact names
- City and state
- Business type and location count
- Website URL and website/app indicators
- POS, KDS, and SMS usage
- DoorDash Marketing and ChowNow indicators
- Delivery and pickup indicators
- Price range, Yelp rating, and review count
- Michelin rating
- Sales notes

The prompt instructs the model to:

- Use only supplied CRM facts.
- Avoid inferring unknown values.
- Avoid inventing decision-makers, providers, pain points, fees, contracts, or savings.
- Avoid claiming DialTone operates a delivery network.
- Treat pricing and processing claims as qualification-dependent.
- Frame savings as a personalized comparison.

The model currently used is:

```text
@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

Generation uses a low temperature for consistent output. The generated script is still sales-assist content and should be reviewed by a person before use.

## Production Verification

After GitHub Actions reports a successful deployment:

1. Sign in through Cloudflare Access.
2. Open the CRM.
3. Confirm **Reviewed** appears in the status filter and edit control.
4. Open a Researched or Reviewed test lead.
5. Generate a script.
6. Confirm the output uses that lead's known facts.
7. Confirm no unknown detail is presented as fact.
8. Confirm **Call Script Generated** appears near the lead name.
9. Close and reopen the lead.
10. Confirm the script and badge persist.
11. Make a small edit, click **Save**, reopen the lead, and confirm the edit persists.

Do not use a real prospect for the first smoke test after changing prompt rules or model configuration.

## Troubleshooting

### Generate Button Is Disabled

**Cause:** The displayed status is not Researched or Reviewed.

**Resolution:** Select an eligible status, click **Save**, reopen the lead, and try again.

### "Save the lead as Researched or Reviewed" Error

**Cause:** The browser shows an eligible status, but the stored Supabase status has not been updated.

**Resolution:** Save the lead before generating.

### "AI generation is not available in this environment"

**Cause:** The application is running under plain Vite or another environment without the Workers AI binding.

**Resolution:** Test generation through the deployed Cloudflare Worker. Use local Vite only for UI review unless a remote Workers AI development environment has been configured.

### "Unable to generate the call script"

Possible causes:

- Workers AI service or model failure.
- Cloudflare account AI access or quota issue.
- Invalid or missing AI binding in the deployed Worker.
- Supabase failure while saving the generated result.

Actions:

1. Retry once.
2. Check Cloudflare Worker logs for `call script generation failed`.
3. Confirm `env.AI` appears in the latest deployment configuration.
4. Confirm Supabase is reachable and migration 008 has been applied.
5. Run a Wrangler dry-run from the deployed revision.

Do not expose provider or database error details to CRM users. Detailed errors belong in server logs.

### CRM Fails to Load After Deployment

**Likely cause:** Application code selects `call_script`, but migration 008 was not applied.

**Resolution:** Apply migration 008 in Supabase. If that cannot be done immediately, roll the Worker back to the prior version.

### Script Uses Stale Messaging

Possible causes:

- The editorial source was edited but not synchronized.
- The synchronized snapshot was not committed.
- The application commit was not pushed or deployment failed.
- The lead still contains a previously generated script.

Resolution:

1. Run `pnpm sync:call-script`.
2. Compare the two files with `cmp`.
3. Build, commit, and push `bytestreams_info`.
4. Confirm GitHub Actions succeeds.
5. Regenerate the affected lead's script.

### Badge Does Not Appear

**Cause:** The saved `call_script` is empty, generation failed, or a manual clear was saved.

**Resolution:** Generate or restore the script, save if manually edited, and reopen the lead.

## Logs and Diagnostics

Cloudflare Worker errors are emitted as structured JSON. Search Worker logs for:

```text
call script generation failed
```

The log includes the lead ID and internal error message. It must not include the full generated script, prompt, credentials, or unnecessary customer data.

For live production logs, use Wrangler only when authenticated and authorized:

```bash
pnpm wrangler tail
```

Do not paste secrets into terminal commands, issue comments, or logs.

## Rollback

### Application Rollback

The preferred rollback is through source control:

1. Revert the problematic commit without rewriting history.
2. Push the revert to `main`.
3. Let GitHub Actions validate and deploy it.

For an urgent Cloudflare rollback, an authorized operator can inspect and roll back Worker versions:

```bash
pnpm wrangler versions list
pnpm wrangler rollback <VERSION_ID>
```

After an emergency rollback, reconcile source control so the next deployment does not reintroduce the problem.

### Prompt-Only Rollback

1. Revert the editorial change in `dialtone_sm`.
2. Run `pnpm sync:call-script` in `bytestreams_info`.
3. Validate, commit, and push the restored snapshot.
4. Regenerate only the scripts that need the restored wording.

### Database Rollback Considerations

Migration 008 is additive except for replacing the status check constraint. Do not drop `call_script` during a routine application rollback; doing so destroys saved scripts and can break any still-running application version that selects the column.

If `reviewed` must be removed from the constraint, first move all leads currently using that status to another valid status. Database rollback should be planned and executed separately from Worker rollback.

## Security and Operational Guardrails

- Keep Supabase service-role credentials server-side only.
- Keep Cloudflare deployment credentials in GitHub Actions secrets.
- Never send arbitrary browser-submitted lead facts directly to the model.
- Review pricing and competitor language before synchronizing template changes.
- Do not log prompts or generated scripts by default.
- Do not deploy before required migrations are applied.
- Do not run `wrangler deploy` manually unless an explicit emergency or deployment procedure requires it.
- Prefer push-to-`main` deployment so CI checks run before production changes.
- Keep unrelated local files and editor settings out of commits.

## Routine Checklist

### Template Update

- [ ] Edit and review the canonical file in `dialtone_sm`.
- [ ] Commit and push the editorial source.
- [ ] Run `pnpm sync:call-script` in `bytestreams_info`.
- [ ] Confirm the source and snapshot match.
- [ ] Run lint, typecheck, tests, build, and Wrangler dry-run.
- [ ] Review and commit only intended files.
- [ ] Push `main` and confirm GitHub Actions succeeds.
- [ ] Regenerate a test lead and review the result.

### AI Feature Deployment

- [ ] Apply migration 008 before deploying the selecting code.
- [ ] Confirm GitHub Actions secrets exist.
- [ ] Confirm the `AI` binding appears in Wrangler dry-run output.
- [ ] Deploy through a push to `main`.
- [ ] Complete the production smoke test.
- [ ] Monitor Worker logs for generation failures.

## Ownership

- **Sales/marketing:** Canonical messaging and competitor claim review in `dialtone_sm`.
- **Engineering:** Prompt guardrails, CRM fact mapping, model configuration, persistence, and deployment.
- **Operations:** Supabase migrations, Cloudflare configuration, production verification, logs, and rollback coordination.

Update this runbook whenever source ownership, model selection, CRM fields, deployment flow, or production prerequisites change.
