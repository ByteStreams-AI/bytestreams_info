import { redirect, error, fail } from '@sveltejs/kit';
import {
	completeLeadResearchRun,
	createLeadResearchRun,
	failLeadResearchRun,
	fetchApprovedLeadResearchFindings,
	fetchLead,
	fetchLeadResearchFindings,
	fetchLeads,
	insertLead,
	reviewLeadResearchFinding,
	updateLeadSalesFields
} from '$lib/server/supabase';
import { generateCallScript } from '$lib/server/call-script';
import { researchRestaurantWebsite } from '$lib/server/restaurant-research';
import { normalizePhoneUri } from '$lib/phone';
import type { PageServerLoad, Actions } from './$types';

/** Editable status values — all valid lead statuses. */
const VALID_STATUSES = [
	'new',
	'researched',
	'reviewed',
	'prospect',
	'contacted',
	'followup_required',
	'demo_scheduled',
	'closed_won',
	'customer',
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

	const [leads, researchFindings] = await Promise.all([
		fetchLeads(),
		fetchLeadResearchFindings()
	]);

	return { leads, researchFindings, user: locals.user };
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

		const textFields = ['contact_name', 'email', 'website_url', 'notes', 'call_script', 'uses_pos', 'business_type', 'michelin_rating'] as const;
		for (const field of textFields) {
			if (READONLY_FIELDS.has(field)) continue;
			const val = form.get(field);
			if (val !== null) {
				payload[field] = typeof val === 'string' && val.trim() === '' ? null : (val as string);
			}
		}

		const contactPhone = form.get('contact_phone');
		if (typeof contactPhone === 'string') {
			try {
				payload.contact_phone = contactPhone.trim() ? normalizePhoneUri(contactPhone) : null;
			} catch (phoneError) {
				return fail(400, {
					message: phoneError instanceof Error ? phoneError.message : 'Contact phone number is invalid.'
				});
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

		await updateLeadSalesFields(leadId, locals.user.email, payload);

		return { success: true };
	},

	generateScript: async ({ request, locals, platform }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const leadId = form.get('lead_id');
		if (!leadId || typeof leadId !== 'string') {
			return fail(400, { message: 'Missing lead ID.' });
		}

		try {
			const lead = await fetchLead(leadId);
			if (!lead) return fail(404, { message: 'Lead not found.' });
			if (lead.status !== 'researched' && lead.status !== 'reviewed') {
				return fail(400, { message: 'Save the lead as Researched or Reviewed before generating a script.' });
			}
			if (!platform?.env.AI) {
				return fail(503, { message: 'AI generation is not available in this environment.' });
			}

			const approvedFindings = await fetchApprovedLeadResearchFindings(leadId);
			const callScript = await generateCallScript(platform.env.AI, lead, approvedFindings);
			await updateLeadSalesFields(leadId, locals.user.email, { call_script: callScript });
			return { success: true, call_script: callScript };
		} catch (generationError) {
			const errorMessage = generationError instanceof Error ? generationError.message : String(generationError);
			console.error(JSON.stringify({
				message: 'call script generation failed',
				leadId,
				error: errorMessage
			}));
			return fail(500, { message: `Unable to generate the call script: ${errorMessage}` });
		}
	},

	researchRestaurant: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const leadId = form.get('lead_id');
		if (!leadId || typeof leadId !== 'string') {
			return fail(400, { message: 'Missing lead ID.' });
		}

		const lead = await fetchLead(leadId);
		if (!lead) return fail(404, { message: 'Lead not found.' });
		if (!lead.website_url?.trim()) {
			return fail(400, { message: 'Add and save the official website before researching this restaurant.' });
		}

		let runId: string | null = null;
		try {
			runId = await createLeadResearchRun(leadId, lead.website_url, locals.user.email);
			const result = await researchRestaurantWebsite(lead.website_url);
			const findings = await completeLeadResearchRun(runId, leadId, result.findings, locals.user.email);
			return { success: true, findings };
		} catch (researchError) {
			const errorMessage = researchError instanceof Error ? researchError.message : String(researchError);
			if (runId) {
				try {
					await failLeadResearchRun(runId, errorMessage, locals.user.email);
				} catch (persistenceError) {
					console.error(JSON.stringify({
						message: 'failed to record restaurant research failure',
						leadId,
						runId,
						error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError)
					}));
				}
			}
			console.error(JSON.stringify({ message: 'restaurant research failed', leadId, error: errorMessage }));
			return fail(502, { message: `Unable to research the restaurant: ${errorMessage}` });
		}
	},

	reviewResearchFinding: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const form = await request.formData();
		const findingId = form.get('finding_id');
		const reviewStatus = form.get('review_status');
		if (!findingId || typeof findingId !== 'string') {
			return fail(400, { message: 'Missing finding ID.' });
		}
		if (reviewStatus !== 'approved' && reviewStatus !== 'rejected') {
			return fail(400, { message: 'Invalid review status.' });
		}

		try {
			await reviewLeadResearchFinding(findingId, reviewStatus, locals.user.email);
			return { success: true, finding_id: findingId, review_status: reviewStatus };
		} catch (reviewError) {
			return fail(500, {
				message: reviewError instanceof Error ? reviewError.message : 'Unable to review this finding.'
			});
		}
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

		const phone = (form.get('phone') as string | null)?.trim();
		if (phone) {
			try {
				row.phone = normalizePhoneUri(phone);
			} catch (phoneError) {
				return fail(400, {
					message: phoneError instanceof Error ? phoneError.message : 'Phone number is invalid.'
				});
			}
		}

		const contactPhone = (form.get('contact_phone') as string | null)?.trim();
		if (contactPhone) {
			try {
				row.contact_phone = normalizePhoneUri(contactPhone);
			} catch (phoneError) {
				return fail(400, {
					message: phoneError instanceof Error ? phoneError.message : 'Contact phone number is invalid.'
				});
			}
		}

		for (const field of ['address', 'contact_name', 'email', 'website_url', 'notes', 'business_type'] as const) {
			const val = (form.get(field) as string | null)?.trim() || null;
			if (val) row[field] = val;
		}

		try {
			await insertLead(row, locals.user.email);
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : 'Failed to save lead.' });
		}

		return { success: true };
	}
};
