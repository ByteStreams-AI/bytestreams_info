/**
 * Cloudflare Access JWT validation.
 *
 * In production, validates the Cf-Access-Jwt-Assertion header against
 * Cloudflare's JWKS endpoint. In development, returns a mock user from
 * environment variables.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { User } from '$lib/types';

/** Cached JWKS instance — avoids re-fetching on every request. */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Returns the Cloudflare Access JWKS set, creating it on first call.
 *
 * @returns The JWKS set for token verification.
 */
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
	if (!jwks) {
		const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
		if (!teamDomain) {
			throw new Error('CF_ACCESS_TEAM_DOMAIN is not configured');
		}
		const certsUrl = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
		jwks = createRemoteJWKSet(certsUrl);
	}
	return jwks;
}

/**
 * Validates a Cloudflare Access JWT and extracts user claims.
 *
 * @param token - The raw JWT string from the Cf-Access-Jwt-Assertion header.
 * @returns The authenticated User, or null if validation fails.
 */
export async function validateCFAccessToken(token: string): Promise<User | null> {
	try {
		const aud = env.CF_ACCESS_AUD;
		if (!aud) {
			console.error('[Auth] CF_ACCESS_AUD is not configured');
			return null;
		}

		const { payload } = await jwtVerify(token, getJWKS(), {
			audience: aud,
			issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}`
		});

		const email = payload.email as string | undefined;
		if (!email) {
			console.warn('[Auth] JWT missing email claim');
			return null;
		}

		return {
			email,
			firstName: (payload.given_name as string) || email.split('@')[0],
			lastName: (payload.family_name as string) || ''
		};
	} catch (err) {
		console.error('[Auth] JWT validation failed:', (err as Error).message);
		return null;
	}
}

/**
 * Returns a mock user for local development.
 *
 * @returns A mock User built from DEV_USER_* environment variables.
 */
export function getDevUser(): User {
	return {
		email: env.DEV_USER_EMAIL || 'dev@bytestreams.ai',
		firstName: env.DEV_USER_FIRST_NAME || 'Dev',
		lastName: env.DEV_USER_LAST_NAME || 'User'
	};
}

/**
 * Determines whether the current environment is development mode.
 *
 * @returns True if running in SvelteKit dev mode.
 */
export function isDevMode(): boolean {
	return dev;
}

/** Routes that do not require authentication. */
export const PUBLIC_PATHS = ['/login', '/health'];

/**
 * Checks whether a given pathname is a public (unauthenticated) route.
 *
 * @param pathname - The request URL pathname.
 * @returns True if the path does not require authentication.
 */
export function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
