import { redirect, error, fail } from '@sveltejs/kit';
import { approvePost, dismissRequest, loadQueue, regeneratePost, rejectPost, removePost, requestDraft, reschedulePost, retryPost, retryRequest } from '$lib/server/social';
import { GENERATED_FORMATS, GENERATED_PILLARS, localInputToIso, parseHashtags, quickCheck, upcomingOpenSlots, type GeneratedFormat } from '$lib/social';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const queue = await loadQueue();
	const openSlots = upcomingOpenSlots(queue.slots, queue.occupiedIso);
	return { ...queue, openSlots, user: locals.user };
};

function str(form: FormData, key: string): string {
	const v = form.get(key);
	return typeof v === 'string' ? v : '';
}

function withPost<T>(fn: (id: string, actor: string, form: FormData) => Promise<T>) {
	return async ({ request, locals }: { request: Request; locals: App.Locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const form = await request.formData();
		const id = str(form, 'id');
		if (!id) throw error(400, 'Missing id');
		try {
			await fn(id, locals.user.email, form);
			return { ok: true, id };
		} catch (e) {
			return fail(400, { id, error: e instanceof Error ? e.message : String(e) });
		}
	};
}

export const actions: Actions = {
	approve: withPost(async (id, actor, form) => {
		const caption = str(form, 'caption');
		const hashtags = parseHashtags(str(form, 'hashtags'));
		const problems = quickCheck(caption, hashtags);
		if (problems.length) throw new Error(problems.join(' '));
		await approvePost(id, actor, { caption, hashtags });
	}),
	reject: withPost((id, actor, form) => rejectPost(id, actor, str(form, 'reason').trim())),
	regenerate: withPost((id, actor, form) => regeneratePost(id, actor, str(form, 'reason').trim())),
	reschedule: withPost(async (id, actor, form) => {
		const iso = localInputToIso(str(form, 'scheduled_for'));
		if (!iso) throw new Error('Pick a date and time');
		await reschedulePost(id, actor, iso);
	}),
	remove: withPost((id, actor, form) => removePost(id, actor, str(form, 'reason').trim())),
	retry: withPost((id, actor) => retryPost(id, actor)),
	retryRequest: withPost((id, actor) => retryRequest(id, actor)),
	dismissRequest: withPost((id) => dismissRequest(id)),

	draft: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const form = await request.formData();
		const format = str(form, 'format') as GeneratedFormat;
		const pillar = str(form, 'pillar');
		const iso = str(form, 'slot') || localInputToIso(str(form, 'scheduled_for'));
		if (!GENERATED_FORMATS.includes(format)) return fail(400, { draftError: 'Pick a format: story, image or carousel.' });
		if (!(GENERATED_PILLARS as readonly string[]).includes(pillar)) return fail(400, { draftError: 'Pick a pillar P0–P3. Reels (P4–P6) are ingested, not drafted.' });
		if (!iso) return fail(400, { draftError: 'Pick a slot.' });
		try {
			await requestDraft({ format, pillar, scheduledForIso: iso, brief: str(form, 'brief') }, locals.user.email);
			return { drafted: true };
		} catch (e) {
			return fail(400, { draftError: e instanceof Error ? e.message : String(e) });
		}
	}
};
