import { redirect, error } from '@sveltejs/kit';
import { disconnectAccount } from '$lib/server/google-calendar';
import type { RequestHandler } from './$types';

/** Disconnects the logged-in user's Google Calendar (removes stored tokens). */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	await disconnectAccount(locals.user.email);
	throw redirect(302, '/calendar');
};
