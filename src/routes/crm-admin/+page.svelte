<script lang="ts">
	import Nav from '$lib/components/Nav.svelte';
	import type { LeadChange } from '$lib/types';

	let { data, form } = $props();
	let search = $state('');
	let operation = $state('');

	function snapshot(change: LeadChange): Record<string, unknown> {
		return change.new_record ?? change.old_record ?? {};
	}

	function textValue(value: unknown): string {
		return typeof value === 'string' && value.trim() ? value : '—';
	}

	function searchableText(change: LeadChange): string {
		return [
			change.operation,
			change.change_id,
			change.lead_id,
			change.changed_by_email,
			change.changed_by,
			change.transaction_id,
			JSON.stringify(change.old_record),
			JSON.stringify(change.new_record)
		].join(' ').toLowerCase();
	}

	const filteredChanges = $derived(
		data.changes.filter((change: LeadChange) => {
			if (operation && change.operation !== operation) return false;
			return !search || searchableText(change).includes(search.trim().toLowerCase());
		})
	);

	function confirmRestore(event: SubmitEvent, change: LeadChange) {
		const record = snapshot(change);
		const businessName = textValue(record.business_name);
		if (!window.confirm(`Restore ${businessName} to its state before this ${change.operation.toLowerCase()}?`)) {
			event.preventDefault();
		}
	}
</script>

<svelte:head>
	<title>CRM Admin — ByteStreams</title>
	<meta name="description" content="Restricted lead change history and recovery tools." />
</svelte:head>

<Nav user={data.user} />

<main class="admin-layout">
	<header class="admin-header">
		<div>
			<p class="eyebrow">Restricted</p>
			<h1>Lead Change Log</h1>
			<p class="subtitle">Review database history and restore a lead to its prior state.</p>
		</div>
		<span class="count">{filteredChanges.length} of {data.changes.length} events</span>
	</header>

	{#if form?.message}
		<div class:notice-success={form.success} class:notice-error={!form.success} class="notice" role="status">
			{form.message}
		</div>
	{/if}

	<section class="toolbar" aria-label="Audit log filters">
		<label>
			<span>Search changes</span>
			<input
				type="search"
				placeholder="Business, city, phone, lead ID, email, transaction…"
				bind:value={search}
			/>
		</label>
		<label>
			<span>Operation</span>
			<select bind:value={operation}>
				<option value="">All operations</option>
				<option value="INSERT">Insert</option>
				<option value="UPDATE">Update</option>
				<option value="DELETE">Delete</option>
			</select>
		</label>
	</section>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Changed</th>
					<th>Operation</th>
					<th>Business</th>
					<th>Location</th>
					<th>Phone</th>
					<th>Changed By / Transaction</th>
					<th><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each filteredChanges as change (change.change_id)}
					{@const record = snapshot(change)}
					<tr>
						<td class="timestamp">{new Date(change.changed_at).toLocaleString()}</td>
						<td><span class="operation operation--{change.operation.toLowerCase()}">{change.operation}</span></td>
						<td>
							<strong>{textValue(record.business_name)}</strong>
							<small>{change.lead_id ?? 'No lead ID'}</small>
						</td>
						<td>{textValue(record.city)}{record.state ? `, ${record.state}` : ''}</td>
						<td>{textValue(record.phone)}</td>
						<td>
							<span>{change.changed_by_email ?? 'Service role'}</span>
							<small>TX {change.transaction_id}</small>
						</td>
						<td class="action-cell">
							{#if change.operation === 'INSERT'}
								<span class="not-available">No prior state</span>
							{:else}
								<form method="POST" action="?/restore" onsubmit={(event) => confirmRestore(event, change)}>
									<input type="hidden" name="change_id" value={change.change_id} />
									<button type="submit">Restore</button>
								</form>
							{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="7" class="empty">No audit events match these filters.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</main>

<style>
	.admin-layout { max-width: 1240px; margin: 0 auto; padding: var(--space-2xl) var(--space-xl); }
	.admin-header { display: flex; align-items: end; justify-content: space-between; gap: var(--space-xl); margin-bottom: var(--space-xl); }
	.eyebrow { color: var(--color-byte-amber); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
	h1 { font-size: 1.75rem; margin: var(--space-xs) 0; }
	.subtitle, .count { color: var(--text-muted); font-size: 0.875rem; }
	.count { white-space: nowrap; }
	.toolbar { display: grid; grid-template-columns: minmax(280px, 1fr) 190px; gap: var(--space-md); margin-bottom: var(--space-lg); }
	label span { display: block; color: var(--text-muted); font-size: 0.75rem; font-weight: 600; margin-bottom: var(--space-xs); }
	input, select { width: 100%; min-height: 42px; background: var(--bg-carbon); color: var(--text-primary); border: 1px solid var(--border-edge); border-radius: var(--radius-sm); padding: 0 12px; }
	.notice { margin-bottom: var(--space-lg); border: 1px solid; border-radius: var(--radius-sm); padding: 12px 14px; font-size: 0.875rem; }
	.notice-success { color: var(--color-signal-green); border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.08); }
	.notice-error { color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08); }
	.table-wrap { overflow-x: auto; border: 1px solid var(--border-edge); border-radius: var(--radius-lg); }
	table { width: 100%; border-collapse: collapse; background: var(--bg-carbon); font-size: 0.8125rem; }
	th { color: var(--text-muted); background: rgba(255,255,255,0.02); font-size: 0.6875rem; text-align: left; text-transform: uppercase; }
	th, td { padding: 13px 14px; border-bottom: 1px solid var(--border-edge); vertical-align: middle; }
	tbody tr:last-child td { border-bottom: 0; }
	td strong, td span, td small { display: block; }
	td small { color: var(--text-faded); margin-top: 4px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
	.timestamp { white-space: nowrap; color: var(--text-muted); }
	.operation { display: inline-block; width: fit-content; border-radius: var(--radius-sm); padding: 4px 7px; font-size: 0.6875rem; font-weight: 700; }
	.operation--insert { color: var(--color-signal-green); background: rgba(16, 185, 129, 0.12); }
	.operation--update { color: var(--color-flow-blue); background: rgba(59, 130, 246, 0.12); }
	.operation--delete { color: #fca5a5; background: rgba(239, 68, 68, 0.12); }
	.action-cell { text-align: right; }
	button { background: transparent; color: var(--color-stream-blue); border: 1px solid var(--color-stream-blue); border-radius: var(--radius-sm); padding: 7px 11px; cursor: pointer; font-weight: 600; }
	button:hover { background: rgba(59, 130, 246, 0.1); }
	.not-available { color: var(--text-faded); white-space: nowrap; }
	.empty { color: var(--text-muted); text-align: center; padding: var(--space-2xl); }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
	@media (max-width: 700px) { .admin-layout { padding: var(--space-xl) var(--space-md); } .admin-header { align-items: start; flex-direction: column; } .toolbar { grid-template-columns: 1fr; } }
</style>