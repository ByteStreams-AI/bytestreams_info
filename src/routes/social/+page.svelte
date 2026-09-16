<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Nav from '$lib/components/Nav.svelte';
	import { FORMAT_ICON, GENERATED_FORMATS, GENERATED_PILLARS, PILLAR_NAMES, STATUS_COLOR, captionFirstLine, formatLocal, isoToLocalInput } from '$lib/social';

	let { data, form } = $props();

	let busy = $state<string | null>(null);
	let open = $state<Record<string, 'reject' | 'regenerate' | 'reschedule' | null>>({});

	function toggle(id: string, panel: 'reject' | 'regenerate' | 'reschedule') {
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
							<form method="POST" action="?/retry" use:enhance={submit(p.id)}><input type="hidden" name="id" value={p.id} /><button class="btn-outline small" type="submit">Retry</button></form>
						{/if}
						{#if p.status !== 'publishing'}
							<form method="POST" action="?/reject" use:enhance={submit(p.id)}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="reason" value="pulled from schedule" /><button class="btn-outline small danger" type="submit">Pull</button></form>
						{/if}
					</span>
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
				</li>
			{/each}
		</ul>
	</section>
</main>

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
</style>
