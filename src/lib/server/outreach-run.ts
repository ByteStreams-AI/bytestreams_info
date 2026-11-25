/**
 * The outreach run loop, called every 15 minutes on weekday mornings by the Worker cron
 * (worker/index.js → /internal/outreach/tick). Each run:
 *
 *   1. Checks every active thread for a reply or a bounce, and stops those sequences.
 *   2. Plans the day once, from 07:00 local: due follow-ups first, then new leads, up to the limit.
 *   3. Sends approved messages whose time has come, re-checking the thread right before each one.
 *
 * Every dependency is injected so the loop is tested without a database or Gmail.
 */

import {
	OUTREACH_TZ,
	classifyThread,
	ineligibleReason,
	isSendingDay,
	localDate,
	planDay,
	renderEmail,
	sendTimesFrom,
	type OutreachConfig,
	type OutreachStep
} from '$lib/server/outreach';
import { buildRawMessage } from '$lib/server/outreach-gmail';
import type {
	OutreachCandidate,
	OutreachMessageRow,
	OutreachSequenceRow,
	OutreachSequenceState
} from '$lib/server/supabase';
import { zonedToUtc } from '$lib/social';

export interface OutreachSettings extends OutreachConfig {
	/** The connected Google user whose Gmail sends. */
	senderAccount: string;
	/** The From header, e.g. "Steve Cotton <hello@bytestreams.ai>"; must be that account or a send-as alias. */
	from: string;
	dailyLimit: number;
	autoApprove: boolean;
}

export interface OutreachDeps {
	fetchCandidates(): Promise<OutreachCandidate[]>;
	/** Name, email and type for leads already in a sequence, to render their follow-ups. */
	fetchLeads(leadIds: string[]): Promise<OutreachCandidate[]>;
	fetchSuppressed(): Promise<Set<string>>;
	addSuppression(email: string, reason: 'opted_out' | 'bounced' | 'manual'): Promise<void>;
	fetchSequences(states: OutreachSequenceState[]): Promise<OutreachSequenceRow[]>;
	fetchSentSteps(leadIds: string[]): Promise<Map<string, number>>;
	upsertSequence(row: Partial<OutreachSequenceRow> & { lead_id: string }): Promise<void>;
	hasPlannedDay(day: string): Promise<boolean>;
	recordPlannedDay(day: string, count: number): Promise<void>;
	insertMessages(rows: Omit<OutreachMessageRow, 'message_id' | 'sent_at' | 'error' | 'leads'>[]): Promise<void>;
	claimDue(nowIso: string, limit: number): Promise<OutreachMessageRow[]>;
	finishMessage(
		messageId: string,
		result: { status: 'sent'; gmail_message_id: string } | { status: 'failed' | 'skipped'; error: string }
	): Promise<void>;
	cancelMessages(leadId: string, reason: string): Promise<void>;
	updateLead(leadId: string, fields: { emailed?: boolean; status?: string }, onlyFromStatuses?: string[]): Promise<void>;
	accessToken(): Promise<string>;
	sendMessage(token: string, raw: string, threadId: string | null): Promise<{ id: string; threadId: string }>;
	rfcMessageId(token: string, messageId: string): Promise<string | null>;
	threadSenders(token: string, threadId: string): Promise<string[]>;
}

export interface TickReport {
	stopped: { lead_id: string; state: OutreachSequenceState }[];
	planned: number;
	sent: number;
	failed: number;
	skipped: number;
}

/** Statuses a lead may be moved out of automatically. Anything later was set by a person. */
const EARLY_STATUSES = ['new', 'researched', 'reviewed', 'prospect'];
const PLAN_FROM = '07:00';
const MAX_SENDS_PER_TICK = 10;

function ownAddresses(settings: OutreachSettings): string[] {
	const fromAddress = settings.from.match(/<([^>]+)>/)?.[1] ?? settings.from;
	return [settings.senderAccount, fromAddress];
}

/** Stops a sequence after a reply, bounce or opt-out, and cancels what it had queued. */
async function stopSequence(deps: OutreachDeps, sequence: OutreachSequenceRow, state: 'replied' | 'bounced', reason: string): Promise<void> {
	await deps.upsertSequence({ lead_id: sequence.lead_id, state, stopped_reason: reason });
	await deps.cancelMessages(sequence.lead_id, reason);
	if (state === 'bounced') {
		await deps.addSuppression(sequence.to_email, 'bounced');
	} else {
		await deps.updateLead(sequence.lead_id, { status: 'followup_required' }, ['contacted', ...EARLY_STATUSES]);
	}
}

/** Checks active threads and stops the ones with a reply or bounce. */
export async function checkThreads(deps: OutreachDeps, settings: OutreachSettings, token: string): Promise<TickReport['stopped']> {
	const stopped: TickReport['stopped'] = [];
	for (const sequence of await deps.fetchSequences(['active'])) {
		if (!sequence.gmail_thread_id) continue;
		const outcome = classifyThread(await deps.threadSenders(token, sequence.gmail_thread_id), ownAddresses(settings));
		if (outcome === 'none') continue;
		await stopSequence(deps, sequence, outcome, outcome === 'replied' ? 'Prospect replied.' : 'Email bounced.');
		stopped.push({ lead_id: sequence.lead_id, state: outcome });
	}
	return stopped;
}

