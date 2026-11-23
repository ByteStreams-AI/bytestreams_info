import { describe, expect, it } from 'vitest';
import {
	businessTypeLabel,
	businessTypesFor,
	isProduct,
	isValidNpi,
	leadProduct,
	productLabel
} from '$lib/products';

describe('products', () => {
	it('treats a lead without a product as a DialTone.Menu lead', () => {
		expect(leadProduct({})).toBe('dialtone_menu');
		expect(leadProduct({ product: null })).toBe('dialtone_menu');
		expect(leadProduct({ product: 'dialtone_med' })).toBe('dialtone_med');
		expect(productLabel(undefined)).toBe('DialTone.Menu');
		expect(productLabel('dialtone_med')).toBe('DialTone.Med');
	});

	it('recognizes only known products', () => {
		expect(isProduct('dialtone_menu')).toBe(true);
		expect(isProduct('dialtone_med')).toBe(true);
		expect(isProduct('other')).toBe(false);
		expect(isProduct(null)).toBe(false);
	});

	it('keeps Menu and Med business types separate', () => {
		expect(businessTypesFor('dialtone_menu')).toContain('food_truck');
		expect(businessTypesFor('dialtone_menu')).not.toContain('specialty_pharmacy');
		expect(businessTypesFor('dialtone_med')).toEqual(['general_practice', 'specialty_practice', 'specialty_pharmacy']);
		expect(businessTypesFor('dialtone_med')).not.toContain('food_truck');
	});

	it('labels known and unknown business types', () => {
		expect(businessTypeLabel(null)).toBe('—');
		expect(businessTypeLabel('general_practice')).toBe('General Practice');
		expect(businessTypeLabel('specialty_practice')).toBe('Specialty Practice');
		expect(businessTypeLabel('ghost_kitchen')).toBe('Ghost Kitchen');
	});

	it('validates the NPI check digit', () => {
		expect(isValidNpi('1234567893')).toBe(true);
		expect(isValidNpi('1245319599')).toBe(true);
		expect(isValidNpi('1234567890')).toBe(false);
		expect(isValidNpi('123456789')).toBe(false);
		expect(isValidNpi('12345678a3')).toBe(false);
	});
});
