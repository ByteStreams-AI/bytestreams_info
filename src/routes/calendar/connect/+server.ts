import { redirect, error } from '@sveltejs/kit';
import { buildAuthUrl } from '$lib/server/google-calendar';
import type { RequestHandler } from './$types';

/**
 * Starts the Google OAuth flow for the logged-in user. `?for=outreach` also asks for the
 * Gmail scopes and returns to /outreach afterwards.
 */
export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const state = crypto.randomUUID();
	cookies.set('gcal_oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});

	const forOutreach = url.searchParams.get('for') === 'outreach';
	cookies.set('gcal_oauth_return', forOutreach ? '/outreach' : '/calendar', {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});

	throw redirect(302, buildAuthUrl(state, forOutreach));
};
