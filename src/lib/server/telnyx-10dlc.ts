/**
 * Telnyx 10DLC — one brand and one campaign PER TENANT.
 *
 * The content rules come from `dialtone/developer/10dlc-campaign-registration.md`,
 * written after campaign CW2K3CT (brand ByteStreams) was rejected on exactly this
 * point: the perceived sender is the restaurant, so each restaurant needs its own
 * brand and campaign. Every string here names the tenant, never DialTone.
 *
 * Pure builders + a thin client with an injectable fetcher, the same shape as
 * `stripe-tax.ts`, so the request bodies are unit-tested without a network.
 */

export type TcrEntityType = 'PRIVATE_PROFIT' | 'PUBLIC_PROFIT' | 'NON_PROFIT';

export type BrandInput = {
	legalName: string;
	displayName: string;
	einDigits: string;
	phoneE164: string;
	street: string;
	city: string;
	state: string;
	postalCode: string;
	email: string;
	website: string;
	entityType: TcrEntityType;
};

export type BrandRequest = {
	entityType: TcrEntityType;
	companyName: string;
	displayName: string;
	ein: string;
	einIssuingCountry: 'US';
	phone: string;
	street: string;
	city: string;
	state: string;
	postalCode: string;
	country: 'US';
	email: string;
	website: string;
	vertical: 'HOSPITALITY';
};

/** TCR wants XX-XXXXXXX; the portal stores nine digits. */
export function formatEin(digits: string): string {
	const d = digits.replace(/\D/g, '');
	if (d.length !== 9) throw new Error('EIN must be nine digits');
	return `${d.slice(0, 2)}-${d.slice(2)}`;
}

/** Ten US digits (or eleven with a leading 1) → E.164, else null. Never guesses a country. */
export function toE164(raw: string): string | null {
	const d = raw.replace(/\D/g, '');
	if (d.length === 10) return `+1${d}`;
	if (d.length === 11 && d.startsWith('1')) return `+${d}`;
	if (/^\+[1-9]\d{7,14}$/.test(raw.trim())) return raw.trim();
	return null;
}

export function buildBrandRequest(input: BrandInput): BrandRequest {
	return {
		entityType: input.entityType,
		// The LEGAL name, which must match the EIN record; the display name is
		// what carriers show and is the restaurant's trading name.
		companyName: input.legalName,
		displayName: input.displayName,
		ein: formatEin(input.einDigits),
		einIssuingCountry: 'US',
		phone: input.phoneE164,
		street: input.street,
		city: input.city,
		state: input.state,
		postalCode: input.postalCode,
		country: 'US',
		email: input.email,
		website: input.website,
		vertical: 'HOSPITALITY'
	};
}

// ── Campaign content, from the template ─────────────────────────────────────

export type Venue = 'restaurant' | 'food_truck';

export type CampaignInput = {
	brandId: string;
	/** The tenant's trading name — every string names it. */
	brandName: string;
	venue: Venue;
	/** https://<slug>.m.dialtone.menu — the embedded link and the opt-in page host. */
	menuHost: string;
	/** Per-tenant disclosure screenshots, in the order the template lists them. */
	evidence: EvidenceUrls;
};

export type EvidenceUrls = {
	cartDisclosure: string;
	homeQrCode: string;
	menuFooterQrCode: string;
	kioskThreeOptions: string;
	kioskDisclosure: string;
};

export const PRIVACY_POLICY_URL = 'https://dialtone.menu/privacy';
export const TERMS_URL = 'https://dialtone.menu/terms';
/** DialTone's shared support line, deliberately unlabelled in the help text (operator, 2026-09-10). */
export const HELP_PHONE_SPOKEN = '855 251 8277';

export const OPTIN_KEYWORDS = 'START,YES,UNSTOP';
export const OPTOUT_KEYWORDS = 'STOP,UNSUBSCRIBE,CANCEL,QUIT,END,STOPALL';
export const HELP_KEYWORDS = 'HELP,INFO';

