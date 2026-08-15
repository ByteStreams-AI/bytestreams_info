import { redirect, error } from '@sveltejs/kit';
import { connectAccount } from '$lib/server/google-calendar';
import type { RequestHandler } from './$types';

/** Handles the redirect back from Google's consent screen. */
export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const state = url.searchParams.get('state');
	const savedState = cookies.get('gcal_oauth_state');
	cookies.delete('gcal_oauth_state', { path: '/' });

	if (!state || !savedState || state !== savedState) {
		throw error(400, 'Invalid OAuth state');
	}

	const googleError = url.searchParams.get('error');
	if (googleError) {
		throw redirect(302, `/calendar?gcal_error=${encodeURIComponent(googleError)}`);
	}

	const code = url.searchParams.get('code');
	if (!code) throw error(400, 'Missing authorization code');

	try {
		await connectAccount(locals.user.email, code);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Failed to connect Google Calendar';
		throw redirect(302, `/calendar?gcal_error=${encodeURIComponent(message)}`);
	}

	throw redirect(302, '/calendar');
};
