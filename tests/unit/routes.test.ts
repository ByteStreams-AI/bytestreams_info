import { describe, it, expect, vi } from 'vitest';

const { fetchLeadChanges, restoreLeadChange } = vi.hoisted(() => ({
	fetchLeadChanges: vi.fn().mockResolvedValue([]),
	restoreLeadChange: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$app/environment', () => ({
	dev: true
}));

vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn((status: number, location: string) => {
		throw { status, location, __isRedirect: true };
	}),
	error: vi.fn((status: number, message: string) => {
		throw { status, message, __isHttpError: true };
	}),
	fail: vi.fn((status: number, data: unknown) => ({ status, data }))
}));

vi.mock('$lib/server/supabase', () => ({
	fetchLeadChanges,
	restoreLeadChange
}));

const mockUser = {
	email: 'test@bytestreams.ai',
	sub: 'cf-user-test',
	displayName: 'Test',
	iat: 1700000000,
	exp: 1700086400
};

const crmAdminUser = {
	...mockUser,
	email: 'scotton@bytestreams.ai'
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

describe('dashboard server load', () => {
	it('exposes CRM admin access only for the allowed account', async () => {
		const { load } = await import('$lib/../routes/+page.server');

		await expect(load({ locals: { user: crmAdminUser } } as never)).resolves.toMatchObject({
			canAccessCrmAdmin: true
		});
		await expect(load({ locals: { user: mockUser } } as never)).resolves.toMatchObject({
			canAccessCrmAdmin: false
		});
	});
});

describe('CRM Admin route', () => {
	it('rejects unauthenticated and non-admin direct access', async () => {
		const { load } = await import('$lib/../routes/crm-admin/+page.server');

		await expect(load({ locals: { user: null } } as never)).rejects.toMatchObject({
			status: 302,
			location: '/login'
		});
		await expect(load({ locals: { user: mockUser } } as never)).rejects.toMatchObject({
			status: 403
		});
	});

	it('loads audit events for the CRM admin', async () => {
		const { load } = await import('$lib/../routes/crm-admin/+page.server');
		const result = await load({ locals: { user: crmAdminUser } } as never);

		expect(fetchLeadChanges).toHaveBeenCalled();
		expect(result).toEqual({ user: crmAdminUser, changes: [] });
	});

	it('permits only the CRM admin to restore an event', async () => {
		const { actions } = await import('$lib/../routes/crm-admin/+page.server');
		const request = () => ({
			formData: vi.fn().mockResolvedValue(new Map([
				['change_id', '12345678-1234-1234-1234-123456789abc']
			]))
		});

		await expect(actions.restore({ request: request(), locals: { user: mockUser } } as never))
			.rejects.toMatchObject({ status: 403 });
		await expect(actions.restore({ request: request(), locals: { user: crmAdminUser } } as never))
			.resolves.toMatchObject({ success: true });
		expect(restoreLeadChange).toHaveBeenCalledWith(
			'12345678-1234-1234-1234-123456789abc',
			'scotton@bytestreams.ai'
		);
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
		expect(result).toEqual({ loginUrl: '/' });
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
