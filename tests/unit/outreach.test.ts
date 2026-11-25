import { describe, expect, it } from 'vitest';
import {
	TEMPLATES,
	classifyThread,
	dueDate,
	firstName,
	footer,
	ineligibleReason,
	isSendingDay,
	isWeekday,
	nextSendingDay,
	outreachHolidays,
	localDate,
	planDay,
	renderEmail,
	sendTimesFrom,
	specialtyPhrase
} from '$lib/server/outreach';

const config = { fromName: 'Steve Cotton', postalAddress: '100 Main St, Jacksonville, FL 32202' };

const lead = {
	lead_id: 'lead-1',
	business_name: 'B-Leeve Primary Care',
	contact_name: 'Quawendella Skinner',
	email: 'owner@bleeve.example',
	business_type: 'general_practice',
	clinical_specialty: 'Nurse Practitioner, Family',
	product: 'dialtone_med',
	status: 'new',
	emailed: false
};

describe('personalization', () => {
	it('takes a usable first name', () => {
		expect(firstName('Quawendella Skinner')).toBe('Quawendella');
		expect(firstName('DR. JASON LEE')).toBe('Jason');
		expect(firstName('R. Vishen')).toBeNull();
		expect(firstName(null)).toBeNull();
	});

	it('turns a registry specialty into a phrase', () => {
		expect(specialtyPhrase('Dentist, Oral and Maxillofacial Surgery')).toBe('oral and maxillofacial surgery');
		expect(specialtyPhrase('Dermatology')).toBe('dermatology');
		expect(specialtyPhrase(null)).toBe('specialty');
	});
});

describe('renderEmail', () => {
	it('renders the first email with the footer the law requires', () => {
		const email = renderEmail(lead, 1, config);
		expect(email.subject).toBe('phones at B-Leeve Primary Care');
		expect(email.body).toMatch(/^Hi Quawendella,/);
		expect(email.body).toContain('DialTone.Med answers every call to B-Leeve Primary Care');
		expect(email.body.endsWith(footer(config))).toBe(true);
		expect(footer(config)).toContain('100 Main St, Jacksonville, FL 32202');
		expect(footer(config)).toContain('unsubscribe');
	});

	it('threads follow-ups under the first subject', () => {
		expect(renderEmail(lead, 2, config).subject).toBe('re: phones at B-Leeve Primary Care');
		expect(renderEmail(lead, 3, config).body).toContain('reply "not now"');
	});

	it('uses the specialty for specialty practices', () => {
		const email = renderEmail(
			{ ...lead, business_type: 'specialty_practice', clinical_specialty: 'Dentist, Oral and Maxillofacial Surgery' },
			1,
			config
		);
		expect(email.body).toContain('For an oral and maxillofacial surgery practice');
		const derm = renderEmail({ ...lead, business_type: 'specialty_practice', clinical_specialty: 'Dermatology' }, 1, config);
		expect(derm.body).toContain('For a dermatology practice');
	});

	it('never quotes a price or a placeholder in any template', () => {
		for (const type of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
			for (const step of [1, 2, 3] as const) {
				const { subject, body } = renderEmail({ ...lead, business_type: type }, step, config);
				expect(`${subject}\n${body}`).not.toMatch(/\$|\[|\]|per month|pricing/i);
			}
		}
	});

	it('refuses a lead it cannot personalize', () => {
		expect(() => renderEmail({ ...lead, business_type: 'food_truck' }, 1, config)).toThrow(/No outreach template/);
		expect(() => renderEmail({ ...lead, contact_name: null }, 1, config)).toThrow(/first name/);
	});
});

describe('ineligibleReason', () => {
	it('accepts a fresh Med lead and explains every refusal', () => {
		expect(ineligibleReason(lead)).toBeNull();
		expect(ineligibleReason({ ...lead, product: 'dialtone_menu' })).toMatch(/DialTone.Med/);
		expect(ineligibleReason({ ...lead, business_type: null })).toMatch(/business type/);
		expect(ineligibleReason({ ...lead, email: 'not-an-email' })).toMatch(/email/);
		expect(ineligibleReason({ ...lead, contact_name: 'R. V' })).toMatch(/first name/);
		expect(ineligibleReason({ ...lead, emailed: true })).toMatch(/already emailed/);
		expect(ineligibleReason({ ...lead, status: 'demo_scheduled' })).toMatch(/demo_scheduled/);
	});
});

