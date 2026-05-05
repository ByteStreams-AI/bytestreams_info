import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	dev: false
}));

vi.mock('jose', () => ({
	createRemoteJWKSet: vi.fn(() => vi.fn()),
	jwtVerify: vi.fn()
}));

describe('auth edge cases', () => {
	it('verifyAccessJwt returns null for empty string token', async () => {
		const { verifyAccessJwt } = await import('$lib/server/auth');
		const result = await verifyAccessJwt('', 'aud', 'domain.com');
		expect(result).toBeNull();
	});

	it('isDevMode returns false in production', async () => {
		const { isDevMode } = await import('$lib/server/auth');
		expect(isDevMode()).toBe(false);
	});

	it('getDevUser returns hardcoded defaults', async () => {
		const { getDevUser } = await import('$lib/server/auth');
		const user = getDevUser();
		expect(user.email).toBe('dev@bytestreams.ai');
		expect(user.sub).toBe('dev-user-id');
		expect(user.displayName).toBe('Dev');
	});
});
