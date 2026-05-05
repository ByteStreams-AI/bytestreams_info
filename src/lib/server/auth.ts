/**
 * Cloudflare Access JWT validation.
 *
 * In production, validates the Cf-Access-Jwt-Assertion header against
 * Cloudflare's JWKS endpoint. In development, returns a mock user.
 * Soft-fail pattern: invalid/missing JWT returns null; page-level
 * guards decide how to handle unauthenticated requests.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { dev } from '$app/environment';
import type { User } from '$lib/types';

/** Cached JWKS instance — persists for the life of the Worker isolate. */
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedTeamDomain: string | null = null;

/**
 * Returns the Cloudflare Access JWKS set, creating it on first call.
 * jose handles key refresh automatically when a new key ID appears.
 *
 * @param teamDomain - The Cloudflare Access team domain.
 * @returns The JWKS set for token verification.
 */
function getJWKS(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
	if (!jwksCache || cachedTeamDomain !== teamDomain) {
		const jwksUrl = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
		jwksCache = createRemoteJWKSet(jwksUrl, {
			cooldownDuration: 10 * 60 * 1000,
			cacheMaxAge: 12 * 60 * 60 * 1000
		});
		cachedTeamDomain = teamDomain;
	}
	return jwksCache;
}

/**
 * Derives a display name from an email address.
 *
 * @param email - The user's email address.
 * @returns A capitalised display name from the email prefix.
 */
function deriveDisplayName(email: string): string {
	const prefix = email.split('@')[0] || '';
	return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

/**
 * Maps a verified JWT payload to a User object.
 *
 * @param payload - The verified JWT payload.
 * @returns The User, or null if required claims are missing.
 */
function mapPayloadToUser(payload: JWTPayload): User | null {
	const email = payload.email as string | undefined;
	const sub = payload.sub;
	if (!email || !sub) return null;

	return {
		email,
		sub,
		displayName: deriveDisplayName(email),
		iat: payload.iat ?? 0,
		exp: payload.exp ?? 0
	};
}

/**
 * Validates a Cloudflare Access JWT and extracts user claims.
 * Soft-fail: never throws on invalid token; returns null.
 *
 * @param token - The raw JWT string (header or cookie).
 * @param aud - The CF Access Application Audience tag.
 * @param teamDomain - The CF Access team domain.
 * @returns The authenticated User, or null if validation fails.
 */
export async function verifyAccessJwt(
	token: string | null | undefined,
	aud: string,
	teamDomain: string
): Promise<User | null> {
	if (!token) return null;

	try {
		const jwks = getJWKS(teamDomain);
		const { payload } = await jwtVerify(token, jwks, {
			issuer: `https://${teamDomain}`,
			audience: aud
		});
		return mapPayloadToUser(payload);
	} catch {
		return null;
	}
}

/**
 * Returns a mock user for local development.
 *
 * @returns A mock User for dev mode.
 */
export function getDevUser(): User {
	return {
		email: 'dev@bytestreams.ai',
		sub: 'dev-user-id',
		displayName: 'Dev',
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 3600
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