/** The conventional evidence paths in the DialTone app project's public bucket. */
export function conventionalEvidenceUrls(appSupabaseUrl: string, restaurantId: string): EvidenceUrls {
	const base = `${appSupabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/compliance-evidence/${restaurantId}`;
	return {
		cartDisclosure: `${base}/cart_disclosure.jpg`,
		homeQrCode: `${base}/home_qrcode.jpg`,
		menuFooterQrCode: `${base}/menu_footer_qrcode.jpg`,
		kioskThreeOptions: `${base}/kiosk_3_options.jpeg`,
		kioskDisclosure: `${base}/kiosk_disclosure.jpeg`
	};
}

const DISCLOSURE = (brand: string, via: string) =>
	`"By ${via}, you agree to receive SMS loyalty messages from ${brand}. Message frequency may vary. ` +
	'Standard Message and Data Rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a ' +
	'condition of purchase. Your mobile information will not be sold or shared with third parties for ' +
	`promotional or marketing purposes. Visit ${PRIVACY_POLICY_URL} to view our privacy policy."`;

export function campaignDescription(brand: string, venue: Venue): string {
	if (venue === 'food_truck') {
		return (
			`${brand} sends SMS loyalty and promotional messages to customers who opt in: rewards balances, ` +
			'points milestones, offers, and location updates telling customers where our truck is parked and when. ' +
			'Customers opt in through our online ordering page, by scanning our QR code and installing our app, or ' +
			'at the kiosk at our order window. STOP and HELP instructions are included in every message.'
		);
	}
	return (
		`${brand} sends SMS loyalty and promotional messages to customers who opt in: rewards balances, points ` +
		'milestones, offers, and special announcements. Customers opt in through our online ordering page, by ' +
		'scanning our QR code and installing our app, or at our in-store kiosk. STOP and HELP instructions are ' +
		'included in every message.'
	);
}

export function campaignMessageFlow(input: Omit<CampaignInput, 'brandId'>): string {
	const { brandName: b, menuHost, evidence, venue } = input;
	const kiosk = venue === 'food_truck' ? 'the kiosk at our order window' : 'our in-store kiosk';
	return [
		`WEB OPT-IN. A customer builds an order at ${menuHost}/menu and enters their name and phone number at ` +
			'checkout to receive order updates. Directly below those fields is an unticked checkbox labelled ' +
			'"Join the rewards program and earn points!", and directly below the checkbox the following disclosure ' +
			'is displayed on the page at all times:',
		'',
		DISCLOSURE(b, 'providing your name and phone number'),
		'',
		'Consent is given only by ticking the box, which is never pre-ticked.',
		`Opt-in evidence: ${menuHost}/menu`,
		`Screenshot: ${evidence.cartDisclosure}`,
		'',
		`QR CODE / APP OPT-IN. A customer visits ${menuHost} and sees an "Order via App" panel containing our QR ` +
			'code. Below the QR code, in the same panel, the following disclosure is displayed:',
		'',
		DISCLOSURE(b, 'clicking the QR Code, installing the app, and providing your name and phone number'),
		'',
		'Scanning the QR code leads to the app, where the customer provides their name and phone number to enrol.',
		`Opt-in evidence: ${menuHost}`,
		`Screenshots: ${evidence.homeQrCode} and ${evidence.menuFooterQrCode}`,
		'',
		`KIOSK OPT-IN. A customer ordering at ${kiosk} is offered three choices: log in to an existing rewards ` +
			'account, "Join Rewards", or "Order Without Membership". Choosing "Join Rewards" opens a form for name ' +
			'and phone number, with the following disclosure displayed directly below the fields:',
		'',
		DISCLOSURE(b, 'providing your name and phone number'),
		'',
		'Consent is given only by completing that form. A customer who chooses "Order Without Membership" gives ' +
			'no phone number and receives no marketing messages.',
		'Opt-in evidence (the kiosk has no public URL, so both steps are shown):',
		`${evidence.kioskThreeOptions} and ${evidence.kioskDisclosure}`
	].join('\n');
}

export function campaignSamples(brand: string, venue: Venue, menuHost: string): [string, string, string] {
	const tail = 'Msg freq varies. Reply STOP to unsubscribe or HELP for help.';
	const second =
		venue === 'food_truck'
			? `${brand}: We're parked at 123 Main St today from 5-8 PM. Come say hi! ${tail}`
			: `${brand}: Double points on all orders this weekend! ${tail}`;
	return [
		`${brand}: You've reached Gold status! Redeem your points on your next order at ${menuHost}. ${tail}`,
		second,
		`${brand}: You have 250 points - that's a free side on your next visit. ${tail}`
	];
}

