import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SvelteKit modules before importing auth
vi.mock('$app/environment', () => ({
	dev: true
}));

vi.mock('jose', () => ({
	createRemoteJWKSet: vi.fn(() => vi.fn()),
	jwtVerify: vi.fn()
}));

import { isPublicPath, PUBLIC_PATHS, getDevUser, isDevMode, verifyAccessJwt } from '$lib/server/auth';
import { jwtVerify } from 'jose';

const TEST_AUD = 'test-audience-tag';
const TEST_DOMAIN = 'bytestreamsai.cloudflareaccess.com';

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
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns null for null/undefined token', async () => {
		expect(await verifyAccessJwt(null, TEST_AUD, TEST_DOMAIN)).toBeNull();
		expect(await verifyAccessJwt(undefined, TEST_AUD, TEST_DOMAIN)).toBeNull();
	});

	it('returns user when JWT is valid', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: {
				email: 'scott@bytestreams.ai',
				sub: 'cf-user-123',
				iat: 1700000000,
				exp: 1700086400
			},
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await verifyAccessJwt('valid-token', TEST_AUD, TEST_DOMAIN);
		expect(user).toEqual({
			email: 'scott@bytestreams.ai',
			sub: 'cf-user-123',
			displayName: 'Scott',
			iat: 1700000000,
			exp: 1700086400
		});
	});

	it('derives displayName from email prefix with capitalisation', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: {
				email: 'jane@bytestreams.ai',
				sub: 'cf-user-456',
				iat: 1700000000,
				exp: 1700086400
			},
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await verifyAccessJwt('valid-token', TEST_AUD, TEST_DOMAIN);
		expect(user?.displayName).toBe('Jane');
	});

	it('returns null when JWT has no email claim', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: { sub: 'no-email' },
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await verifyAccessJwt('token-no-email', TEST_AUD, TEST_DOMAIN);
		expect(user).toBeNull();
	});

	it('returns null when JWT has no sub claim', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: { email: 'test@bytestreams.ai' },
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await verifyAccessJwt('token-no-sub', TEST_AUD, TEST_DOMAIN);
		expect(user).toBeNull();
	});

	it('returns null when JWT verification throws', async () => {
		vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('Invalid signature'));

		const user = await verifyAccessJwt('bad-token', TEST_AUD, TEST_DOMAIN);
		expect(user).toBeNull();
	});

	it('calls jwtVerify with correct issuer and audience', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: { email: 'test@bytestreams.ai', sub: 'cf-user-789' },
			protectedHeader: { alg: 'RS256' }
		} as never);

		await verifyAccessJwt('test-token', TEST_AUD, TEST_DOMAIN);

		expect(jwtVerify).toHaveBeenCalledWith(
			'test-token',
			expect.any(Function),
			{
				issuer: `https://${TEST_DOMAIN}`,
				audience: TEST_AUD
			}
		);
	});

	it('defaults iat/exp to 0 when missing from payload', async () => {
		vi.mocked(jwtVerify).mockResolvedValueOnce({
			payload: { email: 'test@bytestreams.ai', sub: 'cf-user' },
			protectedHeader: { alg: 'RS256' }
		} as never);

		const user = await verifyAccessJwt('test-token', TEST_AUD, TEST_DOMAIN);
		expect(user?.iat).toBe(0);
		expect(user?.exp).toBe(0);
	});
});
