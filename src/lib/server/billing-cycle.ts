/**
 * Recurring DialTone.Menu charges fall on the same day of the month as the day the
 * customer's setup fee cleared (`businesses.billing_cycle_start`), starting the
 * following calendar month. Months too short for the anchor day clamp to the last
 * day of that month and the cycle then returns to the anchor day, so a 31st anchor
 * bills Feb 28, Mar 31, Apr 30, May 31 — never drifting backwards the way repeated
 * 30-day addition does.
 *
 * All arithmetic is UTC and date-only ('YYYY-MM-DD'); billing dates are calendar
 * facts, not instants, and must not shift with the server's timezone.
 *
 * Mirrored in bytestreams_ai/worker.js (`isRecurringBillingDay`). Change both.
 */

type YMD = { year: number; month: number; day: number };

function parse(date: string): YMD {
	const [year, month, day] = date.slice(0, 10).split('-').map(Number);
	if (!year || !month || !day) throw new Error(`Invalid date: ${date}`);
	return { year, month: month - 1, day };
}

function format({ year, month, day }: YMD): string {
	return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Last day of the given month — day 0 of the next month, in UTC. */
export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The anchor day as it lands in a given month, clamped to that month's length. */
export function billingDayIn(anchorDay: number, year: number, month: number): number {
	return Math.min(anchorDay, daysInMonth(year, month));
}

/**
 * Is `today` a recurring charge date for a cycle anchored at `anchor`?
 * False during the anchor's own month — that month's money is the setup fee.
 */
export function isRecurringBillingDay(anchor: string, today: string): boolean {
	const a = parse(anchor);
	const t = parse(today);
	const monthsElapsed = (t.year - a.year) * 12 + (t.month - a.month);
	if (monthsElapsed < 1) return false;
	return t.day === billingDayIn(a.day, t.year, t.month);
}

/** The first recurring charge date strictly after `from` for a cycle anchored at `anchor`. */
export function nextRecurringBillingDate(anchor: string, from: string): string {
	const a = parse(anchor);
	const f = parse(from);
	// Never earlier than the month after the anchor.
	let year = f.year;
	let month = f.month;
	if ((year - a.year) * 12 + (month - a.month) < 1) {
		year = a.year;
		month = a.month + 1;
		if (month > 11) { year += 1; month -= 12; }
		return format({ year, month, day: billingDayIn(a.day, year, month) });
	}
	const dayThisMonth = billingDayIn(a.day, year, month);
	if (dayThisMonth > f.day) return format({ year, month, day: dayThisMonth });
	month += 1;
	if (month > 11) { year += 1; month -= 12; }
	return format({ year, month, day: billingDayIn(a.day, year, month) });
}

/**
 * Bills are generated ahead of their due date so the reminder cron has something to
 * notify on: the charge still falls on the customer's anchor day, they just hear
 * about it `windowDays` earlier. Scanning a window rather than testing today alone
 * makes generation idempotent and self-healing — a cron run that is missed, or an
 * admin pressing Generate by hand, still produces the same row via upsert.
 *
 * Returns the due date of the next charge falling within the window, or null.
 */
export function upcomingBillingDate(anchor: string, today: string, windowDays: number): string | null {
	const t = parse(today);
	for (let offset = 0; offset <= windowDays; offset++) {
		const candidate = new Date(Date.UTC(t.year, t.month, t.day + offset));
		const iso = candidate.toISOString().slice(0, 10);
		if (isRecurringBillingDay(anchor, iso)) return iso;
	}
	return null;
}

/** First day of the calendar month a bill belongs to — the period label on the row. */
export function billingMonthFor(dueDate: string): string {
	return `${dueDate.slice(0, 7)}-01`;
}
