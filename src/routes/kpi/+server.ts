import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CONTACTED_OR_LATER_STATUSES = [
	'contacted',
	'followup_required',
	'demo_scheduled',
	'pilot',
	'closed_won',
	'customer',
	'closed_lost'
];

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const url = env.SUPABASE_URL?.trim();
	const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) {
		return new Response(JSON.stringify({ error: 'CRM Supabase not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
	}

	const sb = createClient(url, key);

	const [totalRes, contactedRes, emailedRes, calledRes, demosRes, pilotsRes, customersRes] = await Promise.all([
		sb.from('leads').select('lead_id', { count: 'exact', head: true }),
		sb.from('leads').select('lead_id', { count: 'exact', head: true }).in('status', CONTACTED_OR_LATER_STATUSES),
		sb.from('leads').select('lead_id', { count: 'exact', head: true }).eq('emailed', true),
		sb.from('leads').select('lead_id', { count: 'exact', head: true }).eq('called', true),
		sb.from('leads').select('lead_id', { count: 'exact', head: true }).eq('status', 'demo_scheduled'),
		sb.from('leads').select('lead_id', { count: 'exact', head: true }).eq('status', 'pilot'),
		sb.from('leads').select('lead_id', { count: 'exact', head: true }).eq('status', 'customer')
	]);

	const queryError = [totalRes, contactedRes, emailedRes, calledRes, demosRes, pilotsRes, customersRes]
		.find((result) => result.error)?.error;
	if (queryError) {
		return new Response(JSON.stringify({ error: queryError.message }), { status: 502, headers: { 'Content-Type': 'application/json' } });
	}

	return new Response(JSON.stringify({
		generated_at: new Date().toISOString(),
		total_contacts: totalRes.count ?? 0,
		contacted_or_beyond: contactedRes.count ?? 0,
		emailed: emailedRes.count ?? 0,
		called: calledRes.count ?? 0,
		demos: demosRes.count ?? 0,
		pilots: pilotsRes.count ?? 0,
		customers: customersRes.count ?? 0
	}), { headers: { 'Content-Type': 'application/json' } });
};
