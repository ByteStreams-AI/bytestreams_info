import { redirect, error } from '@sveltejs/kit';
import { buildAuthUrl } from '$lib/server/google-calendar';
import type { RequestHandler } from './$types';

/** Starts the Google Calendar OAuth flow for the logged-in user. */
export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const state = crypto.randomUUID();
	cookies.set('gcal_oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});

	throw redirect(302, buildAuthUrl(state));
};
