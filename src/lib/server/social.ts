/**
 * Server-only access to the DialTone Social tables (intranet Supabase project; migrations 013/014
 * in developer/migrations). The queue writes rows and audit events; it never calls Meta, Claude or
 * Browser Rendering — the dialtone-social Worker owns those. Every transition here writes a
 * social_post_events row (v1 F4 AC5).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { GENERATED_PILLARS, type GeneratedFormat, type PostFormat, type PostStatus, type ScheduleSlot } from '$lib/social';
import { quickCheckKnowledge } from '$lib/social';

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
	/** Facebook Page post id from the explicit publish (PRD §5). Null means not attempted,
	 *  not yet published, or a story — Facebook stories are not published. */
	fb_post_id: string | null;
	/** Why Facebook failed when Instagram succeeded. The post is still `published`:
	 *  Instagram is the primary channel and a Facebook failure never fails the post. */
	fb_error: string | null;
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
/** PRD §3.2: never more than 21 generated posts in any rolling 7 days. */
export const POSTS_PER_7_DAYS = 21;

/**
 * Refuse a request that would break the ceiling.
 *
 * "No 7-day window holds more than 21" is awkward to prove on insert, so this checks the
 * two windows a new post at T can push over on its own: the week ending at T and the week
 * starting at T. Batching forward — which is how a day's worth of drafts actually gets
 * queued — always lands in one of them. It is an approximation, and a deliberate one: the
 * exact check is several queries to catch a case nobody produces by hand.
 *
 * Counts drafts and scheduled posts as well as published ones, because a pending request
 * becomes a post; counting only what has gone out would let twenty drafts through and
 * refuse the twenty-first the morning they all publish.
 */
async function assertUnderCeiling(sb: ReturnType<typeof client>, slotIso: string, ignoreRequestId?: string): Promise<void> {
	const at = new Date(slotIso).getTime();
	const week = 7 * 86_400_000;
	const windows: Array<[string, string]> = [
		[new Date(at - week).toISOString(), slotIso],
		[slotIso, new Date(at + week).toISOString()]
	];
	for (const [from, to] of windows) {
		const [posts, requests] = await Promise.all([
			sb.from('social_posts').select('id', { count: 'exact', head: true })
				// `library` counts too (migration 017): a hand-assembled carousel takes a slot
				// and reaches the same audience, so it goes against the ceiling like any post.
				.in('origin', ['generated', 'library']).is('removed_at', null)
				.not('status', 'in', '("rejected","expired","failed")')
				.gte('scheduled_for', from).lte('scheduled_for', to),
			// The row being edited already counts toward the ceiling, so counting it again
			// would refuse an edit that changes nothing about how many posts go out.
			(ignoreRequestId
				? sb.from('social_generation_requests').select('id', { count: 'exact', head: true })
					.eq('status', 'pending').neq('id', ignoreRequestId).gte('scheduled_for', from).lte('scheduled_for', to)
				: sb.from('social_generation_requests').select('id', { count: 'exact', head: true })
					.eq('status', 'pending').gte('scheduled_for', from).lte('scheduled_for', to))
		]);
		if (posts.error) throw new Error(posts.error.message);
		if (requests.error) throw new Error(requests.error.message);
		const total = (posts.count ?? 0) + (requests.count ?? 0);
		if (total >= POSTS_PER_7_DAYS) {
			throw new Error(
				`That would make ${total + 1} posts in seven days, and the limit is ${POSTS_PER_7_DAYS}. ` +
				`Pick a time in a quieter week, or take something off the queue first.`
			);
		}
	}
}

/**
 * The daily digest, as a panel rather than an email.
 *
 * PRD §4.3 specified a mailed digest, and the Worker has an ALERT_EMAIL var for it — but
 * nothing in the Worker can send mail (no binding, no provider), and an email nobody opens
 * is worse than a line at the top of the page somebody is already looking at. Computed
 * here, rendered on /social. Email can follow if a nudge is wanted when nobody is looking.
 *
 * Floors and ceilings are PRD §3.2: at least one post a day and two reels a week, never
 * more than three a day (21 in seven) or three reels.
 */
export interface Digest {
	publishedLast24h: number;
	awaitingReview: number;
	daysSinceLastPost: number | null;
	postsLast7: number;
	reelsLast7: number;
	postFloor: number;
	postCeiling: number;
	reelFloor: number;
	warnings: string[];
}

