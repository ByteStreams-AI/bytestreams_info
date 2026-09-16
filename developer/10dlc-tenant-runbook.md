# Runbook — registering a tenant's 10DLC brand and campaign from Portal Admin

For whoever onboards a DialTone.Menu customer. Every step is a click in Portal Admin
(`bytestreams.info/portal-admin`) or a check on Telnyx Mission Control, with the SQL to
confirm what the portal recorded. The content rules behind the campaign are in
`dialtone/developer/10dlc-campaign-registration.md`; the code design is the 2026-09-16
section of `AGENTS.md`. This file is the procedure.

**One brand and one campaign per tenant.** The brand is the restaurant's legal entity
(its EIN); the campaign is its marketing traffic. The brand is a TCR fee and registers
at onboarding signoff; the campaign is submitted from the customer row once the tenant
is live. Walked through end to end on Shorty's under ByteStreams LLC on 2026-09-16.

---

## 0. One-time setup (already done for production)

| What | Where | How to confirm |
|---|---|---|
| Portal migrations `011`, `012`, `013` | Supabase SQL Editor on **`mxhyvvgjtqllohpvrwon`** (the project `PORTAL_SUPABASE_URL` reads — not the CRM project, which has no `businesses`) | `select tcr_menu_host from businesses limit 1;` returns a column, not `42703` |
| `TELNYX_API_KEY` Worker secret | `wrangler secret put TELNYX_API_KEY` — the Telnyx account DialTone sends from | Signoff alert says something other than "skipped (TELNYX_API_KEY not set)" |
| Compliance evidence bucket | DialTone **prod** project `klzznfagrtormretqsgb`, public bucket `compliance-evidence/<restaurant_id>/` | Each of the five URLs in step 4 returns 200 in a browser |

---

## 1. Before you start, per tenant

- [ ] The customer exists as a **DialTone.Menu** product with the **legal** business
      name (must match the IRS record for the EIN) and the restaurant's trading name.
- [ ] If the legal address is not the restaurant's, the "Business (legal) address is the
      same" switch was unticked and the legal address entered. TCR checks the brand
      against the EIN record's address, not the dining room's.
- [ ] **10DLC entity type** on the edit modal is right: private company (LLC, Inc.),
      public company, or non-profit. Sole proprietors are not supported here.
