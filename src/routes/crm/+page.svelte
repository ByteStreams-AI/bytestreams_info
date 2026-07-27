<script lang="ts">
	import Nav from '$lib/components/Nav.svelte';
	import type { Lead, LeadResearchFinding, ResearchReviewStatus } from '$lib/types';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const STATUSES = [
		'new',
		'researched',
		'reviewed',
		'prospect',
		'contacted',
		'followup_required',
		'demo_scheduled',
		'closed_won',
		'customer',
		'closed_lost'
	] as const;

	const STATUS_LABELS: Record<string, string> = {
		new: 'New',
		researched: 'Researched',
		reviewed: 'Reviewed',
		prospect: 'Prospect',
		contacted: 'Contacted',
		followup_required: 'Follow-up',
		demo_scheduled: 'Demo Scheduled',
		closed_won: 'Closed Won',
		customer: 'Customer',
		closed_lost: 'Closed Lost'
	};

	const STATUS_CLASS: Record<string, string> = {
		new: 'badge--new',
		researched: 'badge--researched',
		reviewed: 'badge--reviewed',
		prospect: 'badge--prospect',
		contacted: 'badge--contacted',
		followup_required: 'badge--followup',
		demo_scheduled: 'badge--demo',
		closed_won: 'badge--won',
		customer: 'badge--customer',
		closed_lost: 'badge--lost'
	};

	let selectedLead = $state<Lead | null>(null);
	let saving = $state(false);
	let salesFormDirty = $state(false);
	let saveMessage = $state<string | null>(null);
	let generatingScript = $state(false);
	let scriptMessage = $state<string | null>(null);
	let researching = $state(false);
	let researchMessage = $state<string | null>(null);
	let reviewingFindingId = $state<string | null>(null);
	let researchFindings = $derived<LeadResearchFinding[]>(data.researchFindings);

	let showAddModal = $state(false);
	let addSaving = $state(false);
	let addError = $state<string | null>(null);

	function openAddModal() {
		showAddModal = true;
		addError = null;
	}

	function closeAddModal() {
		showAddModal = false;
		addError = null;
	}

	// ── Filtering ─────────────────────────────────────────────────────────────
	let search = $state('');
	let filterStatus = $state('');
	let filterCity = $state('');
	let filterDelivery = $state('');
	let filterPickup = $state('');
	let currentPage = $state(1);
	const PAGE_SIZE = 50;

	const cities = $derived.by(() => {
		return data.leads
			.map((lead) => lead.city?.trim())
			.filter((value): value is string => Boolean(value))
			.reduce<{ value: string; label: string }[]>((options, city) => {
				const value = city.toLocaleLowerCase();
				const existingIndex = options.findIndex((option) => option.value === value);
				if (existingIndex === -1) return [...options, { value, label: city }];

				const existing = options[existingIndex];
				if (existing.label !== existing.label.toLocaleUpperCase() || city === city.toLocaleUpperCase()) {
					return options;
				}
				return options.with(existingIndex, { value, label: city });
			}, [])
			.sort((left, right) => left.label.localeCompare(right.label));
	});

	const filteredLeads = $derived(
		data.leads.filter((lead) => {
			if (search && !lead.business_name.toLowerCase().includes(search.toLowerCase())) return false;
			if (filterStatus && lead.status !== filterStatus) return false;
			if (filterCity && lead.city?.trim().toLocaleLowerCase() !== filterCity) return false;
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
	const totalPages = $derived(Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE)));
	const pageNumbers = $derived(Array.from({ length: totalPages }, (_, index) => index + 1));
	const pageStart = $derived((currentPage - 1) * PAGE_SIZE);
	const pageEnd = $derived(Math.min(pageStart + PAGE_SIZE, filteredLeads.length));
	const paginatedLeads = $derived(filteredLeads.slice(pageStart, pageEnd));

	function resetPage() {
		currentPage = 1;
	}

	function openPanel(lead: Lead) {
		selectedLead = { ...lead };
		salesFormDirty = false;
		saveMessage = null;
		scriptMessage = null;
		researchMessage = null;
	}

	function closePanel() {
		selectedLead = null;
		salesFormDirty = false;
		saveMessage = null;
		scriptMessage = null;
		researchMessage = null;
	}

	const selectedResearchFindings = $derived(
		selectedLead
			? researchFindings.filter((finding) => finding.lead_id === selectedLead!.lead_id)
			: []
	);

	async function researchRestaurant() {
		if (!selectedLead) return;
		researching = true;
		researchMessage = null;
		const body = new FormData();
		body.set('lead_id', selectedLead.lead_id);

		try {
			const response = await fetch('?/researchRestaurant', { method: 'POST', body });
			const result = deserialize(await response.text()) as {
				type?: string;
				data?: { findings?: LeadResearchFinding[]; message?: string };
			};
			if (result.type === 'success' && result.data?.findings) {
				researchFindings = [
					...result.data.findings,
					...researchFindings.filter((finding) => finding.run_id !== result.data!.findings![0]?.run_id)
				];
				researchMessage = `Found ${result.data.findings.length} items to review`;
			} else {
				researchMessage = result.data?.message ?? `Unable to research restaurant (HTTP ${response.status})`;
			}
		} catch (researchError) {
			researchMessage = researchError instanceof Error
				? `Unable to research restaurant: ${researchError.message}`
				: 'Unable to research restaurant';
		} finally {
			researching = false;
		}
	}

	async function reviewFinding(finding: LeadResearchFinding, reviewStatus: ResearchReviewStatus) {
		reviewingFindingId = finding.finding_id;
		researchMessage = null;
		const body = new FormData();
		body.set('finding_id', finding.finding_id);
		body.set('review_status', reviewStatus);

		try {
			const response = await fetch('?/reviewResearchFinding', { method: 'POST', body });
			const result = deserialize(await response.text()) as { type?: string; data?: { message?: string } };
			if (result.type === 'success') {
				finding.review_status = reviewStatus;
				researchMessage = reviewStatus === 'approved' ? 'Finding approved' : 'Finding rejected';
			} else {
				researchMessage = result.data?.message ?? `Unable to review finding (HTTP ${response.status})`;
			}
		} catch (reviewError) {
			researchMessage = reviewError instanceof Error ? reviewError.message : 'Unable to review finding';
		} finally {
			reviewingFindingId = null;
		}
	}

	async function generateScript() {
		if (!selectedLead) return;
		generatingScript = true;
		scriptMessage = null;
		const body = new FormData();
		body.set('lead_id', selectedLead.lead_id);

		try {
			const response = await fetch('?/generateScript', { method: 'POST', body });
			const responseText = await response.text();
			const result = deserialize(responseText) as { type?: string; data?: { call_script?: string; message?: string } };
			if (result.type === 'success' && result.data?.call_script) {
				selectedLead.call_script = result.data.call_script;
				const index = data.leads.findIndex((lead) => lead.lead_id === selectedLead!.lead_id);
				if (index !== -1) data.leads[index].call_script = result.data.call_script;
				scriptMessage = 'Generated and saved';
			} else {
				scriptMessage = result.data?.message ?? `Unable to generate script (HTTP ${response.status})`;
			}
		} catch (generationError) {
			scriptMessage = generationError instanceof Error
				? `Unable to generate script: ${generationError.message}`
				: 'Unable to generate script';
		} finally {
			generatingScript = false;
		}
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
		<button class="btn-add-lead" onclick={openAddModal}>+ Add Lead</button>
	</div>

	<div class="crm-toolbar">
		<input
			class="crm-search"
			type="search"
			placeholder="Search business name…"
			bind:value={search}
			oninput={resetPage}
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
							<select bind:value={filterCity} onchange={resetPage} aria-label="Filter by city">
								<option value="">All</option>
								{#each cities as city (city.value)}
									<option value={city.value}>{city.label}</option>
								{/each}
							</select>
						</div>
					</th>
					<th>Phone</th>
					<th>
						<div class="th-filter">
							<span>Status</span>
							<select bind:value={filterStatus} onchange={resetPage} aria-label="Filter by status">
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
							<select bind:value={filterDelivery} onchange={resetPage} aria-label="Filter by delivery">
								<option value="">All</option>
								<option value="yes">Yes</option>
								<option value="no">No</option>
							</select>
						</div>
					</th>
					<th>
						<div class="th-filter">
							<span>Pickup</span>
							<select bind:value={filterPickup} onchange={resetPage} aria-label="Filter by pickup">
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
				{#each paginatedLeads as lead (lead.lead_id)}
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
	{#if filteredLeads.length > 0}
		<nav class="crm-pagination" aria-label="Lead pagination">
			<span class="pagination-summary">Showing {pageStart + 1}–{pageEnd} of {filteredLeads.length}</span>
			<div class="pagination-controls">
				<button type="button" onclick={() => currentPage -= 1} disabled={currentPage === 1}>Previous</button>
				<label>
					<span>Page</span>
					<select bind:value={currentPage} aria-label="Current page">
						{#each pageNumbers as page (page)}
							<option value={page}>{page}</option>
						{/each}
					</select>
					<span>of {totalPages}</span>
				</label>
				<button type="button" onclick={() => currentPage += 1} disabled={currentPage === totalPages}>Next</button>
			</div>
		</nav>
	{/if}
</main>

{#if showAddModal}
	<!-- Add Lead modal -->
	<div class="panel-backdrop" onclick={closeAddModal} role="presentation"></div>
	<div class="edit-panel" aria-label="Add new lead" role="dialog" aria-modal="true">
		<div class="panel-header">
			<h2>Add New Lead</h2>
			<button class="btn-close" onclick={closeAddModal} aria-label="Close">✕</button>
		</div>
		<p class="required-note"><span class="req">*</span> Required field</p>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				addSaving = true;
				addError = null;
				return async ({ result, update }) => {
					addSaving = false;
					if (result.type === 'success') {
						showAddModal = false;
						await invalidateAll();
					} else if (result.type === 'failure') {
						addError = (result.data as { message?: string } | undefined)?.message ?? 'Failed to save.';
					} else {
						addError = 'Something went wrong.';
					}
					await update({ reset: false });
				};
			}}
		>
			<label class="field-row">
				<span><span class="req">*</span> Business Name</span>
				<input type="text" name="business_name" required autocomplete="off" />
			</label>

			<label class="field-row">
				<span><span class="req">*</span> City</span>
				<input type="text" name="city" required autocomplete="off" />
			</label>

			<label class="field-row">
				<span><span class="req">*</span> State</span>
				<input type="text" name="state" required placeholder="TX" maxlength="100" autocomplete="off" />
			</label>

			<label class="field-row">
				<span>Phone</span>
				<input type="tel" name="phone" />
			</label>

			<label class="field-row">
				<span>Address</span>
				<input type="text" name="address" />
			</label>

			<label class="field-row">
				<span>Contact Name</span>
				<input type="text" name="contact_name" />
			</label>

			<label class="field-row">
				<span>Email</span>
				<input type="email" name="email" />
			</label>

			<label class="field-row">
				<span>Website URL</span>
				<input type="url" name="website_url" placeholder="https://…" />
			</label>

			<label class="field-row field-row--inline">
				<span>Business Type</span>
				<select name="business_type">
					<option value="">Unknown</option>
					<option value="food_truck">Food Truck</option>
					<option value="single_location">Single Location</option>
					<option value="multi_configuration">Multi-Configuration</option>
					<option value="multi_location">Multi-Location</option>
					<option value="enterprise">Enterprise</option>
				</select>
			</label>

			<label class="field-row">
				<span>Notes</span>
				<textarea name="notes" rows="4"></textarea>
			</label>

			{#if addError}
				<p class="add-error">{addError}</p>
			{/if}

			<div class="panel-actions">
				<button type="submit" class="btn-save" disabled={addSaving}>
					{addSaving ? 'Saving…' : 'Add Lead'}
				</button>
				<button type="button" class="btn-cancel" onclick={closeAddModal}>Cancel</button>
			</div>
		</form>
	</div>
{/if}

{#if selectedLead}
	<!-- Slide-in edit panel -->
	<div class="panel-backdrop" onclick={closePanel} role="presentation"></div>
	<aside class="edit-panel" aria-label="Edit lead">
		<div class="panel-header">
			<div class="panel-title">
				<h2>{selectedLead.business_name}</h2>
				{#if selectedLead.call_script?.trim()}
					<span class="script-generated-badge">Call Script Generated</span>
				{/if}
			</div>
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

		<section class="panel-section research-section">
			<div class="research-heading">
				<div>
					<h3>Restaurant Research</h3>
					<span class="research-autosave">Saved automatically</span>
				</div>
				<button
					type="button"
					class="btn-research"
					disabled={researching || !selectedLead.website_url?.trim()}
					onclick={researchRestaurant}
				>
					{researching ? 'Researching…' : 'Research Restaurant'}
				</button>
			</div>
			{#if researchMessage}
				<p class:script-error={researchMessage.startsWith('Unable')} class="research-message" aria-live="polite">{researchMessage}</p>
			{/if}
			{#if selectedResearchFindings.length > 0}
				<ul class="research-list">
					{#each selectedResearchFindings as finding (finding.finding_id)}
						<li class="research-item">
							<div class="research-copy">
								<span class="research-category">{finding.category.replaceAll('_', ' ')}</span>
								<a href={finding.value} target="_blank" rel="noopener noreferrer">{finding.value}</a>
								<span class="research-source">Source: <a href={finding.source_url} target="_blank" rel="noopener noreferrer">official website</a> · {Math.round(finding.confidence * 100)}% confidence</span>
							</div>
							<div class="research-review">
								<span class="review-status review-status--{finding.review_status}">{finding.review_status}</span>
								<button type="button" title="Approve finding" aria-label="Approve finding" disabled={reviewingFindingId === finding.finding_id} onclick={() => reviewFinding(finding, 'approved')}>✓</button>
								<button type="button" title="Reject finding" aria-label="Reject finding" disabled={reviewingFindingId === finding.finding_id} onclick={() => reviewFinding(finding, 'rejected')}>✕</button>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="research-empty">No saved findings.</p>
			{/if}
		</section>

		<!-- Editable sales fields -->
		<section class="panel-section">
			<h3>Sales Info</h3>
			<form
				method="POST"
				action="?/update"
				oninput={() => { salesFormDirty = true; }}
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
							selectedLead = null;
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

				<div class="field-row call-script-field">
					<div class="call-script-heading">
						<span>AI Call Script</span>
						<div class="call-script-action">
							{#if scriptMessage}
								<span class:script-error={!scriptMessage.includes('saved')} class="script-message" aria-live="polite">{scriptMessage}</span>
							{/if}
							<button
								type="button"
								class="btn-generate"
								disabled={generatingScript || !['researched', 'reviewed'].includes(selectedLead.status)}
								onclick={generateScript}
							>
								{generatingScript ? 'Generating…' : 'Generate Script'}
							</button>
						</div>
					</div>
					<textarea
						name="call_script"
						rows="18"
						maxlength="15000"
						placeholder="Set the status to Researched or Reviewed, save it, then generate a personalized script."
						bind:value={selectedLead.call_script}
					></textarea>
				</div>

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
					<button type="submit" class="btn-save" disabled={saving || !salesFormDirty}>
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

	.crm-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-md) 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.pagination-controls,
	.pagination-controls label {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.pagination-controls button,
	.pagination-controls select {
		min-height: 32px;
		border: 1px solid var(--border-edge);
		border-radius: 4px;
		background: var(--bg-slate);
		color: var(--text-bright);
		font: inherit;
	}

	.pagination-controls button {
		padding: 0 var(--space-md);
		cursor: pointer;
	}

	.pagination-controls button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.pagination-controls select {
		padding: 0 var(--space-sm);
		cursor: pointer;
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
	.badge--reviewed { background: color-mix(in srgb, var(--color-data-teal) 15%, transparent); color: var(--color-data-teal); }
	.badge--prospect { background: color-mix(in srgb, var(--color-stream-blue) 15%, transparent); color: var(--color-stream-blue); }
	.badge--contacted { background: color-mix(in srgb, var(--color-byte-amber) 15%, transparent); color: var(--color-byte-amber); }
	.badge--followup { background: color-mix(in srgb, var(--color-byte-amber) 20%, transparent); color: var(--color-byte-amber); }
	.badge--demo { background: color-mix(in srgb, var(--color-data-teal) 15%, transparent); color: var(--color-data-teal); }
	.badge--won { background: color-mix(in srgb, var(--color-signal-green) 15%, transparent); color: var(--color-signal-green); }
	.badge--customer { background: color-mix(in srgb, var(--color-signal-green) 25%, transparent); color: var(--color-signal-green); }
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
		max-width: 100%;
	}

	.panel-title {
		display: flex;
		min-width: 0;
		max-width: 320px;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-sm);
	}

	.script-generated-badge {
		display: inline-flex;
		align-items: center;
		min-height: 22px;
		padding: 3px 8px;
		border: 1px solid color-mix(in srgb, var(--color-signal-green) 40%, transparent);
		border-radius: 4px;
		background: color-mix(in srgb, var(--color-signal-green) 12%, transparent);
		color: var(--color-signal-green);
		font-size: 0.68rem;
		font-weight: 600;
		line-height: 1.2;
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

	.btn-add-lead {
		margin-left: auto;
		padding: var(--space-sm) var(--space-lg);
		background: var(--color-stream-blue);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-add-lead:hover {
		background: var(--color-deep-stream);
	}

	.required-note {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: var(--space-md);
	}

	.req {
		color: #ef4444;
		font-weight: 700;
		margin-right: 2px;
	}

	.field-row .req {
		color: #ef4444;
	}

	.add-error {
		color: var(--color-error);
		font-size: 0.8125rem;
		margin-bottom: var(--space-md);
	}

	.btn-cancel {
		padding: var(--space-sm) var(--space-lg);
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border-edge);
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-cancel:hover {
		color: var(--text-bright);
		background: var(--bg-slate);
	}

	.call-script-field textarea {
		min-height: 320px;
		resize: vertical;
		font-family: var(--font-code);
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.call-script-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
	}

	.call-script-action {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-sm);
		min-width: 0;
	}

	.btn-generate {
		padding: 6px 10px;
		background: var(--color-data-teal);
		color: #fff;
		border: 0;
		border-radius: 4px;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-generate:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.script-message {
		font-size: 0.75rem;
		color: var(--color-signal-green);
		text-align: right;
		overflow-wrap: anywhere;
	}

	.script-error {
		color: var(--color-error);
	}

	.research-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}

	.research-heading h3 { margin-bottom: 0; }

	.research-autosave {
		display: block;
		margin-top: 2px;
		color: var(--text-faded);
		font-size: 0.68rem;
	}

	.btn-research {
		padding: 6px 10px;
		border: 0;
		border-radius: 4px;
		background: var(--color-stream-blue);
		color: #fff;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-research:disabled { opacity: 0.45; cursor: not-allowed; }

	.research-message,
	.research-empty {
		margin: 0 0 var(--space-sm);
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.research-list {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.research-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-sm);
		padding: var(--space-sm);
		border: 1px solid var(--border-edge);
		border-radius: 4px;
		background: var(--bg-slate);
	}

	.research-copy { display: grid; min-width: 0; gap: 3px; }
	.research-copy > a { color: var(--text-bright); font-size: 0.75rem; overflow-wrap: anywhere; }
	.research-category { color: var(--text-muted); font-size: 0.68rem; font-weight: 600; text-transform: uppercase; }
	.research-source { color: var(--text-faded); font-size: 0.68rem; }
	.research-source a { color: var(--color-stream-blue); }
	.research-review { display: flex; align-items: flex-start; gap: 4px; }
	.research-review button { width: 26px; height: 26px; border: 1px solid var(--border-edge); border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; }
	.research-review button:hover { color: var(--text-bright); background: var(--bg-carbon); }
	.review-status { padding: 4px 6px; border-radius: 4px; color: var(--text-muted); font-size: 0.65rem; text-transform: capitalize; }
	.review-status--approved { color: var(--color-signal-green); }
	.review-status--rejected { color: var(--color-error); }
</style>
