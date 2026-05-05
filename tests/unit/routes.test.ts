import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	dev: true
}));

vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn((status: number, location: string) => {
		throw { status, location, __isRedirect: true };
	})
}));

const mockUser = {
	email: 'test@bytestreams.ai',
	sub: 'cf-user-test',
	displayName: 'Test',
	iat: 1700000000,
	exp: 1700086400
};

function createMockCookies() {
	return {
		get: vi.fn(),
		set: vi.fn(),
		delete: vi.fn()
	};
}

describe('layout server load', () => {
	it('returns user from locals', async () => {
		const { load } = await import('$lib/../routes/+layout.server');
		const result = await load({ locals: { user: mockUser } } as never);
		expect(result).toEqual({ user: mockUser });
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
		const cookies = createMockCookies();
		await expect(
			load({ locals: { user: mockUser }, cookies } as never)
		).rejects.toMatchObject({ status: 302, location: '/' });
	});

	it('returns empty object when not authenticated', async () => {
		const { load } = await import('$lib/../routes/login/+page.server');
		const cookies = createMockCookies();
		const result = await load({ locals: { user: null }, cookies } as never);
		expect(result).toEqual({});
	});

	it('clears logged_out cookie in dev mode when not authenticated', async () => {
		const { load } = await import('$lib/../routes/login/+page.server');
		const cookies = createMockCookies();
		await load({ locals: { user: null }, cookies } as never);
		expect(cookies.delete).toHaveBeenCalledWith('logged_out', { path: '/' });
	});
});

describe('logout route handler', () => {
	it('clears CF_Authorization cookie and redirects to /login', async () => {
		const { GET } = await import('$lib/../routes/auth/logout/+server');
		const cookies = createMockCookies();

		await expect(
			GET({ cookies } as never)
		).rejects.toMatchObject({ status: 302, location: '/login' });

		expect(cookies.delete).toHaveBeenCalledWith('CF_Authorization', { path: '/' });
	});

	it('sets logged_out cookie in dev mode', async () => {
		const { GET } = await import('$lib/../routes/auth/logout/+server');
		const cookies = createMockCookies();

		await expect(
			GET({ cookies } as never)
		).rejects.toMatchObject({ status: 302, location: '/login' });

		expect(cookies.set).toHaveBeenCalledWith('logged_out', '1', {
			path: '/',
			httpOnly: true,
			maxAge: 3600
		});
	});
});
