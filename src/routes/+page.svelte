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
			name: 'Documentation',
			description: 'Internal docs, API references, runbooks, and compliance policies.',
			status: 'Internal'
		}
	];
</script>

<svelte:head>
	<title>ByteStreams Intranet</title>
</svelte:head>

{#if data.user}
	<Nav user={data.user} />

	<main class="dashboard">
		<div class="dashboard-header">
			<h1>Welcome back, {data.user.displayName}</h1>
			<p class="dashboard-subtitle">ByteStreams LLC — Internal Dashboard</p>
		</div>

		<div class="card-grid">
			{#each products as product (product.name)}
				<ProductCard {product} />
			{/each}
		</div>
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
</style>
