/**
 * Finds a lead's decision maker through the Apollo API.
 *
 * Credit use: People API Search is free; one People Enrichment call costs 1 credit
 * when it returns an email. Phone reveal (+8 credits per mobile number) is never
 * requested, and neither are personal emails.
 */

import type { ResearchFindingDraft } from '$lib/server/restaurant-research';
import type { Product } from '$lib/products';

const API_BASE = 'https://api.apollo.io/api/v1';
const REQUEST_TIMEOUT_MS = 15_000;
const SEARCH_PAGE_SIZE = 25;

/** Decision-maker titles in priority order. Earlier titles win when several people match. */
export const DECISION_MAKER_TITLES: Record<Product, readonly string[]> = {
	dialtone_menu: ['owner', 'co-owner', 'founder', 'general manager', 'operations manager', 'director of operations'],
	dialtone_med: [
		'owner',
		'pharmacist in charge',
		'director of pharmacy',
		'practice administrator',
		'practice manager',
		'administrator',
		'chief executive officer',
		'managing partner',
		'office manager'
	]
};

/** Hosts a lead's website field sometimes holds that are not the business's own domain. */
const NON_BUSINESS_HOSTS = [
	'facebook.com',
	'instagram.com',
	'linktr.ee',
	'linkedin.com',
	'google.com',
	'yelp.com',
	'square.site',
	'toasttab.com',
	'wixsite.com',
	'godaddysites.com'
];

/** Apollo returns this placeholder in place of an email it has not revealed. */
const LOCKED_EMAIL_PREFIX = 'email_not_unlocked';

/** Lead fields an approved Apollo finding is written to. */
export const APOLLO_FINDING_FIELDS = {
	contact_name: 'contact_name',
	contact_email: 'email',
	contact_linkedin: 'linkedin_url'
} as const;

export interface ApolloLead {
	business_name: string;
	contact_name: string | null;
	linkedin_url?: string | null;
	website_url: string | null;
	product: Product;
}

export interface ApolloContactResult {
	sourceUrl: string;
	findings: ResearchFindingDraft[];
}

interface SearchPerson {
	id: string;
	first_name?: string | null;
	title?: string | null;
	has_email?: boolean;
}

