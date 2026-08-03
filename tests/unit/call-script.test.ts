import { describe, expect, it, vi } from 'vitest';
import { buildCallScriptPrompt, extractCallScriptContent, generateCallScript } from '$lib/server/call-script';
import callTemplate from '$lib/server/prompts/DialTone_Cold_Call_Template.md?raw';
import type { Lead } from '$lib/types';

function boundedTemplate(prompt: string): string {
	return prompt.slice(
		prompt.indexOf('Bounded canonical call template:'),
		prompt.indexOf('CRM facts:')
	);
}

function canonicalStatement(priority: number, businessName = 'Sample Kitchen'): string {
	const statement = callTemplate.match(
		new RegExp(`^### Priority ${priority}:[^\\n]*\\n\\s*\\n>\\s*(.+)$`, 'm')
	)?.[1];
	if (!statement) throw new Error(`Missing canonical priority ${priority} statement`);
	return statement.replaceAll('[restaurant name]', businessName);
}

function canonicalSectionStatement(heading: string): string {
	const statement = callTemplate.match(
		new RegExp(`^### ${heading}\\s*$\\n\\s*>\\s*(.+)$`, 'm')
	)?.[1];
	if (!statement) throw new Error(`Missing canonical ${heading} statement`);
	return statement;
}

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
		marketplace_providers: null,
		first_party_ordering: null,
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
		expect(prompt).toContain('caller and greeting placeholders have already been resolved');
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
		expect(prompt).toContain('Ranked value-statement guidance (do not include in the response)');
		expect(prompt).toContain('## Ranked Value Statement Selection');
		expect(prompt).not.toContain('## Research and Business Metadata Requirements');
		expect(prompt).not.toContain('## Discovery Questions');
	});

	it('matches note triggers case-insensitively', () => {
		const prompt = buildCallScriptPrompt(lead({ notes: 'Advertising through uberEats' }), 'Alex');
		const generatedTemplate = boundedTemplate(prompt);

		expect(generatedTemplate).toContain(`> ${canonicalStatement(2)}`);
		expect(generatedTemplate).not.toContain('[Selected ranked value statement]');
	});

	it('uses the lowest priority number when several note triggers match', () => {
		const prompt = buildCallScriptPrompt(lead({ notes: 'Uses Square and DOORDASH' }), 'Alex');
		const generatedTemplate = boundedTemplate(prompt);

		expect(generatedTemplate).toContain(`> ${canonicalStatement(1)}`);
		expect(generatedTemplate).not.toContain(`> ${canonicalStatement(6)}`);
	});

	it('selects the Square value statement from a mixed-case note', () => {
		const prompt = buildCallScriptPrompt(lead({ notes: 'Current POS: sqUAre' }), 'Alex');
		const generatedTemplate = boundedTemplate(prompt);

		expect(generatedTemplate).toContain(`> ${canonicalStatement(6)}`);
		expect(generatedTemplate).not.toContain('[Selected ranked value statement]');
		expect(generatedTemplate).not.toContain('[restaurant name]');
	});

	it('uses the known business segment when no approved priority finding is available', () => {
		const prompt = buildCallScriptPrompt(lead({ business_type: 'single_location' }), 'Alex');
		const generatedTemplate = boundedTemplate(prompt);

		expect(generatedTemplate).toContain(`> ${canonicalSectionStatement('Single-Location Restaurant')}`);
		expect(generatedTemplate).not.toContain('[Selected ranked value statement]');
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

	it('uses a generic greeting when the business contact is unknown', () => {
		const prompt = buildCallScriptPrompt(lead(), 'Alex');

		expect(prompt).toContain('> Hi, this is Alex with DialTone.Menu');
		expect(prompt).not.toContain('[contact_name]');
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

	it('rejects an unresolved value statement', () => {
		const response = `******START HERE******
## First 30 Seconds
> [Selected ranked value statement]
******STOP HERE******`;

		expect(() => extractCallScriptContent(response)).toThrow('unresolved value statement');
	});
});

describe('generateCallScript', () => {
	it('requests enough output tokens and restores the canonical value statement', async () => {
		const ai = {
			run: vi.fn().mockResolvedValue({
				response: `Do not save this preamble
******START HERE******
## First 30 Seconds

### 1. Deliver the Value Statement

> I noticed you use Toast for your POS and online ordering. Lets have a conference call sometime next week so that we can walk you through how DialTone.Menu can help you connect your in-store orders, direct online orders, kitchen flow, and customer loyalty.

Stop and let the prospect respond.

## Observation-Based Openers
******STOP HERE******
Do not save this footer`
			})
		};

		const script = await generateCallScript(
			ai as unknown as Ai,
			lead({ notes: 'Vietnamese kitchen\n\nToast\nResi' }),
			'Alex'
		);

		expect(script).toContain(`> ${canonicalStatement(5)}`);
		expect(script).not.toContain('I noticed you use Toast for your POS and online ordering');
		expect(script).not.toContain('[restaurant name]');
		expect(ai.run).toHaveBeenCalledWith(
			'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
			expect.objectContaining({ max_tokens: 2400 })
		);
	});
});