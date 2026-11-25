import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	env: {} as Record<string, string | undefined>,
	tick: vi.fn(),
	hasGmailAccess: vi.fn(),
	getValidAccessToken: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/server/outreach-run', () => ({ tick: mocks.tick }));
vi.mock('$lib/server/google-calendar', () => ({
	hasGmailAccess: mocks.hasGmailAccess,
	getValidAccessToken: mocks.getValidAccessToken
}));
vi.mock('$lib/server/supabase', async (importOriginal) => importOriginal());

import { outreachDeps, outreachSettings } from '$lib/server/outreach-service';
import { POST } from '../../src/routes/internal/outreach/tick/+server';

const configured = {
	OUTREACH_SENDER: 'Steve@ByteStreams.ai',
	OUTREACH_FROM_NAME: 'Steve Cotton',
	OUTREACH_POSTAL_ADDRESS: '100 Main St, Jacksonville, FL 32202',
	OUTREACH_CRON_SECRET: 'cron-secret'
};

function tickRequest(secret?: string) {
	return { request: new Request('https://bytestreams.info/internal/outreach/tick', {
		method: 'POST',
		headers: secret ? { 'x-outreach-cron': secret } : {}
	}) } as never;
}

describe('outreachSettings', () => {
	it('names every missing required setting', () => {
		expect(outreachSettings({})).toEqual({
			settings: null,
			missing: ['OUTREACH_SENDER', 'OUTREACH_FROM_NAME', 'OUTREACH_POSTAL_ADDRESS']
		});
	});

	it('defaults the From header, limit and approval', () => {
		expect(outreachSettings(configured).settings).toEqual({
			senderAccount: 'steve@bytestreams.ai',
			from: 'Steve Cotton <steve@bytestreams.ai>',
			fromName: 'Steve Cotton',
			postalAddress: '100 Main St, Jacksonville, FL 32202',
			dailyLimit: 25,
			autoApprove: false
		});
	});

	it('reads the optional settings and caps the daily limit', () => {
		const { settings } = outreachSettings({
			...configured,
			OUTREACH_FROM: 'Steve Cotton <hello@bytestreams.ai>',
			OUTREACH_DAILY_LIMIT: '500',
			OUTREACH_AUTO_APPROVE: 'TRUE'
		});
		expect(settings).toMatchObject({ from: 'Steve Cotton <hello@bytestreams.ai>', dailyLimit: 100, autoApprove: true });
		expect(outreachSettings({ ...configured, OUTREACH_DAILY_LIMIT: 'lots' }).settings?.dailyLimit).toBe(25);
	});

	it('gets the access token for the sender account', async () => {
		mocks.getValidAccessToken.mockResolvedValue('token');
		const deps = outreachDeps(outreachSettings(configured).settings!);
		expect(await deps.accessToken()).toBe('token');
		expect(mocks.getValidAccessToken).toHaveBeenCalledWith('steve@bytestreams.ai');
	});
});

describe('/internal/outreach/tick', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const key of Object.keys(mocks.env)) delete mocks.env[key];
		Object.assign(mocks.env, configured);
		mocks.hasGmailAccess.mockResolvedValue(true);
		mocks.tick.mockResolvedValue({ stopped: [], planned: 2, sent: 1, failed: 0, skipped: 0 });
	});

	it('hides itself from anyone without the cron secret', async () => {
		await expect(POST(tickRequest())).rejects.toMatchObject({ status: 404 });
		await expect(POST(tickRequest('wrong'))).rejects.toMatchObject({ status: 404 });
		delete mocks.env.OUTREACH_CRON_SECRET;
		await expect(POST(tickRequest('cron-secret'))).rejects.toMatchObject({ status: 404 });
		expect(mocks.tick).not.toHaveBeenCalled();
	});

	it('runs the tick and reports it', async () => {
		const response = await POST(tickRequest('cron-secret'));
		expect(await response.json()).toEqual({ ok: true, stopped: [], planned: 2, sent: 1, failed: 0, skipped: 0 });
		expect(mocks.tick).toHaveBeenCalledOnce();
	});

	it('stays quiet in the log when nothing happened', async () => {
		mocks.tick.mockResolvedValue({ stopped: [], planned: 0, sent: 0, failed: 0, skipped: 0 });
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		await POST(tickRequest('cron-secret'));
		expect(log).not.toHaveBeenCalled();
		log.mockRestore();
	});

	it('skips until configured and connected', async () => {
		delete mocks.env.OUTREACH_POSTAL_ADDRESS;
		expect(await (await POST(tickRequest('cron-secret'))).json()).toEqual({
			ok: false,
			skipped: 'Outreach is not configured: OUTREACH_POSTAL_ADDRESS'
		});

		mocks.env.OUTREACH_POSTAL_ADDRESS = configured.OUTREACH_POSTAL_ADDRESS;
		mocks.hasGmailAccess.mockResolvedValue(false);
		const body = (await (await POST(tickRequest('cron-secret'))).json()) as { skipped: string };
		expect(body.skipped).toMatch(/has not granted Gmail access/);
		expect(mocks.tick).not.toHaveBeenCalled();
	});
});
