import { describe, it, expect } from 'vitest';
import {
	daysInMonth,
	billingDayIn,
	isRecurringBillingDay,
	nextRecurringBillingDate,
	upcomingBillingDate,
	billingMonthFor
} from '$lib/server/billing-cycle';

describe('daysInMonth', () => {
	it('handles month lengths including leap February', () => {
		expect(daysInMonth(2026, 0)).toBe(31);
		expect(daysInMonth(2026, 1)).toBe(28);
		expect(daysInMonth(2028, 1)).toBe(29);
		expect(daysInMonth(2026, 3)).toBe(30);
	});
});

describe('billingDayIn', () => {
	it('clamps an anchor day to the length of the target month', () => {
		expect(billingDayIn(31, 2026, 1)).toBe(28);
		expect(billingDayIn(31, 2028, 1)).toBe(29);
		expect(billingDayIn(31, 2026, 3)).toBe(30);
		expect(billingDayIn(31, 2026, 4)).toBe(31);
		expect(billingDayIn(14, 2026, 1)).toBe(14);
	});
});

describe('isRecurringBillingDay', () => {
	it('does not bill during the anchor month', () => {
		expect(isRecurringBillingDay('2026-06-14', '2026-06-14')).toBe(false);
		expect(isRecurringBillingDay('2026-06-14', '2026-06-30')).toBe(false);
	});

	it('bills the same day of each following month', () => {
		expect(isRecurringBillingDay('2026-06-14', '2026-07-14')).toBe(true);
		expect(isRecurringBillingDay('2026-06-14', '2026-08-14')).toBe(true);
		expect(isRecurringBillingDay('2026-06-14', '2027-06-14')).toBe(true);
	});

	it('ignores every other day of the month', () => {
		expect(isRecurringBillingDay('2026-06-14', '2026-07-13')).toBe(false);
		expect(isRecurringBillingDay('2026-06-14', '2026-07-15')).toBe(false);
	});

	it('clamps a 31st anchor to the last day of short months', () => {
		expect(isRecurringBillingDay('2026-01-31', '2026-02-28')).toBe(true);
		expect(isRecurringBillingDay('2026-01-31', '2026-03-31')).toBe(true);
		expect(isRecurringBillingDay('2026-01-31', '2026-04-30')).toBe(true);
		// ...and does not also fire on the 30th of a 31-day month
		expect(isRecurringBillingDay('2026-01-31', '2026-03-30')).toBe(false);
	});

	it('uses Feb 29 in a leap year and Feb 28 otherwise', () => {
		expect(isRecurringBillingDay('2028-01-31', '2028-02-29')).toBe(true);
		expect(isRecurringBillingDay('2028-01-31', '2028-02-28')).toBe(false);
		expect(isRecurringBillingDay('2026-01-30', '2026-02-28')).toBe(true);
	});

	it('does not drift the way repeated 30-day addition does', () => {
		// A +30d cycle from Jun 1 lands Jul 1, Jul 31, Aug 30. Calendar months hold.
		expect(isRecurringBillingDay('2026-06-01', '2026-07-01')).toBe(true);
		expect(isRecurringBillingDay('2026-06-01', '2026-08-01')).toBe(true);
		expect(isRecurringBillingDay('2026-06-01', '2026-07-31')).toBe(false);
	});
});

describe('nextRecurringBillingDate', () => {
	it('returns the following month when asked during the anchor month', () => {
		expect(nextRecurringBillingDate('2026-06-14', '2026-06-14')).toBe('2026-07-14');
		expect(nextRecurringBillingDate('2026-06-14', '2026-06-30')).toBe('2026-07-14');
	});

	it('advances past a billing date already reached', () => {
		expect(nextRecurringBillingDate('2026-06-14', '2026-07-14')).toBe('2026-08-14');
		expect(nextRecurringBillingDate('2026-06-14', '2026-07-13')).toBe('2026-07-14');
	});

	it('rolls across a year boundary', () => {
		expect(nextRecurringBillingDate('2026-12-14', '2026-12-20')).toBe('2027-01-14');
		expect(nextRecurringBillingDate('2026-11-30', '2027-01-30')).toBe('2027-02-28');
	});

	it('clamps into short months', () => {
		expect(nextRecurringBillingDate('2026-01-31', '2026-02-01')).toBe('2026-02-28');
		expect(nextRecurringBillingDate('2026-01-31', '2026-03-01')).toBe('2026-03-31');
	});
});

describe('upcomingBillingDate', () => {
	const WINDOW = 5;

	it('finds a charge falling inside the lead window', () => {
		expect(upcomingBillingDate('2026-06-14', '2026-07-09', WINDOW)).toBe('2026-07-14');
		expect(upcomingBillingDate('2026-06-14', '2026-07-14', WINDOW)).toBe('2026-07-14');
	});

	it('returns null outside the window', () => {
		expect(upcomingBillingDate('2026-06-14', '2026-07-08', WINDOW)).toBeNull();
		expect(upcomingBillingDate('2026-06-14', '2026-07-15', WINDOW)).toBeNull();
	});

	it('never bills inside the anchor month', () => {
		expect(upcomingBillingDate('2026-06-14', '2026-06-10', WINDOW)).toBeNull();
	});

	it('sees across a month boundary', () => {
		expect(upcomingBillingDate('2026-06-02', '2026-07-30', WINDOW)).toBe('2026-08-02');
	});

	it('finds a clamped date across a year boundary', () => {
		expect(upcomingBillingDate('2026-12-31', '2027-01-28', WINDOW)).toBe('2027-01-31');
		expect(upcomingBillingDate('2027-01-31', '2027-02-25', WINDOW)).toBe('2027-02-28');
	});
});

describe('billingMonthFor', () => {
	it('labels a bill with the first of its due month', () => {
		expect(billingMonthFor('2026-07-14')).toBe('2026-07-01');
		expect(billingMonthFor('2026-08-02')).toBe('2026-08-01');
	});
});
