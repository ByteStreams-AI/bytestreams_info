import { describe, expect, it, vi, type Mock } from 'vitest';
import { checkThreads, planToday, sendDue, tick, type OutreachDeps, type OutreachSettings } from '$lib/server/outreach-run';
import type { OutreachCandidate, OutreachMessageRow, OutreachSequenceRow } from '$lib/server/supabase';

const settings: OutreachSettings = {
	senderAccount: 'steve@bytestreams.ai',
	from: 'Steve Cotton <hello@bytestreams.ai>',
	fromName: 'Steve Cotton',
	postalAddress: '100 Main St, Jacksonville, FL 32202',
	dailyLimit: 25,
	autoApprove: false
};

// Tuesday 2026-11-24, 08:00 Central.
const NOW = new Date('2026-11-24T14:00:00Z');

function candidate(id: string, overrides: Partial<OutreachCandidate> = {}): OutreachCandidate {
	return {
		lead_id: id,
		business_name: `Practice ${id}`,
		contact_name: 'Jordan Blake',
		email: `${id}@clinic.example`,
		business_type: 'general_practice',
		clinical_specialty: null,
		product: 'dialtone_med',
		status: 'new',
		emailed: false,
		...overrides
	};
}

function sequence(id: string, overrides: Partial<OutreachSequenceRow> = {}): OutreachSequenceRow {
	return {
		lead_id: id,
		to_email: `${id}@clinic.example`,
		state: 'active',
		gmail_thread_id: `thread-${id}`,
		last_rfc_message_id: `<${id}@mail>`,
		first_subject: 'phones at Practice',
		last_sent_at: '2026-11-20T15:00:00Z',
		stopped_reason: null,
		...overrides
	};
}

function message(id: string, step: 1 | 2 | 3, overrides: Partial<OutreachMessageRow> = {}): OutreachMessageRow {
	return {
		message_id: `msg-${id}-${step}`,
		lead_id: id,
		step,
		to_email: `${id}@clinic.example`,
		subject: step === 1 ? 'phones at Practice' : 're: phones at Practice',
		body: 'Hi Jordan,',
		status: 'sending',
		planned_for: '2026-11-24',
		send_after: '2026-11-24T13:00:00Z',
		sent_at: null,
		error: null,
		...overrides
	};
}

type FakeDeps = { [K in keyof OutreachDeps]: Mock<OutreachDeps[K]> };

function fakeDeps(overrides: Partial<OutreachDeps> = {}): FakeDeps {
	return {
		fetchCandidates: vi.fn().mockResolvedValue([]),
		fetchLeads: vi.fn().mockResolvedValue([]),
		fetchSuppressed: vi.fn().mockResolvedValue(new Set()),
		addSuppression: vi.fn().mockResolvedValue(undefined),
		fetchSequences: vi.fn().mockResolvedValue([]),
		fetchSentSteps: vi.fn().mockResolvedValue(new Map()),
		upsertSequence: vi.fn().mockResolvedValue(undefined),
		hasPlannedDay: vi.fn().mockResolvedValue(false),
		recordPlannedDay: vi.fn().mockResolvedValue(undefined),
		insertMessages: vi.fn().mockResolvedValue(undefined),
		claimDue: vi.fn().mockResolvedValue([]),
		finishMessage: vi.fn().mockResolvedValue(undefined),
		cancelMessages: vi.fn().mockResolvedValue(undefined),
		updateLead: vi.fn().mockResolvedValue(undefined),
		accessToken: vi.fn().mockResolvedValue('token'),
		sendMessage: vi.fn().mockResolvedValue({ id: 'gmail-1', threadId: 'thread-new' }),
		rfcMessageId: vi.fn().mockResolvedValue('<new@mail>'),
		threadSenders: vi.fn().mockResolvedValue(['Steve Cotton <hello@bytestreams.ai>']),
		...overrides
	} as FakeDeps;
}

