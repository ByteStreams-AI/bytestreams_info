/**
 * Server-only Supabase client using the service role key.
 * Never imported by client-side code — only used in +page.server.ts files.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Lead, CalendarEvent } from '$lib/types';

function getClient() {
	const url = env.SUPABASE_URL?.trim();
	const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) {
		throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
	}
	return createClient(url, key);
}

/** Fetch all leads ordered by created_at descending. */
export async function fetchLeads(): Promise<Lead[]> {
	const client = getClient();
	const { data, error } = await client
		.from('leads')
		.select(
			`lead_id, business_name, phone, address, city, status, business_type, michelin_rating,
			 offers_delivery, offers_pickup, uses_doordash_mktg, uses_chownow,
			 price_range, yelp_rating, yelp_review_count,
			 contact_name, email, website_url, notes, num_locations, has_website, has_app,
			 uses_pos, uses_kds, uses_sms, created_at`
		)
		.order('created_at', { ascending: false });

	if (error) throw new Error(error.message);
	return (data ?? []) as Lead[];
}

/** Update only the sales-editable fields on a lead. Scraper fields are never touched. */
export async function updateLeadSalesFields(
	leadId: string,
	fields: {
		status?: string;
		contact_name?: string | null;
		email?: string | null;
		website_url?: string | null;
		notes?: string | null;
		num_locations?: number | null;
		business_type?: string | null;
		michelin_rating?: string | null;
		has_website?: boolean | null;
		has_app?: boolean | null;
		uses_pos?: string | null;
		uses_kds?: boolean | null;
		uses_sms?: boolean | null;
	}
): Promise<void> {
	const client = getClient();
	const { error } = await client.from('leads').update(fields).eq('lead_id', leadId);
	if (error) throw new Error(error.message);
}

// ── Calendar Events ───────────────────────────────────────────────────────────

/** Fetch all events, ordered by start time. */
export async function fetchEvents(): Promise<CalendarEvent[]> {
	const client = getClient();
	const { data, error } = await client
		.from('events')
		.select('id, title, description, start_at, end_at, all_day, color, created_by, created_at, updated_at')
		.order('start_at', { ascending: true });
	if (error) throw new Error(error.message);
	return (data ?? []) as CalendarEvent[];
}

/** Create a new event. Returns the created row. */
export async function createEvent(fields: {
	title: string;
	description?: string | null;
	start_at: string;
	end_at: string;
	all_day?: boolean;
	color?: string | null;
	created_by: string;
}): Promise<CalendarEvent> {
	const client = getClient();
	const { data, error } = await client.from('events').insert(fields).select().single();
	if (error) throw new Error(error.message);
	return data as CalendarEvent;
}

/** Update an existing event by id. */
export async function updateEvent(
	id: string,
	fields: {
		title?: string;
		description?: string | null;
		start_at?: string;
		end_at?: string;
		all_day?: boolean;
		color?: string | null;
	}
): Promise<void> {
	const client = getClient();
	const { error } = await client.from('events').update(fields).eq('id', id);
	if (error) throw new Error(error.message);
}

/** Delete an event by id. */
export async function deleteEvent(id: string): Promise<void> {
	const client = getClient();
	const { error } = await client.from('events').delete().eq('id', id);
	if (error) throw new Error(error.message);
}
