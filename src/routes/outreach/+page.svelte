<script lang="ts">
	import { enhance } from '$app/forms';
	import Nav from '$lib/components/Nav.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const STEP_LABEL: Record<number, string> = { 1: 'First email', 2: 'Follow-up (Day 4)', 3: 'Last email (Day 9)' };
	const STATE_LABEL: Record<string, string> = {
		active: 'In sequence',
		replied: 'Replied',
		bounced: 'Bounced',
		opted_out: 'Opted out',
		completed: 'Finished, no reply',
		stopped: 'Stopped'
	};

	const pending = $derived(data.messages.filter((message) => message.status === 'pending'));
	const others = $derived(data.messages.filter((message) => message.status !== 'pending'));
	const ready = $derived(data.missing.length === 0 && data.gmailConnected);
	let expanded = $state<string | null>(null);

	function time(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
	}
</script>

<svelte:head><title>Outreach | ByteStreams</title></svelte:head>

<Nav user={data.user} />

<main class="outreach">
	<header class="outreach-header">
		<h1>Outreach</h1>
		<p>DialTone.Med email sequences, sent from Gmail. Weekdays, {data.sender?.dailyLimit ?? 25} a day, follow-ups included.</p>
	</header>

	{#if form?.message}<p class="notice" aria-live="polite">{form.message}</p>{/if}
	{#if data.googleError}<p class="notice notice--error">Google: {data.googleError}</p>{/if}

	<section class="card" aria-label="Setup">
		<h2>Setup</h2>
		<ul class="checklist">
			<li class:ok={data.missing.length === 0}>
				{#if data.missing.length === 0}
					Sending as <strong>{data.sender?.from}</strong>{data.sender?.autoApprove ? ', auto-approve on' : ', daily approval on'}.
				{:else}
					Missing Worker settings: <code>{data.missing.join(', ')}</code>.
				{/if}
			</li>
			<li class:ok={data.gmailConnected}>
				{#if data.gmailConnected}
					Gmail access granted for {data.sender?.account}.
				{:else if data.sender && data.isSender}
					Gmail access needed. <a class="btn-link" href="/calendar/connect?for=outreach">Connect Gmail</a>
				{:else if data.sender}
					{data.sender.account} must sign in here and click Connect Gmail.
				{:else}
					Gmail access is granted once the settings above are in place.
				{/if}
			</li>
		</ul>
	</section>

	<section class="card" aria-label="Today">
		<div class="card-heading">
			<h2>Today, {data.today}</h2>
			<div class="actions">
				{#if !data.planned}
					<form method="POST" action="?/planNow" use:enhance><button class="btn-outline" disabled={!ready}>Plan today now</button></form>
				{/if}
				{#if pending.length}
					<form method="POST" action="?/approveAll" use:enhance><button class="btn-primary" disabled={!ready}>Approve {pending.length} and send</button></form>
				{/if}
			</div>
		</div>

		{#if data.messages.length === 0}
			<p class="empty">{data.planned ? 'Nothing planned today: no new leads with an email and no follow-ups due.' : 'Today is planned automatically at 7:00 Central on weekdays.'}</p>
		{/if}

		{#if pending.length}
			<h3>Waiting for approval</h3>
			<ul class="messages">
				{#each pending as message (message.message_id)}
					<li class="message">
						<button type="button" class="message-summary" onclick={() => (expanded = expanded === message.message_id ? null : message.message_id)}>
							<span class="message-lead">{message.leads?.business_name ?? 'Lead'}{message.leads?.city ? `, ${message.leads.city}` : ''}</span>
							<span class="message-meta">{STEP_LABEL[message.step]} · {message.to_email}</span>
							<span class="message-subject">{message.subject}</span>
						</button>
						<form method="POST" action="?/skip" use:enhance>
							<input type="hidden" name="message_id" value={message.message_id} />
							<button class="btn-small" title="Don't send this one">Remove</button>
						</form>
						{#if expanded === message.message_id}<pre class="message-body">{message.body}</pre>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if others.length}
			<h3>Approved and sent</h3>
			<ul class="messages">
				{#each others as message (message.message_id)}
					<li class="message message--{message.status}">
						<span class="message-lead">{message.leads?.business_name ?? 'Lead'}</span>
						<span class="message-meta">
							{STEP_LABEL[message.step]} ·
							{#if message.status === 'sent'}sent {time(message.sent_at)}
							{:else if message.status === 'approved'}sends about {time(message.send_after)}
							{:else}{message.status}{message.error ? `: ${message.error}` : ''}{/if}
						</span>
						{#if message.status === 'approved'}
							<form method="POST" action="?/skip" use:enhance>
								<input type="hidden" name="message_id" value={message.message_id} />
								<button class="btn-small">Cancel</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card" aria-label="Sequences">
		<h2>Sequences</h2>
		{#if data.sequences.length === 0}
			<p class="empty">No one has been emailed yet.</p>
		{:else}
			<table class="sequences">
				<thead><tr><th>Practice</th><th>Email</th><th>State</th><th>Last sent</th><th></th></tr></thead>
				<tbody>
					{#each data.sequences as sequence (sequence.lead_id)}
						<tr>
							<td>{sequence.leads?.business_name ?? '—'}</td>
							<td>{sequence.to_email}</td>
							<td><span class="state state--{sequence.state}">{STATE_LABEL[sequence.state] ?? sequence.state}</span></td>
							<td>{sequence.last_sent_at ? new Date(sequence.last_sent_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : '—'}</td>
							<td class="row-actions">
								{#if sequence.state === 'active'}
									<form method="POST" action="?/stop" use:enhance>
										<input type="hidden" name="lead_id" value={sequence.lead_id} />
										<button class="btn-small">Stop</button>
									</form>
								{/if}
								{#if sequence.state !== 'opted_out' && sequence.state !== 'bounced'}
									<form method="POST" action="?/optOut" use:enhance>
										<input type="hidden" name="lead_id" value={sequence.lead_id} />
										<input type="hidden" name="email" value={sequence.to_email} />
										<button class="btn-small" title="They asked not to be emailed">Opted out</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</main>

<style>
	.outreach { max-width: 1100px; margin: 0 auto; padding: var(--space-2xl) var(--space-xl); display: grid; gap: var(--space-lg); }
	.outreach-header h1 { margin-bottom: 4px; }
	.outreach-header p { color: var(--text-muted); margin: 0; }
	.card { padding: var(--space-lg); border: 1px solid var(--border-edge); border-radius: 6px; background: var(--bg-carbon); }
	.card h2 { font-size: 1rem; margin: 0 0 var(--space-md); }
	.card h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: var(--space-md) 0 var(--space-sm); }
	.card-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
	.card-heading h2 { margin: 0; }
	.actions { display: flex; gap: var(--space-sm); }
	.notice { padding: var(--space-sm) var(--space-md); border-radius: 4px; background: var(--bg-slate); margin: 0; }
	.notice--error { color: var(--color-error); }
	.checklist { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-sm); }
	.checklist li::before { content: '○ '; color: var(--color-byte-amber); }
	.checklist li.ok::before { content: '● '; color: var(--color-signal-green); }
	.btn-link { color: var(--color-stream-blue); font-weight: 600; margin-left: var(--space-sm); }
	.empty { color: var(--text-muted); margin: var(--space-md) 0 0; }
	.messages { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-sm); }
	.message { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-md); border: 1px solid var(--border-edge); border-radius: 4px; background: var(--bg-void); }
	.message-summary { display: grid; gap: 2px; text-align: left; background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; min-width: 0; }
	.message-lead { font-weight: 600; }
	.message-meta, .message-subject { color: var(--text-muted); font-size: 0.8rem; overflow-wrap: anywhere; }
	.message-body { grid-column: 1 / -1; white-space: pre-wrap; font-family: inherit; font-size: 0.85rem; background: var(--bg-carbon); padding: var(--space-md); border-radius: 4px; margin: 0; }
	.message--failed .message-meta { color: var(--color-error); }
	.btn-small { padding: 4px 10px; border: 1px solid var(--border-edge); border-radius: 4px; background: transparent; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; }
	.btn-small:hover { color: var(--text-bright); background: var(--bg-slate); }
	.sequences { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
	.sequences th { text-align: left; color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; padding: var(--space-sm); border-bottom: 1px solid var(--border-edge); }
	.sequences td { padding: var(--space-sm); border-bottom: 1px solid var(--border-edge); overflow-wrap: anywhere; }
	.row-actions { display: flex; gap: 4px; justify-content: flex-end; }
	.state { font-size: 0.75rem; font-weight: 600; }
	.state--replied { color: var(--color-signal-green); }
	.state--bounced, .state--opted_out { color: var(--color-error); }
	.state--active { color: var(--color-info); }
	button:disabled { opacity: 0.45; cursor: not-allowed; }
	@media (max-width: 640px) {
		.outreach { padding: var(--space-lg) var(--space-md); }
		.sequences th:nth-child(4), .sequences td:nth-child(4) { display: none; }
	}
</style>
