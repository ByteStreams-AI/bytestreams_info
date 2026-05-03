import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /auth/logout
 *
 * Clears the Cloudflare Access session cookie and redirects to login.
 */
export const GET: RequestHandler = async ({ cookies }) => {
	// Clear the Cloudflare Access authorization cookie
	cookies.delete('CF_Authorization', { path: '/' });

	throw redirect(302, '/login');
};
