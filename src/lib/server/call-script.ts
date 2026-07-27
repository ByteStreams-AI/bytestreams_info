import type { Lead, LeadResearchFinding } from '$lib/types';
import callTemplate from '$lib/server/prompts/DialTone_Cold_Call_Template.md?raw';

const START_MARKER = '******START HERE******';
const STOP_MARKER = '******STOP HERE******';

function boundedCallTemplate(): string {
	const start = callTemplate.indexOf(START_MARKER);
	const stop = callTemplate.indexOf(STOP_MARKER, start + START_MARKER.length);
	if (start === -1 || stop === -1) {
		throw new Error('Canonical call template is missing its generation boundaries');
	}
	return callTemplate.slice(start + START_MARKER.length, stop).trim();
}

const GENERATION_RULES = `
Create a concise, call-ready script by personalizing only the bounded DialTone.Menu template supplied below.

Requirements:
- Preserve the bounded template's section order and heading structure.
- Include only sections represented in the bounded template. Do not reproduce instructions, research notes, findings lists, or content from outside the boundaries.
- Replace placeholders only when the supplied facts support the replacement; otherwise preserve the placeholder.
- Use approved findings to personalize the value statement and choose a relevant observation-based opener without listing the findings separately.
- Use only the CRM facts and approved sourced research supplied below. Never infer that an unknown field is false.
- Do not treat the absence of a finding as evidence that a restaurant lacks a product, service, or capability.
- Do not invent a decision-maker, current provider, pain point, savings amount, fee, contract, or operational problem.
- Do not claim DialTone operates a delivery network.
- Do not promise exact savings. Position the meeting as a personalized comparison.
- Use placeholders such as [Your Name], [Day/Time A], and [Day/Time B] where needed.
- Keep the spoken first-30-seconds portion under 90 words.
- Start the response with ${START_MARKER} and end it with ${STOP_MARKER}. Include each marker exactly once.
- Return plain text with clear section headings. Do not include analysis or explain your choices.
`.trim();

function known(value: unknown): boolean {
	return value !== null && value !== undefined && value !== '';
}

export function extractCallScriptContent(response: string): string {
	const trimmedResponse = response.trim();
	const start = trimmedResponse.indexOf(START_MARKER);
	const stop = trimmedResponse.indexOf(STOP_MARKER, start + START_MARKER.length);

	if (start === -1 || stop === -1) {
		throw new Error('Workers AI returned an incomplete call script without generation boundaries');
	}

	const script = trimmedResponse.slice(start + START_MARKER.length, stop).trim();
	if (!script) throw new Error('Workers AI returned an empty call script');
	return script;
}

export function buildCallScriptPrompt(lead: Lead, approvedFindings: LeadResearchFinding[] = []): string {
	const facts = Object.fromEntries(
		Object.entries({
			business_name: lead.business_name,
			contact_name: lead.contact_name,
			phone: lead.phone,
			city: lead.city,
			state: lead.state,
			business_type: lead.business_type,
			num_locations: lead.num_locations,
			website_url: lead.website_url,
			has_website: lead.has_website,
			has_app: lead.has_app,
			uses_pos: lead.uses_pos,
			uses_kds: lead.uses_kds,
			uses_sms: lead.uses_sms,
			uses_doordash_mktg: lead.uses_doordash_mktg,
			uses_chownow: lead.uses_chownow,
			offers_delivery: lead.offers_delivery,
			offers_pickup: lead.offers_pickup,
			price_range: lead.price_range,
			yelp_rating: lead.yelp_rating,
			yelp_review_count: lead.yelp_review_count,
			michelin_rating: lead.michelin_rating,
			notes: lead.notes
		}).filter(([, value]) => known(value))
	);

	const research = approvedFindings.map((finding) => ({
		category: finding.category,
		value: finding.value,
		source_url: finding.source_url,
		retrieved_at: finding.retrieved_at
	}));

	return `${GENERATION_RULES}\n\nBounded canonical call template:\n${START_MARKER}\n${boundedCallTemplate()}\n${STOP_MARKER}\n\nCRM facts:\n${JSON.stringify(facts, null, 2)}\n\nApproved sourced research:\n${JSON.stringify(research, null, 2)}`;
}

export async function generateCallScript(
	ai: Ai,
	lead: Lead,
	approvedFindings: LeadResearchFinding[] = []
): Promise<string> {
	const result = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
		prompt: buildCallScriptPrompt(lead, approvedFindings),
		max_tokens: 2400,
		temperature: 0.2,
		repetition_penalty: 1.05
	});

	if (typeof result === 'object' && result !== null && 'response' in result) {
		const script = extractCallScriptContent(result.response);
		if (script) return script;
	}

	throw new Error('Workers AI returned no call script');
}