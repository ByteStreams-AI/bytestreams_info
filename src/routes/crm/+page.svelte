<script lang="ts">
	import Nav from '$lib/components/Nav.svelte';
	import type { Lead } from '$lib/types';
	import { enhance } from '$app/forms';

	let { data } = $props();

	const STATUSES = [
		'new',
		'researched',
		'contacted',
		'followup_required',
		'demo_scheduled',
		'closed_won',
		'closed_lost'
	] as const;

	const STATUS_LABELS: Record<string, string> = {
		new: 'New',
		researched: 'Researched',
		contacted: 'Contacted',
		followup_required: 'Follow-up',
		demo_scheduled: 'Demo Scheduled',
		closed_won: 'Closed Won',
		closed_lost: 'Closed Lost'
	};

	const STATUS_CLASS: Record<string, string> = {
		new: 'badge--new',
		researched: 'badge--researched',
		contacted: 'badge--contacted',
		followup_required: 'badge--followup',
		demo_scheduled: 'badge--demo',
		closed_won: 'badge--won',
		closed_lost: 'badge--lost'
	};

	let selectedLead = $state<Lead | null>(null);
	let saving = $state(false);
	let saveMessage = $state<string | null>(null);

	// ── Filtering ─────────────────────────────────────────────────────────────
	let search = $state('');
	let filterStatus = $state('');
	let filterCity = $state('');
	let filterDelivery = $state('');
	let filterPickup = $state('');

	const cities = $derived([...new Set(data.leads.map((l) => l.city).filter(Boolean))].sort());

	const filteredLeads = $derived(
		data.leads.filter((lead) => {
			if (search && !lead.business_name.toLowerCase().includes(search.toLowerCase())) return false;
			if (filterStatus && lead.status !== filterStatus) return false;
			if (filterCity && lead.city !== filterCity) return false;
			if (filterDelivery !== '') {
				const want = filterDelivery === 'yes';
				if ((lead.offers_delivery ?? false) !== want) return false;
			}
			if (filterPickup !== '') {
				const want = filterPickup === 'yes';
				if ((lead.offers_pickup ?? false) !== want) return false;
			}
			return true;
		})
	);

	function openPanel(lead: Lead) {
		selectedLead = { ...lead };
		saveMessage = null;
	}

	function closePanel() {
		selectedLead = null;
		saveMessage = null;
	}

	function flag(val: boolean | null) {
		if (val === null || val === undefined) return '—';
		return val ? 'Yes' : 'No';
	}
</script>

<svelte:head>
	<title>CRM — ByteStreams</title>
</svelte:head>

<Nav user={data.user} />