describe('planToday', () => {
	it('plans due follow-ups and new leads as pending, once a day', async () => {
		const deps = fakeDeps({
			fetchCandidates: vi.fn().mockResolvedValue([
				candidate('new-1'),
				candidate('suppressed'),
				candidate('no-name', { contact_name: null })
			]),
			fetchSuppressed: vi.fn().mockResolvedValue(new Set(['suppressed@clinic.example'])),
			fetchSequences: vi.fn().mockResolvedValue([sequence('old')]),
			fetchSentSteps: vi.fn().mockResolvedValue(new Map([['old', 1]])),
			fetchLeads: vi.fn().mockResolvedValue([candidate('old', { emailed: true, status: 'contacted' })])
		});

		expect(await planToday(deps, settings, NOW)).toBe(2);
		const rows = deps.insertMessages.mock.calls[0][0];
		expect(rows.map((row) => [row.lead_id, row.step, row.status, row.send_after])).toEqual([
			['old', 2, 'pending', null],
			['new-1', 1, 'pending', null]
		]);
		expect(rows[0].subject).toBe('re: phones at Practice old');
		expect(deps.fetchLeads).toHaveBeenCalledWith(['old']);
		expect(deps.recordPlannedDay).toHaveBeenCalledWith('2026-11-24', 2);
	});

	it('approves with send times when auto-approve is on', async () => {
		const deps = fakeDeps({ fetchCandidates: vi.fn().mockResolvedValue([candidate('new-1')]) });
		await planToday(deps, { ...settings, autoApprove: true }, NOW);
		const [row] = deps.insertMessages.mock.calls[0][0];
		expect(row.status).toBe('approved');
		expect(row.send_after).toBe('2026-11-24T15:00:00.000Z');
	});

	it('does nothing before 7:00, on weekends, or twice in a day', async () => {
		const deps = fakeDeps();
		expect(await planToday(deps, settings, new Date('2026-11-24T12:00:00Z'))).toBe(0);
		expect(await planToday(deps, settings, new Date('2026-11-28T15:00:00Z'))).toBe(0);
		deps.hasPlannedDay.mockResolvedValue(true);
		expect(await planToday(deps, settings, NOW)).toBe(0);
		expect(deps.insertMessages).not.toHaveBeenCalled();
	});

	it('skips a follow-up whose lead can no longer be rendered', async () => {
		const deps = fakeDeps({
			fetchSequences: vi.fn().mockResolvedValue([sequence('old'), sequence('gone')]),
			fetchSentSteps: vi.fn().mockResolvedValue(new Map([['old', 1], ['gone', 1]])),
			fetchLeads: vi.fn().mockResolvedValue([candidate('old', { business_type: null })])
		});
		expect(await planToday(deps, settings, NOW)).toBe(0);
	});
});