export async function loadDigest(): Promise<Digest> {
	const sb = client();
	const now = Date.now();
	const since24 = new Date(now - 86_400_000).toISOString();
	const since7 = new Date(now - 7 * 86_400_000).toISOString();
	const live = '("rejected","expired","failed")';

	const [pub24, waiting, last, posts7, reels7] = await Promise.all([
		sb.from('social_posts').select('id', { count: 'exact', head: true })
			.eq('status', 'published').is('removed_at', null).gte('published_at', since24),
		sb.from('social_posts').select('id', { count: 'exact', head: true })
			.eq('status', 'draft').is('removed_at', null),
		sb.from('social_posts').select('published_at')
			.eq('status', 'published').is('removed_at', null)
			.order('published_at', { ascending: false }).limit(1),
		sb.from('social_posts').select('id', { count: 'exact', head: true })
			.in('origin', ['generated', 'library']).is('removed_at', null).not('status', 'in', live)
			.gte('scheduled_for', since7),
		sb.from('social_posts').select('id', { count: 'exact', head: true })
			.eq('format', 'reel').is('removed_at', null).not('status', 'in', live)
			.gte('scheduled_for', since7)
	]);
	for (const r of [pub24, waiting, last, posts7, reels7]) if (r.error) throw new Error(r.error.message);

	const lastAt = (last.data?.[0] as { published_at: string } | undefined)?.published_at;
	const daysSinceLastPost = lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86_400_000) : null;

	const postsLast7 = posts7.count ?? 0;
	const reelsLast7 = reels7.count ?? 0;
	const warnings: string[] = [];
	if (daysSinceLastPost === null) warnings.push('Nothing has been published yet.');
	else if (daysSinceLastPost >= 2) warnings.push(`${daysSinceLastPost} days since the last post — the floor is one a day.`);
	if (postsLast7 < 7) warnings.push(`${postsLast7} posts in the last 7 days; the floor is 7.`);
	if (reelsLast7 < 2) warnings.push(`${reelsLast7} reels in the last 7 days; the floor is 2. Only you can make those.`);
	if ((waiting.count ?? 0) > 0) warnings.push(`${waiting.count} draft${waiting.count === 1 ? '' : 's'} waiting to be read.`);

	return {
		publishedLast24h: pub24.count ?? 0,
		awaitingReview: waiting.count ?? 0,
		daysSinceLastPost,
		postsLast7,
		reelsLast7,
		postFloor: 7,
		postCeiling: POSTS_PER_7_DAYS,
		reelFloor: 2,
		warnings
	};
}

/**
 * Everything with a date on it, for the month view — drafts and scheduled posts as well as
 * published ones, because the question the calendar answers is "what is coming", not "what
 * happened". Removed posts are left out; they are not coming and they did not happen.
 */
export interface CalendarPost {
	id: string;
	status: PostStatus;
	format: PostFormat;
	pillar: string;
	scheduled_for: string;
	caption: string;
}

export async function loadCalendar(fromIso: string, toIso: string): Promise<CalendarPost[]> {
	const { data, error } = await client()
		.from('social_posts')
		.select('id, status, format, pillar, scheduled_for, caption')
		.is('removed_at', null)
		.gte('scheduled_for', fromIso)
		.lte('scheduled_for', toIso)
		.order('scheduled_for');
	if (error) throw new Error(error.message);
	return (data ?? []) as CalendarPost[];
}

/**
 * The knowledge base, one row per generated pillar.
 *
 * Material the generator thinks WITH — never citable. Every pricing, tier, feature or
 * savings claim still comes from worker/src/facts.ts with an id, which lives in code and
 * is reviewed in a pull request. Knowledge moved out of code so the person running the
 * account can add to it without a deploy; the guardrail that kept the two apart moved with
 * it, and now runs on save.
 *
 * A pillar with no row falls back to the corpus compiled into the Worker from
 * knowledge/*.md, so an empty table degrades to what shipped rather than to nothing.
 */
export interface KnowledgePillar {
	pillar: string;
	body: string;
	updated_by: string | null;
	updated_at: string | null;
}

