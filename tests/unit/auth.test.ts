import { describe, it, expect, vi } from 'vitest';

// Mock SvelteKit modules before importing auth
vi.mock('$app/environment', () => ({
	dev: true
}));

import { isPublicPath, PUBLIC_PATHS, getDevUser, isDevMode, verifyAccessJwt } from '$lib/server/auth';

/** Creates a fake JWT with the given payload (no real signature). */
function makeToken(payload: Record<string, unknown>): string {
	return `header.${btoa(JSON.stringify(payload))}.sig`;
}

const futureExp = Math.floor(Date.now() / 1000) + 3600;

describe('isPublicPath', () => {
	it('returns true for /login', () => {
		expect(isPublicPath('/login')).toBe(true);
	});

	it('returns true for /login/ sub-paths', () => {
		expect(isPublicPath('/login/callback')).toBe(true);
	});

	it('returns true for /health', () => {
		expect(isPublicPath('/health')).toBe(true);
	});

	it('returns false for /', () => {
		expect(isPublicPath('/')).toBe(false);
	});

	it('returns false for /dashboard', () => {
		expect(isPublicPath('/dashboard')).toBe(false);
	});

	it('returns false for /auth/logout', () => {
		expect(isPublicPath('/auth/logout')).toBe(false);
	});

	it('returns false for /login-extra (not a sub-path)', () => {
		expect(isPublicPath('/login-extra')).toBe(false);
	});
});

describe('PUBLIC_PATHS', () => {
	it('contains /login and /health', () => {
		expect(PUBLIC_PATHS).toContain('/login');
		expect(PUBLIC_PATHS).toContain('/health');
	});

	it('has exactly 2 entries', () => {
		expect(PUBLIC_PATHS).toHaveLength(2);
	});
});

describe('getDevUser', () => {
	it('returns mock user with required fields', () => {
		const user = getDevUser();
		expect(user).toMatchObject({
			email: 'dev@bytestreams.ai',
			sub: 'dev-user-id',
			displayName: 'Dev'
		});
	});

	it('returns object with all User fields', () => {
		const user = getDevUser();
		expect(user).toHaveProperty('email');
		expect(user).toHaveProperty('sub');
		expect(user).toHaveProperty('displayName');
		expect(user).toHaveProperty('iat');
		expect(user).toHaveProperty('exp');
	});

	it('sets exp in the future', () => {
		const user = getDevUser();
		expect(user.exp).toBeGreaterThan(user.iat);
	});
});

describe('isDevMode', () => {
	it('returns true when $app/environment.dev is true', () => {
		expect(isDevMode()).toBe(true);
	});
});

describe('verifyAccessJwt', () => {
	it('returns null for null token', () => {
		expect(verifyAccessJwt(null)).toBeNull();
	});

	it('returns null for undefined token', () => {
		expect(verifyAccessJwt(undefined)).toBeNull();
	});

	it('returns null for malformed token (not 3 parts)', () => {
		expect(verifyAccessJwt('not-a-jwt')).toBeNull();
	});

	it('returns user when JWT has valid claims', () => {
		const token = makeToken({ email: 'scott@bytestreams.ai', sub: 'cf-user-123', iat: 1700000000, exp: futureExp });
		const user = verifyAccessJwt(token);
		expect(user).toEqual({
			email: 'scott@bytestreams.ai',
			sub: 'cf-user-123',
			displayName: 'Scott',
			iat: 1700000000,
			exp: futureExp
		});
	});

	it('derives displayName from email prefix with capitalisation', () => {
		const token = makeToken({ email: 'jane@bytestreams.ai', sub: 'cf-user-456', iat: 0, exp: futureExp });
		const user = verifyAccessJwt(token);
		expect(user?.displayName).toBe('Jane');
	});

	it('returns null when JWT has no email claim', () => {
		const token = makeToken({ sub: 'no-email', exp: futureExp });
		expect(verifyAccessJwt(token)).toBeNull();
	});

	it('returns null when JWT has no sub claim', () => {
		const token = makeToken({ email: 'test@bytestreams.ai', exp: futureExp });
		expect(verifyAccessJwt(token)).toBeNull();
	});

	it('returns null when token is expired', () => {
		const token = makeToken({ email: 'test@bytestreams.ai', sub: 'user', exp: 1000 });
		expect(verifyAccessJwt(token)).toBeNull();
	});

	it('defaults iat to 0 when missing from payload', () => {
		const token = makeToken({ email: 'test@bytestreams.ai', sub: 'cf-user', exp: futureExp });
		const user = verifyAccessJwt(token);
		expect(user?.iat).toBe(0);
	});

	it('defaults exp to 0 when missing (no expiry check)', () => {
		const token = makeToken({ email: 'test@bytestreams.ai', sub: 'cf-user' });
		const user = verifyAccessJwt(token);
		expect(user?.exp).toBe(0);
	});
});
