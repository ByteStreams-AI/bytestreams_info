import { describe, expect, it } from 'vitest';
import { formatPhone } from '$lib/phone';

describe('formatPhone', () => {
	it('formats US numbers for display', () => {
		expect(formatPhone('tel:+15745461900')).toBe('(574) 546-1900');
		expect(formatPhone('904-474-9766')).toBe('(904) 474-9766');
	});

	it('drops the tel: prefix from other numbers and leaves invalid input alone', () => {
		expect(formatPhone('tel:+442071234567')).toBe('+442071234567');
		expect(formatPhone('ext')).toBe('ext');
	});
});
