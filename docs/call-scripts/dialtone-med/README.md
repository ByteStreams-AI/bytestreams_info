# DialTone.Med Call and Email Scripts

Hand-written scripts, one per CRM business type. Unlike DialTone.Menu, these are not generated per lead;
use the ones that match the lead's **Business Type**.

| Business type | Call script | Email sequence |
|---|---|---|
| General Practice | [general-practice.md](general-practice.md) | [general-practice-email.md](general-practice-email.md) |
| Specialty Practice | [specialty-practice.md](specialty-practice.md) | [specialty-practice-email.md](specialty-practice-email.md) |
| Specialty Pharmacy | [specialty-pharmacy.md](specialty-pharmacy.md) | [specialty-pharmacy-email.md](specialty-pharmacy-email.md) |

Each email sequence has three cold emails (Day 1, 4, 9) and two to send after a call: a voicemail follow-up and
the "send me information" reply.

The three cold emails are also sent automatically from the **Outreach** page. That copy lives in
`src/lib/server/outreach.ts` (`TEMPLATES`); when you change an email here, change it there too.

## Rules for Every Med Call

- **Book the demo; don't explain the product.** Fifteen minutes, two specific times, invitation sent before you hang up.
- **Ask for the authorized official by name.** NPI-imported leads carry the owner or officer in the contact name.
- **Never promise clinical outcomes.** The agent does not approve refills, decide prior authorizations, or give medical advice.
- **No pricing on calls.** Cost depends on call volume and workflows; it is covered on the demo, not on a cold call.
- **Only say what the site says.** Product claims match the DialTone.Med homepage and AuthPulse page. When the
  site changes, update these scripts.
- **AuthPulse is in early access.** Say so. It tracks prior authorizations; it never submits, decides, or appeals them.
- **No patient information on sales calls.** If a prospect starts describing a patient, stop them politely.

## Rules for Every Med Email

- **Send from a real person at a real ByteStreams address**, with your name and title. No made-up senders or personas.
- **Plain text, no attachments, no tracking pixels.** At most one link, and none in Email 1.
- **Every cold email must carry the sender's physical business address and a way to opt out**, as CAN-SPAM
  requires. Your email signature can carry both. Honor an opt-out right away and mark it in the CRM.
- **Stop the sequence on any reply**, including "no."

## Where the Claims Come From

- Workflows, data handling, and caregiver access: the DialTone.Med homepage (`dialtone_med/public/index.html`).
- AuthPulse: the AuthPulse page (`dialtone_med/public/authpulse.html`).
- Specialty pharmacy call statistics: URAC 2025 report, cited at the end of the pharmacy script.
