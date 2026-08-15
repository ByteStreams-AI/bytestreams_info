import type { Lead, LeadResearchFinding } from '$lib/types';
import callTemplate from '$lib/server/prompts/DialTone_Cold_Call_Template.md?raw';

const START_MARKER = '******START HERE******';
const STOP_MARKER = '******STOP HERE******';
const RANKED_VALUE_HEADING = '## Ranked Value Statement Selection';
const VALUE_STATEMENT_PLACEHOLDER = '[Selected ranked value statement]';
const VALUE_STATEMENT_HEADING = '### 1. Deliver the Value Statement';
const VALUE_STATEMENT_STOP = 'Stop and let the prospect respond.';
const FOLLOW_UP_EMAIL_HEADING = '## Follow-Up Email';

interface RankedValueStatement {
	priority: number;
	triggers: string[];
	statement: string;
}

function rankedValueGuidance(): string {
	const generationStart = callTemplate.indexOf(START_MARKER);
	const guidanceStart = callTemplate.lastIndexOf(RANKED_VALUE_HEADING, generationStart);
	if (generationStart === -1 || guidanceStart === -1) {
		throw new Error('Canonical call template is missing its ranked value-statement guidance');
	}
	return callTemplate.slice(guidanceStart, generationStart).trim();
}

function rankedValueStatements(): RankedValueStatement[] {
	const guidance = rankedValueGuidance();
	const rows = [...guidance.matchAll(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|$/gm)];
	return rows.map((row) => {
		const priority = Number(row[1]);
		const triggers = [...row[2].matchAll(/`([^`]+)`/g)].map((match) => match[1].toLowerCase());
		const statement = guidance.match(
			new RegExp(`^### Priority ${priority}:[^\\n]*\\n\\s*\\n>\\s*(.+)$`, 'm')
		)?.[1]?.trim();
		if (!triggers.length || !statement) {
			throw new Error(`Canonical call template has an invalid priority ${priority} value statement`);
		}
		return { priority, triggers, statement };
	}).sort((left, right) => left.priority - right.priority);
}

function rankedValueStatement(evidence: string): string | null {
	const normalizedEvidence = evidence.toLowerCase();
	return rankedValueStatements().find(({ triggers }) =>
		triggers.some((trigger) => normalizedEvidence.includes(trigger))
	)?.statement ?? null;
}

