/**
 * Server-only Supabase client using the service role key.
 * Never imported by client-side code — only used in +page.server.ts files.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Lead, LeadChange, CalendarEvent, LeadResearchFinding, ResearchReviewStatus } from '$lib/types';
import type { ResearchFindingDraft } from '$lib/server/restaurant-research';

type InsertRow = Record<string, string | number | boolean | null>;

const LEAD_FIELDS = `lead_id, business_name, phone, address, city, state, status, business_type, michelin_rating,
	offers_delivery, offers_pickup, uses_doordash_mktg, uses_chownow,
	price_range, yelp_rating, yelp_review_count,
	contact_name, email, website_url, notes, call_script, num_locations, has_website, has_app,
	uses_pos, uses_kds, uses_sms, created_at`;
const LEAD_PAGE_SIZE = 1000;

const RESTORABLE_LEAD_FIELDS = new Set([
	'lead_id', 'business_name', 'contact_name', 'phone', 'email', 'address', 'city', 'state',
	'source_url', 'scrape_source', 'status', 'business_type', 'michelin_rating', 'num_locations',
	'has_website', 'has_app', 'offers_delivery', 'offers_pickup', 'delivery_platforms',
	'uses_doordash_mktg', 'uses_chownow', 'uses_pos', 'uses_kds', 'uses_sms', 'notes',
	'call_script', 'website_url', 'price_range', 'yelp_rating', 'yelp_review_count',
	'created_at', 'updated_at'
]);

function getClient(actorEmail?: string) {
	const url = env.SUPABASE_URL?.trim();
	const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) {
		throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
	}
	return createClient(url, key, actorEmail
		? { global: { headers: { 'x-actor-email': actorEmail } } }
		: undefined);
}

/** Fetch all leads ordered by created_at descending. */
export async function fetchLeads(): Promise<Lead[]> {
	const client = getClient();
	const leads: Lead[] = [];

	for (let from = 0; ; from += LEAD_PAGE_SIZE) {
		const { data, error } = await client
			.from('leads')
			.select(LEAD_FIELDS)
			.order('created_at', { ascending: false })
			.order('lead_id', { ascending: true })
			.range(from, from + LEAD_PAGE_SIZE - 1);

		if (error) throw new Error(error.message);
		const page = (data ?? []) as Lead[];
		leads.push(...page);
		if (page.length < LEAD_PAGE_SIZE) return leads;
	}
}

/** Fetch one lead by ID for server-side actions. */
export async function fetchLead(leadId: string): Promise<Lead | null> {
	const client = getClient();
	const { data, error } = await client
		.from('leads')
		.select(LEAD_FIELDS)
		.eq('lead_id', leadId)
		.maybeSingle();

	if (error) throw new Error(error.message);
	return data as Lead | null;
}