<main class="crm-layout">
	<div class="crm-header">
		<h1>Lead Pipeline</h1>
		<span class="crm-count">{filteredLeads.length} of {data.leads.length} leads</span>
	</div>

	<div class="crm-toolbar">
		<input
			class="crm-search"
			type="search"
			placeholder="Search business name…"
			bind:value={search}
			aria-label="Search by business name"
		/>
	</div>

	<div class="crm-table-wrap">
		<table class="crm-table">
			<thead>
				<tr>
					<th>Business</th>
					<th>
						<div class="th-filter">
							<span>City</span>
							<select bind:value={filterCity} aria-label="Filter by city">
								<option value="">All</option>
								{#each cities as city (city)}
									<option value={city}>{city}</option>
								{/each}
							</select>
						</div>
					</th>
					<th>Phone</th>
					<th>
						<div class="th-filter">
							<span>Status</span>
							<select bind:value={filterStatus} aria-label="Filter by status">
								<option value="">All</option>
								{#each STATUSES as s (s)}
									<option value={s}>{STATUS_LABELS[s]}</option>
								{/each}
							</select>
						</div>
					</th>
					<th>
						<div class="th-filter">
							<span>Delivery</span>
							<select bind:value={filterDelivery} aria-label="Filter by delivery">
								<option value="">All</option>
								<option value="yes">Yes</option>
								<option value="no">No</option>
							</select>
						</div>
					</th>
					<th>
						<div class="th-filter">
							<span>Pickup</span>
							<select bind:value={filterPickup} aria-label="Filter by pickup">
								<option value="">All</option>
								<option value="yes">Yes</option>
								<option value="no">No</option>
							</select>
						</div>
					</th>
					<th>Contact</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each filteredLeads as lead (lead.lead_id)}
					<tr class="crm-row" class:crm-row--selected={selectedLead?.lead_id === lead.lead_id}>
						<td class="crm-name">{lead.business_name}</td>
						<td>{lead.city ?? '—'}</td>
						<td>{lead.phone ?? '—'}</td>
						<td>
							<span class="badge {STATUS_CLASS[lead.status] ?? ''}">
								{STATUS_LABELS[lead.status] ?? lead.status}
							</span>
						</td>
						<td>{flag(lead.offers_delivery)}</td>
						<td>{flag(lead.offers_pickup)}</td>
						<td>{lead.contact_name ?? '—'}</td>
						<td>
							<button class="btn-edit" onclick={() => openPanel(lead)}>Edit</button>
						</td>
					</tr>
				{:else}
					<tr><td colspan="8" class="crm-empty">No leads match the current filters.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</main>

{#if selectedLead}
	<!-- Slide-in edit panel -->
	<div class="panel-backdrop" onclick={closePanel} role="presentation"></div>
	<aside class="edit-panel" aria-label="Edit lead">
		<div class="panel-header">
			<h2>{selectedLead.business_name}</h2>
			<button class="btn-close" onclick={closePanel} aria-label="Close">✕</button>
		</div>

		<!-- Read-only scraper data -->
		<section class="panel-section">
			<h3>Lead Info <span class="readonly-tag">read-only</span></h3>
			<dl class="field-list">
				<dt>Phone</dt><dd>{selectedLead.phone ?? '—'}</dd>
				<dt>Address</dt><dd>{selectedLead.address ?? '—'}</dd>
				<dt>City</dt><dd>{selectedLead.city ?? '—'}</dd>
				<dt>Price</dt><dd>{selectedLead.price_range ?? '—'}</dd>
				<dt>Yelp Rating</dt><dd>{selectedLead.yelp_rating != null ? `${selectedLead.yelp_rating} ★ (${selectedLead.yelp_review_count ?? 0} reviews)` : '—'}</dd>
				<dt>Delivery</dt><dd>{flag(selectedLead.offers_delivery)}</dd>
				<dt>Pickup</dt><dd>{flag(selectedLead.offers_pickup)}</dd>
				<dt>DoorDash Mktg</dt><dd>{flag(selectedLead.uses_doordash_mktg)}</dd>
				<dt>ChowNow</dt><dd>{flag(selectedLead.uses_chownow)}</dd>
			</dl>
		</section>

		<!-- Editable sales fields -->
		<section class="panel-section">
			<h3>Sales Info</h3>
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					saving = true;
					saveMessage = null;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'success') {
							// Reflect changes back into the table row
							const idx = data.leads.findIndex((l) => l.lead_id === selectedLead!.lead_id);
							if (idx !== -1) {
								data.leads[idx] = { ...data.leads[idx], ...selectedLead! };
							}
							saveMessage = 'Saved';
						} else {
							saveMessage = 'Error saving';
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="lead_id" value={selectedLead.lead_id} />

				<label class="field-row">
					<span>Status</span>
					<select name="status" bind:value={selectedLead.status}>
{#each STATUSES as s (s)}
							<option value={s}>{STATUS_LABELS[s]}</option>
						{/each}
					</select>
				</label>

				<label class="field-row">
					<span>Contact name</span>
					<input type="text" name="contact_name" bind:value={selectedLead.contact_name} />
				</label>

				<label class="field-row">
					<span>Email</span>
					<input type="email" name="email" bind:value={selectedLead.email} />
				</label>

				<div class="field-row">
					<label class="field-row" style="margin-bottom:0">
						<span>Website</span>
						<input
							type="url"
							name="website_url"
							bind:value={selectedLead.website_url}
							placeholder="https://…"
						/>
					</label>
					{#if selectedLead.website_url}
						<a
							href={selectedLead.website_url}
							target="_blank"
							rel="noopener noreferrer"
							class="website-link"
						>Open ↗</a>
					{/if}
				</div>

				<label class="field-row">
					<span>Notes</span>
					<textarea name="notes" rows="15" maxlength="5000" style="resize: vertical; overflow-y: auto; min-height: 200px;" bind:value={selectedLead.notes}></textarea>
				</label>

				<label class="field-row field-row--inline">
					<span>Business type</span>
					<select
						name="business_type"
						value={selectedLead.business_type ?? ''}
						onchange={(e) => { selectedLead!.business_type = (e.currentTarget as HTMLSelectElement).value || null; }}
					>
						<option value="">Unknown</option>
						<option value="food_truck">Food Truck</option>
						<option value="single_location">Single Location</option>
						<option value="multi_configuration">Multi-Configuration</option>
						<option value="multi_location">Multi-Location</option>
						<option value="enterprise">Enterprise</option>
					</select>
				</label>

				<label class="field-row field-row--inline">
					<span>Michelin</span>
					<select
						name="michelin_rating"
						value={selectedLead.michelin_rating ?? ''}
						onchange={(e) => { selectedLead!.michelin_rating = (e.currentTarget as HTMLSelectElement).value || null; }}
					>
						<option value="">None</option>
						<option value="1_star">★ 1 Star</option>
						<option value="2_stars">★★ 2 Stars</option>
						<option value="3_stars">★★★ 3 Stars</option>
						<option value="bib_gourmand">Bib Gourmand</option>
						<option value="green_star">Green Star</option>
					</select>
				</label>

				<label class="field-row">
					<span># Locations</span>
					<input type="number" name="num_locations" min="1" bind:value={selectedLead.num_locations} />
				</label>

				<label class="field-row field-row--inline">
					<span>Has app</span>
					<select name="has_app" bind:value={selectedLead.has_app}>
						<option value={null}>Unknown</option>
						<option value={true}>Yes</option>
						<option value={false}>No</option>
					</select>
				</label>

				<label class="field-row">
					<span>POS system</span>
					<input type="text" name="uses_pos" bind:value={selectedLead.uses_pos} />
				</label>

				<label class="field-row field-row--inline">
					<span>Uses KDS</span>
					<select name="uses_kds" bind:value={selectedLead.uses_kds}>
						<option value={null}>Unknown</option>
						<option value={true}>Yes</option>
						<option value={false}>No</option>
					</select>
				</label>

				<label class="field-row field-row--inline">
					<span>Uses SMS</span>
					<select name="uses_sms" bind:value={selectedLead.uses_sms}>
						<option value={null}>Unknown</option>
						<option value={true}>Yes</option>
						<option value={false}>No</option>
					</select>
				</label>

				<div class="panel-actions">
					<button type="submit" class="btn-save" disabled={saving}>
						{saving ? 'Saving…' : 'Save'}
					</button>
					{#if saveMessage}
						<span class="save-message" class:save-message--error={saveMessage === 'Error saving'}>
							{saveMessage}
						</span>
					{/if}
				</div>
			</form>
		</section>
	</aside>
{/if}

<style>
	.crm-layout {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-2xl) var(--space-xl);
	}

	.crm-header {
		display: flex;
		align-items: baseline;
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
	}

	.crm-toolbar {
		margin-bottom: var(--space-lg);
	}

	.crm-search {
		width: 320px;
		background: var(--bg-slate);
		border: 1px solid var(--border-edge);
		border-radius: 6px;
		color: var(--text-bright);
		padding: var(--space-sm) var(--space-md);
		font-size: 0.875rem;
		font-family: inherit;
	}

	.crm-search:focus {
		outline: none;
		border-color: var(--color-stream-blue);
	}

	.crm-header h1 {
		font-size: 1.5rem;
	}

	.crm-count {
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.crm-table-wrap {
		overflow-x: auto;
	}

	.crm-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.crm-table th {
		text-align: left;
		padding: var(--space-sm) var(--space-md);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border-edge);
	}

	.th-filter {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.th-filter select {
		background: var(--bg-slate);
		border: 1px solid var(--border-edge);
		border-radius: 4px;
		color: var(--text-muted);
		font-size: 0.7rem;
		padding: 2px 4px;
		cursor: pointer;
		font-family: inherit;
	}

	.th-filter select:focus {
		outline: none;
		border-color: var(--color-stream-blue);
	}

	.crm-empty {
		text-align: center;
		color: var(--text-faded);
		padding: var(--space-2xl);
		font-size: 0.875rem;
	}

	.crm-table td {
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--border-edge);
		color: var(--text-bright);
		vertical-align: middle;
	}

	.crm-row:hover td {
		background: var(--bg-slate);
	}

	.crm-row--selected td {
		background: color-mix(in srgb, var(--color-stream-blue) 8%, transparent);
	}

	.crm-name {
		font-weight: 500;
	}

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		background: var(--bg-slate);
		color: var(--text-muted);
	}

	.badge--new { background: color-mix(in srgb, var(--color-info) 15%, transparent); color: var(--color-info); }
	.badge--researched { background: color-mix(in srgb, #a78bfa 15%, transparent); color: #7c3aed; }
	.badge--contacted { background: color-mix(in srgb, var(--color-byte-amber) 15%, transparent); color: var(--color-byte-amber); }
	.badge--followup { background: color-mix(in srgb, var(--color-byte-amber) 20%, transparent); color: var(--color-byte-amber); }
	.badge--demo { background: color-mix(in srgb, var(--color-data-teal) 15%, transparent); color: var(--color-data-teal); }
	.badge--won { background: color-mix(in srgb, var(--color-signal-green) 15%, transparent); color: var(--color-signal-green); }
	.badge--lost { background: color-mix(in srgb, var(--color-error) 15%, transparent); color: var(--color-error); }

	.btn-edit {
		padding: 4px 12px;
		border: 1px solid var(--border-edge);
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.btn-edit:hover {
		background: var(--bg-slate);
		color: var(--text-bright);
	}

	/* ── Edit Panel ───────────────────────────────────────── */
	.panel-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 10;
	}

	.edit-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 420px;
		background: var(--bg-carbon);
		border-left: 1px solid var(--border-edge);
		z-index: 11;
		overflow-y: auto;
		padding: var(--space-xl);
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--space-xl);
	}

	.panel-header h2 {
		font-size: 1.125rem;
		font-weight: 600;
		max-width: 320px;
	}

	.btn-close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.125rem;
		cursor: pointer;
		padding: 4px;
		line-height: 1;
	}

	.btn-close:hover { color: var(--text-bright); }

	.panel-section {
		margin-bottom: var(--space-xl);
	}

	.panel-section h3 {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: var(--space-md);
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.readonly-tag {
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: none;
		letter-spacing: 0;
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--bg-slate);
		color: var(--text-faded);
	}

	.field-list {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: var(--space-xs) var(--space-md);
		font-size: 0.8125rem;
	}

	.field-list dt { color: var(--text-muted); }
	.field-list dd { color: var(--text-bright); margin: 0; }

	.field-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin-bottom: var(--space-md);
		font-size: 0.8125rem;
	}

	.field-row span {
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 500;
	}

	.field-row input,
	.field-row select,
	.field-row textarea {
		background: var(--bg-slate);
		border: 1px solid var(--border-edge);
		border-radius: 4px;
		color: var(--text-bright);
		padding: var(--space-sm);
		font-size: 0.875rem;
		font-family: inherit;
		width: 100%;
	}

	.field-row textarea { resize: vertical; }

	.field-row--inline {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}

	.field-row--inline select { width: auto; }

	.panel-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		margin-top: var(--space-lg);
	}

	.btn-save {
		padding: var(--space-sm) var(--space-lg);
		background: var(--color-stream-blue);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
	.btn-save:not(:disabled):hover { background: var(--color-deep-stream); }

	.save-message {
		font-size: 0.8125rem;
		color: var(--color-signal-green);
	}

	.save-message--error { color: var(--color-error); }

	.website-link {
		display: inline-block;
		margin-top: var(--space-xs);
		font-size: 0.8125rem;
		color: var(--color-stream-blue);
		text-decoration: none;
	}

	.website-link:hover {
		text-decoration: underline;
	}
</style>
