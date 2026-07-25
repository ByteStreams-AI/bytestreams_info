import type { Lead } from '$lib/types';
import callTemplate from '$lib/server/prompts/DialTone_Cold_Call_Template.md?raw';

const GENERATION_RULES = `
Use the canonical DialTone.Menu template below to create a concise, call-ready script personalized to the supplied CRM facts.

Requirements:
- Include a gatekeeper opener, permission opener, personalized value statement, exactly three discovery questions, relevant provider pivot, meeting close, voicemail, and follow-up email.
- Use only the CRM facts supplied below. Never infer that an unknown field is false.
- Do not invent a decision-maker, current provider, pain point, savings amount, fee, contract, or operational problem.
- Do not claim DialTone operates a delivery network.
- Do not promise exact savings. Position the meeting as a personalized comparison.
- Use placeholders such as [Your Name], [Day/Time A], and [Day/Time B] where needed.
- Keep the spoken first-30-seconds portion under 90 words.
- Return plain text with clear section headings. Do not include analysis or explain your choices.
`.trim();

function known(value: unknown): boolean {
	return value !== null && value !== undefined && value !== '';
}

export function buildCallScriptPrompt(lead: Lead): string {
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

	return `${GENERATION_RULES}\n\nCanonical call template:\n${callTemplate.trim()}\n\nCRM facts:\n${JSON.stringify(facts, null, 2)}`;
}

export async function generateCallScript(ai: Ai, lead: Lead): Promise<string> {
	const result = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
		prompt: buildCallScriptPrompt(lead),
		max_tokens: 1400,
		temperature: 0.2,
		repetition_penalty: 1.05
	});

	if (typeof result === 'object' && result !== null && 'response' in result) {
		const script = result.response.trim();
		if (script) return script;
	}

	throw new Error('Workers AI returned no call script');
}