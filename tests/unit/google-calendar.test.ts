import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	env: {
		GOOGLE_OAUTH_CLIENT_ID: 'client-id',
		GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
		GOOGLE_OAUTH_REDIRECT_URI: 'https://app.example/calendar/oauth/callback'
	},
	getGoogleCalendarTokens: vi.fn(),
	saveGoogleCalendarTokens: vi.fn(),
	deleteGoogleCalendarTokens: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/server/supabase', () => ({
	getGoogleCalendarTokens: mocks.getGoogleCalendarTokens,
	saveGoogleCalendarTokens: mocks.saveGoogleCalendarTokens,
	deleteGoogleCalendarTokens: mocks.deleteGoogleCalendarTokens
}));

import {
	buildAuthUrl,
	connectAccount,
	createEvent,
	deleteEvent,
	disconnectAccount,
	isConnected,
	listEvents,
	updateEvent
} from '$lib/server/google-calendar';

const userEmail = 'sales@bytestreams.ai';
const validTokens = {
	access_token: 'access-token',
	refresh_token: 'refresh-token',
	expires_at: '2099-01-01T00:00:00.000Z',
	scope: 'calendar.events'
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('Google Calendar integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
		mocks.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
		mocks.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://app.example/calendar/oauth/callback';
		mocks.getGoogleCalendarTokens.mockResolvedValue(validTokens);
	});

	it('builds a consent URL with offline access and state', () => {
		const url = new URL(buildAuthUrl('csrf-state'));

		expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
		expect(url.searchParams.get('client_id')).toBe('client-id');
		expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/calendar/oauth/callback');
		expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.events');
		expect(url.searchParams.get('access_type')).toBe('offline');
		expect(url.searchParams.get('prompt')).toBe('consent');
		expect(url.searchParams.get('state')).toBe('csrf-state');
	});

	it('requires complete OAuth configuration', () => {
		mocks.env.GOOGLE_OAUTH_CLIENT_SECRET = '  ';

		expect(() => buildAuthUrl('state')).toThrow('GOOGLE_OAUTH_CLIENT_ID');
	});

	it('exchanges an authorization code and saves tokens', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			expires_in: 3600,
			scope: 'calendar.events'
		}));
		vi.stubGlobal('fetch', fetchMock);

		await connectAccount(userEmail, 'authorization-code');

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://oauth2.googleapis.com/token');
		expect(init.method).toBe('POST');
		expect((init.body as URLSearchParams).get('code')).toBe('authorization-code');
		expect(mocks.saveGoogleCalendarTokens).toHaveBeenCalledWith(userEmail, expect.objectContaining({
			access_token: 'new-access-token',
			refresh_token: 'new-refresh-token',
			scope: 'calendar.events'
		}));
	});

	it('reports token exchange errors and requires a refresh token', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('invalid code', { status: 400 })));
		await expect(connectAccount(userEmail, 'bad-code')).rejects.toThrow(
			'Google token exchange failed: invalid code'
		);

		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
			access_token: 'access-only',
			expires_in: 3600,
			scope: 'calendar.events'
		})));
		await expect(connectAccount(userEmail, 'code')).rejects.toThrow('Google did not return a refresh token');
	});

	it('checks connection state and disconnects the account', async () => {
		await expect(isConnected(userEmail)).resolves.toBe(true);
		mocks.getGoogleCalendarTokens.mockResolvedValueOnce(null);
		await expect(isConnected(userEmail)).resolves.toBe(false);

		await disconnectAccount(userEmail);
		expect(mocks.deleteGoogleCalendarTokens).toHaveBeenCalledWith(userEmail);
	});

	it('lists and maps timed and all-day events', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
			items: [
				{
					id: 'timed-event',
					summary: 'Demo',
					description: 'Product walkthrough',
					start: { dateTime: '2026-08-15T15:00:00.000Z' },
					end: { dateTime: '2026-08-15T15:30:00.000Z' },
					colorId: '9',
					creator: { email: userEmail },
					attendees: [{ email: 'owner@example.com' }]
				},
				{
					id: 'all-day-event',
					start: { date: '2026-08-20' },
					end: { date: '2026-08-22' }
				}
			]
		}));
		vi.stubGlobal('fetch', fetchMock);

		const events = await listEvents(userEmail, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');

		expect(events[0]).toEqual({
			id: 'timed-event',
			title: 'Demo',
			description: 'Product walkthrough',
			start_at: '2026-08-15T15:00:00.000Z',
			end_at: '2026-08-15T15:30:00.000Z',
			all_day: false,
			color: '#3b82f6',
			created_by: userEmail,
			attendees: ['owner@example.com']
		});
		expect(events[1]).toEqual(expect.objectContaining({
			title: '(untitled)',
			description: null,
			start_at: '2026-08-20T00:00:00.000Z',
			end_at: '2026-08-21T23:59:00.000Z',
			all_day: true,
			color: null,
			created_by: '',
			attendees: []
		}));
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('singleEvents=true');
		expect(init.headers).toMatchObject({ authorization: 'Bearer access-token' });
	});

	it('refreshes expired access tokens before an API request', async () => {
		mocks.getGoogleCalendarTokens.mockResolvedValue({
			...validTokens,
			access_token: 'expired-token',
			expires_at: '2020-01-01T00:00:00.000Z'
		});
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(jsonResponse({ access_token: 'refreshed-token', expires_in: 3600 }))
			.mockResolvedValueOnce(jsonResponse({ items: [] }));
		vi.stubGlobal('fetch', fetchMock);

		await listEvents(userEmail, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');

		expect((fetchMock.mock.calls[0][1]?.body as URLSearchParams).get('refresh_token')).toBe('refresh-token');
		expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ authorization: 'Bearer refreshed-token' });
		expect(mocks.saveGoogleCalendarTokens).toHaveBeenCalledWith(userEmail, expect.objectContaining({
			access_token: 'refreshed-token',
			refresh_token: 'refresh-token'
		}));
	});

	it('rejects requests when disconnected or when token refresh fails', async () => {
		mocks.getGoogleCalendarTokens.mockResolvedValueOnce(null);
		await expect(listEvents(userEmail, 'min', 'max')).rejects.toThrow('Google Calendar is not connected');

		mocks.getGoogleCalendarTokens.mockResolvedValueOnce({
			...validTokens,
			expires_at: '2020-01-01T00:00:00.000Z'
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('refresh denied', { status: 401 })));
		await expect(listEvents(userEmail, 'min', 'max')).rejects.toThrow(
			'Google token refresh failed: refresh denied'
		);
	});

	it('creates timed events with attendees and color', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'event-1' }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(createEvent(userEmail, {
			title: 'Sales demo',
			description: 'DialTone demo',
			start_at: '2026-08-15T15:00:00.000Z',
			end_at: '2026-08-15T15:30:00.000Z',
			all_day: false,
			color: '#22c55e',
			attendees: ['owner@example.com']
		})).resolves.toBe('event-1');

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('?sendUpdates=all');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual({
			summary: 'Sales demo',
			description: 'DialTone demo',
			colorId: '10',
			attendees: [{ email: 'owner@example.com' }],
			start: { dateTime: '2026-08-15T15:00:00.000Z' },
			end: { dateTime: '2026-08-15T15:30:00.000Z' }
		});
	});

	it('creates all-day events using Google exclusive end dates', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'event-2' }));
		vi.stubGlobal('fetch', fetchMock);

		await createEvent(userEmail, {
			title: 'Conference',
			start_at: '2026-08-20T00:00:00.000Z',
			end_at: '2026-08-21T23:59:00.000Z',
			all_day: true,
			color: null
		});

		expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
			colorId: null,
			start: { date: '2026-08-20' },
			end: { date: '2026-08-22' }
		});
	});

	it('updates and deletes encoded event IDs', async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response(null, { status: 410 }));
		vi.stubGlobal('fetch', fetchMock);

		await updateEvent(userEmail, 'event/with space', { title: 'Updated title' });
		await deleteEvent(userEmail, 'event/with space');

		expect(fetchMock.mock.calls[0][0]).toContain('/event%2Fwith%20space?sendUpdates=all');
		expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
		expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ summary: 'Updated title' });
		expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
	});

	it.each([
		['list', () => listEvents(userEmail, 'min', 'max'), 'Failed to list Google Calendar events'],
		['create', () => createEvent(userEmail, {
			title: 'Demo', start_at: '2026-08-15T15:00:00Z', end_at: '2026-08-15T15:30:00Z', all_day: false
		}), 'Failed to create Google Calendar event'],
		['update', () => updateEvent(userEmail, 'event-1', { title: 'Demo' }), 'Failed to update Google Calendar event'],
		['delete', () => deleteEvent(userEmail, 'event-1'), 'Failed to delete Google Calendar event']
	])('surfaces %s API errors', async (_operation, action, message) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Google error', { status: 500 })));
		await expect(action()).rejects.toThrow(`${message}: Google error`);
	});
});
