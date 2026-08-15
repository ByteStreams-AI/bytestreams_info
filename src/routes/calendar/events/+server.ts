import { json, error } from '@sveltejs/kit';
import { listEvents } from '$lib/server/google-calendar';
import type { RequestHandler } from './$types';

/** JSON event feed consumed directly by FullCalendar (it appends start/end for the visible range). */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const start = url.searchParams.get('start');
	const end = url.searchParams.get('end');
	if (!start || !end) throw error(400, 'Missing start/end');

	try {
		const events = await listEvents(locals.user.email, start, end);
		return json(
			events.map((e) => ({
				id: e.id,
				title: e.title,
				start: e.start_at,
				end: e.end_at,
				allDay: e.all_day,
				backgroundColor: e.color ?? '#3b82f6',
				borderColor: e.color ?? '#3b82f6',
				extendedProps: {
					description: e.description,
					created_by: e.created_by,
					attendees: e.attendees
				}
			}))
		);
	} catch (e) {
		throw error(502, e instanceof Error ? e.message : 'Failed to load events from Google Calendar');
	}
};
