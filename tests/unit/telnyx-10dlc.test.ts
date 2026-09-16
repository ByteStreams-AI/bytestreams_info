import { describe, expect, it, vi } from 'vitest';
import {
	TelnyxError,
	autoResponses,
	brandIsVerified,
	buildBrandRequest,
	buildCampaignRequest,
	campaignStatusLabel,
	checkUrlsResolve,
	conventionalEvidenceBase,
	conventionalEvidenceUrls,
	createBrand,
	evidenceUrlsFromBase,
	isEvidenceBase,
	isMenuHost,
	describeTelnyxFailure,
	formatEin,
	getBrand,
	getCampaign,
	submitCampaign,
	toE164,
	type CampaignInput
} from '$lib/server/telnyx-10dlc';

const evidence = conventionalEvidenceUrls('https://app.supabase.co/', 'rest-1');

const shortys: CampaignInput = {
	brandId: 'B123',
	brandName: "Shorty's",
	venue: 'restaurant',
	menuHost: 'https://shortys.m.dialtone.menu',
	evidence
};

describe('brand request', () => {
	it('formats the EIN the way TCR wants it and refuses anything but nine digits', () => {
		expect(formatEin('421992050')).toBe('42-1992050');
		expect(formatEin('42-1992050')).toBe('42-1992050');
		expect(() => formatEin('12345')).toThrow(/nine digits/);
	});

	it('normalises a US phone to E.164 and never guesses a country', () => {
		expect(toE164('(615) 555-0100')).toBe('+16155550100');
		expect(toE164('1 615 555 0100')).toBe('+16155550100');
		expect(toE164('+16155550100')).toBe('+16155550100');
		expect(toE164('555-0100')).toBeNull();
	});

	it('sends the LEGAL name as companyName and the trading name as displayName, vertical HOSPITALITY', () => {
		const req = buildBrandRequest({
			legalName: 'Diner On The Go LLC',
			displayName: 'Diner On The Go',
			einDigits: '421992050',
			phoneE164: '+16155550100',
			street: '123 Main St',
			city: 'Nashville',
			state: 'TN',
			postalCode: '37203',
			email: 'owner@dineronthego.com',
			website: 'https://dineronthego.m.dialtone.menu',
			entityType: 'PRIVATE_PROFIT'
		});
		expect(req).toMatchObject({
			entityType: 'PRIVATE_PROFIT',
			companyName: 'Diner On The Go LLC',
			displayName: 'Diner On The Go',
			ein: '42-1992050',
			einIssuingCountry: 'US',
			country: 'US',
			vertical: 'HOSPITALITY'
		});
	});
});

describe('campaign request — the template, per venue', () => {
	it('is Marketing, names the tenant in every string, and never names DialTone as sender', () => {
		const req = buildCampaignRequest(shortys);
		expect(req.usecase).toBe('MARKETING');
		for (const s of [req.description, req.sample1, req.sample2, req.sample3, req.optinMessage, req.optoutMessage, req.helpMessage]) {
			expect(s).toContain("Shorty's");
			expect(s).not.toMatch(/\bDialTone\b/);
		}
		expect(req.numberPool).toBe(false);
		expect(req.embeddedLink).toBe(true);
		expect(req.embeddedLinkSample).toBe('https://shortys.m.dialtone.menu');
		expect(req.ageGated).toBe(false);
		expect(req.optinKeywords).toBe('START,YES,UNSTOP');
		expect(req.optoutKeywords).toContain('STOP');
		expect(req.helpKeywords).toBe('HELP,INFO');
		expect(req.privacyPolicyLink).toBe('https://dialtone.menu/privacy');
		expect(req.termsAndConditionsLink).toBe('https://dialtone.menu/terms');
	});

	it('a restaurant promises no location updates and shows none; a truck promises them AND shows one', () => {
		const r = buildCampaignRequest(shortys);
		expect(r.description).not.toMatch(/location updates/);
		expect(r.description).toContain('in-store kiosk');
		expect(r.sample2).toMatch(/Double points/);
		expect(r.messageFlow).toContain('our in-store kiosk');

		const t = buildCampaignRequest({ ...shortys, brandName: 'Diner On The Go', venue: 'food_truck', menuHost: 'https://dotg.m.dialtone.menu' });
		expect(t.description).toMatch(/location updates/);
		expect(t.description).toContain('the kiosk at our order window');
		expect(t.sample2).toMatch(/parked at/);
		expect(t.messageFlow).toContain('the kiosk at our order window');
	});

	it('the message flow carries every evidence URL and the menu page, and no verbal method', () => {
		const flow = buildCampaignRequest(shortys).messageFlow;
		for (const url of Object.values(evidence)) expect(flow).toContain(url);
		expect(flow).toContain('https://shortys.m.dialtone.menu/menu');
		expect(flow).not.toMatch(/verbal/i);
		expect(flow).toContain('never pre-ticked');
	});

	it('every sample carries STOP and HELP wording', () => {
		const req = buildCampaignRequest(shortys);
		for (const s of [req.sample1, req.sample2, req.sample3]) expect(s).toMatch(/Reply STOP .* HELP/);
	});

	it('refuses a placeholder brand name — that was its own rejection bullet', () => {
		expect(() => buildCampaignRequest({ ...shortys, brandName: '[Restaurant Name]' })).toThrow(/placeholder/);
	});

	it('help names the shared support line without naming DialTone', () => {
		const a = autoResponses("Shorty's");
		expect(a.help).toBe("Shorty's: Please reach out to us at 855 251 8277 for help.");
	});
});

