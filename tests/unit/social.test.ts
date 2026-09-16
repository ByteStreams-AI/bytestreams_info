import { describe, expect, it } from 'vitest';
import {
	captionFirstLine,
	formatLocal,
	isoToLocalInput,
	localInputToIso,
	parseHashtags,
	quickCheck,
	tzOffsetMs,
	upcomingOpenSlots,
	zonedToUtc,
	STATUS_COLOR,
	FORMAT_ICON
} from '$lib/social';

describe('social time helpers (America/Chicago, DST-aware)', () => {
	it('converts Central wall-clock to UTC on both sides of the DST change', () => {
		// CDT (UTC-5) in September, CST (UTC-6) in December
		expect(zonedToUtc('2026-09-23', '11:00').toISOString()).toBe('2026-09-23T16:00:00.000Z');
		expect(zonedToUtc('2026-12-02', '11:00').toISOString()).toBe('2026-12-02T17:00:00.000Z');
	});

	it('round-trips a datetime-local value', () => {
		const iso = localInputToIso('2026-09-23T11:00');
		expect(iso).toBe('2026-09-23T16:00:00.000Z');
		expect(isoToLocalInput(iso!)).toBe('2026-09-23T11:00');
		expect(localInputToIso('garbage')).toBeNull();
		expect(localInputToIso('')).toBeNull();
	});

	it('formats in Central for chips', () => {
		expect(formatLocal('2026-09-23T16:00:00.000Z')).toMatch(/Wed, Sep 23, 11:00 AM/);
		expect(tzOffsetMs(Date.UTC(2026, 8, 23))).toBe(-5 * 3600 * 1000);
	});
});

describe('upcomingOpenSlots', () => {
	const slots = [
		{ weekday: 1, time_local: '11:00:00', format: 'image' as const, pillar: 'P1' },
		{ weekday: 2, time_local: '16:00:00', format: 'reel' as const, pillar: null },
		{ weekday: 3, time_local: '11:00:00', format: 'story' as const, pillar: 'P1' },
		{ weekday: 6, time_local: '10:00:00', format: 'carousel' as const, pillar: null, is_active: false }
	];
	const from = new Date('2026-09-21T00:00:00Z'); // Sunday evening Central

	it('lists story/post slots only, skips reel and inactive slots and occupied instants', () => {
		const open = upcomingOpenSlots(slots, ['2026-09-23T16:00:00.000Z'], { from, days: 10 });
		const labels = open.map((s) => `${s.format}@${s.iso}`);
		expect(labels).toContain('image@2026-09-21T16:00:00.000Z');
		expect(labels).not.toContain('story@2026-09-23T16:00:00.000Z'); // occupied
		expect(labels).toContain('image@2026-09-28T16:00:00.000Z');
		expect(labels).toContain('story@2026-09-30T16:00:00.000Z'); // next week's story slot is free
		expect(open.every((s) => (s.format as string) !== 'reel')).toBe(true);
		expect(open.every((s) => (s.format as string) !== 'carousel')).toBe(true);
	});

	it('is sorted and respects the lead time', () => {
		const open = upcomingOpenSlots(slots, [], { from: new Date('2026-09-21T15:00:00Z'), days: 7, minLeadMinutes: 180 });
		expect(open[0].iso).not.toBe('2026-09-21T16:00:00.000Z'); // only an hour away
		expect([...open.map((s) => s.iso)].sort()).toEqual(open.map((s) => s.iso));
	});
});

describe('caption and hashtag helpers', () => {
	it('parses hashtag text and prefixes missing #', () => {
		expect(parseHashtags('#DialTone RestaurantOwners  #FrontOfHouse\n')).toEqual(['#DialTone', '#RestaurantOwners', '#FrontOfHouse']);
	});

	it('quickCheck flags the cheap rule breaks and passes a clean post', () => {
		expect(quickCheck('Friday at 7pm the phone rings out. Book a 15-minute call — link in bio.', ['#DialTone', '#RestaurantOwners', '#FrontOfHouse'])).toEqual([]);
		const problems = quickCheck('Start your free trial', ['#DialTone']);
		expect(problems.some((p) => p.includes('free trial'))).toBe(true);
		expect(problems.some((p) => p.includes('#restaurantowners'))).toBe(true);
		expect(problems.some((p) => p.includes('1 hashtags'))).toBe(true);
		expect(quickCheck('', ['#DialTone', '#RestaurantOwners', '#a'])).toContain('Caption is empty.');
		expect(quickCheck('x'.repeat(2201), ['#DialTone', '#RestaurantOwners', '#a'])[0]).toMatch(/2,200/);
	});

	it('captionFirstLine skips blank leading lines', () => {
		expect(captionFirstLine('\n\n  Hook line\nbody')).toBe('Hook line');
		expect(captionFirstLine('')).toBe('');
	});

	it('every status has a colour and every format an icon', () => {
		for (const s of ['draft', 'scheduled', 'publishing', 'published', 'failed', 'blocked', 'rejected', 'expired'] as const) expect(STATUS_COLOR[s]).toBeTruthy();
		for (const f of ['reel', 'image', 'carousel', 'story'] as const) expect(FORMAT_ICON[f]).toBeTruthy();
	});
});
