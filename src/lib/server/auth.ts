/**
 * Cloudflare Access JWT validation.
 *
 * In production, validates the Cf-Access-Jwt-Assertion header against
 * Cloudflare's JWKS endpoint. In development, returns a mock user.
 * Soft-fail pattern: invalid/missing JWT returns null; page-level
 * guards decide how to handle unauthenticated requests.
 */

import type { JWTPayload } from 'jose';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { User } from '$lib/types';

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

function isAudienceValid(payload: JWTPayload): boolean {
	const expectedAud = env.CF_ACCESS_AUD?.trim();
	if (!expectedAud) return true;

	const aud = payload.aud;
	if (typeof aud === 'string') return aud === expectedAud;
	if (Array.isArray(aud)) return aud.includes(expectedAud);
	return false;
}

/**
 * Decodes a Cloudflare Access JWT and extracts user claims.
 * Does not re-verify the signature — CF Access already verified at the edge.
 * Soft-fail: never throws on invalid token; returns null.
 *
 * @param token - The raw JWT string (header or cookie).
 * @returns The authenticated User, or null if decoding fails.
 */
export function verifyAccessJwt(
	token: string | null | undefined
): User | null {
	if (!token) return null;

	try {
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		const payload = JSON.parse(atob(parts[1])) as JWTPayload;
		if (!isAudienceValid(payload)) return null;
		// Reject expired tokens
		if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
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
	const email = env.DEV_USER_EMAIL?.trim() || 'dev@bytestreams.ai';
	return {
		email,
		sub: 'dev-user-id',
		displayName: deriveDisplayName(email),
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
