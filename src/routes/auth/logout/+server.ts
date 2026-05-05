import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

/**
 * GET /auth/logout
 *
 * Clears the Cloudflare Access session cookie and redirects to login.
 * In dev mode, sets a logged_out cookie so the mock auth bypass
 * respects the signed-out state.
 */
export const GET: RequestHandler = async ({ cookies }) => {
	cookies.delete('CF_Authorization', { path: '/' });

	if (dev) {
		cookies.set('logged_out', '1', { path: '/', httpOnly: true, maxAge: 60 * 60 });
	}

	throw redirect(302, '/login');
};
