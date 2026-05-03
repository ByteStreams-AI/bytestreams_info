import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	dev: false
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		CF_ACCESS_TEAM_DOMAIN: '',
		CF_ACCESS_AUD: 'test-aud',
		DEV_USER_EMAIL: '',
		DEV_USER_FIRST_NAME: '',
		DEV_USER_LAST_NAME: ''
	}
}));

vi.mock('jose', () => ({
	createRemoteJWKSet: vi.fn(() => vi.fn()),
	jwtVerify: vi.fn()
}));

describe('auth edge cases — missing team domain', () => {
	it('validateCFAccessToken returns null when team domain is empty', async () => {
		const { validateCFAccessToken } = await import('$lib/server/auth');
		const result = await validateCFAccessToken('some-token');
		expect(result).toBeNull();
	});

	it('isDevMode returns false in production', async () => {
		const { isDevMode } = await import('$lib/server/auth');
		expect(isDevMode()).toBe(false);
	});

	it('getDevUser falls back to defaults when env vars are empty', async () => {
		const { getDevUser } = await import('$lib/server/auth');
		const user = getDevUser();
		expect(user.email).toBe('dev@bytestreams.ai');
		expect(user.firstName).toBe('Dev');
		expect(user.lastName).toBe('User');
	});
});
