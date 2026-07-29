import { describe, expect, it, vi } from 'vitest';
import { buildCallScriptPrompt, extractCallScriptContent, generateCallScript } from '$lib/server/call-script';
import type { Lead } from '$lib/types';

function lead(overrides: Partial<Lead> = {}): Lead {
	return {
		lead_id: 'lead-1',
		business_name: 'Sample Kitchen',
		phone: null,
		contact_phone: null,
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
		const prompt = buildCallScriptPrompt(lead(), 'Alex');

		expect(prompt).toContain('"business_name": "Sample Kitchen"');
		expect(prompt).toContain('"uses_pos": "Toast"');
		expect(prompt).toContain('"has_app": false');
		expect(prompt).not.toContain('"contact_name"');
		expect(prompt).not.toContain('"uses_kds"');
	});

	it('prohibits invented facts and unsupported savings claims', () => {
		const prompt = buildCallScriptPrompt(lead(), 'Alex');

		expect(prompt).toContain('Use only the CRM facts');
		expect(prompt).toContain('all text outside square-bracketed placeholders verbatim');
		expect(prompt).toContain('caller and contact placeholders have already been resolved');
		expect(prompt).toContain('Do not invent');
		expect(prompt).toContain('Do not promise exact savings');
		expect(prompt).toContain('Do not claim DialTone operates a delivery network');
	});

	it('requires the canonical content markers', () => {
		const prompt = buildCallScriptPrompt(lead(), 'Alex');

		expect(prompt).toContain('******START HERE******');
		expect(prompt).toContain('******STOP HERE******');
	});

	it('includes only the bounded canonical template', () => {
		const prompt = buildCallScriptPrompt(lead(), 'Alex');

		expect(prompt).toContain('## First 30 Seconds');
		expect(prompt).toContain('## Observation-Based Openers');
		expect(prompt).not.toContain('## Objective');
		expect(prompt).not.toContain('## Research and Business Metadata Requirements');
		expect(prompt).not.toContain('## Discovery Questions');
	});

	it('includes approved sourced research and prohibits absence-based claims', () => {
		const prompt = buildCallScriptPrompt(lead(), 'Alex', [{
			finding_id: 'finding-1',
			run_id: 'run-1',
			lead_id: 'lead-1',
			category: 'social_instagram',
			value: 'https://instagram.com/samplekitchen',
			source_url: 'https://sample.example/',
			retrieved_at: '2026-07-27T00:00:00Z',
			confidence: 0.95,
			review_status: 'approved',
			reviewed_by_email: 'reviewer@bytestreams.ai',
			reviewed_at: '2026-07-27T00:01:00Z'
		}]);

		expect(prompt).toContain('"category": "social_instagram"');
		expect(prompt).toContain('"source_url": "https://sample.example/"');
		expect(prompt).toContain('Do not treat the absence of a finding as evidence');
	});

	it('uses the configured caller and the business contact name when available', () => {
		const prompt = buildCallScriptPrompt(lead({ contact_name: 'Diana' }), 'Alex');

		expect(prompt).toContain('> Hi Diana, this is Alex with DialTone.Menu');
		expect(prompt).not.toContain('[contact_name]');
		expect(prompt).not.toContain('[Your Name]');
	});

	it('preserves the contact placeholder when the business contact is unknown', () => {
		const prompt = buildCallScriptPrompt(lead(), 'Alex');

		expect(prompt).toContain('> Hi [contact_name], this is Alex with DialTone.Menu');
	});

	it('rejects a missing caller name', () => {
		expect(() => buildCallScriptPrompt(lead(), '  ')).toThrow('CALLER_NAME is not configured');
	});
});

describe('extractCallScriptContent', () => {
	it('returns only content between the markers', () => {
		const response = `Planning notes
******START HERE******
## First 30 Seconds
Call-ready copy
******STOP HERE******
Internal guidance`;

		expect(extractCallScriptContent(response)).toBe(
			'## First 30 Seconds\nCall-ready copy'
		);
	});

	it('rejects an unmarked response', () => {
		expect(() => extractCallScriptContent('## First 30 Seconds\nCall-ready copy'))
			.toThrow('incomplete call script');
	});

	it('rejects a truncated response when the stop marker is missing', () => {
		const response = '******START HERE******\n## First 30 Seconds\nCall-ready copy';

		expect(() => extractCallScriptContent(response)).toThrow('incomplete call script');
	});
});

describe('generateCallScript', () => {
	it('requests enough output tokens and returns only bounded content', async () => {
		const ai = {
			run: vi.fn().mockResolvedValue({
				response: `Do not save this preamble
******START HERE******
## First 30 Seconds
Call-ready copy
******STOP HERE******
Do not save this footer`
			})
		};

		const script = await generateCallScript(ai as unknown as Ai, lead(), 'Alex');

		expect(script).toBe('## First 30 Seconds\nCall-ready copy');
		expect(ai.run).toHaveBeenCalledWith(
			'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
			expect.objectContaining({ max_tokens: 2400 })
		);
	});
});