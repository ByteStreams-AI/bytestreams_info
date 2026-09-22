/**
 * Server-only access to the DialTone Social tables (intranet Supabase project; migrations 013/014
 * in developer/migrations). The queue writes rows and audit events; it never calls Meta, Claude or
 * Browser Rendering — the dialtone-social Worker owns those. Every transition here writes a
 * social_post_events row (v1 F4 AC5).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { GeneratedFormat, PostFormat, PostStatus, ScheduleSlot } from '$lib/social';

const BUCKET = 'social-media-assets';
const THUMB_TTL_SECONDS = 3600;

export interface SocialPost {
	id: string;
	platform: string;
	format: PostFormat;
	pillar: string;
	origin: 'reel' | 'generated';
	status: PostStatus;
	hook: string | null;
	caption: string;
	caption_original: string | null;
	hashtags: string[];
	media_asset_ids: string[];
	claims: Array<{ text: string; source_file: string; fact_id?: string; source_note?: string }>;
	rationale: string | null;
	proposal_path: string | null;
	scheduled_for: string;
	schedule_version: number;
	publish_workflow_id: string | null;
	published_at: string | null;
	ig_media_id: string | null;
	error: string | null;
	requires_approval: boolean;
	approved_by: string | null;
	approved_at: string | null;
	rejection_reason: string | null;
	/** Set when the post was taken out of the queue. For a published post this means it was
	 *  deleted from the account BY HAND — Meta has no delete API. Null means live in the queue. */
	removed_at: string | null;
	removed_reason: string | null;
	created_at: string;
}

export interface GenerationRequest {
	id: string;
	format: GeneratedFormat;
	pillar: string;
	scheduled_for: string;
	status: 'pending' | 'done' | 'failed';
	requested_by: string;
	brief: string | null;
	error: string | null;
	post_id: string | null;
	created_at: string;
}

export interface QueueItem extends SocialPost {
	thumbnails: string[];
}

