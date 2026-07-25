import { describe, expect, it } from 'vitest';
import { buildCallScriptPrompt } from '$lib/server/call-script';
import type { Lead } from '$lib/types';

function lead(overrides: Partial<Lead> = {}): Lead {
	return {
		lead_id: 'lead-1',
		business_name: 'Sample Kitchen',
		phone: null,
		address: null,
		city: 'Austin',
		state: 'TX',
		status: 'researched',
		business_type: 'single_location',
		offers_delivery: true,
		offers_pickup: true,
		uses_doordash_mktg: true,
		uses_chownow: null,
		price_range: '$$',
		yelp_rating: 4.5,
		yelp_review_count: 120,
		contact_name: null,
		email: null,
		website_url: null,
		notes: null,
		num_locations: 1,
		michelin_rating: null,
		has_website: null,
		has_app: false,
		uses_pos: 'Toast',
		uses_kds: null,
		uses_sms: null,
		created_at: '2026-07-25T00:00:00Z',
		...overrides,
		call_script: overrides.call_script ?? null
	};
}

describe('buildCallScriptPrompt', () => {
	it('includes known CRM facts and omits unknown values', () => {
		const prompt = buildCallScriptPrompt(lead());

		expect(prompt).toContain('"business_name": "Sample Kitchen"');
		expect(prompt).toContain('"uses_pos": "Toast"');
		expect(prompt).toContain('"has_app": false');
		expect(prompt).not.toContain('"contact_name"');
		expect(prompt).not.toContain('"uses_kds"');
	});

	it('prohibits invented facts and unsupported savings claims', () => {
		const prompt = buildCallScriptPrompt(lead());

		expect(prompt).toContain('Use only the CRM facts');
		expect(prompt).toContain('Do not invent');
		expect(prompt).toContain('Do not promise exact savings');
		expect(prompt).toContain('Do not claim DialTone operates a delivery network');
	});
});