describe('checkThreads', () => {
	it('stops a sequence on a reply and flags the lead for follow-up', async () => {
		const deps = fakeDeps({
			fetchSequences: vi.fn().mockResolvedValue([sequence('a'), sequence('b'), sequence('no-thread', { gmail_thread_id: null })]),
			threadSenders: vi.fn().mockImplementation(async (_token, threadId) =>
				threadId === 'thread-a' ? ['hello@bytestreams.ai', 'Jordan <a@clinic.example>'] : ['hello@bytestreams.ai'])
		});
		expect(await checkThreads(deps, settings, 'token')).toEqual([{ lead_id: 'a', state: 'replied' }]);
		expect(deps.upsertSequence).toHaveBeenCalledWith({ lead_id: 'a', state: 'replied', stopped_reason: 'Prospect replied.' });
		expect(deps.cancelMessages).toHaveBeenCalledWith('a', 'Prospect replied.');
		expect(deps.updateLead).toHaveBeenCalledWith('a', { status: 'followup_required' }, expect.arrayContaining(['contacted', 'new']));
		expect(deps.addSuppression).not.toHaveBeenCalled();
	});

	it('suppresses a bounced address', async () => {
		const deps = fakeDeps({
			fetchSequences: vi.fn().mockResolvedValue([sequence('a')]),
			threadSenders: vi.fn().mockResolvedValue(['hello@bytestreams.ai', 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>'])
		});
		await checkThreads(deps, settings, 'token');
		expect(deps.addSuppression).toHaveBeenCalledWith('a@clinic.example', 'bounced');
		expect(deps.updateLead).not.toHaveBeenCalled();
	});
});

describe('sendDue', () => {
	it('sends a first email, starts the sequence and marks the lead emailed', async () => {
		const deps = fakeDeps({ claimDue: vi.fn().mockResolvedValue([message('new-1', 1)]) });
		expect(await sendDue(deps, settings, 'token', NOW)).toEqual({ sent: 1, failed: 0, skipped: 0 });

		expect(deps.sendMessage).toHaveBeenCalledWith('token', expect.any(String), null);
		expect(deps.finishMessage).toHaveBeenCalledWith('msg-new-1-1', { status: 'sent', gmail_message_id: 'gmail-1' });
		expect(deps.upsertSequence).toHaveBeenCalledWith(expect.objectContaining({
			lead_id: 'new-1', state: 'active', gmail_thread_id: 'thread-new', last_rfc_message_id: '<new@mail>', first_subject: 'phones at Practice'
		}));
		expect(deps.updateLead).toHaveBeenCalledWith('new-1', { emailed: true });
		expect(deps.updateLead).toHaveBeenCalledWith('new-1', { status: 'contacted' }, expect.arrayContaining(['new']));
	});

	it('sends a follow-up in the thread and finishes the sequence after the last step', async () => {
		const deps = fakeDeps({
			claimDue: vi.fn().mockResolvedValue([message('old', 3)]),
			fetchSequences: vi.fn().mockResolvedValue([sequence('old')]),
			rfcMessageId: vi.fn().mockRejectedValue(new Error('flaky'))
		});
		await sendDue(deps, settings, 'token', NOW);
		expect(deps.sendMessage).toHaveBeenCalledWith('token', expect.any(String), 'thread-old');
		expect(deps.upsertSequence).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed', last_rfc_message_id: '<old@mail>' }));
		expect(deps.updateLead).not.toHaveBeenCalled();
	});

	it('skips instead of sending when the prospect replied in the meantime', async () => {
		const deps = fakeDeps({
			claimDue: vi.fn().mockResolvedValue([message('old', 2)]),
			fetchSequences: vi.fn().mockResolvedValue([sequence('old')]),
			threadSenders: vi.fn().mockResolvedValue(['hello@bytestreams.ai', 'old@clinic.example'])
		});
		expect(await sendDue(deps, settings, 'token', NOW)).toEqual({ sent: 0, failed: 0, skipped: 1 });
		expect(deps.sendMessage).not.toHaveBeenCalled();
		expect(deps.finishMessage).toHaveBeenCalledWith('msg-old-2', { status: 'skipped', error: 'Prospect replied.' });
	});

	it('skips suppressed addresses, inactive sequences and duplicate first emails', async () => {
		const deps = fakeDeps({
			claimDue: vi.fn().mockResolvedValue([message('opted', 1), message('stopped', 2), message('dupe', 1)]),
			fetchSuppressed: vi.fn().mockResolvedValue(new Set(['opted@clinic.example'])),
			fetchSequences: vi.fn().mockResolvedValue([sequence('stopped', { state: 'stopped' }), sequence('dupe')])
		});
		expect(await sendDue(deps, settings, 'token', NOW)).toEqual({ sent: 0, failed: 0, skipped: 3 });
		expect(deps.sendMessage).not.toHaveBeenCalled();
	});

	it('records a send failure without stopping the run', async () => {
		const deps = fakeDeps({
			claimDue: vi.fn().mockResolvedValue([message('a', 1), message('b', 1)]),
			sendMessage: vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce({ id: 'g2', threadId: 't2' })
		});
		expect(await sendDue(deps, settings, 'token', NOW)).toEqual({ sent: 1, failed: 1, skipped: 0 });
		expect(deps.finishMessage).toHaveBeenCalledWith('msg-a-1', { status: 'failed', error: 'quota' });

		deps.sendMessage.mockRejectedValueOnce('offline');
		deps.claimDue.mockResolvedValueOnce([message('c', 1)]);
		await sendDue(deps, settings, 'token', NOW);
		expect(deps.finishMessage).toHaveBeenCalledWith('msg-c-1', { status: 'failed', error: 'offline' });
	});
});

describe('tick', () => {
	it('checks threads, plans and sends in one run', async () => {
		const deps = fakeDeps({ fetchCandidates: vi.fn().mockResolvedValue([candidate('new-1')]) });
		expect(await tick(deps, settings, NOW)).toEqual({ stopped: [], planned: 1, sent: 0, failed: 0, skipped: 0 });
		expect(deps.accessToken).toHaveBeenCalledOnce();
	});
});
