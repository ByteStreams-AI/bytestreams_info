import { redirect, error } from '@sveltejs/kit';
import {
	isConnected,
	createEvent,
	updateEvent,
	deleteEvent,
	type GoogleCalendarEventInput
} from '$lib/server/google-calendar';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const connected = await isConnected(locals.user.email);
	return { user: locals.user, connected };
};

/** Splits a comma/newline-separated attendee list into trimmed emails. */
function parseAttendees(raw: FormDataEntryValue | null): string[] {
	if (!raw || typeof raw !== 'string') return [];
	return raw
		.split(/[,\n]/)
		.map((e) => e.trim())
		.filter(Boolean);
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const title = form.get('title');
		const description = form.get('description');
		const start_at = form.get('start_at');
		const end_at = form.get('end_at');
		const all_day = form.get('all_day') === 'true';
		const color = form.get('color');
		const attendees = parseAttendees(form.get('attendees'));

		if (!title || typeof title !== 'string' || !title.trim()) {
			throw error(400, 'Title is required');
		}
		if (!start_at || typeof start_at !== 'string') {
			throw error(400, 'Start time is required');
		}
		if (!end_at || typeof end_at !== 'string') {
			throw error(400, 'End time is required');
		}

		try {
			await createEvent(locals.user.email, {
				title: title.trim(),
				description: description && typeof description === 'string' && description.trim() ? description.trim() : null,
				start_at,
				end_at,
				all_day,
				color: color && typeof color === 'string' ? color : null,
				attendees
			});
		} catch (e) {
			throw error(502, e instanceof Error ? e.message : 'Failed to create event in Google Calendar');
		}

		return { success: true };
	},

	update: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const id = form.get('id');

		if (!id || typeof id !== 'string') throw error(400, 'Missing event id');

		const fields: Partial<GoogleCalendarEventInput> = {};

		const title = form.get('title');
		if (title && typeof title === 'string' && title.trim()) fields.title = title.trim();

		const description = form.get('description');
		if (description !== null) {
			fields.description = typeof description === 'string' && description.trim() ? description.trim() : null;
		}

		const start_at = form.get('start_at');
		if (start_at && typeof start_at === 'string') fields.start_at = start_at;

		const end_at = form.get('end_at');
		if (end_at && typeof end_at === 'string') fields.end_at = end_at;

		const all_day = form.get('all_day');
		if (all_day !== null) fields.all_day = all_day === 'true';

		const color = form.get('color');
		if (color !== null) fields.color = typeof color === 'string' && color ? color : null;

		if (form.has('attendees')) fields.attendees = parseAttendees(form.get('attendees'));

		try {
			await updateEvent(locals.user.email, id, fields);
		} catch (e) {
			throw error(502, e instanceof Error ? e.message : 'Failed to update event in Google Calendar');
		}
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const id = form.get('id');

		if (!id || typeof id !== 'string') throw error(400, 'Missing event id');

		try {
			await deleteEvent(locals.user.email, id);
		} catch (e) {
			throw error(502, e instanceof Error ? e.message : 'Failed to delete event in Google Calendar');
		}
		return { success: true };
	}
};
