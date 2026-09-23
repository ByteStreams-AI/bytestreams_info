/**
 * Pure helpers for the DialTone Social queue (/social). No I/O, so they run in tests, on the
 * server and in the browser. Times: slots are America/Chicago wall-clock, stored as UTC
 * (dialtone_social PRD §9); DST is the zone's problem, never a constant offset.
 */

export const SOCIAL_TZ = 'America/Chicago';

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'blocked' | 'rejected' | 'expired';
export type PostFormat = 'reel' | 'image' | 'carousel' | 'story';
export type GeneratedFormat = Exclude<PostFormat, 'reel'>;

export const GENERATED_FORMATS: GeneratedFormat[] = ['story', 'image', 'carousel'];
export const GENERATED_PILLARS = ['P0', 'P1', 'P2', 'P3'] as const;

export const PILLAR_NAMES: Record<string, string> = {
	P0: 'Positioning',
	P1: 'Operator education',
	P2: 'Menu engineering',
	P3: 'Cost evaluation',
	P4: 'Product proof',
	P5: 'Brand spot',
	P6: 'Real operator'
};

/** Status is colour, format is icon (v1 PRD §9): two channels a month view can read at a glance. */
export const STATUS_COLOR: Record<PostStatus, string> = {
	draft: 'var(--color-byte-amber)',
	scheduled: 'var(--color-stream-blue)',
	publishing: 'var(--color-data-teal)',
	published: 'var(--color-signal-green)',
	failed: 'var(--color-error)',
	blocked: 'var(--color-error)',
	rejected: 'var(--text-faded)',
	expired: 'var(--text-faded)'
};

export const FORMAT_ICON: Record<PostFormat, string> = { reel: '🎬', image: '🖼️', carousel: '🗂️', story: '📱' };

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
export function tzOffsetMs(utcMs: number, timeZone = SOCIAL_TZ): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date(utcMs));
	const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
	return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Local wall-clock ("YYYY-MM-DD", "HH:MM") in `timeZone` → UTC Date. Iterates the offset for DST edges. */
export function zonedToUtc(dateStr: string, timeStr: string, timeZone = SOCIAL_TZ): Date {
	const [y, m, d] = dateStr.split('-').map(Number);
	const [hh, mm] = timeStr.split(':').map(Number);
	const naive = Date.UTC(y, m - 1, d, hh, mm);
	let guess = naive - tzOffsetMs(naive, timeZone);
	guess = naive - tzOffsetMs(guess, timeZone);
	return new Date(guess);
}

/** A `datetime-local` value ("2026-09-23T11:00"), read as Central wall-clock, → ISO UTC. */
export function localInputToIso(value: string, timeZone = SOCIAL_TZ): string | null {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value ?? '');
	if (!m) return null;
	const d = zonedToUtc(m[1], m[2], timeZone);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function localDateStr(utcMs: number, timeZone = SOCIAL_TZ): string {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(utcMs));
	const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	return `${g('year')}-${g('month')}-${g('day')}`;
}

