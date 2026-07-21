<script lang="ts">
	import type { User } from '$lib/types';

	let { user }: { user: User } = $props();
</script>

<nav class="nav" aria-label="Primary">
	<div class="nav-brand">
		<a href="/" aria-label="ByteStreams — home">
			<img
				src="/assets/blue-side-slim-logo.png"
				alt="ByteStreams"
				class="nav-logo"
				width="148"
				height="42"
			/>
		</a>
		<span class="nav-divider" aria-hidden="true"></span>
		<span class="nav-label">Intranet</span>
	</div>

	<nav class="nav-links" aria-label="Section">
		<a href="/crm" class="nav-link">CRM</a>
		<a href="/calendar" class="nav-link">Calendar</a>
	</nav>

	<div class="nav-user">
		<span class="nav-user-name">
			{user.displayName}
			<span class="nav-user-email">{user.email}</span>
		</span>
		<a href="/auth/logout" class="btn-outline">Sign Out</a>
	</div>
</nav>

<style>
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-xl);
		border-bottom: 1px solid var(--border-edge);
		background: var(--bg-carbon);
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.nav-brand a {
		display: flex;
		align-items: center;
	}

	.nav-logo {
		display: block;
	}

	.nav-divider {
		width: 1px;
		height: 24px;
		background: var(--border-edge);
	}

	.nav-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.01em;
	}

	.nav-user {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
	}

	.nav-link {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
	}

	.nav-link:hover {
		color: var(--text-bright);
	}

	.nav-user-name {
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.nav-user-email {
		display: none;
	}

	@media (min-width: 640px) {
		.nav-user-email {
			display: inline;
		}

		.nav-user-name {
			display: flex;
			align-items: center;
			gap: var(--space-sm);
		}

		.nav-user-email::before {
			content: '·';
			margin-right: var(--space-xs);
		}
	}
</style>