function client(): SupabaseClient {
	const url = env.SUPABASE_URL?.trim();
	const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
	return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function thumbnailsFor(sb: SupabaseClient, assetIds: string[]): Promise<string[]> {
	if (!assetIds.length) return [];
	const { data } = await sb.from('media_assets').select('id, storage_path, media_type').in('id', assetIds);
	const byId = new Map((data ?? []).map((a) => [a.id as string, a as { storage_path: string; media_type: string }]));
	const out: string[] = [];
	for (const id of assetIds) {
		const a = byId.get(id);
		if (!a || a.media_type !== 'image') continue;
		const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(a.storage_path, THUMB_TTL_SECONDS);
		if (signed?.signedUrl) out.push(signed.signedUrl);
	}
	return out;
}

export async function loadQueue(): Promise<{
	drafts: QueueItem[];
	upcoming: SocialPost[];
	recent: SocialPost[];
	requests: GenerationRequest[];
	slots: ScheduleSlot[];
	occupiedIso: string[];
}> {
	const sb = client();
	const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
	const [draftsRes, upcomingRes, recentRes, requestsRes, slotsRes, pendingRes] = await Promise.all([
		sb.from('social_posts').select('*').eq('status', 'draft').is('removed_at', null).order('scheduled_for'),
		sb.from('social_posts').select('*').in('status', ['scheduled', 'publishing', 'failed', 'blocked']).is('removed_at', null).gte('scheduled_for', since).order('scheduled_for'),
		sb.from('social_posts').select('*').in('status', ['published', 'rejected', 'expired']).is('removed_at', null).gte('scheduled_for', since).order('scheduled_for', { ascending: false }).limit(20),
		sb.from('social_generation_requests').select('*').in('status', ['pending', 'failed']).order('created_at', { ascending: false }).limit(20),
		sb.from('schedule_slots').select('weekday, time_local, format, pillar, is_active').eq('is_active', true),
		sb.from('social_generation_requests').select('scheduled_for').eq('status', 'pending')
	]);
	for (const r of [draftsRes, upcomingRes, recentRes, requestsRes, slotsRes, pendingRes]) if (r.error) throw new Error(r.error.message);

	const drafts: QueueItem[] = [];
	for (const p of (draftsRes.data ?? []) as SocialPost[]) drafts.push({ ...p, thumbnails: await thumbnailsFor(sb, p.media_asset_ids) });
	const upcoming = (upcomingRes.data ?? []) as SocialPost[];
	const occupiedIso = [...drafts, ...upcoming].map((p) => p.scheduled_for).concat(((pendingRes.data ?? []) as { scheduled_for: string }[]).map((r) => r.scheduled_for));
	return { drafts, upcoming, recent: (recentRes.data ?? []) as SocialPost[], requests: (requestsRes.data ?? []) as GenerationRequest[], slots: (slotsRes.data ?? []) as ScheduleSlot[], occupiedIso };
}

async function getPost(sb: SupabaseClient, id: string): Promise<SocialPost> {
	const { data, error } = await sb.from('social_posts').select('*').eq('id', id).maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('Post not found');
	return data as SocialPost;
}

async function logEvent(sb: SupabaseClient, postId: string, event: string, actor: string, detail: Record<string, unknown> = {}): Promise<void> {
	const { error } = await sb.from('social_post_events').insert({ post_id: postId, event, actor, detail });
	if (error) throw new Error(`audit write failed: ${error.message}`);
}

async function patch(sb: SupabaseClient, id: string, fields: Record<string, unknown>): Promise<void> {
	const { error } = await sb.from('social_posts').update(fields).eq('id', id);
	if (error) throw new Error(error.message);
}

/** Approve, optionally with an edited caption/hashtags. The original caption is kept for the delta (F4 AC3). */
export async function approvePost(id: string, actor: string, edit?: { caption: string; hashtags: string[] }): Promise<void> {
	const sb = client();
	const post = await getPost(sb, id);
	if (post.status !== 'draft') throw new Error(`Only drafts can be approved (this post is ${post.status})`);
	const edited = !!edit && (edit.caption !== post.caption || edit.hashtags.join(' ') !== post.hashtags.join(' '));
	const fields: Record<string, unknown> = { status: 'scheduled', approved_by: actor, approved_at: new Date().toISOString(), error: null };
	if (edited) Object.assign(fields, { caption: edit!.caption, hashtags: edit!.hashtags, caption_original: post.caption_original ?? post.caption });
	await patch(sb, id, fields);
	await logEvent(sb, id, 'approved', actor, { outcome: edited ? 'approved_edited' : 'approved_unedited', scheduleVersion: post.schedule_version });
	if (edited) await logEvent(sb, id, 'edited', actor, { captionBefore: post.caption, hashtagsBefore: post.hashtags });
}

export async function rejectPost(id: string, actor: string, reason: string): Promise<void> {
	const sb = client();
	const post = await getPost(sb, id);
	if (!['draft', 'scheduled', 'failed', 'blocked'].includes(post.status)) throw new Error(`A ${post.status} post cannot be rejected`);
	await patch(sb, id, { status: 'rejected', rejection_reason: reason || null, schedule_version: post.schedule_version + 1 });
	await logEvent(sb, id, 'rejected', actor, { reason, fromStatus: post.status, scheduleVersion: post.schedule_version + 1 });
}

/** Reschedule bumps schedule_version; the Worker's reconcile creates a fresh workflow and the old one exits stale (PRD §6.2). */
export async function reschedulePost(id: string, actor: string, scheduledForIso: string): Promise<void> {
	const sb = client();
	const post = await getPost(sb, id);
	if (!['draft', 'scheduled', 'failed', 'blocked'].includes(post.status)) throw new Error(`A ${post.status} post cannot be rescheduled`);
	if (new Date(scheduledForIso).getTime() < Date.now() + 30 * 60_000) throw new Error('Pick a time at least 30 minutes from now');
	const fields: Record<string, unknown> = { scheduled_for: scheduledForIso, schedule_version: post.schedule_version + 1, publish_workflow_id: null, error: null };
	if (post.status === 'failed' || post.status === 'blocked') fields.status = post.approved_by || !post.requires_approval ? 'scheduled' : 'draft';
	await patch(sb, id, fields);
	await logEvent(sb, id, 'rescheduled', actor, { from: post.scheduled_for, to: scheduledForIso, scheduleVersion: post.schedule_version + 1 });
}

/** Retry a failed publish without re-approval (PRD §6.2). */
/**
 * Take a post out of the queue without destroying its history.
 *
 * Two cases, labelled differently in the UI, stored identically here:
 *   - a PUBLISHED post the operator deleted from the account by hand. Meta's content
 *     publishing API has no delete, so this only records what happened outside the
 *     system; the button must never claim to have removed it from Instagram.
 *   - a post that never reached Instagram and is only clutter.
 *
 * Never a hard delete: social_post_events cascades on delete, so dropping the row would
 * destroy every publish attempt, failure and rejection reason attached to it — the log
 * that makes a failure diagnosable at all.
 */
export async function removePost(id: string, actor: string, reason: string): Promise<void> {
	const sb = client();
	const post = await getPost(sb, id);
	if (post.removed_at) throw new Error('This post has already been removed');
	if (post.status === 'publishing') throw new Error('This post is publishing right now — wait for it to finish, then remove it');
	// A scheduled post still has a workflow asleep somewhere. Bumping the version makes
	// that instance fail its claim and exit stale rather than publishing something the
	// operator has just taken out of the queue.
	const fields: Record<string, unknown> = { removed_at: new Date().toISOString(), removed_reason: reason || null };
	if (post.status === 'scheduled') fields.schedule_version = post.schedule_version + 1;
	await patch(sb, id, fields);
	await logEvent(sb, id, 'removed', actor, { reason, fromStatus: post.status, published: post.status === 'published' });
}

export async function retryPost(id: string, actor: string): Promise<void> {
	const sb = client();
	const post = await getPost(sb, id);
	if (post.status !== 'failed') throw new Error(`Only failed posts can be retried (this post is ${post.status})`);
	// A post that failed AT its slot always has a slot in the past, and Cloudflare
	// Workflows refuses to sleep until a past time — the instance errors before claiming
	// the post and the row sits at 'scheduled' forever, invisible to reconcile. The
	// Worker now guards this too, but a retry should not depend on that: move the slot
	// to two minutes out so the workflow has something real to wait for.
	const slotHasPassed = new Date(post.scheduled_for).getTime() <= Date.now();
	const scheduledFor = slotHasPassed ? new Date(Date.now() + 2 * 60_000).toISOString() : post.scheduled_for;
	await patch(sb, id, { status: 'scheduled', scheduled_for: scheduledFor, schedule_version: post.schedule_version + 1, publish_workflow_id: null, error: null });
	await logEvent(sb, id, 'retry', actor, { scheduleVersion: post.schedule_version + 1, movedSlot: slotHasPassed ? scheduledFor : null });
}

/** Reject the draft and ask the Worker for another for the same slot, with the reason as a negative example. */
export async function regeneratePost(id: string, actor: string, reason: string): Promise<void> {
	const sb = client();
	const post = await getPost(sb, id);
	if (post.status !== 'draft') throw new Error(`Only drafts can be regenerated (this post is ${post.status})`);
	if (post.origin !== 'generated') throw new Error('Reels are regenerated by editing script.md and re-ingesting');
	await patch(sb, id, { status: 'rejected', rejection_reason: reason || 'regenerate', schedule_version: post.schedule_version + 1 });
	await logEvent(sb, id, 'rejected', actor, { reason: reason || 'regenerate', regenerate: true });
	const { error } = await sb.from('social_generation_requests').insert({
		platform: post.platform,
		format: post.format,
		pillar: post.pillar,
		scheduled_for: post.scheduled_for,
		requested_by: actor,
		avoid: reason || null,
		replaces_post_id: post.id
	});
	if (error) throw new Error(error.message);
}

/** Ask the Worker for a draft in an open slot. The next reconcile run (≤ 15 min) drafts it. */
export async function requestDraft(input: { format: GeneratedFormat; pillar: string; scheduledForIso: string; brief?: string }, actor: string): Promise<void> {
	const sb = client();
	const [{ data: live }, { data: pending }] = await Promise.all([
		sb.from('social_posts').select('id').eq('scheduled_for', input.scheduledForIso).not('status', 'in', '("rejected","expired","failed")').limit(1),
		sb.from('social_generation_requests').select('id').eq('scheduled_for', input.scheduledForIso).eq('status', 'pending').limit(1)
	]);
	if (live?.length) throw new Error('That slot already has a post');
	if (pending?.length) throw new Error('That slot already has a draft on the way');
	const { error } = await sb.from('social_generation_requests').insert({
		platform: 'instagram',
		format: input.format,
		pillar: input.pillar,
		scheduled_for: input.scheduledForIso,
		requested_by: actor,
		brief: input.brief?.trim() || null
	});
	if (error) throw new Error(error.message);
}

export async function retryRequest(id: string, actor: string): Promise<void> {
	const sb = client();
	const { error } = await sb.from('social_generation_requests').update({ status: 'pending', error: null, requested_by: actor }).eq('id', id).eq('status', 'failed');
	if (error) throw new Error(error.message);
}

export async function dismissRequest(id: string): Promise<void> {
	const sb = client();
	const { error } = await sb.from('social_generation_requests').delete().eq('id', id).in('status', ['failed', 'pending']);
	if (error) throw new Error(error.message);
}
