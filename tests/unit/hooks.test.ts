import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockDevMode = true;

const mockDevUser = {
	email: 'dev@bytestreams.ai',
	sub: 'dev-user-id',
	displayName: 'Dev',
	iat: 1700000000,
	exp: 1700003600
};

const mockProdUser = {
	email: 'scott@bytestreams.ai',
	sub: 'cf-user-123',
	displayName: 'Scott',
	iat: 1700000000,
	exp: 1700086400
};

vi.mock('$lib/server/auth', () => ({
	isDevMode: vi.fn(() => mockDevMode),
	getDevUser: vi.fn(() => mockDevUser),
	verifyAccessJwt: vi.fn()
}));

import { handle } from '$lib/../hooks.server';
import { verifyAccessJwt } from '$lib/server/auth';

function createMockEvent(pathname: string, options: { token?: string } = {}) {
	const headers = new Headers();
	if (options.token) {
		headers.set('cf-access-jwt-assertion', options.token);
	}

	const cookies = {
		get: vi.fn((): string | undefined => undefined)
	};

	return {
		url: new URL(`https://bytestreams.info${pathname}`),
		request: { headers },
		cookies,
		locals: {} as App.Locals
	};
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockResolve = vi.fn(async (_event: unknown) => new Response('OK'));

describe('hooks.server handle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDevMode = true;
		mockResolve.mockImplementation(async () => new Response('OK'));
	});

	describe('dev mode', () => {
		it('injects mock dev user for all routes', async () => {
			const event = createMockEvent('/');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toEqual(mockDevUser);
			expect(mockResolve).toHaveBeenCalled();
		});

		it('injects mock dev user for any path', async () => {
			const event = createMockEvent('/dashboard');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toEqual(mockDevUser);
		});

		it('skips JWT validation entirely in dev mode', async () => {
			const event = createMockEvent('/', { token: 'some-token' });
			await handle({ event: event as never, resolve: mockResolve });
			expect(verifyAccessJwt).not.toHaveBeenCalled();
		});
	});

	describe('production mode (soft-fail)', () => {
		beforeEach(() => {
			mockDevMode = false;
		});

		it('sets user to null when no token present', async () => {
			vi.mocked(verifyAccessJwt).mockReturnValueOnce(null);
			const event = createMockEvent('/');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toBeNull();
			expect(mockResolve).toHaveBeenCalled();
		});

		it('sets user to null when JWT validation fails', async () => {
			vi.mocked(verifyAccessJwt).mockReturnValueOnce(null);
			const event = createMockEvent('/', { token: 'invalid-token' });
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toBeNull();
		});

		it('sets user from valid JWT and resolves', async () => {
			vi.mocked(verifyAccessJwt).mockReturnValueOnce(mockProdUser);
			const event = createMockEvent('/', { token: 'valid-token' });
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toEqual(mockProdUser);
			expect(mockResolve).toHaveBeenCalled();
		});

		it('passes token to verifyAccessJwt', async () => {
			vi.mocked(verifyAccessJwt).mockReturnValueOnce(mockProdUser);
			const event = createMockEvent('/', { token: 'my-jwt-token' });
			await handle({ event: event as never, resolve: mockResolve });
			expect(verifyAccessJwt).toHaveBeenCalledWith('my-jwt-token');
		});

		it('falls back to CF_Authorization cookie when header missing', async () => {
			vi.mocked(verifyAccessJwt).mockReturnValueOnce(mockProdUser);
			const event = createMockEvent('/');
			event.cookies.get.mockReturnValueOnce('cookie-token');
			await handle({ event: event as never, resolve: mockResolve });
			expect(verifyAccessJwt).toHaveBeenCalledWith('cookie-token');
		});
	});
});
