<script lang="ts">
	import { onMount } from 'svelte';
	import Nav from '$lib/components/Nav.svelte';
	import ProductCard from '$lib/components/ProductCard.svelte';
	import type { Product } from '$lib/types';

	type KpiData = {
		generated_at: string;
		total_contacts: number;
		contacted_or_beyond: number;
		emailed: number;
		called: number;
		demos: number;
		pilots: number;
		customers: number;
	};

	let kpi = $state<KpiData | null>(null);
	let kpiError = $state<string | null>(null);
	let kpiLoading = $state(true);

	async function loadKpi() {
		kpiLoading = true;
		kpiError = null;
		try {
			const res = await fetch('/kpi');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			kpi = await res.json() as KpiData;
		} catch (e) {
			kpiError = e instanceof Error ? e.message : 'Failed to load KPIs';
		} finally {
			kpiLoading = false;
		}
	}

	function fmtTimestamp(iso: string): string {
		return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
	}

	onMount(() => {
		loadKpi();
		const id = setInterval(loadKpi, 60 * 60 * 1000); // refresh every 60 min
		return () => clearInterval(id);
	});

	let { data } = $props();

	const products = $derived.by((): Product[] => [
		{
			name: 'DialTone.Menu',
			description:
				'Voice AI for restaurants — call handling, order capture, and SMS confirmations.',
			status: 'Active',
			href: 'https://dialtone.menu'
		},
		{
			name: 'DialTone.Med',
			description:
				'AI phone assistant for medical and dental practices — scheduling, intake, routing.',
			status: 'In Development'
		},
		{
			name: 'CRM',
			description: 'Lead pipeline — view prospects and update sales activity.',
			status: 'Internal',
			href: '/crm'
		},
		...(data.canAccessCrmAdmin
			? [{
				name: 'CRM Admin',
				description: 'Audit lead changes, investigate history, and restore prior states.',
				status: 'Internal' as const,
				href: '/crm-admin'
			}]
			: []),
		...(data.canAccessPortalAdmin
			? [{
				name: 'Portal Admin',
				description: 'Manage customers, billing, and messages for the ByteStreams customer portal.',
				status: 'Internal' as const,
				href: '/portal-admin'
			}]
			: []),
		{
			name: 'Documentation',
			description: 'Internal docs, API references, runbooks, and compliance policies.',
			status: 'Internal',
			href: '/files'
		}
	]);
</script>

<svelte:head>
	<title>ByteStreams Internal Intranet</title>
	<meta
		name="description"
		content="ByteStreams internal intranet landing page for authorized personnel."
	/>
</svelte:head>

<Nav user={data.user} />

<main class="dashboard">
	<div class="dashboard-header">
		<h1>Welcome back, {data.user.displayName}</h1>
		<p class="dashboard-subtitle">ByteStreams LLC — Internal Dashboard</p>
	</div>

	<div class="section-header kpi-header">
		<h2>Lead KPIs</h2>
		{#if kpi}
			<span class="kpi-updated">Updated {fmtTimestamp(kpi.generated_at)}</span>
		{/if}
	</div>

	{#if kpiLoading && !kpi}
		<div class="kpi-loading">Loading KPIs…</div>
	{:else if kpiError}
		<div class="kpi-error">
			<span><i>⚠</i> {kpiError}</span>
			<button onclick={loadKpi} class="retry-btn">Retry</button>
		</div>
	{:else if kpi}
		<div class="kpi-grid">
			<div class="kpi-card">
				<span class="kpi-value">{kpi.total_contacts.toLocaleString()}</span>
				<span class="kpi-label">Contacts</span>
			</div>
			<div class="kpi-card">
				<span class="kpi-value">{kpi.contacted_or_beyond.toLocaleString()}</span>
				<span class="kpi-label">Contacted</span>
			</div>
			<div class="kpi-card">
				<span class="kpi-value">{kpi.emailed.toLocaleString()}</span>
				<span class="kpi-label">Emailed</span>
			</div>
			<div class="kpi-card">
				<span class="kpi-value">{kpi.called.toLocaleString()}</span>
				<span class="kpi-label">Called</span>
			</div>
			<div class="kpi-card">
				<span class="kpi-value">{kpi.demos.toLocaleString()}</span>
				<span class="kpi-label">Demos Booked</span>
			</div>
		</div>
		<div class="kpi-highlight-list">
			<div class="kpi-highlight kpi-highlight--pilots">
				<span class="kpi-highlight-label">Pilots</span>
				<span class="kpi-highlight-value">{kpi.pilots.toLocaleString()}</span>
			</div>
			<div class="kpi-highlight kpi-highlight--customers">
				<span class="kpi-highlight-label">Customers</span>
				<span class="kpi-highlight-value">{kpi.customers.toLocaleString()}</span>
			</div>
		</div>
	{/if}

	<div class="section-header" style="margin-top:var(--space-2xl);">
		<h2>Internal Tools</h2>
		<p>Direct access to ByteStreams products and resources. More tools will be added here as they come online.</p>
	</div>

	<div class="card-grid">
		{#each products as product (product.name)}
			<ProductCard {product} />
		{/each}
	</div>
</main>

<style>
	.dashboard {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-2xl) var(--space-xl);
	}

	.dashboard-header {
		margin-bottom: var(--space-2xl);
	}

	.dashboard-header h1 {
		font-size: 1.75rem;
		margin-bottom: var(--space-sm);
	}

	.dashboard-subtitle {
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.section-header.kpi-header {
		display: flex;
		align-items: baseline;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}

	.kpi-updated {
		font-size: 0.75rem;
		color: var(--text-faded);
	}

	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}

	.kpi-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-md) var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.kpi-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1;
	}

	.kpi-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.kpi-highlight-list {
		display: grid;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
	}

	.kpi-highlight {
		display: flex;
		align-items: baseline;
		gap: var(--space-md);
		padding: var(--space-md) var(--space-lg);
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.kpi-highlight--pilots {
		border-left-color: var(--color-byte-amber);
	}

	.kpi-highlight--customers {
		border-left-color: var(--color-signal-green);
	}

	.kpi-highlight-value {
		min-width: 2ch;
		font-size: 0.9375rem;
		font-weight: 700;
		line-height: 1;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.kpi-highlight-label {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1;
		color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0;
	}

	.kpi-loading {
		font-size: 0.875rem;
		color: var(--text-faded);
		margin-bottom: var(--space-lg);
	}

	.kpi-error {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		font-size: 0.875rem;
		color: var(--error, #c0392b);
		margin-bottom: var(--space-lg);
	}

	.retry-btn {
		background: none;
		border: 1px solid currentColor;
		border-radius: var(--radius-sm);
		color: inherit;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 8px;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-lg);
	}

	.section-header {
		margin-bottom: var(--space-lg);
	}

	.section-header h2 {
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: var(--space-xs);
	}

	.section-header p {
		font-size: 0.8125rem;
		color: var(--text-faded);
	}
</style>
