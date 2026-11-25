/**
 * Server-only Supabase client using the service role key.
 * Never imported by client-side code — only used in +page.server.ts files.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Lead, LeadChange, CalendarEvent, LeadResearchFinding, ResearchReviewStatus } from '$lib/types';
import type { ResearchFindingDraft } from '$lib/server/restaurant-research';

type InsertRow = Record<string, string | number | boolean | null>;

const LEAD_FIELDS = `lead_id, business_name, phone, contact_phone, address, city, state, status, business_type, michelin_rating,
	offers_delivery, offers_pickup, marketplace_providers, first_party_ordering,
	price_range, yelp_rating, yelp_review_count,
	contact_name, email, linkedin_url, emailed, called, website_url, notes, call_script, num_locations, has_website, has_app,
	uses_pos, uses_kds, uses_sms, product, clinical_specialty, npi, npi_entity_type, created_at`;
const LEAD_PAGE_SIZE = 1000;

const RESTORABLE_LEAD_FIELDS = new Set([
	'lead_id', 'business_name', 'contact_name', 'contact_phone', 'phone', 'email', 'address', 'city', 'state',
	'source_url', 'scrape_source', 'status', 'business_type', 'michelin_rating', 'num_locations',
	'has_website', 'has_app', 'offers_delivery', 'offers_pickup', 'delivery_platforms',
	'marketplace_providers', 'first_party_ordering', 'uses_pos', 'uses_kds', 'uses_sms', 'notes',
	'call_script', 'website_url', 'linkedin_url', 'price_range', 'yelp_rating', 'yelp_review_count',
	'product', 'clinical_specialty', 'npi', 'npi_entity_type',
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
		contact_phone?: string | null;
		email?: string | null;
		emailed?: boolean;
		called?: boolean;
		website_url?: string | null;
		linkedin_url?: string | null;
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
		clinical_specialty?: string | null;
		npi?: string | null;
		npi_entity_type?: string | null;
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
): Promise<Pick<LeadResearchFinding, 'lead_id' | 'category' | 'value'>> {
	const client = getClient(actorEmail);
	const { data, error } = await client
		.from('lead_research_findings')
		.update({ review_status: status, reviewed_by_email: actorEmail, reviewed_at: new Date().toISOString() })
		.eq('finding_id', findingId)
		.select('lead_id, category, value')
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('Finding not found.');
	return data as Pick<LeadResearchFinding, 'lead_id' | 'category' | 'value'>;
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

// ── Google Calendar OAuth Tokens ──────────────────────────────────────────────

export interface GoogleCalendarTokens {
	access_token: string;
	refresh_token: string;
	expires_at: string; // ISO 8601
	scope: string;
}

/** Fetch a user's stored Google Calendar OAuth tokens, if they've connected. */
export async function getGoogleCalendarTokens(userEmail: string): Promise<GoogleCalendarTokens | null> {
	const client = getClient();
	const { data, error } = await client
		.from('google_calendar_tokens')
		.select('access_token, refresh_token, expires_at, scope')
		.eq('user_email', userEmail)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data as GoogleCalendarTokens | null;
}

/** Upsert a user's Google Calendar OAuth tokens (initial connect or refresh). */
export async function saveGoogleCalendarTokens(userEmail: string, tokens: GoogleCalendarTokens): Promise<void> {
	const client = getClient();
	const { error } = await client
		.from('google_calendar_tokens')
		.upsert({ user_email: userEmail, ...tokens }, { onConflict: 'user_email' });
	if (error) throw new Error(error.message);
}

