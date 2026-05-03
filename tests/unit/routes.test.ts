import { describe, it, expect, vi } from 'vitest';

vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn((status: number, location: string) => {
		throw { status, location, __isRedirect: true };
	})
}));

describe('layout server load', () => {
	it('returns user from locals', async () => {
		const { load } = await import('$lib/../routes/+layout.server');
		const user = { email: 'test@bytestreams.ai', firstName: 'Test', lastName: 'User' };
		const result = await load({ locals: { user } } as never);
		expect(result).toEqual({ user });
	});

	it('returns null user when not authenticated', async () => {
		const { load } = await import('$lib/../routes/+layout.server');
		const result = await load({ locals: { user: null } } as never);
		expect(result).toEqual({ user: null });
	});
});

describe('login page server load', () => {
	it('redirects to / when user is authenticated', async () => {
		const { load } = await import('$lib/../routes/login/+page.server');
		const user = { email: 'test@bytestreams.ai', firstName: 'Test', lastName: 'User' };
		await expect(
			load({ locals: { user } } as never)
		).rejects.toMatchObject({ status: 302, location: '/' });
	});

	it('returns empty object when not authenticated', async () => {
		const { load } = await import('$lib/../routes/login/+page.server');
		const result = await load({ locals: { user: null } } as never);
		expect(result).toEqual({});
	});
});

describe('logout route handler', () => {
	it('clears CF_Authorization cookie and redirects to /login', async () => {
		const { GET } = await import('$lib/../routes/auth/logout/+server');
		const deleteFn = vi.fn();
		const mockCookies = { delete: deleteFn };

		await expect(
			GET({ cookies: mockCookies } as never)
		).rejects.toMatchObject({ status: 302, location: '/login' });

		expect(deleteFn).toHaveBeenCalledWith('CF_Authorization', { path: '/' });
	});
});