/** Plans today's messages once per day. Returns how many were planned. */
export async function planToday(deps: OutreachDeps, settings: OutreachSettings, now: Date): Promise<number> {
	const today = localDate(now);
	if (!isSendingDay(today) || now < zonedToUtc(today, PLAN_FROM, OUTREACH_TZ)) return 0;
	if (await deps.hasPlannedDay(today)) return 0;

	const suppressed = await deps.fetchSuppressed();
	const candidates = (await deps.fetchCandidates()).filter(
		(lead) => !ineligibleReason(lead) && !suppressed.has(lead.email!.trim().toLowerCase())
	);
	const active = await deps.fetchSequences(['active']);
	const steps = await deps.fetchSentSteps(active.map((sequence) => sequence.lead_id));
	const plan = planDay({
		today,
		limit: settings.dailyLimit,
		alreadyPlanned: 0,
		newLeadIds: candidates.map((lead) => lead.lead_id),
		active: active
			.filter((sequence) => sequence.last_sent_at && steps.has(sequence.lead_id))
			.map((sequence) => ({
				lead_id: sequence.lead_id,
				last_step: steps.get(sequence.lead_id)!,
				last_sent_date: localDate(new Date(sequence.last_sent_at!))
			}))
	});

	const followUpIds = plan.filter((item) => item.step > 1).map((item) => item.lead_id);
	const leads = new Map([...candidates, ...(await deps.fetchLeads(followUpIds))].map((lead) => [lead.lead_id, lead]));
	const sequences = new Map(active.map((sequence) => [sequence.lead_id, sequence]));
	const rows: Parameters<OutreachDeps['insertMessages']>[0] = [];

	for (const item of plan) {
		const lead = leads.get(item.lead_id);
		if (!lead) continue;
		let email;
		try {
			email = renderEmail(lead, item.step as OutreachStep, settings);
		} catch {
			continue; // The lead changed since it was sequenced (type or name removed); leave it for a person.
		}
		rows.push({
			lead_id: item.lead_id,
			step: item.step,
			to_email: sequences.get(item.lead_id)?.to_email ?? lead.email!.trim().toLowerCase(),
			subject: email.subject,
			body: email.body,
			status: settings.autoApprove ? 'approved' : 'pending',
			planned_for: today,
			send_after: null
		});
	}
	if (settings.autoApprove) {
		const times = sendTimesFrom(today, rows.length, now);
		rows.forEach((row, index) => (row.send_after = times[index]));
	}
	await deps.insertMessages(rows);
	await deps.recordPlannedDay(today, rows.length);
	return rows.length;
}

/** Sends approved messages that are due. */
export async function sendDue(
	deps: OutreachDeps,
	settings: OutreachSettings,
	token: string,
	now: Date
): Promise<Pick<TickReport, 'sent' | 'failed' | 'skipped'>> {
	const report = { sent: 0, failed: 0, skipped: 0 };
	// The cron already skips weekends; this also holds approved mail over holidays.
	if (!isSendingDay(localDate(now))) return report;
	const suppressed = await deps.fetchSuppressed();
	const sequences = new Map((await deps.fetchSequences(['active', 'replied', 'bounced', 'opted_out', 'completed', 'stopped']))
		.map((sequence) => [sequence.lead_id, sequence]));

	for (const message of await deps.claimDue(now.toISOString(), MAX_SENDS_PER_TICK)) {
		const sequence = sequences.get(message.lead_id);
		const skip = async (reason: string) => {
			await deps.finishMessage(message.message_id, { status: 'skipped', error: reason });
			report.skipped += 1;
		};

		if (suppressed.has(message.to_email.toLowerCase())) { await skip('Address is suppressed.'); continue; }
		if (message.step > 1) {
			if (!sequence || sequence.state !== 'active' || !sequence.gmail_thread_id) { await skip('Sequence is not active.'); continue; }
			const outcome = classifyThread(await deps.threadSenders(token, sequence.gmail_thread_id), ownAddresses(settings));
			if (outcome !== 'none') {
				await stopSequence(deps, sequence, outcome, outcome === 'replied' ? 'Prospect replied.' : 'Email bounced.');
				await skip(outcome === 'replied' ? 'Prospect replied.' : 'Email bounced.');
				continue;
			}
		} else if (sequence) {
			await skip('Lead already has a sequence.');
			continue;
		}

		try {
			const raw = buildRawMessage({
				from: settings.from,
				to: message.to_email,
				subject: message.subject,
				body: message.body,
				inReplyTo: message.step > 1 ? sequence?.last_rfc_message_id : null
			});
			const sent = await deps.sendMessage(token, raw, message.step > 1 ? sequence!.gmail_thread_id : null);
			const rfcId = await deps.rfcMessageId(token, sent.id).catch(() => null);
			await deps.finishMessage(message.message_id, { status: 'sent', gmail_message_id: sent.id });
			await deps.upsertSequence({
				lead_id: message.lead_id,
				to_email: message.to_email,
				state: message.step === 3 ? 'completed' : 'active',
				gmail_thread_id: sent.threadId,
				last_rfc_message_id: rfcId ?? sequence?.last_rfc_message_id ?? null,
				last_sent_at: now.toISOString(),
				...(message.step === 1 ? { first_subject: message.subject } : {})
			});
			if (message.step === 1) {
				await deps.updateLead(message.lead_id, { emailed: true });
				await deps.updateLead(message.lead_id, { status: 'contacted' }, EARLY_STATUSES);
			}
			report.sent += 1;
		} catch (error) {
			await deps.finishMessage(message.message_id, {
				status: 'failed',
				error: error instanceof Error ? error.message : String(error)
			});
			report.failed += 1;
		}
	}
	return report;
}

/** One cron run. */
export async function tick(deps: OutreachDeps, settings: OutreachSettings, now: Date): Promise<TickReport> {
	const token = await deps.accessToken();
	const stopped = await checkThreads(deps, settings, token);
	const planned = await planToday(deps, settings, now);
	const sent = await sendDue(deps, settings, token, now);
	return { stopped, planned, ...sent };
}