export async function loadKnowledge(): Promise<KnowledgePillar[]> {
	const { data, error } = await client().from('social_knowledge').select('pillar, body, updated_by, updated_at').order('pillar');
	if (error) throw new Error(error.message);
	const rows = new Map((data ?? []).map((r) => [(r as KnowledgePillar).pillar, r as KnowledgePillar]));
	return GENERATED_PILLARS.map((p) => rows.get(p) ?? { pillar: p, body: '', updated_by: null, updated_at: null });
}

export async function saveKnowledge(pillar: string, body: string, actor: string): Promise<void> {
	if (!GENERATED_PILLARS.includes(pillar as (typeof GENERATED_PILLARS)[number])) throw new Error(`${pillar} is not a pillar the generator writes`);
	const reasons = quickCheckKnowledge(body);
	// Refuse on save, so somebody typing gets told immediately and in plain words. This is a
	// pre-flight, not the authority: the Worker re-checks every row and falls back to its
	// compiled corpus for any that breaks the rules, the same way guardrails run at draft
	// time and again inside the publish workflow.
	if (reasons.length) throw new Error(reasons.join(' '));
	const { error } = await client().from('social_knowledge').upsert({ pillar, body: body.trim(), updated_by: actor }, { onConflict: 'pillar' });
	if (error) throw new Error(error.message);
}

/**
 * Every rule a slot has to pass, whether the request is new or being edited. `ignoreRequestId`
 * is the row being edited: it occupies its own slot and counts toward its own ceiling, so
 * without this an edit that leaves the time alone would refuse itself.
 */
async function assertSlotUsable(sb: ReturnType<typeof client>, iso: string, ignoreRequestId?: string): Promise<void> {
	const [{ data: live }, { data: pending }] = await Promise.all([
		sb.from('social_posts').select('id').eq('scheduled_for', iso).not('status', 'in', '("rejected","expired","failed")').limit(1),
		sb.from('social_generation_requests').select('id').eq('scheduled_for', iso).eq('status', 'pending').limit(2)
	]);
	if (live?.length) throw new Error('That slot already has a post');
	if ((pending ?? []).some((r) => r.id !== ignoreRequestId)) throw new Error('That slot already has a draft on the way');
	await assertUnderCeiling(sb, iso, ignoreRequestId);
	// reschedulePost has always refused anything under 30 minutes; requestDraft never did,
	// and the gap bites: reconcile drafts in step 0 and expires passed drafts in step 2 of
	// the SAME run, so a slot ten minutes out produces a draft that vanishes before it can
	// be read. The floor is the cron interval plus a real chance to review.
	if (new Date(iso).getTime() < Date.now() + 30 * 60_000) {
		throw new Error('Pick a time at least 30 minutes from now — it takes up to 15 minutes to write the draft, and you need time to read it');
	}
}

export async function requestDraft(input: { format: GeneratedFormat; pillar: string; scheduledForIso: string; brief?: string }, actor: string): Promise<void> {
	const sb = client();
	await assertSlotUsable(sb, input.scheduledForIso);
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

/**
 * Change a request that has not been drafted yet. Dismiss-and-retype was the only way to fix
 * a typo in a brief, and a brief is the longest thing anyone types on this page.
 *
 * Editing a FAILED request also puts it back in the queue, because that is the only reason
 * anyone edits one — the brief is usually what made it fail. Leaving it failed would mean
 * Edit then Retry, and the second click is easy to forget.
 *
 * There is a narrow race the status guard cannot close: the Worker reads pending rows and
 * only marks them `done` once the draft is written, so an edit landing during generation is
 * accepted and then discarded. Reconcile is every 15 minutes and the drain takes seconds, so
 * the window is small; when it happens the draft simply reflects the old brief, and Reject
 * with a reason is the way out.
 */
export async function editRequest(
	id: string,
	actor: string,
	input: { format: GeneratedFormat; pillar: string; scheduledForIso: string; brief?: string }
): Promise<void> {
	const sb = client();
	await assertSlotUsable(sb, input.scheduledForIso, id);
	const { data, error } = await sb
		.from('social_generation_requests')
		.update({
			format: input.format,
			pillar: input.pillar,
			scheduled_for: input.scheduledForIso,
			brief: input.brief?.trim() || null,
			requested_by: actor,
			status: 'pending',
			error: null
		})
		.eq('id', id)
		.in('status', ['pending', 'failed'])
		.select('id');
	if (error) throw new Error(error.message);
	if (!data?.length) {
		throw new Error('That request is no longer waiting — the draft may already be written. Look under Needs review.');
	}
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
