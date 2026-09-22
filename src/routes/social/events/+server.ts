/**
 * FullCalendar fetches this for the visible month. Mirrors /calendar/events, which the
 * intranet already uses — same shape, same library, so the social month view is a second
 * view of an existing pattern rather than a new integration.
 */
import { error, json } from '@sveltejs/kit';
import { loadCalendar } from '$lib/server/social';
import { PILLAR_NAMES, STATUS_COLOR, FORMAT_ICON, formatLocal } from '$lib/social';
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
			// Central in the title, because the grid itself renders in the viewer's own zone.
			title: `${formatLocal(p.scheduled_for)} CT ${FORMAT_ICON[p.format] ?? ''} ${p.pillar} · ${p.caption.split('\n')[0].slice(0, 32)}`,
			start: p.scheduled_for,
			backgroundColor: STATUS_COLOR[p.status],
			borderColor: STATUS_COLOR[p.status],
			extendedProps: { status: p.status, pillar: p.pillar, pillarLabel: PILLAR_NAMES[p.pillar] ?? p.pillar, format: p.format }
		}))
	);
};