- [ ] In DialTone admin, **Settings → Branding → display name** is the name guests see,
      spelled exactly as the menu page and screenshots show it. Every campaign string
      is built from it (falling back to the row's base name only when it is empty).
- [ ] `is_food_truck` on the DialTone restaurant is correct. It picks the campaign
      wording: a truck's description promises location updates and one sample is one;
      a restaurant's must not.
- [ ] The tenant's branded menu is live at `https://<slug>.m.dialtone.menu/menu` and
      shows the rewards checkbox with its disclosure.
- [ ] The five evidence screenshots are in the bucket under the **live** (prod)
      restaurant id: `cart_disclosure.jpg`, `home_qrcode.jpg`, `menu_footer_qrcode.jpg`,
      `kiosk_3_options.jpeg`, `kiosk_disclosure.jpeg`.

---

## 2. Verify EIN and addresses

On the customer row, the pencil beside an unverified badge opens the re-verify modal.
EIN goes through Cobalt, both addresses through PostGrid. Both **EIN** and **Business
Address** must read Verified before onboarding can be signed off; the brand call refuses
otherwise. Once all three checks are green a **View** button opens the same modal
read-back.

**Manual override — test rows only.** When a verifier is unavailable (Cobalt's plan
change on 2026-09-16), a test row can be flipped by hand. Never on a real customer: the
timestamp it writes is a claim that we checked.

```sql
-- SQL Editor on mxhyvvgjtqllohpvrwon. Preview first: exactly one row.
select id, name, ein_verified, address_verified, restaurant_address_verified
  from businesses where name ilike '<legal business name>';

do $$
declare v_id uuid;
begin
  select id into strict v_id from businesses where name ilike '<legal business name>';
  update businesses
     set ein_verified = true, ein_verified_at = coalesce(ein_verified_at, now()),
         address_verified = true, restaurant_address_verified = true
   where id = v_id;
end $$;
```

---

## 3. Onboarding signoff registers the brand

1. Customer list → scroll the row right → **Edit**.
2. Tick **Onboarding complete** (enabled only when EIN and Business Address are verified).
3. **Save.** The server registers the brand with Telnyx before it responds, so allow a
   few seconds. An alert reports the outcome; the list reloads and the **10DLC** column
   leaves "After onboarding".

Signoff also bills the real TCR brand fee and sets the first recurring charge 30 days
out. It never fails because of Telnyx: a refusal is stored on the row and said back.

| Alert says | Meaning | Do |
|---|---|---|
| `Brand <id> registered (SELF_DECLARED)` | Created. TCR's EIN check has not run yet | Step 4 |
| `EIN and address must both be verified…` | A verification is missing | Step 2 |
| `The restaurant phone is not a valid US number…` | Precondition, Telnyx not called | Fix the phone in Edit, then **Register Brand** on the row |
| `No owner email on the portal account.` | Precondition, Telnyx not called | Fix the account, then Register Brand |
| `The business address is incomplete…` | Precondition, Telnyx not called | Re-verify with the full legal address, then Register Brand |
| Anything else | Telnyx refused; the same text sits in red under the 10DLC badge | Read it, fix, Register Brand |

**Register Brand** appears in the column whenever the row is onboarded with no brand
id. It is safe: with no id stored it registers; with one stored it only refreshes. Do
not run it if a brand exists on Telnyx but the row lost its id — that would create a
second brand and a second fee. Restore the id by hand instead.

---

## 4. Refresh until the brand is verified

The column is a stored value; Telnyx does not call us back. Press **Refresh** under
"Brand SELF_DECLARED" to re-read it. TCR's check usually finishes within minutes.

| identityStatus | Meaning | Do |
|---|---|---|
| SELF_DECLARED | Created from our declaration; TCR check pending | Refresh |
| VERIFIED | EIN matched the legal name and address | Step 5 |
| VETTED_VERIFIED | Verified plus paid vetting | Step 5 |
| UNVERIFIED | TCR could not match the EIN to the name/address | Fix the legal name or address to match the IRS record, re-verify, Register Brand |

Mission Control → Messaging → 10DLC → **Brands** shows the same status independently,
with the TCR id (`BEB30ZQ` for Shorty's). Its Name column is the display name as
registered.

---

## 5. Submit the campaign

Once the badge reads **Brand verified**, the button is **Submit Campaign**. The modal
asks for two links, prefilled with the conventional values from the portal's own row.
**Replace them with the live tenant's**, which is the prod clone and may carry a
different restaurant id:

```
Menu host:      https://<slug>.m.dialtone.menu
Evidence base:  https://klzznfagrtormretqsgb.supabase.co/storage/v1/object/public/compliance-evidence/<prod restaurant_id>
```

Before anything reaches Telnyx the portal GETs the host, `<host>/menu` and all five
evidence images. A dead link is refused with its URL named, because a reviewer who
clicks a dead link fails the campaign. On success the alert shows the campaign id, the
column reads **Campaign in review**, and the links used are recorded on the row.

To see the exact copy that will be sent for a tenant before submitting, render it from
the builders (they are the template, verbatim, by venue type):
`tests/unit/telnyx-10dlc.test.ts` pins every field.

---

## 6. Track the review

Press **Refresh** on the row over the following days. TCR review is quick; each carrier
(MNO) reviews separately and typically takes 1–5 business days.

| Column reads | Telnyx campaignStatus | Do |
|---|---|---|
| Campaign in review | TCR_PENDING → TCR_ACCEPTED → MNO_PENDING | Wait, Refresh |
| Campaign approved | MNO_ACCEPTED / MNO_PROVISIONED | Step 7 |
| Red status, e.g. `TCR FAILED`, `MNO REJECTED`, `TCR SUSPENDED` | A reviewer refused | The reason is in the red text under the badge; fix content or evidence per the template, then resubmit |

Mission Control → 10DLC → **Campaigns** lists it under the brand with the samples as
submitted; that is where to confirm the trading name and wording actually sent.

---

## 7. After approval — the parts that are still manual

1. **Assign the tenant's marketing DID** on the DialTone side. It must differ from the
   voice number and the transactional number, and no other tenant may hold it:

   ```sql
   -- DialTone project (prod: klzznfagrtormretqsgb)
   update restaurants set marketing_sms_from_number = '+1XXXXXXXXXX' where id = '<restaurant_id>';
   ```

2. **Attach that number to the campaign** in Mission Control (Numbers → the DID →
   Messaging → campaign). A number belongs to one campaign; a number on no campaign
   reports `sent` and is silently dropped by the carrier.
3. **Messaging profile auto-responses:** CLEAR opt-in, CLEAR help, POPULATE opt-out.
   We send the first two branded from the tenant's DID; Telnyx must send the third
   because it suppresses the number before our webhook fires. The profile must be on
   API V2 with its inbound webhook at `…/functions/v1/telnyx_webhook`.
4. **Send one test** to a handset. On the outbound message detail,
   `tcr_campaign_registered` must be non-null. `sent` with no delivery means the number
   is not on an approved campaign, not a wiring fault.

Open item: the opt-out reply is per messaging profile, so on a shared profile it cannot
name the brand (dialtone #1614). Decide that before a real customer's campaign goes live.

---

## Reading the 10DLC column

| Shown | State |
|---|---|
| — | Not a DialTone.Menu product |
| After onboarding | Not signed off; no brand yet |
| No brand · Register Brand | Signed off, brand not registered (see step 3 table) |
| Brand SELF_DECLARED · Refresh | Brand created, TCR check pending |
| Brand UNVERIFIED · Refresh | TCR could not match the EIN |
| Brand verified · Submit Campaign | Ready for the campaign |
| Brand verified / Campaign in review · Refresh | Submitted |
| Brand verified / Campaign approved | Done; step 7 |
| Red campaign status · Refresh | Refused; read the text under it |

Red text under any badge is the last Telnyx error (`tcr_last_error`), truncated at 60
characters; hover for the whole message.

## What the portal recorded

```sql
-- SQL Editor on mxhyvvgjtqllohpvrwon
select name, onboarded, tcr_entity_type,
       tcr_brand_id, tcr_brand_status, tcr_brand_registered_at,
       tcr_campaign_id, tcr_campaign_status, tcr_campaign_submitted_at,
       tcr_menu_host, tcr_evidence_base_url,
       tcr_last_checked_at, tcr_last_error
  from businesses
 where name ilike '<legal business name>';
```

`tcr_last_checked_at` moves on every stamp, including the registration itself, so it
does not by itself prove a Refresh ran; a status change does.

## Things that have already gone wrong once

- **Migration on the wrong project.** `011` was first run on the CRM project and failed
  with `relation "businesses" does not exist`. The portal tables are on
  `mxhyvvgjtqllohpvrwon`.
- **The brand registered as "Shortys".** The code read the restaurant row's base name;
  Settings → Branding held "Shorty's". Fixed (#23) to read the branding name first.
  Check the branding name before signoff, since the brand's display name is set at
  registration.
- **Evidence links derived from the wrong project.** The portal's tenant is the staging
  row; the live tenant is its prod clone. The modal exists so the admin pastes the live
  links.
- **The Edit button was off-screen.** With two address columns the table is wider than
  the panel; it scrolls horizontally now. Scroll right for Edit and Resend.
