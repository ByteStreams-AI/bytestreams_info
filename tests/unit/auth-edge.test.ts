import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: false }));

const { mockPrivateEnv } = vi.hoisted(() => ({
	mockPrivateEnv: {
		DEV_USER_EMAIL: '',
		CF_ACCESS_AUD: ''
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockPrivateEnv
}));

import { verifyAccessJwt } from '$lib/server/auth';

function makeToken(payload: Record<string, unknown>): string {
	return `header.${btoa(JSON.stringify(payload))}.sig`;
}

const futureExp = Math.floor(Date.now() / 1000) + 3600;
describe('verifyAccessJwt edge cases', () => {
	it('returns null for null/undefined', () => {
		expect(verifyAccessJwt(null)).toBeNull();
		expect(verifyAccessJwt(undefined)).toBeNull();
	});

	it('returns null for expired token', () => {
		const token = makeToken({ email: 'a@b.com', sub: 'x', exp: 1000 });
		expect(verifyAccessJwt(token)).toBeNull();
	});

	it('returns user for valid token', () => {
		mockPrivateEnv.CF_ACCESS_AUD = '';
		const token = makeToken({ email: 'a@b.com', sub: 'x', exp: futureExp });
		expect(verifyAccessJwt(token)).not.toBeNull();
	});

	it('returns null for aud mismatch when CF_ACCESS_AUD is set', () => {
		mockPrivateEnv.CF_ACCESS_AUD = 'aud-expected';
		const token = makeToken({ email: 'a@b.com', sub: 'x', aud: 'aud-other', exp: futureExp });
		expect(verifyAccessJwt(token)).toBeNull();
	});

	it('returns user for aud match when CF_ACCESS_AUD is set', () => {
		mockPrivateEnv.CF_ACCESS_AUD = 'aud-expected';
		const token = makeToken({ email: 'a@b.com', sub: 'x', aud: 'aud-expected', exp: futureExp });
		expect(verifyAccessJwt(token)).not.toBeNull();
	});
});
