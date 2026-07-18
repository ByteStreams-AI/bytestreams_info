import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: false }));

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
		const token = makeToken({ email: 'a@b.com', sub: 'x', exp: futureExp });
		expect(verifyAccessJwt(token)).not.toBeNull();
	});
});
