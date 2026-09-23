<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Nav from '$lib/components/Nav.svelte';
	import { PILLAR_NAMES as PN, quickCheckKnowledge, FORMAT_ICON, GENERATED_FORMATS, GENERATED_PILLARS, PILLAR_NAMES, STATUS_COLOR, captionFirstLine, formatLocal, isoToLocalInput } from '$lib/social';

	let { data, form } = $props();

	let busy = $state<string | null>(null);
	// Seeded from the server, then left alone. `??=` matters: after a REFUSED save the page
	// reloads with the stored value, and overwriting would throw away what the person typed
	// along with the explanation of why it was refused.
	let knowledgeDraft = $state<Record<string, string>>({});
	$effect(() => {
		for (const k of data.knowledge ?? []) knowledgeDraft[k.pillar] ??= k.body;
	});

	// Month view. Same library and shape as /calendar, which the intranet already runs —
	// a second view of an existing pattern, not a new integration.
	let calEl = $state<HTMLDivElement>();
	let mix = $state<Array<[string, number]>>([]);
	let monthLabel = $state('');

	onMount(async () => {
		const { Calendar } = await import('@fullcalendar/core');
		const { default: dayGridPlugin } = await import('@fullcalendar/daygrid');
		if (!calEl) return;
		const cal = new Calendar(calEl, {
			plugins: [dayGridPlugin],
			initialView: 'dayGridMonth',
			height: 'auto',
			firstDay: 0,
			// Times come from /social/events as Central wall time with no offset, which
			// FullCalendar renders as given. That is deliberate: it makes the grid read Central
			// for every viewer without @fullcalendar/luxon3 and its luxon peer. Do not set
			// timeZone here — with no plugin installed it cannot convert and fails silently.
			headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
			events: '/social/events',
			eventTimeFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' },
			// The pillar-mix strip (PRD §4.3): what the month is actually made of. A calendar
			// shows you that days are full; the mix shows you they are all the same thing.
			eventsSet: (events) => {
				const counts: Record<string, number> = {};
				for (const e of events) {
					const p = (e.extendedProps as { pillar?: string }).pillar ?? '?';
					counts[p] = (counts[p] ?? 0) + 1;
				}
				mix = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
			},
			datesSet: (info) => { monthLabel = info.view.title; }
		});
		cal.render();
	});
	let open = $state<Record<string, 'reject' | 'regenerate' | 'reschedule' | 'remove' | null>>({});

	function toggle(id: string, panel: 'reject' | 'regenerate' | 'reschedule' | 'remove') {
		open = { ...open, [id]: open[id] === panel ? null : panel };
	}
	const submit =
		(id: string): SubmitFunction =>
		() => {
			busy = id;
			return async ({ update }) => {
				await update({ reset: false });
				busy = null;
			};
		};
	const errorFor = (id: string) => (form && 'id' in form && form.id === id && 'error' in form ? (form.error as string) : null);
</script>

<svelte:head>
	<title>Social — ByteStreams</title>
</svelte:head>

<Nav user={data.user} />

