import { describe, expect, it, vi } from 'vitest';
import { researchRestaurantWebsite, validateResearchUrl } from '$lib/server/restaurant-research';

describe('validateResearchUrl', () => {
	it.each([
		'http://127.0.0.1/admin',
		'http://[::1]/admin',
		'http://localhost/admin',
		'http://restaurant.local/admin',
		'ftp://example.com/menu',
		'https://user:password@example.com',
		'https://example.com:8443'
	])('rejects unsafe URL %s', (url) => {
		expect(() => validateResearchUrl(url)).toThrow();
	});

	it('accepts a public website URL', () => {
		expect(validateResearchUrl('https://restaurant.example/menu#lunch').toString())
			.toBe('https://restaurant.example/menu');
	});
});

describe('researchRestaurantWebsite', () => {
	it('extracts deduplicated social profiles and ordering links with provenance', async () => {
		const html = `<!doctype html><html><head><title> Sample Kitchen </title></head><body>
			<a href="https://www.instagram.com/samplekitchen/?utm_source=site">Instagram</a>
			<a href="https://instagram.com/samplekitchen/">Instagram again</a>
			<a href="https://www.facebook.com/samplekitchen/">Facebook</a>
			<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
			<a href="https://www.tiktok.com/@samplekitchen">TikTok</a>
			<a href="https://x.com/samplekitchen">X</a>
			<a href="https://www.youtube.com/@samplekitchen/videos">YouTube</a>
			<a href="https://www.linkedin.com/company/sample-kitchen">LinkedIn</a>
			<a href="https://order.toasttab.com/online/sample-kitchen">Order</a>
		</body></html>`;
		const fetcher = vi.fn().mockResolvedValue(new Response(html, {
			status: 200,
			headers: { 'content-type': 'text/html; charset=utf-8' }
		}));

		const result = await researchRestaurantWebsite('https://sample.example', fetcher);

		expect(result.pageTitle).toBe('Sample Kitchen');
		expect(result.sourceUrl).toBe('https://sample.example/');
		expect(result.findings).toEqual(expect.arrayContaining([
			expect.objectContaining({ category: 'social_instagram', value: 'https://instagram.com/samplekitchen' }),
			expect.objectContaining({ category: 'social_facebook', value: 'https://facebook.com/samplekitchen' }),
			expect.objectContaining({ category: 'social_tiktok', value: 'https://tiktok.com/@samplekitchen' }),
			expect.objectContaining({ category: 'social_x', value: 'https://x.com/samplekitchen' }),
			expect.objectContaining({ category: 'social_youtube', value: 'https://youtube.com/@samplekitchen/videos' }),
			expect.objectContaining({ category: 'social_linkedin', value: 'https://linkedin.com/company/sample-kitchen' }),
			expect.objectContaining({ category: 'online_ordering_url', value: 'https://order.toasttab.com/online/sample-kitchen' })
		]));
		expect(result.findings.filter((finding) => finding.category === 'social_instagram')).toHaveLength(1);
		expect(result.findings.every((finding) => finding.sourceUrl === 'https://sample.example/')).toBe(true);
	});

	it('extracts app, public email, and verified POS usage from official website links', async () => {
		const html = `<html><body>
			<a href="https://apps.apple.com/us/app/sample-kitchen/id123456789?campaign=website">iPhone app</a>
			<a href="https://play.google.com/store/apps/details?id=com.sample.kitchen&utm_source=website">Android app</a>
			<a href="mailto:Hello@SampleKitchen.com?subject=Reservation">Email us</a>
			<a href="https://order.toasttab.com/online/sample-kitchen?utm_source=website">Order with Toast</a>
			<a href="https://www.doordash.com/store/sample-kitchen">DoorDash</a>
		</body></html>`;
		const fetcher = vi.fn().mockResolvedValue(new Response(html, {
			status: 200,
			headers: { 'content-type': 'text/html' }
		}));

		const result = await researchRestaurantWebsite('https://sample.example', fetcher);

		expect(result.findings).toEqual(expect.arrayContaining([
			expect.objectContaining({
				category: 'branded_app_ios',
				value: 'https://apps.apple.com/us/app/sample-kitchen/id123456789'
			}),
			expect.objectContaining({
				category: 'branded_app_android',
				value: 'https://play.google.com/store/apps/details?id=com.sample.kitchen'
			}),
			expect.objectContaining({
				category: 'public_business_email',
				value: 'mailto:hello@samplekitchen.com'
			}),
			expect.objectContaining({
				category: 'pos_toast_verified_usage',
				value: 'https://order.toasttab.com/online/sample-kitchen'
			})
		]));
		expect(result.findings.some((finding) => finding.category === 'pos_doordash_verified_usage')).toBe(false);
	});

	it('validates redirects before following them', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(null, {
			status: 302,
			headers: { location: 'http://127.0.0.1/private' }
		}));

		await expect(researchRestaurantWebsite('https://sample.example', fetcher))
			.rejects.toThrow('public hostname');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('follows a validated redirect', async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce(new Response(null, {
				status: 302,
				headers: { location: '/menu' }
			}))
			.mockResolvedValueOnce(new Response('<html><title>Menu</title></html>', {
				status: 200,
				headers: { 'content-type': 'text/html' }
			}));

		const result = await researchRestaurantWebsite('https://sample.example', fetcher);

		expect(result.pageTitle).toBe('Menu');
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls[1][0].toString()).toBe('https://sample.example/menu');
	});

	it('rejects redirects without a destination', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));

		await expect(researchRestaurantWebsite('https://sample.example', fetcher))
			.rejects.toThrow('invalid redirect');
	});

	it('rejects non-HTML and empty responses', async () => {
		const nonHtmlFetcher = vi.fn().mockResolvedValue(new Response('{}', {
			status: 200,
			headers: { 'content-type': 'application/json' }
		}));
		const emptyFetcher = vi.fn().mockResolvedValue(new Response(null, {
			status: 200,
			headers: { 'content-type': 'text/html' }
		}));

		await expect(researchRestaurantWebsite('https://sample.example', nonHtmlFetcher))
			.rejects.toThrow('did not return HTML');
		await expect(researchRestaurantWebsite('https://sample.example', emptyFetcher))
			.rejects.toThrow('empty response');
	});

	it('ignores share links, social home pages, and invalid email links', async () => {
		const html = `<html><body>
			<a href="https://facebook.com/sharer/sharer.php?u=x">Share</a>
			<a href="https://x.com/intent/post">Post</a>
			<a href="https://instagram.com/">Instagram</a>
			<a href="mailto:not-an-email">Email</a>
		</body></html>`;
		const fetcher = vi.fn().mockResolvedValue(new Response(html, {
			status: 200,
			headers: { 'content-type': 'text/html' }
		}));

		const result = await researchRestaurantWebsite('https://sample.example', fetcher);

		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].category).toBe('official_website');
	});

	it('rejects oversized responses before reading the body', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('<html></html>', {
			status: 200,
			headers: {
				'content-type': 'text/html',
				'content-length': String(2 * 1024 * 1024 + 1)
			}
		}));

		await expect(researchRestaurantWebsite('https://sample.example', fetcher))
			.rejects.toThrow('too large');
	});

	it('applies a timeout signal to outbound requests', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('<html></html>', {
			status: 200,
			headers: { 'content-type': 'text/html' }
		}));

		await researchRestaurantWebsite('https://sample.example', fetcher);

		expect(fetcher).toHaveBeenCalledWith(
			expect.any(URL),
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});
});