/** Remove a user's stored Google Calendar OAuth tokens (disconnect). */
export async function deleteGoogleCalendarTokens(userEmail: string): Promise<void> {
	const client = getClient();
	const { error } = await client.from('google_calendar_tokens').delete().eq('user_email', userEmail);
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

// ── Outreach (developer/migrations/024_create_outreach.sql) ─────────────────

export type OutreachMessageStatus = 'pending' | 'approved' | 'sending' | 'sent' | 'skipped' | 'failed';
export type OutreachSequenceState = 'active' | 'replied' | 'bounced' | 'opted_out' | 'completed' | 'stopped';

export interface OutreachMessageRow {
	message_id: string;
	lead_id: string;
	step: 1 | 2 | 3;
	to_email: string;
	subject: string;
	body: string;
	status: OutreachMessageStatus;
	planned_for: string;
	send_after: string | null;
	sent_at: string | null;
	error: string | null;
	leads?: { business_name: string; city: string | null; contact_name: string | null } | null;
}

export interface OutreachSequenceRow {
	lead_id: string;
	to_email: string;
	state: OutreachSequenceState;
	gmail_thread_id: string | null;
	last_rfc_message_id: string | null;
	first_subject: string | null;
	last_sent_at: string | null;
	stopped_reason: string | null;
	updated_at?: string;
	leads?: { business_name: string; city: string | null } | null;
}

export interface OutreachCandidate {
	lead_id: string;
	business_name: string;
	contact_name: string | null;
	email: string | null;
	business_type: string | null;
	clinical_specialty: string | null;
	product: string;
	status: string;
	emailed: boolean | null;
}

const OUTREACH_MESSAGE_FIELDS =
	'message_id, lead_id, step, to_email, subject, body, status, planned_for, send_after, sent_at, error';

/** Med leads that could start a sequence: not emailed, with an email, never sequenced. Oldest first. */
export async function fetchOutreachCandidates(): Promise<OutreachCandidate[]> {
	const client = getClient();
	const { data: sequenced, error: sequenceError } = await client.from('outreach_sequences').select('lead_id');
	if (sequenceError) throw new Error(sequenceError.message);
	const skip = new Set((sequenced ?? []).map((row) => row.lead_id as string));

	const { data, error } = await client
		.from('leads')
		.select('lead_id, business_name, contact_name, email, business_type, clinical_specialty, product, status, emailed')
		.eq('product', 'dialtone_med')
		.not('email', 'is', null)
		.or('emailed.is.null,emailed.eq.false')
		.in('status', ['new', 'researched', 'reviewed', 'prospect'])
		.order('created_at', { ascending: true })
		.limit(1000);
	if (error) throw new Error(error.message);
	return ((data ?? []) as OutreachCandidate[]).filter((lead) => !skip.has(lead.lead_id));
}

export async function fetchSuppressedEmails(): Promise<Set<string>> {
	const { data, error } = await getClient().from('outreach_suppressions').select('email');
	if (error) throw new Error(error.message);
	return new Set((data ?? []).map((row) => row.email as string));
}

export async function addOutreachSuppression(email: string, reason: 'opted_out' | 'bounced' | 'manual', actorEmail: string | null): Promise<void> {
	const { error } = await getClient(actorEmail ?? undefined)
		.from('outreach_suppressions')
		.upsert({ email: email.trim().toLowerCase(), reason, created_by_email: actorEmail }, { onConflict: 'email' });
	if (error) throw new Error(error.message);
}

export async function fetchOutreachSequences(states?: OutreachSequenceState[]): Promise<OutreachSequenceRow[]> {
	let query = getClient()
		.from('outreach_sequences')
		.select('lead_id, to_email, state, gmail_thread_id, last_rfc_message_id, first_subject, last_sent_at, stopped_reason, updated_at, leads(business_name, city)')
		.order('updated_at', { ascending: false })
		.limit(500);
	if (states) query = query.in('state', states);
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return (data ?? []) as unknown as OutreachSequenceRow[];
}

/** The highest step sent per lead, for active sequences. */
export async function fetchSentSteps(leadIds: string[]): Promise<Map<string, number>> {
	const steps = new Map<string, number>();
	if (leadIds.length === 0) return steps;
	const { data, error } = await getClient()
		.from('outreach_messages')
		.select('lead_id, step')
		.eq('status', 'sent')
		.in('lead_id', leadIds);
	if (error) throw new Error(error.message);
	for (const row of data ?? []) steps.set(row.lead_id, Math.max(steps.get(row.lead_id) ?? 0, row.step));
	return steps;
}

export async function upsertOutreachSequence(row: Partial<OutreachSequenceRow> & { lead_id: string }): Promise<void> {
	const { error } = await getClient().from('outreach_sequences').upsert(row, { onConflict: 'lead_id' });
	if (error) throw new Error(error.message);
}

export async function hasPlannedDay(day: string): Promise<boolean> {
	const { data, error } = await getClient().from('outreach_plan_days').select('day').eq('day', day).maybeSingle();
	if (error) throw new Error(error.message);
	return data !== null;
}

export async function recordPlannedDay(day: string, plannedCount: number): Promise<void> {
	const { error } = await getClient()
		.from('outreach_plan_days')
		.upsert({ day, planned_count: plannedCount }, { onConflict: 'day' });
	if (error) throw new Error(error.message);
}

export async function insertOutreachMessages(
	rows: Omit<OutreachMessageRow, 'message_id' | 'sent_at' | 'error' | 'leads'>[]
): Promise<void> {
	if (rows.length === 0) return;
	const { error } = await getClient()
		.from('outreach_messages')
		.upsert(rows, { onConflict: 'lead_id,step', ignoreDuplicates: true });
	if (error) throw new Error(error.message);
}

export async function fetchOutreachMessagesFor(day: string): Promise<OutreachMessageRow[]> {
	const { data, error } = await getClient()
		.from('outreach_messages')
		.select(`${OUTREACH_MESSAGE_FIELDS}, leads(business_name, city, contact_name)`)
		.eq('planned_for', day)
		.order('step', { ascending: false })
		.order('created_at', { ascending: true });
	if (error) throw new Error(error.message);
	return (data ?? []) as unknown as OutreachMessageRow[];
}

/** Approves pending messages, giving each its send time. Returns how many were approved. */
export async function approveOutreachMessages(
	approvals: { message_id: string; send_after: string }[],
	actorEmail: string
): Promise<number> {
	const client = getClient(actorEmail);
	let approved = 0;
	for (const approval of approvals) {
		const { data, error } = await client
			.from('outreach_messages')
			.update({ status: 'approved', send_after: approval.send_after, approved_by_email: actorEmail, approved_at: new Date().toISOString() })
			.eq('message_id', approval.message_id)
			.eq('status', 'pending')
			.select('message_id');
		if (error) throw new Error(error.message);
		approved += data?.length ?? 0;
	}
	return approved;
}

export async function skipOutreachMessage(messageId: string, actorEmail: string): Promise<void> {
	const { error } = await getClient(actorEmail)
		.from('outreach_messages')
		.update({ status: 'skipped', error: `Removed by ${actorEmail}` })
		.eq('message_id', messageId)
		.in('status', ['pending', 'approved']);
	if (error) throw new Error(error.message);
}

/** Atomically claims approved messages that are due, so two overlapping runs cannot both send one. */
export async function claimDueOutreachMessages(nowIso: string, limit: number): Promise<OutreachMessageRow[]> {
	const client = getClient();
	const { data: due, error: dueError } = await client
		.from('outreach_messages')
		.select('message_id')
		.eq('status', 'approved')
		.lte('send_after', nowIso)
		.order('send_after', { ascending: true })
		.limit(limit);
	if (dueError) throw new Error(dueError.message);
	const ids = (due ?? []).map((row) => row.message_id as string);
	if (ids.length === 0) return [];

	const { data, error } = await client
		.from('outreach_messages')
		.update({ status: 'sending' })
		.in('message_id', ids)
		.eq('status', 'approved')
		.select(OUTREACH_MESSAGE_FIELDS);
	if (error) throw new Error(error.message);
	return (data ?? []) as OutreachMessageRow[];
}

export async function finishOutreachMessage(
	messageId: string,
	result: { status: 'sent'; gmail_message_id: string } | { status: 'failed' | 'skipped'; error: string }
): Promise<void> {
	const update = result.status === 'sent'
		? { status: 'sent', gmail_message_id: result.gmail_message_id, sent_at: new Date().toISOString(), error: null }
		: { status: result.status, error: result.error.slice(0, 1000) };
	const { error } = await getClient().from('outreach_messages').update(update).eq('message_id', messageId);
	if (error) throw new Error(error.message);
}

/** Cancels every unsent message for a lead whose sequence has stopped. */
export async function cancelOutreachMessages(leadId: string, reason: string): Promise<void> {
	const { error } = await getClient()
		.from('outreach_messages')
		.update({ status: 'skipped', error: reason })
		.eq('lead_id', leadId)
		.in('status', ['pending', 'approved']);
	if (error) throw new Error(error.message);
}

export async function updateLeadFromOutreach(
	leadId: string,
	fields: { emailed?: boolean; status?: string },
	onlyFromStatuses?: string[]
): Promise<void> {
	let query = getClient('outreach@bytestreams.info').from('leads').update(fields).eq('lead_id', leadId);
	if (onlyFromStatuses) query = query.in('status', onlyFromStatuses);
	const { error } = await query;
	if (error) throw new Error(error.message);
}

export async function fetchLeadsForOutreach(leadIds: string[]): Promise<OutreachCandidate[]> {
	if (leadIds.length === 0) return [];
	const { data, error } = await getClient()
		.from('leads')
		.select('lead_id, business_name, contact_name, email, business_type, clinical_specialty, product, status, emailed')
		.in('lead_id', leadIds);
	if (error) throw new Error(error.message);
	return (data ?? []) as OutreachCandidate[];
}
