import { Parser } from 'htmlparser2';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

const SOCIAL_HOSTS: Record<string, string> = {
	'facebook.com': 'facebook',
	'instagram.com': 'instagram',
	'tiktok.com': 'tiktok',
	'twitter.com': 'x',
	'x.com': 'x',
	'youtube.com': 'youtube',
	'youtu.be': 'youtube',
	'linkedin.com': 'linkedin'
};

const ORDERING_HOSTS = new Set([
	'chownow.com',
	'clover.com',
	'doordash.com',
	'grubhub.com',
	'order.online',
	'square.site',
	'toasttab.com',
	'ubereats.com'
]);

export interface ResearchFindingDraft {
	category: string;
	value: string;
	sourceUrl: string;
	confidence: number;
}

export interface RestaurantResearchResult {
	sourceUrl: string;
	pageTitle: string | null;
	findings: ResearchFindingDraft[];
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function normalizedHostname(url: URL): string {
	return url.hostname.toLowerCase().replace(/^www\./, '');
}

function matchesHost(hostname: string, approvedHost: string): boolean {
	return hostname === approvedHost || hostname.endsWith(`.${approvedHost}`);
}

function isIpLiteral(hostname: string): boolean {
	return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

export function validateResearchUrl(input: string | URL): URL {
	const url = input instanceof URL ? new URL(input) : new URL(input);
	const hostname = url.hostname.toLowerCase();

	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('Research URLs must use HTTP or HTTPS.');
	}
	if (url.username || url.password) throw new Error('Research URLs cannot contain credentials.');
	if (url.port && !['80', '443'].includes(url.port)) {
		throw new Error('Research URLs must use a standard web port.');
	}
	if (
		!hostname ||
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		isIpLiteral(hostname)
	) {
		throw new Error('Research URLs must use a public hostname.');
	}

	url.hash = '';
	return url;
}

function socialPlatform(url: URL): string | null {
	const platform = SOCIAL_HOSTS[normalizedHostname(url)];
	if (!platform) return null;

	const path = url.pathname.replace(/\/+$/, '');
	if (!path) return null;
	if (platform === 'facebook' && /^\/(share|sharer|dialog)(\/|$)/i.test(path)) return null;
	if (platform === 'x' && /^\/(home|intent|share|search)(\/|$)/i.test(path)) return null;
	if (platform === 'youtube' && !/^\/(?:@|channel\/|c\/|user\/)/i.test(path)) return null;
	if (platform === 'linkedin' && !/^\/(?:company|in)\//i.test(path)) return null;

	return platform;
}

function normalizeExternalUrl(url: URL): string {
	url.hash = '';
	url.search = '';
	url.hostname = normalizedHostname(url);
	url.pathname = url.pathname.replace(/\/+$/, '') || '/';
	return url.toString();
}

function deduplicateFindings(findings: ResearchFindingDraft[]): ResearchFindingDraft[] {
	const seen = new Set<string>();
	return findings.filter((finding) => {
		const key = `${finding.category}\0${finding.value}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function fetchPage(url: URL, fetcher: Fetch): Promise<Response> {
	let currentUrl = url;

	for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
		const response = await fetcher(currentUrl, {
			headers: { accept: 'text/html,application/xhtml+xml' },
			redirect: 'manual',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});

		if (response.status < 300 || response.status >= 400) return response;

		const location = response.headers.get('location');
		if (!location) throw new Error('The restaurant website returned an invalid redirect.');
		if (redirectCount === MAX_REDIRECTS) throw new Error('The restaurant website redirected too many times.');
		currentUrl = validateResearchUrl(new URL(location, currentUrl));
	}

	throw new Error('The restaurant website redirected too many times.');
}

export async function researchRestaurantWebsite(
	websiteUrl: string,
	fetcher: Fetch = fetch
): Promise<RestaurantResearchResult> {
	const requestedUrl = validateResearchUrl(websiteUrl);
	const response = await fetchPage(requestedUrl, fetcher);
	if (!response.ok) throw new Error(`The restaurant website returned HTTP ${response.status}.`);

	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
		throw new Error('The restaurant website did not return HTML.');
	}

	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
		throw new Error('The restaurant website response is too large to research safely.');
	}
	if (!response.body) throw new Error('The restaurant website returned an empty response.');

	const finalUrl = validateResearchUrl(response.url || requestedUrl);
	const links: URL[] = [];
	let pageTitle = '';
	let insideTitle = false;
	const parser = new Parser({
		onopentag(name, attributes) {
			if (name === 'title') insideTitle = true;
			if (name !== 'a' || !attributes.href) return;
			try {
				links.push(new URL(attributes.href, finalUrl));
			} catch {
				// Ignore malformed links from the source page.
			}
		},
		ontext(text) {
			if (insideTitle) pageTitle += text;
		},
		onclosetag(name) {
			if (name === 'title') insideTitle = false;
		}
	});

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytesRead = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytesRead += value.byteLength;
		if (bytesRead > MAX_RESPONSE_BYTES) {
			await reader.cancel();
			throw new Error('The restaurant website response is too large to research safely.');
		}
		parser.write(decoder.decode(value, { stream: true }));
	}
	parser.end(decoder.decode());

	const sourceUrl = finalUrl.toString();
	const findings: ResearchFindingDraft[] = [{
		category: 'official_website',
		value: sourceUrl,
		sourceUrl,
		confidence: 1
	}];

	for (const link of links) {
		if (!['http:', 'https:'].includes(link.protocol)) continue;
		const platform = socialPlatform(link);
		if (platform) {
			findings.push({
				category: `social_${platform}`,
				value: normalizeExternalUrl(link),
				sourceUrl,
				confidence: 0.95
			});
			continue;
		}

		if ([...ORDERING_HOSTS].some((host) => matchesHost(normalizedHostname(link), host))) {
			findings.push({
				category: 'online_ordering_url',
				value: normalizeExternalUrl(link),
				sourceUrl,
				confidence: 0.9
			});
		}
	}

	return {
		sourceUrl,
		pageTitle: pageTitle.trim().replace(/\s+/g, ' ') || null,
		findings: deduplicateFindings(findings)
	};
}