describe('evidence must resolve', () => {
	it('names every URL that does not answer 200', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('home_qrcode.jpg')) return new Response('', { status: 404 });
			if (url.endsWith('kiosk_disclosure.jpeg')) throw new Error('boom');
			return new Response('', { status: 200 });
		}) as unknown as typeof fetch;
		const out = await checkUrlsResolve(Object.values(evidence), fetcher);
		expect(out.ok).toBe(false);
		expect(out.dead).toHaveLength(2);
		expect(out.dead.some((d) => d.includes('home_qrcode.jpg (404)'))).toBe(true);
		expect(out.dead.some((d) => d.includes('kiosk_disclosure.jpeg (unreachable)'))).toBe(true);
	});
});

describe('client', () => {
	const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

	it('creates a brand with the bearer key at the 10DLC endpoint and reads the id + status back', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe('https://api.telnyx.com/v2/10dlc/brand');
			expect(init?.method).toBe('POST');
			expect((init?.headers as Record<string, string>).authorization).toBe('Bearer KEY');
			expect(JSON.parse(init?.body as string).vertical).toBe('HOSPITALITY');
			return ok({ brandId: 'BABC', identityStatus: 'VERIFIED' });
		}) as unknown as typeof fetch;
		const brand = await createBrand('KEY', buildBrandRequest({
			legalName: 'L', displayName: 'D', einDigits: '421992050', phoneE164: '+16155550100', street: 's', city: 'c',
			state: 'TN', postalCode: '37203', email: 'e@x.com', website: 'https://x', entityType: 'PRIVATE_PROFIT'
		}), fetcher);
		expect(brand).toMatchObject({ brandId: 'BABC', identityStatus: 'VERIFIED' });
	});

	it('polls a brand and a campaign by id', async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/10dlc/brand/BABC')) return ok({ brandId: 'BABC', identityStatus: 'UNVERIFIED' });
			if (url.endsWith('/10dlc/campaignBuilder/CXYZ')) return ok({ campaignId: 'CXYZ', campaignStatus: 'TCR_PENDING' });
			return new Response('', { status: 404 });
		}) as unknown as typeof fetch;
		expect((await getBrand('KEY', 'BABC', fetcher)).identityStatus).toBe('UNVERIFIED');
		expect((await getCampaign('KEY', 'CXYZ', fetcher)).campaignStatus).toBe('TCR_PENDING');
	});

	it('submits a campaign and surfaces Telnyx refusals verbatim', async () => {
		const fetcher = vi.fn(async () =>
			new Response(JSON.stringify({ errors: [{ title: 'Bad Request', detail: 'brand not verified' }] }), { status: 422 })
		) as unknown as typeof fetch;
		await expect(submitCampaign('KEY', buildCampaignRequest(shortys), fetcher)).rejects.toMatchObject({
			name: 'TelnyxError',
			status: 422,
			message: 'Bad Request: brand not verified'
		});
		expect(describeTelnyxFailure({ message: 'flat' }, 500)).toBe('flat');
		expect(describeTelnyxFailure(null, 502)).toBe('Telnyx 502');
		expect(new TelnyxError('x', 1, null).name).toBe('TelnyxError');
	});

	it('reads statuses for the admin table', () => {
		expect(brandIsVerified('VERIFIED')).toBe(true);
		expect(brandIsVerified('VETTED_VERIFIED')).toBe(true);
		expect(brandIsVerified('SELF_DECLARED')).toBe(false);
		expect(campaignStatusLabel(null)).toMatchObject({ tone: 'muted' });
		expect(campaignStatusLabel('TCR_PENDING')).toMatchObject({ text: 'In review', tone: 'warning' });
		expect(campaignStatusLabel('MNO_PROVISIONED')).toMatchObject({ text: 'Approved', tone: 'success' });
		expect(campaignStatusLabel('TELNYX_FAILED')).toMatchObject({ tone: 'danger' });
	});
});

describe('admin-confirmed links (the live tenant is the prod clone)', () => {
	it('derives the five screenshots from any folder, conventional or supplied', () => {
		const base = conventionalEvidenceBase('https://app.supabase.co', 'rest-1');
		expect(base).toBe('https://app.supabase.co/storage/v1/object/public/compliance-evidence/rest-1');
		expect(evidenceUrlsFromBase(base)).toEqual(conventionalEvidenceUrls('https://app.supabase.co', 'rest-1'));
		expect(evidenceUrlsFromBase(base + '/').cartDisclosure).toBe(base + '/cart_disclosure.jpg');
	});

	it('accepts only our hosts and a public evidence folder', () => {
		expect(isMenuHost('https://shortys.m.dialtone.menu')).toBe(true);
		expect(isMenuHost('https://shortys.dialtone.menu')).toBe(true);
		expect(isMenuHost('http://shortys.m.dialtone.menu')).toBe(false);
		expect(isMenuHost('https://evil.example.com')).toBe(false);
		expect(isEvidenceBase('https://klzznfagrtormretqsgb.supabase.co/storage/v1/object/public/compliance-evidence/8221b632-6f69-443d-b972-57a7a9f551d1')).toBe(true);
		expect(isEvidenceBase('https://klzznfagrtormretqsgb.supabase.co/storage/v1/object/public/other/x')).toBe(false);
	});
});
