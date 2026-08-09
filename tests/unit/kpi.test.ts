import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, privateEnv } = vi.hoisted(() => ({
	createClient: vi.fn(),
	privateEnv: {
		SUPABASE_URL: 'https://example.supabase.co',
		SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
	}
}));

vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('@sveltejs/kit', () => ({
	redirect: vi.fn((status: number, location: string) => {
		throw { status, location };
	})
}));

type QueryResult = { count: number | null; error: { message: string } | null };

function createCountClient(results: QueryResult[]) {
	let queryIndex = 0;
	return {
		from: vi.fn(() => {
			const result = results[queryIndex++];
			const query = {
				in: vi.fn(() => query),
				eq: vi.fn(() => query),
				then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
					Promise.resolve(result).then(resolve, reject)
			};
			return { select: vi.fn(() => query) };
		})
	};
}

const user = {
	email: 'test@bytestreams.ai',
	sub: 'cf-user-test',
	displayName: 'Test',
	iat: 1700000000,
	exp: 1700086400
};

describe('KPI endpoint', () => {
	beforeEach(() => {
		createClient.mockReset();
		privateEnv.SUPABASE_URL = 'https://example.supabase.co';
		privateEnv.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
	});

	it('redirects unauthenticated requests to login', async () => {
		const { GET } = await import('$lib/../routes/kpi/+server');

		await expect(GET({ locals: { user: null } } as never)).rejects.toMatchObject({
			status: 302,
			location: '/login'
		});
	});

	it('returns a configuration error without Supabase credentials', async () => {
		privateEnv.SUPABASE_URL = '';
		const { GET } = await import('$lib/../routes/kpi/+server');

		const response = await GET({ locals: { user } } as never);
		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'CRM Supabase not configured' });
	});

	it('returns a configuration error without the Supabase service key', async () => {
		privateEnv.SUPABASE_SERVICE_ROLE_KEY = '';
		const { GET } = await import('$lib/../routes/kpi/+server');

		const response = await GET({ locals: { user } } as never);
		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'CRM Supabase not configured' });
	});

	it('returns lead-based KPI counts', async () => {
		createClient.mockReturnValue(createCountClient([
			{ count: 120, error: null },
			{ count: 75, error: null },
			{ count: 45, error: null },
			{ count: 31, error: null },
			{ count: 12, error: null },
			{ count: 8, error: null },
			{ count: 5, error: null }
		]));
		const { GET } = await import('$lib/../routes/kpi/+server');

		const response = await GET({ locals: { user } } as never);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			total_contacts: 120,
			contacted_or_beyond: 75,
			emailed: 45,
			called: 31,
			demos: 12,
			pilots: 8,
			customers: 5
		});
	});

	it('uses zero for lead counts that Supabase returns as null', async () => {
		createClient.mockReturnValue(createCountClient([
			{ count: null, error: null },
			{ count: null, error: null },
			{ count: null, error: null },
			{ count: null, error: null },
			{ count: null, error: null },
			{ count: null, error: null },
			{ count: null, error: null }
		]));
		const { GET } = await import('$lib/../routes/kpi/+server');

		const response = await GET({ locals: { user } } as never);
		await expect(response.json()).resolves.toMatchObject({
			total_contacts: 0,
			contacted_or_beyond: 0,
			emailed: 0,
			called: 0,
			demos: 0,
			pilots: 0,
			customers: 0
		});
	});

	it('returns a gateway error when a lead count query fails', async () => {
		createClient.mockReturnValue(createCountClient([
			{ count: 120, error: null },
			{ count: null, error: { message: 'Database unavailable' } },
			{ count: 45, error: null },
			{ count: 31, error: null },
			{ count: 12, error: null },
			{ count: 8, error: null },
			{ count: 5, error: null }
		]));
		const { GET } = await import('$lib/../routes/kpi/+server');

		const response = await GET({ locals: { user } } as never);
		expect(response.status).toBe(502);
		await expect(response.json()).resolves.toEqual({ error: 'Database unavailable' });
	});
});