describe('dates', () => {
	it('reads the local Central date', () => {
		expect(localDate(new Date('2026-11-24T05:00:00Z'))).toBe('2026-11-23');
		expect(localDate(new Date('2026-11-24T07:00:00Z'))).toBe('2026-11-24');
	});

	it('knows weekdays and moves due dates off weekends', () => {
		expect(isWeekday('2026-11-24')).toBe(true);
		expect(isWeekday('2026-11-28')).toBe(false);
		expect(dueDate('2026-11-17', 3)).toBe('2026-11-20'); // Tue + 3 = Fri
		expect(dueDate('2026-11-24', 3)).toBe('2026-11-30'); // the day after Thanksgiving → Mon
		expect(dueDate('2026-11-26', 3)).toBe('2026-11-30'); // Thu + 3 = Sun → Mon
		expect(dueDate('2026-11-23', 3)).toBe('2026-11-30'); // Thanksgiving, the day after, the weekend
	});

	it('knows the holidays, as observed', () => {
		expect(outreachHolidays(2026)).toEqual([
			'2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03',
			'2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25'
		]);
		expect(outreachHolidays(2027)).toContain('2027-12-24'); // Christmas on a Saturday, observed Friday
		expect(outreachHolidays(2028)[0]).toBe('2027-12-31'); // New Year's Day on a Saturday
		expect(isSendingDay('2027-12-31')).toBe(false);
		expect(outreachHolidays(2027)[0]).toBe('2027-01-01');
		expect(outreachHolidays(2028)).toContain('2028-12-25');
		expect(outreachHolidays(2022)).toContain('2022-12-26'); // Christmas on a Sunday, observed Monday
	});

	it('skips weekends and holidays when sending', () => {
		expect(isSendingDay('2026-11-25')).toBe(true);
		expect(isSendingDay('2026-11-26')).toBe(false);
		expect(isSendingDay('2026-11-28')).toBe(false);
		expect(nextSendingDay('2026-11-26')).toBe('2026-11-30');
		expect(nextSendingDay('2026-11-25')).toBe('2026-11-25');
	});

	it('spreads send times over the window and never schedules the past', () => {
		const early = sendTimesFrom('2026-11-24', 3, new Date('2026-11-24T13:00:00Z')); // 07:00 CST
		expect(early).toEqual(['2026-11-24T15:00:00.000Z', '2026-11-24T16:15:00.000Z', '2026-11-24T17:30:00.000Z']);

		const late = sendTimesFrom('2026-11-24', 2, new Date('2026-11-24T20:00:00Z')); // after the window
		expect(late).toEqual(['2026-11-24T20:02:00.000Z', '2026-11-24T20:07:00.000Z']);
		expect(sendTimesFrom('2026-11-24', 0, new Date())).toEqual([]);
		expect(sendTimesFrom('2026-11-24', 1, new Date('2026-11-24T13:00:00Z'))).toEqual(['2026-11-24T15:00:00.000Z']);
	});
});

describe('planDay', () => {
	const active = [
		{ lead_id: 'due-step-2', last_step: 1, last_sent_date: '2026-11-20' },
		{ lead_id: 'not-due', last_step: 1, last_sent_date: '2026-11-23' },
		{ lead_id: 'due-step-3', last_step: 2, last_sent_date: '2026-11-18' },
		{ lead_id: 'finished', last_step: 3, last_sent_date: '2026-11-10' }
	];

	it('puts due follow-ups first, then fills with new leads up to the limit', () => {
		expect(planDay({ today: '2026-11-24', limit: 3, alreadyPlanned: 0, active, newLeadIds: ['new-1', 'new-2'] })).toEqual([
			{ lead_id: 'due-step-3', step: 3 },
			{ lead_id: 'due-step-2', step: 2 },
			{ lead_id: 'new-1', step: 1 }
		]);
	});

	it('stops at the limit even inside the follow-ups, and plans nothing on weekends', () => {
		expect(planDay({ today: '2026-11-24', limit: 1, alreadyPlanned: 0, active, newLeadIds: ['new-1'] })).toHaveLength(1);
		expect(planDay({ today: '2026-11-24', limit: 3, alreadyPlanned: 3, active, newLeadIds: ['new-1'] })).toEqual([]);
		expect(planDay({ today: '2026-11-28', limit: 25, alreadyPlanned: 0, active, newLeadIds: ['new-1'] })).toEqual([]);
		expect(planDay({ today: '2026-11-26', limit: 25, alreadyPlanned: 0, active, newLeadIds: ['new-1'] })).toEqual([]);
	});
});

describe('classifyThread', () => {
	const own = ['steve@bytestreams.ai', 'hello@bytestreams.ai'];

	it('sees our own messages as no response', () => {
		expect(classifyThread(['Steve Cotton <hello@bytestreams.ai>', 'steve@bytestreams.ai'], own)).toBe('none');
	});

	it('sees any other sender as a reply, even after a bounce notice', () => {
		expect(classifyThread(['Steve <hello@bytestreams.ai>', 'Jason Lee <jason@clinic.example>'], own)).toBe('replied');
		expect(classifyThread(['Mail Delivery Subsystem <mailer-daemon@googlemail.com>', 'jason@clinic.example'], own)).toBe('replied');
	});

	it('sees a delivery failure as a bounce', () => {
		expect(classifyThread(['hello@bytestreams.ai', 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>'], own)).toBe('bounced');
		expect(classifyThread(['postmaster@clinic.example'], own)).toBe('bounced');
	});
});
