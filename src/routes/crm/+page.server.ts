import { redirect, error, fail } from '@sveltejs/kit';
import { fetchLeads, updateLeadSalesFields, insertLead } from '$lib/server/supabase';
import type { PageServerLoad, Actions } from './$types';

/** Editable status values — all valid lead statuses. */
const VALID_STATUSES = [
	'new',
	'researched',
	'contacted',
	'followup_required',
	'demo_scheduled',
	'closed_won',
	'closed_lost'
] as const;

/** Read-only scraper fields — never written by this route. */
const READONLY_FIELDS = new Set([
	'business_name',
	'phone',
	'address',
	'city',
	'source_url',
	'scrape_source',
	'offers_delivery',
	'offers_pickup',
	'delivery_platforms',
	'uses_doordash_mktg',
	'uses_chownow',
	'created_at'
]);

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const leads = await fetchLeads();

	return { leads, user: locals.user };
};

export const actions: Actions = {
		update: async ({ request, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const form = await request.formData();
		const leadId = form.get('lead_id');

		if (!leadId || typeof leadId !== 'string') {
			throw error(400, 'Missing lead_id');
		}

		// Build update payload — only sales-editable fields
		const status = form.get('status');
		const payload: Record<string, string | number | boolean | null> = {};

		if (status && typeof status === 'string' && VALID_STATUSES.includes(status as never)) {
			payload.status = status;
		}

		const textFields = ['contact_name', 'email', 'website_url', 'notes', 'uses_pos', 'business_type', 'michelin_rating'] as const;
		for (const field of textFields) {
			if (READONLY_FIELDS.has(field)) continue;
			const val = form.get(field);
			if (val !== null) {
				payload[field] = typeof val === 'string' && val.trim() === '' ? null : (val as string);
			}
		}

		const numVal = form.get('num_locations');
		if (numVal !== null) {
			const n = parseInt(numVal as string, 10);
			payload.num_locations = isNaN(n) ? null : n;
		}

		for (const boolField of ['uses_kds', 'uses_sms', 'has_app'] as const) {
			const val = form.get(boolField);
			if (val !== null) {
				payload[boolField] = val === 'true';
			}
		}

		await updateLeadSalesFields(leadId, payload);

		return { success: true };
	},

	create: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const business_name = (form.get('business_name') as string | null)?.trim() ?? '';
		const city = (form.get('city') as string | null)?.trim() ?? '';
		const state = (form.get('state') as string | null)?.trim() ?? '';

		if (!business_name) return fail(400, { message: 'Business name is required.' });
		if (!city) return fail(400, { message: 'City is required.' });
		if (!state) return fail(400, { message: 'State is required.' });

		const row: Record<string, string | null> = { business_name, city, state };

		for (const field of ['phone', 'address', 'contact_name', 'email', 'website_url', 'notes', 'business_type'] as const) {
			const val = (form.get(field) as string | null)?.trim() || null;
			if (val) row[field] = val;
		}

		try {
			await insertLead(row);
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : 'Failed to save lead.' });
		}

		return { success: true };
	}
};
