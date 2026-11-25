/**
 * Worker entry: the SvelteKit app plus a cron for outreach.
 *
 * SvelteKit's Cloudflare build only exports `fetch`. The cron calls the app's own
 * /internal/outreach/tick route from inside the Worker (it never passes through
 * Cloudflare Access), authenticated with OUTREACH_CRON_SECRET.
 */

import app from '../.svelte-kit/cloudflare/_worker.js';

export default {
	fetch: (request, env, ctx) => app.fetch(request, env, ctx),

	async scheduled(_controller, env, ctx) {
		if (!env.OUTREACH_CRON_SECRET) return;
		const request = new Request('https://bytestreams.info/internal/outreach/tick', {
			method: 'POST',
			headers: { 'x-outreach-cron': env.OUTREACH_CRON_SECRET }
		});
		const response = await app.fetch(request, env, ctx);
		if (!response.ok) console.error(`outreach tick failed: HTTP ${response.status} ${await response.text()}`);
	}
};