/** "Wed Sep 23, 11:00 AM" in Central, for chips and lists. */
export function formatLocal(iso: string, timeZone = SOCIAL_TZ): string {
	return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** ISO → `datetime-local` value in Central, to prefill the reschedule picker. */
export function isoToLocalInput(iso: string, timeZone = SOCIAL_TZ): string {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
	const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

export interface ScheduleSlot {
	weekday: number; // 0 = Sunday
	time_local: string; // "11:00" or "11:00:00"
	format: PostFormat;
	pillar: string | null;
	is_active?: boolean;
}

export interface OpenSlot {
	iso: string;
	format: GeneratedFormat;
	pillar: string | null;
	label: string;
}

/**
 * Story/post slots in the next `days` days that no live post or pending request occupies. Reel slots
 * are ingest's, never the queue's. Slots less than `minLeadMinutes` away are skipped: the cron
 * needs time to draft and a person needs time to approve.
 */
export function upcomingOpenSlots(
	slots: ScheduleSlot[],
	occupiedIso: string[],
	{ from = new Date(), days = 14, timeZone = SOCIAL_TZ, minLeadMinutes = 180 } = {}
): OpenSlot[] {
	const occupied = new Set(occupiedIso.map((s) => new Date(s).getTime()));
	const earliest = from.getTime() + minLeadMinutes * 60_000;
	const out: OpenSlot[] = [];
	for (let i = 0; i <= days; i++) {
		const dateStr = localDateStr(from.getTime() + i * 86_400_000, timeZone);
		const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
		for (const s of slots) {
			if (s.is_active === false || s.format === 'reel' || Number(s.weekday) !== weekday) continue;
			const t = zonedToUtc(dateStr, String(s.time_local).slice(0, 5), timeZone);
			if (t.getTime() < earliest || occupied.has(t.getTime())) continue;
			out.push({ iso: t.toISOString(), format: s.format as GeneratedFormat, pillar: s.pillar, label: `${formatLocal(t.toISOString(), timeZone)} · ${s.format}${s.pillar ? ` · ${s.pillar}` : ''}` });
		}
	}
	return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

/** Textarea text ⇄ hashtag array. Tags are whitespace-separated, each starting with #. */
export function parseHashtags(text: string): string[] {
	return text
		.split(/\s+/)
		.map((t) => t.trim())
		.filter(Boolean)
		.map((t) => (t.startsWith('#') ? t : `#${t}`));
}

/**
 * The cheap half of the guardrails, for immediate feedback in the form. The Worker re-runs the full
 * set at publish time (dialtone_social PRD §8), so this is a courtesy, not the gate.
 */
export function quickCheck(caption: string, hashtags: string[]): string[] {
	const problems: string[] = [];
	const lower = `${caption}`.toLowerCase();
	if (!caption.trim()) problems.push('Caption is empty.');
	if (caption.length > 2200) problems.push(`Caption is ${caption.length} characters; Instagram allows 2,200.`);
	if (hashtags.length < 3 || hashtags.length > 5) problems.push(`${hashtags.length} hashtags; use 3 to 5.`);
	const tags = hashtags.map((t) => t.toLowerCase());
	for (const a of ['#dialtone', '#restaurantowners']) if (!tags.includes(a)) problems.push(`Missing ${a}.`);
	for (const bad of ['free trial', 'try it free', 'no credit card', 'pilot program', 'agentic', 'ai-powered', 'restaurant tech']) if (lower.includes(bad)) problems.push(`Contains "${bad}".`);
	return problems;
}

export function captionFirstLine(caption: string): string {
	return (caption ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
}

/**
 * Pre-flight for the knowledge base, shown while somebody is editing a pillar in /social.
 *
 * A deliberate near-copy of the Worker's `checkKnowledge`, for the same reason `quickCheck`
 * near-copies the caption guardrails: this runs in the browser and in the SvelteKit server,
 * neither of which can import from the Worker. It is not the authority. The Worker re-checks
 * every row before putting it in the prompt and falls back to its compiled corpus for any
 * that fails, so drift here means a confusing save, never bad material reaching the model.
 */
export function quickCheckKnowledge(body: string): string[] {
	const problems: string[] = [];
	const lower = body.toLowerCase();
	if (!body.trim()) problems.push('Nothing to save — an empty pillar falls back to the built-in material.');
	if (body.length > 12000) problems.push(`This is ${body.length} characters; keep a pillar under 12,000.`);
	// Clock times are fine and are the good kind of concrete ("Friday at 7:15 the phone
	// rings out"). Money, percentages and bare quantities become an uncitable statistic.
	const withoutTimes = body.replace(/\b\d{1,2}:\d{2}\b/g, '').replace(/\b\d{1,2}\s?[ap]m\b/gi, '');
	const figures = [...new Set(withoutTimes.match(/\$\s?\d|\d+\s?%|\b\d{2,}\b/g) ?? [])];
	if (figures.length)
		problems.push(`Remove the figures (${figures.join(', ')}). Knowledge is never cited, so a number here becomes a statistic with nothing behind it.`);
	for (const w of ['agentic', 'ai-powered', 'revolutionary', 'leverage', 'seamless', 'cutting-edge', 'game-changing', 'restaurant tech', 'pos system', 'not a pos'])
		if (lower.includes(w)) problems.push(`Remove "${w}" — it is on the banned list.`);
	for (const v of ['stripe', 'doordash', 'nash', 'telnyx', 'twilio', 'vapi', 'elevenlabs'])
		if (new RegExp(`\\b${v}\\b`).test(lower)) problems.push(`Remove "${v}" — we never name the companies we build on.`);
	return problems;
}
