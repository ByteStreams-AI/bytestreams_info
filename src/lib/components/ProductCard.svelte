<script lang="ts">
	import type { Product } from '$lib/types';

	let { product }: { product: Product } = $props();

	const statusColors: Record<Product['status'], string> = {
		Active: 'badge-active',
		'In Development': 'badge-dev',
		Internal: 'badge-internal',
		'Coming Soon': 'badge-soon'
	};
</script>

<div class="card">
	{#if product.href}
		<a href={product.href} class="card-link">
			<h3>{product.name}</h3>
		</a>
	{:else}
		<h3>{product.name}</h3>
	{/if}
	<p>{product.description}</p>
	<span class="badge {statusColors[product.status]}">{product.status}</span>
</div>

<style>
	.card {
		background: var(--bg-carbon);
		border: 1px solid var(--border-edge);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		transition: border-color var(--duration-micro) ease-out;
	}

	.card:hover {
		border-color: var(--text-faded);
	}

	h3 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: var(--space-sm);
		letter-spacing: -0.01em;
	}

	.card-link {
		color: inherit;
	}

	.card-link:hover h3 {
		color: var(--color-stream-blue);
	}

	p {
		color: var(--text-muted);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.badge {
		display: inline-block;
		margin-top: var(--space-sm);
		font-size: 0.6875rem;
		font-weight: 600;
		padding: var(--space-xs) 10px;
		border-radius: var(--radius-sm);
		letter-spacing: 0.02em;
	}

	.badge-active {
		background: rgba(16, 185, 129, 0.12);
		color: var(--color-signal-green);
	}

	.badge-dev {
		background: rgba(59, 130, 246, 0.12);
		color: var(--color-flow-blue);
	}

	.badge-internal {
		background: rgba(139, 148, 158, 0.12);
		color: var(--text-muted);
	}

	.badge-soon {
		background: rgba(245, 158, 11, 0.12);
		color: var(--color-byte-amber);
	}
</style>