export function autoResponses(brand: string): { optin: string; optout: string; help: string } {
	return {
		optin:
			`${brand}: Thanks for subscribing to loyalty and promotional messages! Reply HELP for help. ` +
			'Message frequency may vary. Msg&data rates may apply. Consent is not a condition of purchase. Reply STOP to opt out.',
		// Declared branded; what actually arrives is the messaging profile's opt-out
		// text, which is Telnyx's to send (dialtone #1614). Keep in step with it.
		optout: `${brand}: You are unsubscribed and will receive no further messages.`,
		help: `${brand}: Please reach out to us at ${HELP_PHONE_SPOKEN} for help.`
	};
}

export type CampaignRequest = {
	brandId: string;
	usecase: 'MARKETING';
	description: string;
	messageFlow: string;
	sample1: string;
	sample2: string;
	sample3: string;
	optinKeywords: string;
	optoutKeywords: string;
	helpKeywords: string;
	optinMessage: string;
	optoutMessage: string;
	helpMessage: string;
	subscriberOptin: true;
	subscriberOptout: true;
	subscriberHelp: true;
	numberPool: false;
	directLending: false;
	embeddedLink: true;
	embeddedLinkSample: string;
	embeddedPhone: false;
	ageGated: false;
	autoRenewal: true;
	termsAndConditions: true;
	privacyPolicyLink: string;
	termsAndConditionsLink: string;
};

export function buildCampaignRequest(input: CampaignInput): CampaignRequest {
	if (/\[Restaurant Name\]/i.test(input.brandName) || !input.brandName.trim()) {
		throw new Error('A campaign must name the actual sender; a placeholder brand name is a rejection.');
	}
	const [sample1, sample2, sample3] = campaignSamples(input.brandName, input.venue, input.menuHost);
	const auto = autoResponses(input.brandName);
	return {
		brandId: input.brandId,
		usecase: 'MARKETING',
		description: campaignDescription(input.brandName, input.venue),
		messageFlow: campaignMessageFlow(input),
		sample1,
		sample2,
		sample3,
		optinKeywords: OPTIN_KEYWORDS,
		optoutKeywords: OPTOUT_KEYWORDS,
		helpKeywords: HELP_KEYWORDS,
		optinMessage: auto.optin,
		optoutMessage: auto.optout,
		helpMessage: auto.help,
		subscriberOptin: true,
		subscriberOptout: true,
		subscriberHelp: true,
		numberPool: false,
		directLending: false,
		embeddedLink: true,
		embeddedLinkSample: input.menuHost,
		embeddedPhone: false,
		ageGated: false,
		autoRenewal: true,
		termsAndConditions: true,
		privacyPolicyLink: PRIVACY_POLICY_URL,
		termsAndConditionsLink: TERMS_URL
	};
}

// ── Evidence must resolve before a reviewer clicks it ─────────────────────────

/**
 * Every URL a reviewer might click must answer 200 BEFORE the campaign is sent.
 * A dead evidence or embedded link was its own rejection reason on CW2K3CT.
 */
export async function checkUrlsResolve(
	urls: string[],
	fetcher: typeof fetch = fetch
): Promise<{ ok: boolean; dead: string[] }> {
	const dead: string[] = [];
	await Promise.all(
		urls.map(async (url) => {
			try {
				const res = await fetcher(url, { method: 'GET', redirect: 'follow' });
				if (!res.ok) dead.push(`${url} (${res.status})`);
			} catch {
				dead.push(`${url} (unreachable)`);
			}
		})
	);
	return { ok: dead.length === 0, dead };
}

// ── Client ───────────────────────────────────────────────────────────────────

const TELNYX_BASE = 'https://api.telnyx.com/v2';

export type BrandStatus = 'SELF_DECLARED' | 'VERIFIED' | 'VETTED_VERIFIED' | 'UNVERIFIED' | string;

