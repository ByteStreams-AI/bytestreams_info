import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { tick } from '$lib/server/outreach-run';
import { outreachDeps, outreachSettings, senderHasGmail } from '$lib/server/outreach-service';
import type { RequestHandler } from './$types';

/**
 * Called by the Worker cron (worker/index.js) from inside the Worker, never through
 * Cloudflare Access. The shared secret is the only way in.
 */
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.OUTREACH_CRON_SECRET?.trim();
	if (!secret || request.headers.get('x-outreach-cron') !== secret) throw error(404, 'Not found');

	const { settings, missing } = outreachSettings();
	if (!settings) return json({ ok: false, skipped: `Outreach is not configured: ${missing.join(', ')}` });
	if (!(await senderHasGmail(settings))) {
		return json({ ok: false, skipped: `${settings.senderAccount} has not granted Gmail access on the Outreach page.` });
	}

	const report = await tick(outreachDeps(settings), settings, new Date());
	if (report.planned || report.sent || report.failed || report.stopped.length) {
		console.log(JSON.stringify({ message: 'outreach tick', ...report }));
	}
	return json({ ok: true, ...report });
};