interface MatchedPerson {
	id: string;
	name?: string | null;
	title?: string | null;
	email?: string | null;
	email_status?: string | null;
	linkedin_url?: string | null;
	match_confidence?: string | null;
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ApolloError extends Error {
	constructor(message: string, readonly status?: number) {
		super(message);
		this.name = 'ApolloError';
	}
}

/** The business's own domain from its website URL, or null when the URL is not a business site. */
export function businessDomain(websiteUrl: string | null): string | null {
	if (!websiteUrl?.trim()) return null;
	let host: string;
	try {
		const raw = websiteUrl.trim();
		host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
	} catch {
		return null;
	}
	host = host.replace(/^www\./, '');
	if (!host.includes('.')) return null;
	if (NON_BUSINESS_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return null;
	return host;
}

/** A linkedin.com/in/ personal profile URL, normalized; null for company pages and anything else. */
export function personLinkedInUrl(value: string | null | undefined): string | null {
	if (!value?.trim()) return null;
	try {
		const raw = value.trim();
		const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
		const host = url.hostname.toLowerCase();
		if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;
		const slug = url.pathname.match(/^\/in\/([^/]+)/)?.[1];
		return slug ? `https://www.linkedin.com/in/${slug}` : null;
	} catch {
		return null;
	}
}

/** Index of the highest-priority title this person's title contains; Infinity when none does. */
export function titleRank(title: string | null | undefined, product: Product): number {
	if (!title) return Infinity;
	const normalized = title.toLowerCase();
	const index = DECISION_MAKER_TITLES[product].findIndex((wanted) => normalized.includes(wanted));
	return index === -1 ? Infinity : index;
}

function query(params: Record<string, string | boolean | number | readonly string[]>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (Array.isArray(value)) {
			for (const item of value) search.append(`${key}[]`, item);
		} else {
			search.set(key, String(value));
		}
	}
	return search.toString();
}

async function post<T>(path: string, params: Parameters<typeof query>[0], apiKey: string, fetcher: Fetch): Promise<T> {
	const response = await fetcher(`${API_BASE}${path}?${query(params)}`, {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			'content-type': 'application/json',
			'cache-control': 'no-cache',
			accept: 'application/json'
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new ApolloError(describeApolloFailure(response.status, body), response.status);
	}
	return (await response.json()) as T;
}

export function describeApolloFailure(status: number, body: string): string {
	if (status === 401) return 'Apollo rejected the API key (401). Check APOLLO_API_KEY.';
	if (status === 403) {
		return 'Apollo refused the request (403). People Search needs a master API key — enable "Set as master key" on the key in Apollo.';
	}
	if (status === 422) return `Apollo could not process the request (422): ${body.slice(0, 200)}`;
	if (status === 429) return 'Apollo rate limit reached (429). Try again later.';
	return `Apollo returned HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ''}`;
}

/** Ranks People Search results and returns the best decision maker with an email on file. */
export function pickDecisionMaker(people: SearchPerson[], product: Product): SearchPerson | null {
	const candidates = people
		.filter((person) => person.has_email !== false)
		.map((person, order) => ({ person, order, rank: titleRank(person.title, product) }))
		.filter((candidate) => candidate.rank !== Infinity);
	candidates.sort((a, b) => a.rank - b.rank || a.order - b.order);
	return candidates[0]?.person ?? null;
}

/** Says what Apollo does hold for the domain, so a coverage gap is not mistaken for a bug. */
export function describeNoDecisionMaker(domain: string, people: SearchPerson[]): string {
	if (people.length === 0) return `Apollo has no people on file at ${domain}.`;
	const withEmail = people.filter((person) => person.has_email).length;
	const titles = [...new Set(people.map((person) => person.title?.trim()).filter(Boolean))].slice(0, 5);
	return `Apollo has ${people.length} ${people.length === 1 ? 'person' : 'people'} at ${domain} (${withEmail} with an email), ` +
		`but no owner or manager with an email${titles.length ? `. Titles on file: ${titles.join(', ')}` : ''}.`;
}

const MATCH_CONFIDENCE: Record<string, number> = { high: 0.95, medium: 0.75, low: 0.5 };

function findingsFor(person: MatchedPerson): ApolloContactResult {
	const sourceUrl = `https://app.apollo.io/#/people/${person.id}`;
	const confidence = MATCH_CONFIDENCE[person.match_confidence ?? ''] ?? 0.75;
	const findings: ResearchFindingDraft[] = [];

	if (person.name?.trim()) {
		findings.push({ category: 'contact_name', value: person.name.trim(), sourceUrl, confidence });
	}
	if (person.title?.trim()) {
		findings.push({ category: 'contact_title', value: person.title.trim(), sourceUrl, confidence });
	}
	const email = person.email?.trim().toLowerCase();
	if (email && !email.startsWith(LOCKED_EMAIL_PREFIX)) {
		findings.push({
			category: 'contact_email',
			value: email,
			sourceUrl,
			confidence: person.email_status === 'verified' ? 0.95 : 0.6
		});
	}
	if (person.linkedin_url?.trim()) {
		findings.push({ category: 'contact_linkedin', value: person.linkedin_url.trim(), sourceUrl, confidence });
	}
	return { sourceUrl, findings };
}

/**
 * Finds the lead's decision maker. With a contact name or personal LinkedIn profile on the
 * lead it enriches that person directly; otherwise it searches the business domain for the
 * best-ranked title.
 */
export async function findLeadContact(
	lead: ApolloLead,
	apiKey: string,
	fetcher: Fetch = fetch
): Promise<ApolloContactResult> {
	const domain = businessDomain(lead.website_url);
	const contactName = lead.contact_name?.trim();
	const linkedinUrl = personLinkedInUrl(lead.linkedin_url);
	let matchParams: Record<string, string | boolean>;

	if (contactName || linkedinUrl) {
		// A personal LinkedIn profile is Apollo's strongest match key; it finds people its search index misses.
		matchParams = {
			...(linkedinUrl ? { linkedin_url: linkedinUrl } : {}),
			...(contactName ? { name: contactName } : {}),
			...(domain ? { domain } : { organization_name: lead.business_name })
		};
	} else {
		if (!domain) {
			throw new ApolloError(
				"Add the business's own website (not a social or ordering page), or a contact name, so Apollo can find the decision maker."
			);
		}
		const search = await post<{ people?: SearchPerson[] }>(
			'/mixed_people/api_search',
			{
				q_organization_domains_list: [domain],
				person_titles: DECISION_MAKER_TITLES[lead.product],
				include_similar_titles: true,
				page: 1,
				per_page: SEARCH_PAGE_SIZE
			},
			apiKey,
			fetcher
		);
		let people = search.people ?? [];
		const person = pickDecisionMaker(people, lead.product);
		if (!person) {
			if (people.length === 0) {
				const everyone = await post<{ people?: SearchPerson[] }>(
					'/mixed_people/api_search',
					{ q_organization_domains_list: [domain], page: 1, per_page: SEARCH_PAGE_SIZE },
					apiKey,
					fetcher
				);
				people = everyone.people ?? [];
			}
			throw new ApolloError(describeNoDecisionMaker(domain, people));
		}
		matchParams = { id: person.id };
	}

	const match = await post<{ person?: MatchedPerson | null }>(
		'/people/match',
		{ ...matchParams, reveal_personal_emails: false, reveal_phone_number: false },
		apiKey,
		fetcher
	);
	if (!match.person?.id || match.person.match_confidence === 'none') {
		throw new ApolloError(`Apollo found no match for ${contactName ?? linkedinUrl ?? 'a decision maker'} at ${domain ?? lead.business_name}.`);
	}
	return findingsFor(match.person);
}
