import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SvelteKit modules before importing auth
vi.mock('$app/environment', () => ({
	dev: true
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		CF_ACCESS_TEAM_DOMAIN: 'bytestreams.cloudflareaccess.com',
		CF_ACCESS_AUD: 'test-audience-tag',
		DEV_USER_EMAIL: 'test@bytestreams.ai',
		DEV_USER_FIRST_NAME: 'Test',
		DEV_USER_LAST_NAME: 'User'
	}
}));

vi.mock('jose', () => ({
	createRemoteJWKSet: vi.fn(() => vi.fn()),
	jwtVerify: vi.fn()
}));

import { isPublicPath, PUBLIC_PATHS, getDevUser, isDevMode, validateCFAccessToken } from '$lib/server/auth';
import { jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

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
	it('returns user from environment variables', () => {
		const user = getDevUser();
		expect(user).toEqual({
			email: 'test@bytestreams.ai',
			firstName: 'Test',
			lastName: 'User'
		});
	});

	it('returns object with required User fields', () => {
		const user = getDevUser();
		expect(user).toHaveProperty('email');
		expect(user).toHaveProperty('firstName');
		expect(user).toHaveProperty('lastName');
	});
});

describe('isDevMode', () => {
	it('returns true when $app/environment.dev is true', () => {
		expect(isDevMode()).toBe(true);
	});
});

describe('validateCFAccessToken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns user when JWT is valid with all claims', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: {
				email: 'scott@bytestreams.ai',
				given_name: 'Scott',
				family_name: 'Thornton'
			},
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await validateCFAccessToken('valid-token');
		expect(user).toEqual({
			email: 'scott@bytestreams.ai',
			firstName: 'Scott',
			lastName: 'Thornton'
		});
	});

	it('falls back to email prefix for missing given_name', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: { email: 'scott@bytestreams.ai' },
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await validateCFAccessToken('valid-token');
		expect(user?.firstName).toBe('scott');
		expect(user?.lastName).toBe('');
	});

	it('returns null when JWT has no email claim', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: { sub: 'no-email' },
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await validateCFAccessToken('token-no-email');
		expect(user).toBeNull();
	});

	it('returns null when JWT verification throws', async () => {
		vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Invalid signature'));

		const user = await validateCFAccessToken('bad-token');
		expect(user).toBeNull();
	});

	it('calls jwtVerify with correct audience and issuer', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: { email: 'test@bytestreams.ai' },
			protectedHeader: { alg: 'RS256' }
		} as never);

		await validateCFAccessToken('test-token');

		expect(jwtVerify).toHaveBeenCalledWith(
			'test-token',
			expect.any(Function),
			{
				audience: 'test-audience-tag',
				issuer: 'https://bytestreams.cloudflareaccess.com'
			}
		);
	});

	it('returns null when CF_ACCESS_AUD is not configured', async () => {
		const savedAud = env.CF_ACCESS_AUD;
		(env as Record<string, string>).CF_ACCESS_AUD = '';

		const user = await validateCFAccessToken('some-token');
		expect(user).toBeNull();

		(env as Record<string, string>).CF_ACCESS_AUD = savedAud!;
	});
});
