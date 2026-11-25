import { redirect, error, fail } from '@sveltejs/kit';
import { isSendingDay, localDate, nextSendingDay, sendTimesFrom } from '$lib/server/outreach';
import { planToday } from '$lib/server/outreach-run';
import { outreachDeps, outreachSettings, senderHasGmail } from '$lib/server/outreach-service';
import {
	addOutreachSuppression,
	approveOutreachMessages,
	cancelOutreachMessages,
	fetchOutreachMessagesFor,
	fetchOutreachSequences,
	hasPlannedDay,
	retryOutreachMessage,
	skipOutreachMessage,
	upsertOutreachSequence
} from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');

	const { settings, missing } = outreachSettings();
	const today = localDate(new Date());
	const [messages, sequences, planned, gmailConnected] = await Promise.all([
		fetchOutreachMessagesFor(today),
		fetchOutreachSequences(),
		hasPlannedDay(today),
		settings ? senderHasGmail(settings) : Promise.resolve(false)
	]);

	return {
		user: locals.user,
		today,
		nextSendingDay: isSendingDay(today) ? null : nextSendingDay(today),
		missing,
		sender: settings ? { account: settings.senderAccount, from: settings.from, dailyLimit: settings.dailyLimit, autoApprove: settings.autoApprove } : null,
		isSender: settings?.senderAccount === locals.user.email.toLowerCase(),
		gmailConnected,
		planned,
		messages,
		sequences: sequences.slice(0, 100),
		googleError: url.searchParams.get('gcal_error')
	};
};

function text(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

export const actions: Actions = {
	planNow: async ({ locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const { settings, missing } = outreachSettings();
		if (!settings) return fail(503, { message: `Outreach is not configured: ${missing.join(', ')}.` });
		const planned = await planToday(outreachDeps(settings), settings, new Date());
		return { message: planned ? `Planned ${planned} emails for today.` : 'Nothing to plan: today is already planned, it is before 7:00, or it is a weekend or holiday.' };
	},

	approveAll: async ({ locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const today = localDate(new Date());
		const pending = (await fetchOutreachMessagesFor(today)).filter((message) => message.status === 'pending');
		if (pending.length === 0) return fail(400, { message: 'Nothing is waiting for approval.' });
		// Approved on a weekend or holiday: spread over the next sending day's window instead.
		const sendDay = nextSendingDay(today);
		const times = sendTimesFrom(sendDay, pending.length, new Date());
		const approved = await approveOutreachMessages(
			pending.map((message, index) => ({ message_id: message.message_id, send_after: times[index] })),
			locals.user.email
		);
		return {
			message: isSendingDay(today)
				? `Approved ${approved} emails. They go out spread across the morning.`
				: `Approved ${approved} emails. Today is a weekend or holiday, so they go out ${sendDay} between 9:00 and 11:30 Central.`
		};
	},

	skip: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const id = text(await request.formData(), 'message_id');
		if (!id) return fail(400, { message: 'Missing message.' });
		await skipOutreachMessage(id, locals.user.email);
		return { message: 'Removed from today.' };
	},

	retry: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const id = text(await request.formData(), 'message_id');
		if (!id) return fail(400, { message: 'Missing message.' });
		await retryOutreachMessage(id, locals.user.email);
		return { message: 'Queued again. It goes out on the next run, within 15 minutes before noon Central.' };
	},

	optOut: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const form = await request.formData();
		const leadId = text(form, 'lead_id');
		const email = text(form, 'email');
		if (!leadId || !email) return fail(400, { message: 'Missing lead or email.' });
		await addOutreachSuppression(email, 'opted_out', locals.user.email);
		await upsertOutreachSequence({ lead_id: leadId, state: 'opted_out', stopped_reason: `Opted out (recorded by ${locals.user.email}).` });
		await cancelOutreachMessages(leadId, 'Opted out.');
		return { message: `${email} will never be emailed again.` };
	},

	stop: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const leadId = text(await request.formData(), 'lead_id');
		if (!leadId) return fail(400, { message: 'Missing lead.' });
		await upsertOutreachSequence({ lead_id: leadId, state: 'stopped', stopped_reason: `Stopped by ${locals.user.email}.` });
		await cancelOutreachMessages(leadId, `Stopped by ${locals.user.email}.`);
		return { message: 'Sequence stopped.' };
	}
};
