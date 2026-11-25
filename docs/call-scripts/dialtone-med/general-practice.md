# DialTone.Med Cold Call Script: General Practice

For primary care, family medicine, internal medicine, and nurse-practitioner practices
(CRM business type **General Practice**).

## Objective

Do not explain the whole product. The call has three jobs:

1. Reach the owner, physician lead, or practice manager.
2. Name the phone problem they already have: missed calls at peak times and staff stuck on the phone.
3. Book a 15-minute demo where they hear the agent handle a real-sounding patient call.

Keep it under five minutes.

## Before the Call

Check the lead in the CRM:

- **Contact name and title.** NPI imports carry the authorized official (owner, president, administrator)
  in the contact name and the title in the notes. Ask for that person by name.
- **Contact phone.** The authorized official's direct line, if imported. Try it first; it often skips the front desk.
- **Providers.** One provider or several? The NPI specialty and the website usually tell you.
- **Website.** Online scheduling? Patient portal? A "call us to book" page is a good sign.

## Getting Past the Front Desk

The person who answers is usually the person whose day this fixes. Be brief and respectful.

> Hi, this is [Your Name] with DialTone.Med. I'm trying to reach [contact_name]. Is she in today?

If asked what it's about:

> We help practices answer every patient call, including the busy times when the phones back up. I'd like
> to set up a short demo with [contact_name]. What's the best way to get 15 minutes on her calendar?

If the decision maker isn't available, ask for the practice manager's name and the best time to call back.
Log it in the CRM notes.

## First 30 Seconds

> Hi [contact_name], this is [Your Name] with DialTone.Med. How are you?
>
> I'll be quick. Most practices tell us the phones are hardest at the open and right after lunch. Calls
> go to voicemail, and some of those patients don't call back. DialTone.Med answers every call, verifies the
> patient, and texts them a secure link to finish the request: rescheduling, paying a balance, updating
> insurance. Your front desk stays with the patients in the room.
>
> I'd like to set up 15 minutes next week so you can hear it handle a call. Would that be worth a look?

Stop and let them respond.

If asked who you are:

> I'm with DialTone.Med. We answer patient calls and texts for general practices: appointments, billing,
> refill requests, prior authorization status, and insurance updates.

## Discovery Questions

Ask one or two. The goal is the meeting, not a long conversation.

1. What happens to a call when everyone at the front desk is already on the phone?
2. Roughly how many calls a day does the practice get?
3. What are most of those calls about: scheduling, refills, billing, or insurance?
4. How do patients pay a balance today: mailed statements, the portal, or over the phone?
5. How much of your staff's time goes to prior authorizations and the status calls that follow them?
6. Do you use an answering service or a phone tree after hours?

## The Five Workflows

Use only the ones the prospect asks about, or the one that matches their biggest pain. Every workflow
follows the same pattern: **the call identifies the patient, a secure texted link carries the detail, and
staff see every request in one console.** Anything the agent can't finish waits as a message in the
caller's own words until staff close it.

### Appointments

- **Patient says:** "I need to move my appointment on Thursday."
- **Agent:** checks who's calling, then texts a secure link with open times.
- **Patient:** books, reschedules, or cancels from the link and gets a confirmation by text and email.
- **Left for staff:** nothing. The change is already in the schedule.

### Billing and Payment

- **Patient says:** "How much do I owe, and can I pay it now?"
- **Agent:** never says the amount aloud. It texts a secure link with the balance.
- **Patient:** pays by card from the link and gets a receipt by text and email. Nobody reads a card number to staff.
- **Left for staff:** nothing.

### Refill Requests

- **Patient says:** "I need a refill on my blood pressure medication."
- **Agent:** takes the request in the patient's own words and tells them it has gone to the care team.
  It never approves a refill or promises one.
- **Left for staff:** one request to review in the console. The decision stays with the prescriber.

### Prior Authorization Status

- **Patient says:** "Has my prior authorization been approved yet?"
- **Agent:** after verifying the caller, says only the status ("one approved, one still in review"), never the
  drug or procedure. Details, dates, and the next step go by secure link.
- **Patient:** gets a text when the status changes: approved, denied, more information needed, or an appeal decided.
- **Left for staff:** nothing. No status call to return. The status comes from AuthPulse (below).

### Insurance Updates

- **Patient says:** "I have new insurance. Can you update it?"
- **Agent:** texts a secure link.
- **Patient:** types in the carrier, member ID, and group number.
- **Left for staff:** an eligibility result to review.

### Also Worth Knowing

