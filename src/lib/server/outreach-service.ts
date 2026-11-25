/**
 * Wires the outreach run loop to the real database, Gmail and settings.
 *
 * Settings (Worker vars or secrets):
 *   OUTREACH_SENDER          the connected Google account whose Gmail sends (required)
 *   OUTREACH_FROM            From header, e.g. "Steve Cotton <hello@bytestreams.ai>"; must be that
 *                            account or one of its Gmail "Send mail as" addresses (default: OUTREACH_SENDER)
 *   OUTREACH_FROM_NAME       name in the signature (required)
 *   OUTREACH_POSTAL_ADDRESS  physical mailing address in every footer, required by CAN-SPAM (required)
 *   OUTREACH_DAILY_LIMIT     emails per weekday, follow-ups included (default 25)
 *   OUTREACH_AUTO_APPROVE    "true" to send without the daily approval (default false)
 *   OUTREACH_CRON_SECRET     shared secret between the cron and /internal/outreach/tick (required)
 */

import { env } from '$env/dynamic/private';
import { getValidAccessToken, hasGmailAccess } from '$lib/server/google-calendar';
import { rfcMessageId, sendMessage, threadSenders } from '$lib/server/outreach-gmail';
import type { OutreachDeps, OutreachSettings } from '$lib/server/outreach-run';
import * as db from '$lib/server/supabase';

export interface OutreachStatus {
	settings: OutreachSettings | null;
	missing: string[];
}

/** Reads the settings, naming each required one that is missing. */
export function outreachSettings(source: Record<string, string | undefined> = env): OutreachStatus {
	const get = (name: string) => source[name]?.trim() || '';
	const senderAccount = get('OUTREACH_SENDER').toLowerCase();
	const fromName = get('OUTREACH_FROM_NAME');
	const postalAddress = get('OUTREACH_POSTAL_ADDRESS');
	const missing = [
		!senderAccount && 'OUTREACH_SENDER',
		!fromName && 'OUTREACH_FROM_NAME',
		!postalAddress && 'OUTREACH_POSTAL_ADDRESS'
	].filter((name): name is string => Boolean(name));
	if (missing.length) return { settings: null, missing };

	const limit = Number.parseInt(get('OUTREACH_DAILY_LIMIT') || '25', 10);
	return {
		missing,
		settings: {
			senderAccount,
			from: get('OUTREACH_FROM') || `${fromName} <${senderAccount}>`,
			fromName,
			postalAddress,
			dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 25,
			autoApprove: get('OUTREACH_AUTO_APPROVE').toLowerCase() === 'true'
		}
	};
}

export async function senderHasGmail(settings: OutreachSettings): Promise<boolean> {
	return hasGmailAccess(settings.senderAccount);
}

export function outreachDeps(settings: OutreachSettings): OutreachDeps {
	return {
		fetchCandidates: db.fetchOutreachCandidates,
		fetchLeads: db.fetchLeadsForOutreach,
		fetchSuppressed: db.fetchSuppressedEmails,
		addSuppression: (email, reason) => db.addOutreachSuppression(email, reason, null),
		fetchSequences: db.fetchOutreachSequences,
		fetchSentSteps: db.fetchSentSteps,
		upsertSequence: db.upsertOutreachSequence,
		hasPlannedDay: db.hasPlannedDay,
		recordPlannedDay: db.recordPlannedDay,
		insertMessages: db.insertOutreachMessages,
		claimDue: db.claimDueOutreachMessages,
		finishMessage: db.finishOutreachMessage,
		cancelMessages: db.cancelOutreachMessages,
		updateLead: db.updateLeadFromOutreach,
		accessToken: () => getValidAccessToken(settings.senderAccount),
		sendMessage: (token, raw, threadId) => sendMessage(token, raw, threadId),
		rfcMessageId: (token, id) => rfcMessageId(token, id),
		threadSenders: (token, threadId) => threadSenders(token, threadId)
	};
}
