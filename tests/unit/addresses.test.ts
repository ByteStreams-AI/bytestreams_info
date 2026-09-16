import { describe, expect, it } from 'vitest';
import { formatAddressLine, legalAddressFor } from '$lib/server/addresses';

const restaurant = { line1: '11 10th Ave S', city: 'Nashville', state: 'TN', postalCode: '37203' };
const office = { line1: '500 Church St', city: 'Nashville', state: 'TN', postalCode: '37219' };

describe('legalAddressFor', () => {
	it('is the restaurant address when the business says they are the same', () => {
		expect(legalAddressFor({ businessAddressSame: true, business: office, restaurant })).toEqual(restaurant);
	});
	it('is the separately entered business address when they differ', () => {
		expect(legalAddressFor({ businessAddressSame: false, business: office, restaurant })).toEqual(office);
	});
	it('falls back to the restaurant when "different" was claimed but nothing was entered', () => {
		expect(legalAddressFor({ businessAddressSame: false, business: null, restaurant })).toEqual(restaurant);
	});
	it('is null when the chosen address is incomplete — never a half address to TCR', () => {
		expect(legalAddressFor({ businessAddressSame: false, business: { line1: 'x' }, restaurant: null })).toBeNull();
	});
});

describe('formatAddressLine', () => {
	it('joins what is present and is null for nothing', () => {
		expect(formatAddressLine(office)).toBe('500 Church St, Nashville, TN, 37219');
		expect(formatAddressLine({ city: 'Nashville' })).toBe('Nashville');
		expect(formatAddressLine(null)).toBeNull();
		expect(formatAddressLine({})).toBeNull();
	});
});
