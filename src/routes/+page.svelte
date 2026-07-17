<script lang="ts">
	import Nav from '$lib/components/Nav.svelte';
	import ProductCard from '$lib/components/ProductCard.svelte';
	import type { Product } from '$lib/types';

	let { data } = $props();

	const products: Product[] = [
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
		{
			name: 'Documentation',
			description: 'Internal docs, API references, runbooks, and compliance policies.',
			status: 'Internal'
		}
	];
</script>

<svelte:head>
	<title>ByteStreams Internal Intranet</title>
	<meta
		name="description"
		content="ByteStreams internal intranet landing page for authorized personnel."
	/>
</svelte:head>

{#if data.user}
	<Nav user={data.user} />

	<main class="dashboard">
		<div class="dashboard-header">
			<h1>Welcome back, {data.user.displayName}</h1>
			<p class="dashboard-subtitle">ByteStreams LLC — Internal Dashboard</p>
		</div>

		<div class="section-header">
			<h2>Internal Tools</h2>
			<p>Direct access to ByteStreams products and resources. More tools will be added here as they come online.</p>
		</div>

		<div class="card-grid">
			{#each products as product (product.name)}
				<ProductCard {product} />
			{/each}
		</div>
	</main>
{:else}
	<main class="landing-minimal" aria-label="ByteStreams intranet landing">
		<img
			src="/assets/blue-side-slim-logo.png"
			alt="ByteStreams"
			class="landing-logo"
			width="198"
			height="56"
		/>
		<p class="landing-tagline">Smarter Workflows, Stronger Results.</p>
	</main>
{/if}

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

	.landing-minimal {
		min-height: 100vh;
		padding: 28px 20px;
		background: #0d1117;
	}

	.landing-logo {
		display: block;
		max-width: 198px;
		height: auto;
		margin-bottom: 14px;
	}

	.landing-tagline {
		margin: 0;
		color: #c9d1d9;
		font-size: 1.625rem;
		line-height: 1.35;
		letter-spacing: 0.01em;
	}

	@media (max-width: 640px) {
		.landing-tagline {
			font-size: 1.25rem;
		}
	}
</style>
