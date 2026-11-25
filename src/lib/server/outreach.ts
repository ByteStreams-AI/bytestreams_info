/**
 * Automated DialTone.Med email outreach: templates, personalization, and the daily plan.
 * Pure functions only. Gmail calls live in outreach-gmail.ts; persistence in supabase.ts;
 * the run loop in outreach-run.ts.
 *
 * The copy follows docs/call-scripts/dialtone-med/*-email.md, minus the after-call emails
 * and with the "[Day/Time A] or [Day/Time B]" asks rewritten, since a scheduled send cannot
 * offer real times. When the docs change, change these templates too.
 */

import { SOCIAL_TZ, localDateStr, zonedToUtc } from '$lib/social';

export const OUTREACH_TZ = SOCIAL_TZ;
export const OUTREACH_STEPS = [1, 2, 3] as const;
export type OutreachStep = (typeof OUTREACH_STEPS)[number];

/** Calendar days after the previous email before the next step is due (Day 1, Day 4, Day 9). */
export const STEP_GAP_DAYS: Record<2 | 3, number> = { 2: 3, 3: 5 };

/** Sends are spread across this local window on weekdays. */
export const SEND_WINDOW = { start: '09:00', end: '11:30' };

export type OutreachBusinessType = 'general_practice' | 'specialty_practice' | 'specialty_pharmacy';

export interface OutreachLead {
	lead_id: string;
	business_name: string;
	contact_name: string | null;
	email: string | null;
	business_type: string | null;
	clinical_specialty?: string | null;
}

export interface OutreachConfig {
	fromName: string;
	postalAddress: string;
}

export interface RenderedEmail {
	subject: string;
	body: string;
}

type TemplateContext = { first: string; practice: string; specialty: string };
type Template = { subject: (c: TemplateContext) => string; body: (c: TemplateContext) => string };

const CLOSE_THE_LOOP = (c: TemplateContext, topic: string) => `Hi ${c.first},

I don't want to keep filling your inbox. If ${topic} aren't a priority right now, just reply "not now" and I'll check back in a few months.

If they are, reply with a day and time that suits you, and I'll send a 15-minute invite.`;

export const TEMPLATES: Record<OutreachBusinessType, Record<OutreachStep, Template>> = {
	general_practice: {
		1: {
			subject: (c) => `phones at ${c.practice}`,
			body: (c) => `Hi ${c.first},

Most practices tell us the phones are hardest at the open and right after lunch. Calls roll to voicemail, and some of those patients book somewhere else.

DialTone.Med answers every call to ${c.practice}, checks who's calling, and texts the patient a secure link to finish the request: move an appointment, pay a balance, update their insurance. Refill requests go to your team in the patient's own words, and balances and medications are never said aloud.

Would a 15-minute demo be worth it? You'd hear it handle a patient call.`
		},
		2: {
			subject: (c) => `phones at ${c.practice}`,
			body: (c) => `Hi ${c.first},

One more thought. For a lot of practices the heaviest calls aren't scheduling. They're "has my prior authorization come through yet?"

Our agent answers those calls with the status only ("one approved, one in review"), never the drug or procedure, and texts the details. The status comes from AuthPulse, our prior-auth tracker, which is in early access. It puts every request on a deadline clock and flags late decisions and approvals about to expire.

Worth 15 minutes to see both?`
		},
		3: {
			subject: (c) => `phones at ${c.practice}`,
			body: (c) => CLOSE_THE_LOOP(c, 'phones and front-desk time')
		}
	},
	specialty_practice: {
		1: {
			subject: () => 'referrals that ring out',
			body: (c) => `Hi ${c.first},

For ${/^[aeiou]/i.test(c.specialty) ? 'an' : 'a'} ${c.specialty} practice, a missed call is often a referral: a patient who was sent to you and called the next office on the list instead.

DialTone.Med answers every call to ${c.practice}, checks who's calling, and texts a secure link to finish the request: book the consult, pay a balance, update insurance. Anything clinical goes to your staff in the patient's own words.

Would a 15-minute demo be worth it? You'd hear it handle a patient call.`
		},
		2: {
			subject: () => 'referrals that ring out',
			body: (c) => `Hi ${c.first},

One more thought. After a procedure is scheduled, the phones fill up with "has my authorization come through yet?"

Our agent answers those calls with the status only, never the procedure, and texts the details. The status comes from AuthPulse, our prior-auth tracker, which is in early access. Every request gets a deadline clock where a federal timeframe applies, and it flags late decisions, denials sent without a specific reason, and approvals about to expire.

How does ${c.practice} track authorization deadlines today?`
		},
		3: {
			subject: () => 'referrals that ring out',
			body: (c) => CLOSE_THE_LOOP(c, 'phones and prior auths')
		}
	},
	specialty_pharmacy: {
		1: {
			subject: () => `"where's my refill?" calls`,
			body: (c) => `Hi ${c.first},

Specialty pharmacies answer almost every call; URAC's latest report puts abandonment around 3%. The cost is who's answering: pharmacists and technicians spending hours on refills, authorization status, and "what do I owe."

DialTone.Med answers those calls for ${c.practice}, verifies the patient, and texts a secure link with the detail. Refill requests go to your team in the patient's own words, and drug names and balances are never said aloud.

Would a 15-minute demo be worth it?`
		},
		2: {
			subject: () => `"where's my refill?" calls`,
			body: (c) => `Hi ${c.first},

One more thought. How many prior authorizations does ${c.practice} have open right now, and how many are past their due date?

AuthPulse, our prior-auth tracker (in early access), keeps every request from every prescriber and plan in one list on a deadline clock. It flags late decisions, denials sent without a specific reason, and approvals about to expire. With our voice agent, patients who call to ask get the status, never the drug name, and a text when it changes.

Worth 15 minutes?`
		},
		3: {
			subject: () => `"where's my refill?" calls`,
			body: (c) => CLOSE_THE_LOOP(c, 'phone time and prior auths')
		}
	}
};

