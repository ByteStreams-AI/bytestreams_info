/**
 * SvelteKit server hooks — authentication middleware.
 *
 * Intercepts every request to validate Cloudflare Access JWT.
 * Soft-fail: sets locals.user to null if unauthenticated.
 * Page-level guards handle redirects for protected routes.
 * In dev mode, a mock user is injected automatically.
 */

import type { Handle } from '@sveltejs/kit';
import { verifyAccessJwt, getDevUser, isDevMode } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// --- Development: mock auth bypass ---
	if (isDevMode()) {
		if (event.cookies.get('logged_out')) {
			event.locals.user = null;
		} else {
			event.locals.user = getDevUser();
		}
		return resolve(event);
	}

	// --- Production: validate Cloudflare Access JWT ---
	// Header is preferred; fall back to CF_Authorization cookie.
	const token =
		event.request.headers.get('cf-access-jwt-assertion') ??
		event.cookies.get('CF_Authorization') ??
		null;

	const aud = event.platform?.env.CF_ACCESS_AUD;
	const teamDomain = event.platform?.env.CF_ACCESS_TEAM_DOMAIN;

	if (aud && teamDomain) {
		event.locals.user = await verifyAccessJwt(token, aud, teamDomain);
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};
