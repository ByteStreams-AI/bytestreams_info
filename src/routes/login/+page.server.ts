import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

/**
 * Login page server load.
 *
 * Redirects authenticated users to the dashboard.
 * In dev mode, clears the logged_out cookie so clicking
 * "Sign in with Google" restores the mock user session.
 * In production, passes the Cloudflare Access login URL so the
 * button initiates the SSO flow rather than looping back to /.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}

	if (dev) {
		cookies.delete('logged_out', { path: '/' });
		return { loginUrl: '/' };
	}

	return { loginUrl: '/cdn-cgi/access/login?redirect_url=/' };
};