export type TelnyxBrand = { brandId: string; identityStatus: BrandStatus; raw: unknown };
export type TelnyxCampaign = {
	campaignId: string;
	campaignStatus: string | null;
	submissionStatus: string | null;
	failureReasons: string | null;
	raw: unknown;
};

export class TelnyxError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: unknown
	) {
		super(message);
		this.name = 'TelnyxError';
	}
}

async function telnyx<T>(
	apiKey: string,
	method: 'GET' | 'POST',
	path: string,
	body: unknown,
	fetcher: typeof fetch
): Promise<T> {
	const res = await fetcher(`${TELNYX_BASE}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${apiKey}`,
			accept: 'application/json',
			...(body !== undefined ? { 'content-type': 'application/json' } : {})
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {})
	});
	const json = (await res.json().catch(() => null)) as unknown;
	if (!res.ok) {
		throw new TelnyxError(describeTelnyxFailure(json, res.status), res.status, json);
	}
	return json as T;
}

/** Telnyx returns `{ errors: [{ title, detail }] }` or, from the 10DLC service, a flat `{ message }`. */
export function describeTelnyxFailure(json: unknown, status: number): string {
	const j = json as { errors?: { title?: string; detail?: string }[]; message?: string; description?: string } | null;
	const first = j?.errors?.[0];
	if (first) return [first.title, first.detail].filter(Boolean).join(': ') || `Telnyx ${status}`;
	return j?.message ?? j?.description ?? `Telnyx ${status}`;
}

function brandFrom(raw: unknown): TelnyxBrand {
	const r = raw as { brandId?: string; identityStatus?: string };
	if (!r?.brandId) throw new Error('Telnyx returned no brandId');
	return { brandId: r.brandId, identityStatus: r.identityStatus ?? 'SELF_DECLARED', raw };
}

function campaignFrom(raw: unknown): TelnyxCampaign {
	const r = raw as {
		campaignId?: string;
		campaignStatus?: string;
		submissionStatus?: string;
		failureReasons?: string;
	};
	if (!r?.campaignId) throw new Error('Telnyx returned no campaignId');
	return {
		campaignId: r.campaignId,
		campaignStatus: r.campaignStatus ?? null,
		submissionStatus: r.submissionStatus ?? null,
		failureReasons: r.failureReasons ?? null,
		raw
	};
}

export async function createBrand(apiKey: string, request: BrandRequest, fetcher: typeof fetch = fetch): Promise<TelnyxBrand> {
	return brandFrom(await telnyx(apiKey, 'POST', '/10dlc/brand', request, fetcher));
}

export async function getBrand(apiKey: string, brandId: string, fetcher: typeof fetch = fetch): Promise<TelnyxBrand> {
	return brandFrom(await telnyx(apiKey, 'GET', `/10dlc/brand/${encodeURIComponent(brandId)}`, undefined, fetcher));
}

export async function submitCampaign(
	apiKey: string,
	request: CampaignRequest,
	fetcher: typeof fetch = fetch
): Promise<TelnyxCampaign> {
	return campaignFrom(await telnyx(apiKey, 'POST', '/10dlc/campaignBuilder', request, fetcher));
}

export async function getCampaign(apiKey: string, campaignId: string, fetcher: typeof fetch = fetch): Promise<TelnyxCampaign> {
	return campaignFrom(
		await telnyx(apiKey, 'GET', `/10dlc/campaignBuilder/${encodeURIComponent(campaignId)}`, undefined, fetcher)
	);
}

/** A brand may carry a campaign only once TCR has verified its identity. */
export function brandIsVerified(status: BrandStatus | null | undefined): boolean {
	return status === 'VERIFIED' || status === 'VETTED_VERIFIED';
}

/** Human reading of a campaign status for the admin table. */
export function campaignStatusLabel(status: string | null | undefined): { text: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
	if (!status) return { text: 'Not submitted', tone: 'muted' };
	if (status === 'MNO_PROVISIONED' || status === 'MNO_ACCEPTED') return { text: 'Approved', tone: 'success' };
	if (status.endsWith('_FAILED') || status.endsWith('_REJECTED') || status === 'TCR_SUSPENDED' || status === 'TCR_EXPIRED') {
		return { text: status.replace(/_/g, ' '), tone: 'danger' };
	}
	return { text: 'In review', tone: 'warning' };
}
