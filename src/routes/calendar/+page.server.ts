import { redirect, error } from '@sveltejs/kit';
import { fetchEvents, createEvent, updateEvent, deleteEvent } from '$lib/server/supabase';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const events = await fetchEvents();
	return { events, user: locals.user };
};

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

		if (!title || typeof title !== 'string' || !title.trim()) {
			throw error(400, 'Title is required');
		}
		if (!start_at || typeof start_at !== 'string') {
			throw error(400, 'Start time is required');
		}
		if (!end_at || typeof end_at !== 'string') {
			throw error(400, 'End time is required');
		}

		await createEvent({
			title: title.trim(),
			description: description && typeof description === 'string' && description.trim() ? description.trim() : null,
			start_at,
			end_at,
			all_day,
			color: color && typeof color === 'string' ? color : null,
			created_by: locals.user.email
		});

		return { success: true };
	},

	update: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const id = form.get('id');

		if (!id || typeof id !== 'string') throw error(400, 'Missing event id');

		const fields: Record<string, string | boolean | null> = {};

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

		await updateEvent(id, fields);
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const id = form.get('id');

		if (!id || typeof id !== 'string') throw error(400, 'Missing event id');

		await deleteEvent(id);
		return { success: true };
	}
};
