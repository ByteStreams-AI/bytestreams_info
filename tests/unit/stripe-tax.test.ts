import { describe, expect, it, vi } from 'vitest';
import { assessStripeTax } from '$lib/server/stripe-tax';

const address = {
	line1: '920 5th Ave',
	city: 'Seattle',
	state: 'WA',
	postalCode: '98104',
	country: 'US'
};

describe('assessStripeTax', () => {
	it('assesses exclusive tax using the verified billing address', async () => {
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = init?.body as URLSearchParams;
			expect(body.get('line_items[0][amount]')).toBe('10000');
			expect(body.get('line_items[0][tax_behavior]')).toBe('exclusive');
			expect(body.get('line_items[0][tax_code]')).toBe('txcd_10103001');
			expect(body.get('customer_details[address][postal_code]')).toBe('98104');
			expect(body.get('customer_details[address_source]')).toBe('billing');
			return new Response(JSON.stringify({
				id: 'taxcalc_setup',
				amount_total: 11025,
				tax_amount_exclusive: 1025,
				tax_breakdown: [{ taxability_reason: 'standard_rated' }]
			}), { status: 200 });
		});

		await expect(assessStripeTax({
			secretKey: 'sk_test_example',
			amountCents: 10000,
			address,
			reference: 'setup-business-1',
			taxCode: 'txcd_10103001',
			fetcher
		})).resolves.toEqual({
			calculationId: 'taxcalc_setup',
			subtotalCents: 10000,
			taxCents: 1025,
			totalCents: 11025,
			taxBreakdown: [{ taxability_reason: 'standard_rated' }]
		});
	});

	it('surfaces Stripe errors without exposing the secret key', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({
			error: { message: 'Tax calculation requires a recognized location' }
		}), { status: 400 }));

		await expect(assessStripeTax({
			secretKey: 'sk_test_example',
			amountCents: 10000,
			address,
			reference: 'setup-business-1',
			taxCode: 'txcd_10103001',
			fetcher
		})).rejects.toThrow('Tax calculation requires a recognized location');
	});
});