{#if data.digest}
	<section class="digest">
		<div class="digest-figures">
			<span><strong>{data.digest.publishedLast24h}</strong> published today</span>
			<span><strong>{data.digest.awaitingReview}</strong> waiting to be read</span>
			<span><strong>{data.digest.postsLast7}</strong> posts in 7 days <span class="muted">(floor {data.digest.postFloor}, limit {data.digest.postCeiling})</span></span>
			<span><strong>{data.digest.reelsLast7}</strong> reels in 7 days <span class="muted">(floor {data.digest.reelFloor})</span></span>
			<span>
				{#if data.digest.daysSinceLastPost === null}<strong>Nothing published yet</strong>
				{:else}<strong>{data.digest.daysSinceLastPost}</strong> days since the last post{/if}
			</span>
		</div>
		{#if data.digest.warnings.length}
			<ul class="digest-warnings">
				{#each data.digest.warnings as w (w)}<li>{w}</li>{/each}
			</ul>
		{/if}
	</section>

	<section class="month">
		<div class="month-head">
			<h2>The month {monthLabel ? `— ${monthLabel}` : ''}</h2>
			{#if mix.length}
				<div class="mix">
					{#each mix as [pillar, n] (pillar)}
						<span class="chip">{pillar} · {PILLAR_NAMES[pillar] ?? pillar} <strong>{n}</strong></span>
					{/each}
				</div>
			{/if}
		</div>
		<div bind:this={calEl}></div>
	</section>
{/if}

<main class="social">
	<header class="head">
		<h1>DialTone Social</h1>
		<span class="count">{data.drafts.length} awaiting review</span>
	</header>

	<!-- ── Queue ─────────────────────────────────────────────────────────── -->
	<section aria-label="Approval queue">
		{#if data.drafts.length === 0}
			<p class="empty">Nothing waiting. Ask for a draft below, or the Sunday planner will fill the week.</p>
		{/if}
		{#each data.drafts as post (post.id)}
			<article class="post" class:busy={busy === post.id}>
				<div class="chips">
					<span class="chip status" style="--c: {STATUS_COLOR[post.status]}">{post.status}</span>
					<span class="chip">{FORMAT_ICON[post.format]} {post.format}</span>
					<span class="chip">{post.pillar} · {PILLAR_NAMES[post.pillar] ?? ''}</span>
					<span class="chip when">{formatLocal(post.scheduled_for)} CT</span>
					{#if post.origin === 'reel'}<span class="chip">reel · {post.proposal_path}</span>{/if}
				</div>

				{#if post.thumbnails.length}
					<div class="thumbs" class:story={post.format === 'story'}>
						{#each post.thumbnails as url, i (url)}
							<img src={url} alt="Card {i + 1} of {post.thumbnails.length}" loading="lazy" />
						{/each}
					</div>
				{/if}

				{#if post.rationale}<p class="rationale">{post.rationale}</p>{/if}
				{#if post.hook}<h2 class="hook">{post.hook}</h2>{/if}

				<form method="POST" action="?/approve" use:enhance={submit(post.id)}>
					<input type="hidden" name="id" value={post.id} />
					<label>
						<span class="label">Caption</span>
						<textarea name="caption" rows={Math.min(12, Math.max(4, post.caption.split('\n').length + 1))}>{post.caption}</textarea>
					</label>
					<label>
						<span class="label">Hashtags</span>
						<input name="hashtags" value={post.hashtags.join(' ')} />
					</label>
					{#if post.claims?.length}
						<details class="claims">
							<summary>{post.claims.length} cited claim{post.claims.length === 1 ? '' : 's'}</summary>
							<ul>
								{#each post.claims as c (c.text + c.source_file)}
									<li><q>{c.text}</q> <small>{c.fact_id ? `[${c.fact_id}] ` : ''}{c.source_file}</small></li>
								{/each}
							</ul>
						</details>
					{/if}
					{#if errorFor(post.id)}<p class="err" role="alert">{errorFor(post.id)}</p>{/if}
					<div class="actions">
						<button class="btn-primary" type="submit" disabled={busy === post.id}>Approve</button>
						<button class="btn-outline" type="button" onclick={() => toggle(post.id, 'reject')}>Reject</button>
						{#if post.origin === 'generated'}
							<button class="btn-outline" type="button" onclick={() => toggle(post.id, 'regenerate')}>Regenerate</button>
						{/if}
						<button class="btn-outline" type="button" onclick={() => toggle(post.id, 'reschedule')}>Reschedule</button>
					</div>
				</form>

				{#if open[post.id] === 'reject' || open[post.id] === 'regenerate'}
					<form method="POST" action={open[post.id] === 'reject' ? '?/reject' : '?/regenerate'} class="panel" use:enhance={submit(post.id)}>
						<input type="hidden" name="id" value={post.id} />
						<label>
							<span class="label">{open[post.id] === 'reject' ? 'Why? (optional; fed to the next draft as a negative example)' : 'What should the next draft avoid?'}</span>
							<input name="reason" placeholder="e.g. too generic, wrong tier, no hook" />
						</label>
						<button class="btn-outline danger" type="submit" disabled={busy === post.id}>{open[post.id] === 'reject' ? 'Confirm reject' : 'Reject and draft again'}</button>
					</form>
				{:else if open[post.id] === 'reschedule'}
					<form method="POST" action="?/reschedule" class="panel" use:enhance={submit(post.id)}>
						<input type="hidden" name="id" value={post.id} />
						<label>
							<span class="label">New time (Central)</span>
							<input type="datetime-local" name="scheduled_for" value={isoToLocalInput(post.scheduled_for)} required />
						</label>
						<button class="btn-outline" type="submit" disabled={busy === post.id}>Move it</button>
					</form>
				{/if}
			</article>
		{/each}
	</section>

	<!-- ── Ask for a draft ───────────────────────────────────────────────── -->
	<section class="card" aria-label="Request a draft">
		<h2>Draft one</h2>
		<p class="muted">The Worker drafts it within 15 minutes and it appears above for review. Reels are not drafted here.</p>
		<form method="POST" action="?/draft" use:enhance={submit('draft')}>
			<div class="row">
				<label><span class="label">Format</span>
					<select name="format">{#each GENERATED_FORMATS as f (f)}<option value={f}>{FORMAT_ICON[f]} {f}</option>{/each}</select>
				</label>
				<label><span class="label">Pillar</span>
					<select name="pillar">{#each GENERATED_PILLARS as p (p)}<option value={p} selected={p === 'P1'}>{p} · {PILLAR_NAMES[p]}</option>{/each}</select>
				</label>
			</div>
			<label><span class="label">Slot</span>
				<select name="slot">
					<option value="">Custom time below…</option>
					{#each data.openSlots as s (s.iso)}<option value={s.iso}>{s.label}</option>{/each}
				</select>
			</label>
			<label><span class="label">Or a custom time (Central)</span><input type="datetime-local" name="scheduled_for" /></label>
			<label><span class="label">Brief (optional)</span><input name="brief" placeholder="e.g. the Friday 7pm missed-call problem, for food trucks" /></label>
			{#if form && 'draftError' in form}<p class="err" role="alert">{form.draftError}</p>{/if}
			{#if form && 'drafted' in form}<p class="ok" role="status">Requested. Check back after the next 15-minute run.</p>{/if}
			<button class="btn-primary" type="submit" disabled={busy === 'draft'}>Request draft</button>
		</form>
	</section>

	<!-- ── Requests in flight / failed ───────────────────────────────────── -->
	{#if data.requests.length}
		<section class="card" aria-label="Draft requests">
			<h2>Draft requests</h2>
			<ul class="list">
				{#each data.requests as r (r.id)}
					<li>
						<span class="chip status" style="--c: {r.status === 'pending' ? 'var(--color-data-teal)' : 'var(--color-error)'}">{r.status}</span>
						<span>{FORMAT_ICON[r.format]} {r.format} · {r.pillar} · {formatLocal(r.scheduled_for)} CT</span>
						{#if r.brief}<span class="muted">“{r.brief}”</span>{/if}
						{#if r.error}<span class="err">{r.error}</span>{/if}
						<span class="inline-actions">
							{#if r.status === 'failed'}
								<form method="POST" action="?/retryRequest" use:enhance={submit(r.id)}><input type="hidden" name="id" value={r.id} /><button class="btn-outline small" type="submit">Retry</button></form>
							{/if}
							<form method="POST" action="?/dismissRequest" use:enhance={submit(r.id)}><input type="hidden" name="id" value={r.id} /><button class="btn-outline small" type="submit">Dismiss</button></form>
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- ── Scheduled and recent ──────────────────────────────────────────── -->
	<section class="card" aria-label="Scheduled and recent">
		<h2>Scheduled</h2>
		{#if data.upcoming.length === 0}<p class="muted">Nothing scheduled.</p>{/if}
		<ul class="list">
			{#each data.upcoming as p (p.id)}
				<li>
					<span class="chip status" style="--c: {STATUS_COLOR[p.status]}">{p.status}</span>
					<span>{FORMAT_ICON[p.format]} {p.pillar} · {formatLocal(p.scheduled_for)} CT</span>
					<span class="muted">{captionFirstLine(p.caption)}</span>
					{#if p.error}<span class="err">{p.error}</span>{/if}
					{#if errorFor(p.id)}<span class="err">{errorFor(p.id)}</span>{/if}
					<span class="inline-actions">
						{#if p.status === 'failed'}
							<form method="POST" action="?/retry" use:enhance={submit(p.id)}><input type="hidden" name="id" value={p.id} /><button class="btn-outline small" type="submit">Try again</button></form>
						{/if}
						{#if p.status !== 'publishing'}
							<button class="btn-outline small" type="button" onclick={() => toggle(p.id, 'reschedule')}>Change the time</button>
							<button class="btn-outline small danger" type="button" onclick={() => toggle(p.id, 'remove')}>Take it off</button>
						{/if}
					</span>
					{#if open[p.id] === 'reschedule'}
						<form method="POST" action="?/reschedule" class="panel" use:enhance={submit(p.id)}>
							<input type="hidden" name="id" value={p.id} />
							<label>
								<span class="label">New time (Central) — at least 30 minutes from now</span>
								<input type="datetime-local" name="scheduled_for" value={isoToLocalInput(p.scheduled_for)} required />
							</label>
							<button class="btn-outline" type="submit" disabled={busy === p.id}>Move it</button>
						</form>
					{:else if open[p.id] === 'remove'}
						<form method="POST" action="?/remove" class="panel" use:enhance={submit(p.id)}>
							<input type="hidden" name="id" value={p.id} />
							<p class="muted">This takes the post out of the queue so it will not go out. It does not delete anything from Instagram — nothing has been posted yet.</p>
							<label>
								<span class="label">Why? (optional, for the record)</span>
								<input name="reason" placeholder="e.g. wrong week for this one" />
							</label>
							<button class="btn-outline danger" type="submit" disabled={busy === p.id}>Yes, take it off</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<h2>Recent</h2>
		<ul class="list">
			{#each data.recent as p (p.id)}
				<li>
					<span class="chip status" style="--c: {STATUS_COLOR[p.status]}">{p.status}</span>
					<span>{FORMAT_ICON[p.format]} {p.pillar} · {formatLocal(p.scheduled_for)} CT</span>
					<span class="muted">{captionFirstLine(p.caption)}</span>
					{#if p.rejection_reason}<span class="muted">— {p.rejection_reason}</span>{/if}
					{#if errorFor(p.id)}<span class="err">{errorFor(p.id)}</span>{/if}
					<span class="inline-actions">
						<button class="btn-outline small danger" type="button" onclick={() => toggle(p.id, 'remove')}>
							{p.status === 'published' ? 'I deleted this on Instagram' : 'Delete'}
						</button>
					</span>
					{#if open[p.id] === 'remove'}
						<form method="POST" action="?/remove" class="panel" use:enhance={submit(p.id)}>
							<input type="hidden" name="id" value={p.id} />
							{#if p.status === 'published'}
								<p class="muted">
									Use this <strong>after</strong> you have deleted the post in the Instagram app. It cannot delete
									the post for you — Instagram does not allow that from here. It records that the post is gone, so
									the queue stops counting it as live.
								</p>
							{:else}
								<p class="muted">This hides the post from the queue. It was never posted, so there is nothing on Instagram to remove. The record is kept.</p>
							{/if}
							<label>
								<span class="label">Why? (optional, for the record)</span>
								<input name="reason" placeholder={p.status === 'published' ? 'e.g. wrong wording on the card' : 'e.g. not needed'} />
							</label>
							<button class="btn-outline danger" type="submit" disabled={busy === p.id}>
								{p.status === 'published' ? 'Yes, it is deleted on Instagram' : 'Yes, delete it'}
							</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
</main>

{#if data.knowledge}
	<section class="knowledge">
		<h2>What Claude knows</h2>
		<p class="muted">
			Background material the writing draws on — the moments that cost an operator money, how
			menus behave, how an owner reads a cost. It is <strong>never quoted as fact</strong>: every
			price, tier and feature claim still comes from the fact sheet in code. So no figures here,
			and no company names.
			A pillar left empty falls back to the material built into the system.
		</p>
		{#each data.knowledge as k (k.pillar)}
			<details class="pillar">
				<summary>
					{k.pillar} · {PN[k.pillar] ?? k.pillar}
					<span class="muted">
						{#if k.updated_at}edited {formatLocal(k.updated_at)} CT by {k.updated_by}{:else}using the built-in material{/if}
					</span>
				</summary>
				<form method="POST" action="?/saveKnowledge" use:enhance={submit(k.pillar)}>
					<input type="hidden" name="pillar" value={k.pillar} />
					<textarea name="body" rows="16" bind:value={knowledgeDraft[k.pillar]}></textarea>
					{#if knowledgeDraft[k.pillar] && quickCheckKnowledge(knowledgeDraft[k.pillar]).length}
						<ul class="knowledge-problems">
							{#each quickCheckKnowledge(knowledgeDraft[k.pillar]) as p (p)}<li>{p}</li>{/each}
						</ul>
					{/if}
					{#if errorFor(k.pillar)}<p class="err">{errorFor(k.pillar)}</p>{/if}
					<button class="btn-outline" type="submit" disabled={busy === k.pillar}>Save {k.pillar}</button>
				</form>
			</details>
		{/each}
	</section>
{/if}

<style>
	.social { max-width: 760px; margin: 0 auto; padding: var(--space-lg) var(--space-md) var(--space-3xl); display: grid; gap: var(--space-lg); }
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-md); }
	h1 { font-size: 1.5rem; }
	h2 { font-size: 1.1rem; margin-bottom: var(--space-sm); }
	.count, .muted { color: var(--text-muted); font-size: 0.9rem; }
	.empty { color: var(--text-muted); padding: var(--space-lg); text-align: center; border: 1px dashed var(--border-edge); border-radius: var(--radius-lg); }
	.post, .card { background: var(--bg-carbon); border: 1px solid var(--border-edge); border-radius: var(--radius-lg); padding: var(--space-md); display: grid; gap: var(--space-md); }
	.post.busy { opacity: 0.6; }
	.chips { display: flex; flex-wrap: wrap; gap: var(--space-sm); font-size: 0.8rem; }
	.chip { padding: 2px 10px; border-radius: var(--radius-full); background: var(--bg-slate); color: var(--text-muted); }
	.chip.status { --c: var(--text-muted); color: var(--c); border: 1px solid var(--c); background: transparent; text-transform: capitalize; }
	.chip.when { color: var(--text-bright); }
	.thumbs { display: flex; gap: var(--space-sm); overflow-x: auto; scroll-snap-type: x mandatory; }
	.thumbs img { height: 220px; width: auto; border-radius: var(--radius-md); scroll-snap-align: start; flex: 0 0 auto; }
	.thumbs.story img { height: 320px; }
	.rationale { font-style: italic; color: var(--text-muted); border-left: 3px solid var(--color-byte-amber); padding-left: var(--space-sm); }
	.hook { font-size: 1.15rem; }
	form { display: grid; gap: var(--space-sm); }
	label { display: grid; gap: 4px; }
	.label { font-size: 0.8rem; color: var(--text-muted); }
	textarea, input, select { width: 100%; font: inherit; font-size: 1rem; color: var(--text-bright); background: var(--bg-void); border: 1px solid var(--border-edge); border-radius: var(--radius-md); padding: 10px 12px; }
	textarea { line-height: 1.45; resize: vertical; }
	.claims summary { cursor: pointer; color: var(--text-muted); font-size: 0.9rem; }
	.claims ul { margin: var(--space-sm) 0 0 var(--space-md); display: grid; gap: 4px; font-size: 0.9rem; }
	.claims small { color: var(--text-muted); display: block; }
	.actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); }
	.actions .btn-primary { grid-column: 1 / -1; padding: 14px; font-size: 1.05rem; }
	.actions button, .panel button { min-height: 44px; }
	.panel { border-top: 1px solid var(--border-edge); padding-top: var(--space-md); }
	.danger { color: var(--color-error); border-color: var(--color-error); }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); }
	.err { color: var(--color-error); font-size: 0.9rem; }
	.ok { color: var(--color-signal-green); font-size: 0.9rem; }
	.list { list-style: none; display: grid; gap: var(--space-sm); }
	.list li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); font-size: 0.9rem; padding: var(--space-sm) 0; border-bottom: 1px solid var(--border-edge); }
	.inline-actions { margin-left: auto; display: flex; gap: var(--space-xs); }
	.inline-actions form { display: inline; }
	.small { padding: 4px 10px; font-size: 0.8rem; min-height: 32px; }
	@media (min-width: 640px) { .actions { grid-template-columns: 2fr 1fr 1fr 1fr; } .actions .btn-primary { grid-column: auto; } }

.digest {
		margin: 0 0 1.25rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border, #2a2a2a);
		border-radius: 8px;
	}
	.digest-figures { display: flex; flex-wrap: wrap; gap: 1.25rem; font-size: 0.95rem; }
	.digest-figures strong { font-size: 1.05rem; }
	.digest-warnings { margin: 0.75rem 0 0; padding-left: 1.1rem; }
	.digest-warnings li { color: var(--color-byte-amber, #e8a020); font-size: 0.9rem; }
	.month { margin: 0 0 1.75rem; }
	.month-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem; justify-content: space-between; }
	.mix { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.knowledge { margin: 2rem 0 1rem; }
	.knowledge .pillar { border: 1px solid var(--border, #2a2a2a); border-radius: 8px; margin: 0.5rem 0; padding: 0.6rem 0.9rem; }
	.knowledge summary { cursor: pointer; display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: baseline; }
	.knowledge textarea { width: 100%; margin: 0.75rem 0 0.5rem; font-family: inherit; font-size: 0.9rem; line-height: 1.5; }
	.knowledge-problems { margin: 0 0 0.5rem; padding-left: 1.1rem; }
	.knowledge-problems li { color: var(--color-byte-amber, #e8a020); font-size: 0.85rem; }
	.mix .chip { font-size: 0.8rem; padding: 0.15rem 0.5rem; border: 1px solid var(--border, #2a2a2a); border-radius: 999px; }
</style>
