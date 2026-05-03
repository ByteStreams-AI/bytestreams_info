<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<meta name="description" content="ByteStreams LLC — Internal Platform" />
</svelte:head>

{@render children()}
