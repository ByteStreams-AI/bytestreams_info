import { describe, expect, it, vi } from 'vitest';
import {
	ApolloError,
	businessDomain,
	describeApolloFailure,
	findLeadContact,
	personLinkedInUrl,
	pickDecisionMaker,
	titleRank,
	type ApolloLead
} from '$lib/server/apollo';

const pharmacy: ApolloLead = {
	business_name: 'Sample Specialty Rx',
	contact_name: null,
	website_url: 'https://www.samplerx.example/about',
	product: 'dialtone_med'
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function calls(fetcher: ReturnType<typeof vi.fn>) {
	return fetcher.mock.calls.map(([input, init]) => ({ url: new URL(String(input)), init: init as RequestInit }));
}

const matched = {
	person: {
		id: 'p-1',
		name: 'Jordan Blake',
		title: 'Pharmacist in Charge',
		email: 'Jordan@SampleRx.example',
		email_status: 'verified',
		linkedin_url: 'http://www.linkedin.com/in/jordanblake',
		match_confidence: 'high'
	}
};

describe('businessDomain', () => {
	it('strips www and the path', () => {
		expect(businessDomain('https://www.samplerx.example/about')).toBe('samplerx.example');
		expect(businessDomain('samplerx.example')).toBe('samplerx.example');
	});

	it('refuses social, ordering and malformed sites', () => {
		expect(businessDomain('https://facebook.com/samplerx')).toBeNull();
		expect(businessDomain('https://samplerx.square.site')).toBeNull();
		expect(businessDomain('localhost')).toBeNull();
		expect(businessDomain('http://exa mple')).toBeNull();
		expect(businessDomain(null)).toBeNull();
		expect(businessDomain('  ')).toBeNull();
	});
});

describe('personLinkedInUrl', () => {
	it('normalizes a personal profile and refuses everything else', () => {
		expect(personLinkedInUrl('http://linkedin.com/in/jane-doe-123/?trk=x')).toBe('https://www.linkedin.com/in/jane-doe-123');
		expect(personLinkedInUrl('www.linkedin.com/in/jane')).toBe('https://www.linkedin.com/in/jane');
		expect(personLinkedInUrl('https://www.linkedin.com/company/acme')).toBeNull();
		expect(personLinkedInUrl('https://evil.example/in/jane')).toBeNull();
		expect(personLinkedInUrl('http://exa mple')).toBeNull();
		expect(personLinkedInUrl(null)).toBeNull();
	});
});

describe('decision-maker ranking', () => {
	it('ranks by the product title list', () => {
		expect(titleRank('Owner & Pharmacist', 'dialtone_med')).toBe(0);
		expect(titleRank('Pharmacy Technician', 'dialtone_med')).toBe(Infinity);
		expect(titleRank(null, 'dialtone_menu')).toBe(Infinity);
	});

	it('picks the best title with an email, keeping Apollo order on ties', () => {
		const picked = pickDecisionMaker(
			[
				{ id: 'tech', title: 'Pharmacy Technician', has_email: true },
				{ id: 'pm', title: 'Practice Manager', has_email: true },
				{ id: 'owner-no-email', title: 'Owner', has_email: false },
				{ id: 'pic', title: 'Pharmacist in Charge', has_email: true },
				{ id: 'pic-2', title: 'Pharmacist In Charge', has_email: true }
			],
			'dialtone_med'
		);
		expect(picked?.id).toBe('pic');
		expect(pickDecisionMaker([{ id: 'x', title: 'Cashier' }], 'dialtone_menu')).toBeNull();
	});
});

describe('findLeadContact', () => {
	it('searches the domain, enriches the best match and never asks for phones', async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce(json({ people: [
				{ id: 'p-2', title: 'Office Manager', has_email: true },
				{ id: 'p-1', title: 'Pharmacist in Charge', has_email: true }
			] }))
			.mockResolvedValueOnce(json(matched));

		const result = await findLeadContact(pharmacy, 'key-1', fetcher);

		const [search, match] = calls(fetcher);
		expect(search.url.pathname).toBe('/api/v1/mixed_people/api_search');
		expect(search.url.searchParams.getAll('q_organization_domains_list[]')).toEqual(['samplerx.example']);
		expect(search.url.searchParams.getAll('person_titles[]')).toContain('pharmacist in charge');
		expect((search.init.headers as Record<string, string>)['x-api-key']).toBe('key-1');
		expect(search.init.method).toBe('POST');

		expect(match.url.pathname).toBe('/api/v1/people/match');
		expect(match.url.searchParams.get('id')).toBe('p-1');
		expect(match.url.searchParams.get('reveal_phone_number')).toBe('false');
		expect(match.url.searchParams.get('reveal_personal_emails')).toBe('false');

		expect(result.sourceUrl).toBe('https://app.apollo.io/#/people/p-1');
		expect(result.findings).toEqual([
			{ category: 'contact_name', value: 'Jordan Blake', sourceUrl: result.sourceUrl, confidence: 0.95 },
			{ category: 'contact_title', value: 'Pharmacist in Charge', sourceUrl: result.sourceUrl, confidence: 0.95 },
			{ category: 'contact_email', value: 'jordan@samplerx.example', sourceUrl: result.sourceUrl, confidence: 0.95 },
			{ category: 'contact_linkedin', value: 'http://www.linkedin.com/in/jordanblake', sourceUrl: result.sourceUrl, confidence: 0.95 }
		]);
	});

	it('enriches a named contact directly, skipping the search', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json(matched));
		await findLeadContact({ ...pharmacy, contact_name: 'Jordan Blake' }, 'key-1', fetcher);

		const [match] = calls(fetcher);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(match.url.searchParams.get('name')).toBe('Jordan Blake');
		expect(match.url.searchParams.get('domain')).toBe('samplerx.example');
	});

	it('enriches by a personal LinkedIn profile when the lead has no contact name', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json(matched));
		await findLeadContact({ ...pharmacy, linkedin_url: 'linkedin.com/in/jordanblake/' }, 'key-1', fetcher);

		const [match] = calls(fetcher);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(match.url.searchParams.get('linkedin_url')).toBe('https://www.linkedin.com/in/jordanblake');
		expect(match.url.searchParams.has('name')).toBe(false);
		expect(match.url.searchParams.get('domain')).toBe('samplerx.example');
	});

	it('searches the domain when the LinkedIn URL is a company page', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json({ people: [] })).mockResolvedValueOnce(json({ people: [] }));
		await expect(findLeadContact({ ...pharmacy, linkedin_url: 'https://www.linkedin.com/company/samplerx' }, 'k', fetcher))
			.rejects.toThrow(/no people on file/);
		expect(calls(fetcher)[0].url.pathname).toBe('/api/v1/mixed_people/api_search');
	});

	it('names the LinkedIn profile when it matches no one', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json({ person: null }));
		await expect(findLeadContact({ ...pharmacy, linkedin_url: 'linkedin.com/in/ghost' }, 'k', fetcher))
			.rejects.toThrow('Apollo found no match for https://www.linkedin.com/in/ghost at samplerx.example.');
	});

	it('falls back to the business name for a named contact with no usable website', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json(matched));
		await findLeadContact({ ...pharmacy, contact_name: 'Jordan Blake', website_url: null }, 'key-1', fetcher);

		const [match] = calls(fetcher);
		expect(match.url.searchParams.get('organization_name')).toBe('Sample Specialty Rx');
		expect(match.url.searchParams.has('domain')).toBe(false);
	});

	it('needs a business domain or a contact name', async () => {
		const fetcher = vi.fn();
		await expect(findLeadContact({ ...pharmacy, website_url: 'https://facebook.com/x' }, 'key-1', fetcher))
			.rejects.toThrow(/own website/);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('spends no enrichment credit when the search finds no decision maker', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json({ people: [{ id: 't', title: 'Technician', has_email: true }] }));
		await expect(findLeadContact(pharmacy, 'key-1', fetcher)).rejects.toThrow(
			'Apollo has 1 person at samplerx.example (1 with an email), but no owner or manager with an email. Titles on file: Technician.'
		);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('describes who Apollo does hold when no one has a decision-maker title', async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce(json({ people: [] }))
			.mockResolvedValueOnce(json({ people: [
				{ id: 'a', title: 'Pediatric Nurse Practitioner', has_email: false },
				{ id: 'b', title: 'Pediatric Nurse Practitioner', has_email: false }
			] }));
		await expect(findLeadContact(pharmacy, 'key-1', fetcher)).rejects.toThrow(
			'Apollo has 2 people at samplerx.example (0 with an email), but no owner or manager with an email. Titles on file: Pediatric Nurse Practitioner.'
		);
		const [, everyone] = calls(fetcher);
		expect(everyone.url.searchParams.has('person_titles[]')).toBe(false);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('handles search responses with no people array', async () => {
		const fetcher = vi.fn().mockImplementation(async () => json({}));
		await expect(findLeadContact(pharmacy, 'key-1', fetcher)).rejects.toThrow('Apollo has no people on file at samplerx.example.');
	});

	it('omits titles when none are on file', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json({ people: [{ id: 'x', title: null, has_email: true }] }));
		await expect(findLeadContact(pharmacy, 'key-1', fetcher)).rejects.toThrow(/with an email\.$/);
	});

	it('reports a non-match', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(json({ person: { id: 'p', match_confidence: 'none' } }));
		await expect(findLeadContact({ ...pharmacy, contact_name: 'Nobody' }, 'k', fetcher)).rejects.toThrow(/no match for Nobody/);

		const empty = vi.fn().mockResolvedValueOnce(json({ person: null }));
		await expect(findLeadContact({ ...pharmacy, contact_name: 'Nobody', website_url: null }, 'k', empty))
			.rejects.toThrow(/at Sample Specialty Rx/);
	});

	it('drops locked placeholder emails and lowers confidence for unverified ones', async () => {
		const locked = vi.fn().mockResolvedValueOnce(json({ person: {
			id: 'p', name: ' ', email: 'email_not_unlocked@domain.com', match_confidence: 'low'
		} }));
		expect((await findLeadContact({ ...pharmacy, contact_name: 'A B' }, 'k', locked)).findings).toEqual([]);

		const unverified = vi.fn().mockResolvedValueOnce(json({ person: {
			id: 'p', name: 'A B', email: 'a@samplerx.example', email_status: 'extrapolated'
		} }));
		const { findings } = await findLeadContact({ ...pharmacy, contact_name: 'A B' }, 'k', unverified);
		expect(findings).toEqual([
			expect.objectContaining({ category: 'contact_name', confidence: 0.75 }),
			expect.objectContaining({ category: 'contact_email', confidence: 0.6 })
		]);
	});

	it('turns HTTP failures into ApolloError with the status', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(new Response('nope', { status: 403 }));
		const failure = await findLeadContact(pharmacy, 'k', fetcher).catch((e) => e);
		expect(failure).toBeInstanceOf(ApolloError);
		expect(failure.status).toBe(403);
		expect(failure.message).toMatch(/master API key/);
	});
});

describe('describeApolloFailure', () => {
	it('explains each common status', () => {
		expect(describeApolloFailure(401, '')).toMatch(/APOLLO_API_KEY/);
		expect(describeApolloFailure(422, 'bad param')).toMatch(/bad param/);
		expect(describeApolloFailure(429, '')).toMatch(/rate limit/);
		expect(describeApolloFailure(500, 'boom')).toBe('Apollo returned HTTP 500: boom');
		expect(describeApolloFailure(500, '')).toBe('Apollo returned HTTP 500');
	});
});