function segmentValueStatement(template: string, lead: Lead): string | null {
	const heading = segmentHeading(lead);
	if (!heading) return null;

	const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return template.match(new RegExp(`^### ${escapedHeading}\\s*$\\n\\s*>\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
}

function segmentHeading(lead: Lead): string | null {
	let heading: string | null = null;
	if (lead.business_type === 'food_truck') heading = 'Food Truck';
	else if (
		['multi_configuration', 'multi_location', 'enterprise'].includes(lead.business_type ?? '') ||
		(lead.num_locations ?? 0) > 1
	) heading = 'Multi-Location Restaurant';
	else if (lead.business_type === 'single_location' || lead.num_locations === 1) {
		heading = 'Single-Location Restaurant';
	}
	return heading;
}

function canonicalSection(template: string, heading: string): string {
	const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const headingMatch = new RegExp(`^### ${escapedHeading}\\s*$`, 'm').exec(template);
	if (!headingMatch || headingMatch.index === undefined) {
		throw new Error(`Canonical call template is missing the ${heading} section`);
	}
	const sectionStart = headingMatch.index;
	const nextSection = template.indexOf('\n### ', sectionStart + headingMatch[0].length);
	return template.slice(sectionStart, nextSection === -1 ? undefined : nextSection).trim();
}

function canonicalFollowUpEmail(template: string, heading: string): string {
	const section = canonicalSection(template, heading);
	if (!section) throw new Error(`Canonical call template is missing the ${heading} follow-up email`);
	return section;
}

function matchesPriority(evidence: string, priority: number): boolean {
	const normalizedEvidence = evidence.toLowerCase();
	return rankedValueStatements().some((statement) =>
		statement.priority === priority
		&& statement.triggers.some((trigger) => normalizedEvidence.includes(trigger))
	);
}

function hasNoDirectOrdering(value: string | null): boolean {
	return /^(no|none|false)$/i.test(value?.trim() ?? '');
}

function followUpEmailHeading(lead: Lead, approvedFindings: LeadResearchFinding[]): string | null {
	const evidence = [
		lead.notes,
		lead.uses_pos,
		...approvedFindings.map((finding) => `${finding.category} ${finding.value}`)
	].filter(known).join('\n');
	const hasNoOnlineOrdering = hasNoDirectOrdering(lead.first_party_ordering) || matchesPriority(evidence, 3);
	const usesToast = /toast/i.test(evidence);
	const usesSquare = /square/i.test(evidence);
	const usesDoorDash = /door\s?dash/i.test(evidence);
	const usesUberEats = /uber\s?eats/i.test(evidence);
	const usesResy = /resy/i.test(evidence);
	const usesChowNow = /chownow/i.test(evidence);
	const usesOpenTable = /open\s?table/i.test(evidence);
	const isFoodTruck = lead.business_type === 'food_truck';
	const isSingleLocation = lead.business_type === 'single_location' || lead.num_locations === 1;

	if (isFoodTruck) {
		if (hasNoOnlineOrdering) return 'Food Truck With No Online Ordering';
		if (usesToast) return 'Food Truck Using Toast';
		if (usesSquare) return 'Food Truck Using Square';
		return 'Food Truck';
	}
	if (isSingleLocation) {
		if (hasNoOnlineOrdering) return 'Single Location With No Online Ordering';
		if (usesDoorDash) return 'Single Location Using DoorDash';
		if (usesUberEats) return 'Single Location Using Uber Eats';
		if (usesToast) return 'Single Location Using Toast';
		if (usesSquare) return 'Single Location Using Square';
		if (usesResy) return 'Single Location Using Resy';
		if (usesChowNow) return 'Single Location Using ChowNow';
		if (usesOpenTable) return 'Single Location Using OpenTable';
		return 'Single Location Restaurant';
	}
	return null;
}

function boundedCallTemplate(
	lead: Lead,
	callerName: string,
	approvedFindings: LeadResearchFinding[]
): string {
	const start = callTemplate.indexOf(START_MARKER);
	const stop = callTemplate.indexOf(STOP_MARKER, start + START_MARKER.length);
	if (start === -1 || stop === -1) {
		throw new Error('Canonical call template is missing its generation boundaries');
	}

	const normalizedCallerName = callerName?.trim();
	if (!normalizedCallerName) throw new Error('CALLER_NAME is not configured');

	let template = callTemplate
		.slice(start + START_MARKER.length, stop)
		.trim()
		.replaceAll('[Your Name]', () => normalizedCallerName);
	const contactName = lead.contact_name?.trim();
	if (contactName) template = template.replaceAll('[contact_name]', () => contactName);
	else template = template.replaceAll('Hi [contact_name],', 'Hi,');

	const researchEvidence = approvedFindings
		.map((finding) => `${finding.category} ${finding.value}`)
		.join('\n');
	const valueStatement = rankedValueStatement(lead.notes ?? '')
		?? rankedValueStatement(researchEvidence)
		?? segmentValueStatement(template, lead);
	if (!valueStatement) {
		throw new Error('No supported value statement could be selected from approved research or CRM business type');
	}
	template = template
		.replace(VALUE_STATEMENT_PLACEHOLDER, () => valueStatement)
		.replaceAll('[restaurant name]', () => lead.business_name);
	const openerHeading = segmentHeading(lead);
	if (openerHeading) {
		const openerStart = template.indexOf('## Observation-Based Openers');
		if (openerStart === -1) throw new Error('Canonical call template is missing observation-based openers');
		const openerIntroEnd = template.indexOf('\n### ', openerStart);
		if (openerIntroEnd === -1) throw new Error('Canonical call template is missing observation opener sections');
		template = `${template.slice(0, openerIntroEnd).trimEnd()}\n\n${canonicalSection(template, openerHeading)}`;
	}
	const emailHeading = followUpEmailHeading(lead, approvedFindings);
	if (emailHeading) {
		let email = canonicalFollowUpEmail(callTemplate, emailHeading)
			.replaceAll('[Your Name]', () => normalizedCallerName)
			.replaceAll('[Restaurant Name]', () => lead.business_name)
			.replaceAll('[Truck Name]', () => lead.business_name);
		if (contactName) email = email.replaceAll('[Name]', () => contactName);
		template = `${template}\n\n${FOLLOW_UP_EMAIL_HEADING}\n\n${email}`;
	}
	return template;
}

function canonicalValueStatementBlock(template: string): string {
	const start = template.indexOf(VALUE_STATEMENT_HEADING);
	const stop = template.indexOf(VALUE_STATEMENT_STOP, start);
	if (start === -1 || stop === -1) {
		throw new Error('Canonical call template is missing its value-statement boundaries');
	}
	return template.slice(start, stop + VALUE_STATEMENT_STOP.length);
}

function restoreCanonicalValueStatement(script: string, template: string): string {
	const start = script.indexOf(VALUE_STATEMENT_HEADING);
	const stop = script.indexOf(VALUE_STATEMENT_STOP, start);
	if (start === -1 || stop === -1) {
		throw new Error('Workers AI returned a call script without the value-statement boundaries');
	}
	return `${script.slice(0, start)}${canonicalValueStatementBlock(template)}${script.slice(stop + VALUE_STATEMENT_STOP.length)}`;
}

function restoreCanonicalFollowUpEmail(script: string, template: string): string {
	const start = template.indexOf(FOLLOW_UP_EMAIL_HEADING);
	if (start === -1) return script;
	const canonicalEmail = template.slice(start).trim();
	const scriptEmailStart = script.indexOf(FOLLOW_UP_EMAIL_HEADING);
	if (scriptEmailStart === -1) return `${script.trimEnd()}\n\n${canonicalEmail}`;
	return `${script.slice(0, scriptEmailStart).trimEnd()}\n\n${canonicalEmail}`;
}

function restoreCanonicalObservationOpener(script: string, template: string): string {
	const templateStart = template.indexOf('## Observation-Based Openers');
	if (templateStart === -1) return script;
	const canonicalOpeners = template.slice(templateStart, template.indexOf(FOLLOW_UP_EMAIL_HEADING, templateStart)).trim();
	const scriptStart = script.indexOf('## Observation-Based Openers');
	if (scriptStart === -1) return `${script.trimEnd()}\n\n${canonicalOpeners}`;
	const scriptEnd = script.indexOf(FOLLOW_UP_EMAIL_HEADING, scriptStart);
	return `${script.slice(0, scriptStart).trimEnd()}\n\n${canonicalOpeners}${scriptEnd === -1 ? '' : `\n\n${script.slice(scriptEnd).trimStart()}`}`;
}

const GENERATION_RULES = `
Create a concise, call-ready script by personalizing only the bounded DialTone.Menu template supplied below.

Requirements:
- Preserve the bounded template's section order and heading structure.
- Treat the bounded template as authoritative copy: reproduce all headings and all text outside square-bracketed placeholders verbatim without paraphrasing, correcting, or substituting words.
- Personalize only text inside square-bracketed placeholders. The caller and greeting placeholders have already been resolved from configuration and CRM data.
- Include only sections represented in the bounded template. Do not reproduce instructions, research notes, findings lists, or content from outside the boundaries.
- Replace optional placeholders only when supplied facts support the replacement; otherwise preserve them. The required value statement has already been resolved from approved evidence or known business segment and must remain unchanged.
- Resolve the value statement from the case-insensitive note triggers and numbered priorities in the pre-call guidance. When several triggers match, the lowest priority number wins.
- If the note does not match, use the highest-priority statement supported by approved research; otherwise use the known restaurant segment.
- Do not combine value statements or list the pre-call guidance in the response.
- Use only the CRM facts and approved sourced research supplied below. Never infer that an unknown field is false.
- Do not treat the absence of a finding as evidence that a restaurant lacks a product, service, or capability.
- Do not invent a decision-maker, current provider, pain point, savings amount, fee, contract, or operational problem.
- Do not claim DialTone operates a delivery network.
- Do not promise exact savings. Position the meeting as a personalized comparison.
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
	if (script.includes(VALUE_STATEMENT_PLACEHOLDER)) {
		throw new Error('Workers AI returned an unresolved value statement');
	}
	return script;
}

export function buildCallScriptPrompt(
	lead: Lead,
	callerName: string,
	approvedFindings: LeadResearchFinding[] = []
): string {
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
			marketplace_providers: lead.marketplace_providers,
			first_party_ordering: lead.first_party_ordering,
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

	return `${GENERATION_RULES}\n\nRanked value-statement guidance (do not include in the response):\n${rankedValueGuidance()}\n\nBounded canonical call template:\n${START_MARKER}\n${boundedCallTemplate(lead, callerName, approvedFindings)}\n${STOP_MARKER}\n\nCRM facts:\n${JSON.stringify(facts, null, 2)}\n\nApproved sourced research:\n${JSON.stringify(research, null, 2)}`;
}

export async function generateCallScript(
	ai: Ai,
	lead: Lead,
	callerName: string,
	approvedFindings: LeadResearchFinding[] = []
): Promise<string> {
	const result = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
		prompt: buildCallScriptPrompt(lead, callerName, approvedFindings),
		max_tokens: 2400,
		temperature: 0.2,
		repetition_penalty: 1.05
	});

	if (typeof result === 'object' && result !== null && 'response' in result) {
		const script = extractCallScriptContent(result.response);
		if (script) {
			const template = boundedCallTemplate(lead, callerName, approvedFindings);
			return restoreCanonicalFollowUpEmail(
				restoreCanonicalObservationOpener(restoreCanonicalValueStatement(script, template), template),
				template
			);
		}
	}

	throw new Error('Workers AI returned no call script');
}