export function isOutreachBusinessType(value: unknown): value is OutreachBusinessType {
	return typeof value === 'string' && value in TEMPLATES;
}

const HONORIFICS = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.']);

/** First name for the greeting, or null when the contact name doesn't give one. */
export function firstName(contactName: string | null | undefined): string | null {
	const words = (contactName ?? '').trim().split(/\s+/).filter((word) => !HONORIFICS.has(word.toLowerCase()));
	const first = words[0]?.replace(/[^A-Za-z'-]/g, '');
	if (!first || first.length < 2) return null;
	return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

/** "Dentist, Oral and Maxillofacial Surgery" → "oral and maxillofacial surgery". */
export function specialtyPhrase(clinicalSpecialty: string | null | undefined): string {
	const parts = (clinicalSpecialty ?? '').split(',').map((part) => part.trim()).filter(Boolean);
	const phrase = (parts.length > 1 ? parts[parts.length - 1] : parts[0]) ?? '';
	return phrase ? phrase.toLowerCase() : 'specialty';
}

export function footer(config: OutreachConfig): string {
	return `--
${config.fromName}
DialTone.Med, by ByteStreams
${config.postalAddress}

If you'd rather not hear from me, reply "unsubscribe" and I won't email again.`;
}

/**
 * Renders one step for a lead. Follow-ups reuse the first subject with "re: " so they
 * thread under the first email in the recipient's inbox.
 */
export function renderEmail(lead: OutreachLead, step: OutreachStep, config: OutreachConfig): RenderedEmail {
	if (!isOutreachBusinessType(lead.business_type)) {
		throw new Error(`No outreach template for business type "${lead.business_type}".`);
	}
	const first = firstName(lead.contact_name);
	if (!first) throw new Error(`Lead "${lead.business_name}" has no usable contact first name.`);

	const context = { first, practice: lead.business_name, specialty: specialtyPhrase(lead.clinical_specialty) };
	const template = TEMPLATES[lead.business_type][step];
	const subject = template.subject(context);
	return {
		subject: step === 1 ? subject : `re: ${subject}`,
		body: `${template.body(context)}\n\n${footer(config)}`
	};
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why a lead cannot start a sequence, or null when it can. */
export function ineligibleReason(lead: OutreachLead & { product?: string; emailed?: boolean | null; status?: string }): string | null {
	if (lead.product !== 'dialtone_med') return 'not a DialTone.Med lead';
	if (!isOutreachBusinessType(lead.business_type)) return 'no business type with an email sequence';
	if (!lead.email || !EMAIL.test(lead.email.trim())) return 'no valid email';
	if (!firstName(lead.contact_name)) return 'no contact first name';
	if (lead.emailed) return 'already emailed';
	if (lead.status && !['new', 'researched', 'reviewed', 'prospect'].includes(lead.status)) return `status is ${lead.status}`;
	return null;
}

/** Local calendar date (YYYY-MM-DD) in the outreach time zone. */
export function localDate(now: Date): string {
	return localDateStr(now.getTime(), OUTREACH_TZ);
}

function weekday(date: string): number {
	return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function isWeekday(date: string): boolean {
	const day = weekday(date);
	return day !== 0 && day !== 6;
}

/** `days` calendar days after `date`, moved forward to Monday if that lands on a weekend. */
export function dueDate(date: string, days: number): string {
	const due = new Date(`${date}T12:00:00Z`);
	due.setUTCDate(due.getUTCDate() + days);
	while (due.getUTCDay() === 0 || due.getUTCDay() === 6) due.setUTCDate(due.getUTCDate() + 1);
	return due.toISOString().slice(0, 10);
}

/**
 * Send times for `count` messages approved at `now`: spread across what is left of today's
 * window, or a few minutes apart starting now when the window has passed. Never in the past.
 */
export function sendTimesFrom(date: string, count: number, now: Date): string[] {
	if (count <= 0) return [];
	const soonest = now.getTime() + 2 * 60_000;
	const windowStart = zonedToUtc(date, SEND_WINDOW.start, OUTREACH_TZ).getTime();
	const windowEnd = zonedToUtc(date, SEND_WINDOW.end, OUTREACH_TZ).getTime();
	const start = Math.max(windowStart, soonest);
	const end = Math.max(windowEnd, start + (count - 1) * 5 * 60_000);
	const step = count === 1 ? 0 : (end - start) / (count - 1);
	return Array.from({ length: count }, (_, index) => new Date(Math.round(start + step * index)).toISOString());
}

export interface ActiveSequence {
	lead_id: string;
	last_step: number;
	last_sent_date: string;
}

export interface PlannedMessage {
	lead_id: string;
	step: OutreachStep;
}

/**
 * Today's plan: follow-ups that are due come first (they finish what was started), then new
 * leads fill what is left of the daily limit. Leads already planned or sent today are skipped.
 */
export function planDay(input: {
	today: string;
	limit: number;
	active: ActiveSequence[];
	newLeadIds: string[];
	alreadyPlanned: number;
}): PlannedMessage[] {
	if (!isWeekday(input.today)) return [];
	let room = Math.max(0, input.limit - input.alreadyPlanned);
	const plan: PlannedMessage[] = [];

	const due = input.active
		.filter((sequence) => sequence.last_step === 1 || sequence.last_step === 2)
		.filter((sequence) => dueDate(sequence.last_sent_date, STEP_GAP_DAYS[(sequence.last_step + 1) as 2 | 3]) <= input.today)
		.sort((a, b) => a.last_sent_date.localeCompare(b.last_sent_date));
	for (const sequence of due) {
		if (room === 0) return plan;
		plan.push({ lead_id: sequence.lead_id, step: (sequence.last_step + 1) as OutreachStep });
		room -= 1;
	}
	for (const leadId of input.newLeadIds) {
		if (room === 0) break;
		plan.push({ lead_id: leadId, step: 1 });
		room -= 1;
	}
	return plan;
}

export type ThreadOutcome = 'none' | 'replied' | 'bounced';

const BOUNCE_SENDER = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;

/**
 * What the other side has done in a thread, from each message's From header.
 * `ownAddresses` are every address we send as; anything else is the prospect or a bounce.
 */
export function classifyThread(fromHeaders: string[], ownAddresses: string[]): ThreadOutcome {
	const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
	let outcome: ThreadOutcome = 'none';
	for (const from of fromHeaders) {
		const address = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
		if (own.has(address)) continue;
		if (BOUNCE_SENDER.test(from)) {
			if (outcome === 'none') outcome = 'bounced';
			continue;
		}
		return 'replied';
	}
	return outcome;
}