/** Update only the sales-editable fields on a lead. Scraper fields are never touched. */
export async function updateLeadSalesFields(
	leadId: string,
	actorEmail: string,
	fields: {
		status?: string;
		contact_name?: string | null;
		email?: string | null;
		website_url?: string | null;
		notes?: string | null;
		call_script?: string | null;
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
	const client = getClient(actorEmail);
	const { error } = await client.from('leads').update(fields).eq('lead_id', leadId);
	if (error) throw new Error(error.message);
}

/** Insert a single manually-entered lead. */
export async function insertLead(row: InsertRow, actorEmail: string): Promise<void> {
	const client = getClient(actorEmail);
	const { error } = await client.from('leads').insert(row);
	if (error) throw new Error(error.message);
}

export async function fetchLeadResearchFindings(): Promise<LeadResearchFinding[]> {
	const client = getClient();
	const { data, error } = await client
		.from('lead_research_findings')
		.select('finding_id, run_id, lead_id, category, value, source_url, retrieved_at, confidence, review_status, reviewed_by_email, reviewed_at')
		.order('retrieved_at', { ascending: false })
		.limit(1000);

	if (error) throw new Error(error.message);
	return (data ?? []) as LeadResearchFinding[];
}

export async function fetchApprovedLeadResearchFindings(leadId: string): Promise<LeadResearchFinding[]> {
	const client = getClient();
	const { data, error } = await client
		.from('lead_research_findings')
		.select('finding_id, run_id, lead_id, category, value, source_url, retrieved_at, confidence, review_status, reviewed_by_email, reviewed_at')
		.eq('lead_id', leadId)
		.eq('review_status', 'approved')
		.order('retrieved_at', { ascending: false });

	if (error) throw new Error(error.message);
	return (data ?? []) as LeadResearchFinding[];
}

export async function createLeadResearchRun(
	leadId: string,
	sourceUrl: string,
	actorEmail: string
): Promise<string> {
	const client = getClient(actorEmail);
	const { data, error } = await client
		.from('lead_research_runs')
		.insert({ lead_id: leadId, status: 'running', source_url: sourceUrl, requested_by_email: actorEmail })
		.select('run_id')
		.single();

	if (error) throw new Error(error.code === '23505' ? 'Research is already running for this lead.' : error.message);
	return data.run_id as string;
}

export async function completeLeadResearchRun(
	runId: string,
	leadId: string,
	findings: ResearchFindingDraft[],
	actorEmail: string
): Promise<LeadResearchFinding[]> {
	const client = getClient(actorEmail);
	if (findings.length > 0) {
		const { error: findingError } = await client.from('lead_research_findings').insert(
			findings.map((finding) => ({
				run_id: runId,
				lead_id: leadId,
				category: finding.category,
				value: finding.value,
				source_url: finding.sourceUrl,
				confidence: finding.confidence
			}))
		);
		if (findingError) throw new Error(findingError.message);
	}

	const { error: runError } = await client
		.from('lead_research_runs')
		.update({ status: 'completed', completed_at: new Date().toISOString() })
		.eq('run_id', runId);
	if (runError) throw new Error(runError.message);

	const { data, error } = await client
		.from('lead_research_findings')
		.select('finding_id, run_id, lead_id, category, value, source_url, retrieved_at, confidence, review_status, reviewed_by_email, reviewed_at')
		.eq('run_id', runId)
		.order('category');
	if (error) throw new Error(error.message);
	return (data ?? []) as LeadResearchFinding[];
}

export async function failLeadResearchRun(runId: string, message: string, actorEmail: string): Promise<void> {
	const client = getClient(actorEmail);
	const { error } = await client
		.from('lead_research_runs')
		.update({ status: 'failed', completed_at: new Date().toISOString(), error_summary: message.slice(0, 1000) })
		.eq('run_id', runId);
	if (error) throw new Error(error.message);
}

export async function reviewLeadResearchFinding(
	findingId: string,
	status: ResearchReviewStatus,
	actorEmail: string
): Promise<void> {
	const client = getClient(actorEmail);
	const { error } = await client
		.from('lead_research_findings')
		.update({ review_status: status, reviewed_by_email: actorEmail, reviewed_at: new Date().toISOString() })
		.eq('finding_id', findingId);
	if (error) throw new Error(error.message);
}

export async function fetchLeadChanges(limit = 500): Promise<LeadChange[]> {
	const client = getClient();
	const { data, error } = await client
		.from('lead_change_log')
		.select('change_id, lead_id, operation, old_record, new_record, changed_at, changed_by, changed_by_email, transaction_id')
		.order('changed_at', { ascending: false })
		.limit(limit);

	if (error) throw new Error(error.message);
	return (data ?? []) as LeadChange[];
}

export async function restoreLeadChange(changeId: string, actorEmail: string): Promise<void> {
	const client = getClient(actorEmail);
	const { data: change, error: changeError } = await client
		.from('lead_change_log')
		.select('lead_id, operation, old_record')
		.eq('change_id', changeId)
		.maybeSingle();

	if (changeError) throw new Error(changeError.message);
	if (!change) throw new Error('Audit event not found.');
	if (change.operation === 'INSERT' || !change.old_record) {
		throw new Error('Insert events do not have a previous state to restore.');
	}

	const snapshot = Object.fromEntries(
		Object.entries(change.old_record as Record<string, unknown>).filter(([field]) =>
			RESTORABLE_LEAD_FIELDS.has(field)
		)
	);
	const leadId = typeof snapshot.lead_id === 'string' ? snapshot.lead_id : change.lead_id;
	if (!leadId) throw new Error('The audit event does not identify a lead.');

	if (change.operation === 'DELETE') {
		const { error } = await client.from('leads').insert(snapshot);
		if (error) throw new Error(error.message);
		return;
	}

	delete snapshot.lead_id;
	const { data, error } = await client
		.from('leads')
		.update(snapshot)
		.eq('lead_id', leadId)
		.select('lead_id')
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('The lead no longer exists; restore its delete event first.');
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

// ── File Storage ──────────────────────────────────────────────────────────────

const BUCKET = 'documents';

export interface StorageFile {
	name: string;
	size: number;
	updated_at: string;
	metadata: Record<string, string | number | null>;
}

/** List all files in the documents bucket. */
export async function listFiles(folder = ''): Promise<StorageFile[]> {
	const client = getClient();
	const { data, error } = await client.storage.from(BUCKET).list(folder, {
		sortBy: { column: 'updated_at', order: 'desc' }
	});
	if (error) throw new Error(error.message);
	return (data ?? [])
		.filter((f) => f.name !== '.emptyFolderPlaceholder')
		.map((f) => ({
			name: f.name,
			size: f.metadata?.size ?? 0,
			updated_at: f.updated_at ?? f.created_at ?? new Date().toISOString(),
			metadata: f.metadata ?? {}
		}));
}

/** Upload a file; returns the storage path. */
export async function uploadFile(path: string, file: File): Promise<string> {
	const client = getClient();
	const { error } = await client.storage.from(BUCKET).upload(path, file, { upsert: true });
	if (error) throw new Error(error.message);
	return path;
}

/** Generate a signed download URL valid for 1 hour. */
export async function getSignedUrl(path: string): Promise<string> {
	const client = getClient();
	const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
	if (error) throw new Error(error.message);
	return data.signedUrl;
}

/** Delete a file from the bucket. */
export async function deleteFile(path: string): Promise<void> {
	const client = getClient();
	const { error } = await client.storage.from(BUCKET).remove([path]);
	if (error) throw new Error(error.message);
}
