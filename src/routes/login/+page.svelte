<script lang="ts">
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { data } = $props();
</script>

<svelte:head>
	<title>Sign In — ByteStreams Intranet</title>
</svelte:head>

<div class="login-page">
	<div class="login-card">
		<img
			src="/assets/blue-side-slim-logo.png"
			alt="ByteStreams"
			class="login-logo"
			width="198"
			height="56"
		/>

		<h1>ByteStreams Intranet</h1>
		<p class="login-subtitle">
			Sign in with your ByteStreams Google Workspace account to continue.
		</p>

		<a href="/" class="btn-primary sso-btn">
			<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<path
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
					fill="#4285F4"
				/>
				<path
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					fill="#34A853"
				/>
				<path
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					fill="#FBBC05"
				/>
				<path
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					fill="#EA4335"
				/>
			</svg>
			Sign in with Google
		</a>

		<p class="login-footer">ByteStreams LLC — Authorized personnel only</p>
	</div>
</div>

<style>
	.login-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: var(--space-md);
	}

	.login-card {
		background: var(--bg-carbon);
		border: 1px solid var(--border-edge);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
		max-width: 420px;
		width: 100%;
		text-align: center;
	}

	.login-logo {
		margin-bottom: var(--space-lg);
	}

	.login-card h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: var(--space-sm);
	}

	.login-subtitle {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin-bottom: var(--space-xl);
		line-height: 1.5;
	}

	.sso-btn {
		width: 100%;
	}

	.sso-btn :global(svg) {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}

	.login-footer {
		margin-top: var(--space-lg);
		font-size: 0.75rem;
		color: var(--text-faded);
		letter-spacing: 0.02em;
	}
</style>