- **Caregiver access.** Family members can call with only the permissions staff grant, such as appointments
  and prior-auth status but not payments.
- **Getting started.** The practice keeps its phone numbers. No EHR integration is needed to start; staff work
  from the console, and the EHR can be connected later.

## AuthPulse: Prior Authorization Tracking

AuthPulse is our prior-auth tracker for staff. It works on its own or with the voice agent, which reads
patient status from it. **It is in early access**, so say so: "it's in early access, and early customers
help shape it."

For a general practice, the payoff is staff time: prior auths are the most time-consuming phone task for many practice leaders, ahead of scheduling.

What it does:

- **One list, every request.** Every prior authorization the team is waiting on, sorted by what needs attention first.
- **Decision clocks.** Shows when each plan's answer is due where a federal timeframe applies (for example, 72
  hours for standard Medicare Part D drug requests, 7 days for Medicare Advantage medical services),
  and turns amber, then red, as the deadline passes.
- **Flags.** Late or due-today decisions; denials that came without a specific reason, which certain plans must
  give, so staff can ask before deciding on an appeal; approvals expiring within 30 days, so renewals start on time.
- **A record for the plan.** Each request keeps its timeline: submitted, delivery confirmed, calls to the plan,
  decision, appeal. A turnaround report shows each plan's record over 90 days.
- **Getting requests in.** Staff add them by hand or upload a spreadsheet; a scheduled EHR export can feed it
  automatically. Teams that fax can add a packet-and-fax assistant that builds the packet and sends the fax.

What it does not do, and you must not imply it does:

- It does not submit, decide, or appeal prior authorizations. The team submits the way it does today.
- A status in AuthPulse is a fact relayed from the plan, never a prediction.

Lead with AuthPulse only if they say prior auths are a big drain. Otherwise mention it in one line and keep the focus on the phones.

Useful lines:

> Prior auth isn't really the form. It's the chasing: status calls, deadlines nobody's watching, denials no one
> has time to appeal. AuthPulse puts every request on a clock and tells your staff which ones need them today.

> Most denials that get appealed are overturned, at least in Medicare Advantage. Very few get appealed, because
> nobody has time to spot them. AuthPulse flags the ones worth a second look.

## Close for the Meeting

### Standard Close

> The easiest way to judge it is to hear it. It takes 15 minutes, and we can run your own numbers on missed
> calls and front-desk time. Would [Day/Time A] or [Day/Time B] work better?

### Prior-Auth Close

> It sounds like prior authorizations are the bigger drain. Let us show you how status calls get answered
> without anyone pulling a chart, and how AuthPulse tracks every deadline. Is [Day/Time A] or [Day/Time B] better?

Always offer two specific times. Confirm the email address and send the invitation before you hang up.

## Objection Responses

### "We don't miss calls."

> That's great. Most practices that say that are paying for it in staff time instead. How many hours a day
> does someone spend on the phone? The demo shows what happens to that time.

### "We have an answering service."

> That covers after hours. The question is what happens at 8:30 on a Monday. An answering service takes a
> message; DialTone.Med finishes the request. The appointment gets moved and the bill gets paid while the
> patient is still on the line.

### "Patients won't want to talk to a robot."

> Fair concern. The agent's job is to get the patient to a finished request fast, not to keep them talking.
> Anything it can't handle goes to your staff in the patient's own words. Hearing a call is the best way to judge.

### "What about HIPAA?"

> We work as your business associate under a signed agreement. On the call, the agent only says what's safe
> to say aloud. Balances, medications, and procedures go to the patient's secure link, never spoken. Calls are
> recorded only with consent, and recordings are deleted after 30 days.

### "We'd have to change our EHR."

> You don't. You keep your phone numbers and your EHR. Staff work from our console to start, and we connect
> to the EHR when you're ready.

### "How much does it cost?"

> It depends on your call volume and which workflows you'd use, so I'd rather not guess. On the demo we'll
> look at your numbers and give you an exact figure.

### "Send me information."

> Happy to. So I send the right thing: is the bigger issue missed calls, or staff time on the phone?

After the answer:

> I'll send that today. Let's also hold 15 minutes so you can hear it on a call. Is [Day/Time A] or [Day/Time B] better?

### "I'm not the right person."

> Thanks for telling me. Who handles the phones and front-desk staffing? I'll make sure I don't waste her time either.

## After the Call

- Set the CRM status: **Contacted**, **Follow-up Required**, or **Demo Scheduled**.
- Mark **Phoned**.
- Put what you learned in the notes: call volume, current answering setup, biggest pain, who decides.
