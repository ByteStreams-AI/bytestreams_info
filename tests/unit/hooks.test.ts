import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track which mock dev mode returns — toggled per test
let mockDevMode = true;

const mockDevUser = {
	email: 'dev@bytestreams.ai',
	firstName: 'Dev',
	lastName: 'User'
};

const mockProdUser = {
	email: 'scott@bytestreams.ai',
	firstName: 'Scott',
	lastName: 'Thornton'
};

vi.mock('$lib/server/auth', () => ({
	isPublicPath: vi.fn((path: string) => path === '/login' || path === '/health' || path.startsWith('/login/')),
	isDevMode: vi.fn(() => mockDevMode),
	getDevUser: vi.fn(() => mockDevUser),
	validateCFAccessToken: vi.fn()
}));

vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn((status: number, location: string) => {
		throw { status, location, __isRedirect: true };
	})
}));

import { handle } from '$lib/../hooks.server';
import { validateCFAccessToken } from '$lib/server/auth';

/**
 * Creates a mock SvelteKit RequestEvent.
 */
function createMockEvent(pathname: string, token?: string) {
	const headers = new Headers();
	if (token) {
		headers.set('cf-access-jwt-assertion', token);
	}
	return {
		url: new URL(`https://bytestreams.info${pathname}`),
		request: { headers },
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

	describe('public routes', () => {
		it('allows /login without authentication', async () => {
			const event = createMockEvent('/login');
			await handle({ event: event as never, resolve: mockResolve });
			expect(mockResolve).toHaveBeenCalled();
		});

		it('allows /health without authentication', async () => {
			const event = createMockEvent('/health');
			await handle({ event: event as never, resolve: mockResolve });
			expect(mockResolve).toHaveBeenCalled();
		});

		it('populates user on public routes in dev mode', async () => {
			const event = createMockEvent('/login');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toEqual(mockDevUser);
		});

		it('sets user to null on public routes in prod mode', async () => {
			mockDevMode = false;
			const event = createMockEvent('/login');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toBeNull();
		});
	});

	describe('dev mode', () => {
		it('injects mock dev user for protected routes', async () => {
			const event = createMockEvent('/');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toEqual(mockDevUser);
			expect(mockResolve).toHaveBeenCalled();
		});

		it('injects mock dev user for any protected path', async () => {
			const event = createMockEvent('/dashboard');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toEqual(mockDevUser);
		});
	});

	describe('production mode', () => {
		beforeEach(() => {
			mockDevMode = false;
		});

		it('redirects to /login when no JWT token present', async () => {
			const event = createMockEvent('/');
			await expect(
				handle({ event: event as never, resolve: mockResolve })
			).rejects.toMatchObject({ status: 302, location: '/login' });
		});

		it('redirects to /login when JWT validation fails', async () => {
			vi.mocked(validateCFAccessToken).mockResolvedValueOnce(null);
			const event = createMockEvent('/', 'invalid-token');
			await expect(
				handle({ event: event as never, resolve: mockResolve })
			).rejects.toMatchObject({ status: 302, location: '/login' });
		});

		it('sets user from valid JWT and resolves', async () => {
			vi.mocked(validateCFAccessToken).mockResolvedValueOnce(mockProdUser);
			const event = createMockEvent('/', 'valid-token');
			await handle({ event: event as never, resolve: mockResolve });
			expect(event.locals.user).toEqual(mockProdUser);
			expect(mockResolve).toHaveBeenCalled();
		});

		it('passes JWT token to validateCFAccessToken', async () => {
			vi.mocked(validateCFAccessToken).mockResolvedValueOnce(mockProdUser);
			const event = createMockEvent('/', 'my-jwt-token');
			await handle({ event: event as never, resolve: mockResolve });
			expect(validateCFAccessToken).toHaveBeenCalledWith('my-jwt-token');
		});
	});
});
