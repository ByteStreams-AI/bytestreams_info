/**
 * FullCalendar fetches this for the visible month. Mirrors /calendar/events, which the
 * intranet already uses — same shape, same library, so the social month view is a second
 * view of an existing pattern rather than a new integration.
 */
import { error, json } from '@sveltejs/kit';
import { loadCalendar } from '$lib/server/social';
import { PILLAR_NAMES, STATUS_COLOR, FORMAT_ICON, isoToLocalInput } from '$lib/social';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const start = url.searchParams.get('start');
	const end = url.searchParams.get('end');
	if (!start || !end) throw error(400, 'start and end are required');

	const posts = await loadCalendar(start, end);
	return json(
		posts.map((p) => ({
			id: p.id,
			title: `${FORMAT_ICON[p.format] ?? ''} ${p.pillar} · ${p.caption.split('\n')[0].slice(0, 36)}`,
			// Central WALL TIME with no offset, which FullCalendar treats as "floating" and
			// renders exactly as given. So the grid reads Central for every viewer without a
			// named-timezone plugin — @fullcalendar/luxon3 would drag in luxon for what is a
			// display concern. Setting timeZone: 'America/Chicago' instead does NOT work: with
			// no plugin installed FullCalendar cannot convert, and renders wrong times silently.
			// Matters because the operator is moving from Central to Pacific; without this the
			// grid would say 9:00 while the list beside it said 11:00 CT for the same post.
			start: isoToLocalInput(p.scheduled_for),
			backgroundColor: STATUS_COLOR[p.status],
			borderColor: STATUS_COLOR[p.status],
			extendedProps: { status: p.status, pillar: p.pillar, pillarLabel: PILLAR_NAMES[p.pillar] ?? p.pillar, format: p.format }
		}))
	);
};
