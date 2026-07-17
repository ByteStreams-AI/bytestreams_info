# Task #1 KPI Requirements — DialTone Outreach Landing Page

## Purpose

Define the KPI requirements for adding a business-facing KPI group to the `bytestreams_info` landing page.

This document is the source of truth for:

- KPI definitions and formulas
- Data source assumptions
- API response contract (draft)
- Acceptance criteria for delivery

## Audience

- Business users with moderate technical aptitude
- Product and engineering stakeholders implementing the KPI feature

## Scope

In scope:

- Landing-page KPI summary cards
- Core outreach funnel percentages
- Data freshness timestamp
- Clear labels and plain-language definitions

Out of scope (for this task):

- Historical trend charts
- Drill-down analytics
- Role-specific metric variants

## Current-State Findings

- `bytestreams_info` is currently auth-first and does not yet have runtime KPI data integration.
- Existing KPI operational data currently lives in the DialTone Outreach system.
- The DialTone FastAPI app reads KPI data from Supabase Postgres via `outreach/db.py`.

## Source Data

Primary source: Supabase Postgres (DialTone Outreach).

Relevant entities currently used by the FastAPI dashboard logic:

- `contacts`
- `email_log`
- `contact_status_counts` (view)
- `contacts_due_for_outreach` (view)

## KPI Definitions

### 1) Total Contacts

Business definition: Total number of tracked outreach contacts.

Formula:

- `total_contacts = sum(status_counts[*])`

### 2) Emails Sent (Today)

Business definition: Number of outreach emails sent since `00:00:00 UTC` today.

Formula:

- `emails_sent_today = count(email_log where sent_at >= today_utc_start)`

### 3) Contacts Emailed (Sequence Stages)

Business definition: Total contacts that have entered outbound email sequence stages.

Formula:

- `sent_contacts = emailed_1 + emailed_2 + emailed_3 + breakup_sent + re_engage`

### 4) Demos Booked

Business definition: Contacts in `demo_booked` status.

Formula:

- `demos = status_counts['demo_booked']`

### 5) Pilots

Business definition: Contacts in `pilot` status.

Formula:

- `pilots = status_counts['pilot']`

### 6) Customers

Business definition: Contacts in `customer` status.

Formula:

- `customers = status_counts['customer']`

### 7) Email-to-Demo Conversion

Business definition: Percentage of sent contacts that reached demo-booked status.

Formula:

- `email_to_demo = demos / sent_contacts`
- Display as percentage with one decimal place.
- If denominator is `0`, display em dash `—`.

### 8) Demo-to-Pilot Conversion

Business definition: Percentage of demos that reached pilot status.

Formula:

- `demo_to_pilot = pilots / demos`
- Display as percentage with one decimal place.
- If denominator is `0`, display em dash `—`.

### 9) Pilot-to-Customer Conversion

Business definition: Percentage of pilots that became customers.

Formula:

- `pilot_to_customer = customers / pilots`
- Display as percentage with one decimal place.
- If denominator is `0`, display em dash `—`.

## Display and UX Requirements

- Show KPI labels in plain language, not internal status names.
- Show last-updated timestamp in UTC.
- Use a loading state while data is fetched.
- Use a non-blocking error state with retry guidance if data fetch fails.
- Keep first release to a compact card group suitable for the landing page.

## API Contract (Draft)

Suggested server response for landing-page KPIs:

```json
{
  "generated_at": "2026-05-19T18:30:00Z",
  "total_contacts": 0,
  "emails_sent_today": 0,
  "sent_contacts": 0,
  "demos": 0,
  "pilots": 0,
  "customers": 0,
  "funnel": {
    "email_to_demo": "—",
    "demo_to_pilot": "—",
    "pilot_to_customer": "—"
  },
  "status_counts": {
    "new": 0,
    "emailed_1": 0,
    "emailed_2": 0,
    "emailed_3": 0,
    "breakup_sent": 0,
    "re_engage": 0,
    "demo_booked": 0,
    "pilot": 0,
    "customer": 0,
    "replied": 0,
    "not_interested": 0,
    "invalid": 0
  }
}
```

## Data Quality Rules

- All percentage KPIs must handle divide-by-zero safely.
- Missing statuses in source data should default to `0`.
- Timestamp values must be ISO-8601 UTC strings.
- Metric generation should be deterministic for the same source snapshot.

## Acceptance Criteria (Task #1)

- KPI list, formulas, and source tables are documented and unambiguous.
- Business stakeholder can read each KPI definition without code-level knowledge.
- Draft API contract is approved by engineering for implementation.
- Issue tasks for implementation reference this document as source of truth.

## Open Decisions

- ~~Confirm whether `re_engage` should be included in `sent_contacts` for v1 KPI reporting.~~ **Decision (2026-05-20): Yes — include `re_engage` in `sent_contacts`.**
- ~~Confirm refresh model for landing page.~~ **Decision (2026-05-20): Load on page render, then auto-refresh every 60 minutes.**
- ~~Confirm whether business users need local-time display in addition to UTC.~~ **Decision (2026-05-20): Display local time only (browser's local timezone via `toLocaleString`).**
