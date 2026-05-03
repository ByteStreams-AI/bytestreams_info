/**
 * SvelteKit server hooks — authentication middleware.
 *
 * Intercepts every request to validate Cloudflare Access JWT.
 * Public routes (/login, /health) are excluded from auth checks.
 * In dev mode, a mock user is injected automatically.
 */

import { redirect, type Handle } from '@sveltejs/kit';
import { validateCFAccessToken, getDevUser, isDevMode, isPublicPath } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Skip auth for public routes
	if (isPublicPath(pathname)) {
		event.locals.user = null;

		// In dev mode, still populate user for public pages that check auth
		if (isDevMode()) {
			event.locals.user = getDevUser();
		}

		return resolve(event);
	}

	// --- Development: mock auth bypass ---
	if (isDevMode()) {
		event.locals.user = getDevUser();
		return resolve(event);
	}

	// --- Production: validate Cloudflare Access JWT ---
	const token = event.request.headers.get('cf-access-jwt-assertion');

	if (!token) {
		throw redirect(302, '/login');
	}

	const user = await validateCFAccessToken(token);

	if (!user) {
		throw redirect(302, '/login');
	}

	event.locals.user = user;
	return resolve(event);
};
