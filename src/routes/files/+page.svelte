<script lang="ts">
	import { enhance } from '$app/forms';
	import Nav from '$lib/components/Nav.svelte';

	let { data, form } = $props();

	let uploading = $state(false);
	let deletingPath = $state<string | null>(null);
	let deleteConfirmPath = $state<string | null>(null);
	let downloadingPath = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let dragOver = $state(false);

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short', day: 'numeric', year: 'numeric'
		});
	}

	function fileIcon(name: string): string {
		const ext = name.split('.').pop()?.toLowerCase() ?? '';
		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
		if (ext === 'pdf') return '📄';
		if (['doc', 'docx'].includes(ext)) return '📝';
		if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
		if (['ppt', 'pptx'].includes(ext)) return '📑';
		if (['mp4', 'mov'].includes(ext)) return '🎬';
		return '📁';
	}

	// Display name strips the leading timestamp prefix added during upload
	function displayName(name: string): string {
		return name.replace(/^\d+_/, '');
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file && fileInput) {
			const dt = new DataTransfer();
			dt.items.add(file);
			fileInput.files = dt.files;
			fileInput.dispatchEvent(new Event('change'));
		}
	}
</script>

<svelte:head>
	<title>Files — ByteStreams</title>
</svelte:head>

<Nav user={data.user} />

<main class="files-layout">
	<div class="files-header">
		<h1>Files</h1>
		<span class="files-count">{data.files.length} file{data.files.length !== 1 ? 's' : ''}</span>
	</div>

	<!-- ── Upload zone ─────────────────────────────────────────────────────── -->
	<form
		method="POST"
		action="?/upload"
		enctype="multipart/form-data"
		use:enhance={() => {
			uploading = true;
			return async ({ update }) => {
				await update();
				uploading = false;
				if (fileInput) fileInput.value = '';
			};
		}}
	>
		<div
			class="upload-zone"
			class:upload-zone--over={dragOver}
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => (dragOver = false)}
			ondrop={handleDrop}
			onclick={() => fileInput?.click()}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
			aria-label="Upload file"
		>
			<span class="upload-icon">⬆</span>
			<span class="upload-label">
				{#if uploading}
					Uploading…
				{:else}
					Click or drag a file to upload
				{/if}
			</span>
			<span class="upload-hint">PDF, Word, Excel, images, video · max 25 MB</span>
			<input
				type="file"
				name="file"
				bind:this={fileInput}
				class="upload-input"
				onchange={(e) => {
					const f = (e.currentTarget as HTMLInputElement).files?.[0];
					if (f) (e.currentTarget.form as HTMLFormElement).requestSubmit();
				}}
			/>
		</div>

		{#if form?.uploadError}
			<p class="upload-error">{form.uploadError}</p>
		{/if}
	</form>

	<!-- ── File list ───────────────────────────────────────────────────────── -->
	{#if data.files.length === 0}
		<div class="files-empty">No files yet. Upload one above.</div>
	{:else}
		<div class="files-table-wrap">
			<table class="files-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Size</th>
						<th>Updated</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.files as file (file.name)}
						<tr class="file-row">
							<td class="file-name">
								<span class="file-icon" aria-hidden="true">{fileIcon(file.name)}</span>
								{displayName(file.name)}
							</td>
							<td class="file-size">{formatBytes(file.size)}</td>
							<td class="file-date">{formatDate(file.updated_at)}</td>
							<td class="file-actions">
								<!-- Download: get signed URL then open -->
								<form
									method="POST"
									action="?/download"
									use:enhance={() => {
										downloadingPath = file.name;
										return async ({ result, update }) => {
											downloadingPath = null;
											if (result.type === 'success' && result.data?.signedUrl) {
												window.open(result.data.signedUrl as string, '_blank', 'noopener');
											}
											await update({ reset: false });
										};
									}}
								>
									<input type="hidden" name="path" value={file.name} />
									<button
										type="submit"
										class="btn-icon"
										disabled={downloadingPath === file.name}
										aria-label="Download {displayName(file.name)}"
										title="Download"
									>⬇</button>
								</form>

								<!-- Delete with confirm -->
								{#if deleteConfirmPath === file.name}
									<form
										method="POST"
										action="?/delete"
										use:enhance={() => {
											deletingPath = file.name;
											return async ({ update }) => {
												await update();
												deletingPath = null;
												deleteConfirmPath = null;
											};
										}}
									>
										<input type="hidden" name="path" value={file.name} />
										<button
											type="submit"
											class="btn-icon btn-icon--danger"
											disabled={deletingPath === file.name}
											aria-label="Confirm delete"
											title="Confirm delete"
										>✓</button>
									</form>
									<button
										type="button"
										class="btn-icon"
										onclick={() => (deleteConfirmPath = null)}
										aria-label="Cancel delete"
										title="Cancel"
									>✕</button>
								{:else}
									<button
										type="button"
										class="btn-icon btn-icon--danger-outline"
										onclick={() => (deleteConfirmPath = file.name)}
										aria-label="Delete {displayName(file.name)}"
										title="Delete"
									>🗑</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

<style>
	.files-layout {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--space-xl);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.files-header {
		display: flex;
		align-items: baseline;
		gap: var(--space-md);
	}

	.files-header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.files-count {
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	/* ── Upload zone ── */
	.upload-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		border: 2px dashed var(--border-edge);
		border-radius: var(--radius-lg);
		padding: var(--space-xl) var(--space-lg);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
		position: relative;
		background: var(--bg-surface);
	}

	.upload-zone:hover,
	.upload-zone--over {
		border-color: var(--color-byte-blue);
		background: color-mix(in srgb, var(--color-byte-blue) 5%, transparent);
	}

	.upload-icon {
		font-size: 1.8rem;
		line-height: 1;
		color: var(--text-secondary);
	}

	.upload-label {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.upload-hint {
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.upload-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.upload-error {
		font-size: 0.85rem;
		color: var(--color-error, #ef4444);
		margin: 0;
	}

	/* ── File table ── */
	.files-table-wrap {
		border: 1px solid var(--border-edge);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.files-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}

	.files-table thead th {
		background: var(--bg-carbon);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: var(--space-sm) var(--space-md);
		text-align: left;
		border-bottom: 1px solid var(--border-edge);
	}

	.file-row {
		border-bottom: 1px solid var(--border-edge);
		transition: background 0.1s;
	}

	.file-row:last-child { border-bottom: none; }
	.file-row:hover { background: var(--bg-elevated); }

	.file-row td {
		padding: var(--space-sm) var(--space-md);
		color: var(--text-primary);
		vertical-align: middle;
	}

	.file-name {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-weight: 500;
		word-break: break-all;
	}

	.file-icon { font-size: 1.1rem; flex-shrink: 0; }

	.file-size,
	.file-date {
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.file-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		justify-content: flex-end;
	}

	.files-empty {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.9rem;
		padding: var(--space-xl);
		border: 1px solid var(--border-edge);
		border-radius: var(--radius-lg);
	}

	/* ── Icon buttons ── */
	.btn-icon {
		background: transparent;
		border: 1px solid var(--border-edge);
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0;
		transition: border-color 0.1s, color 0.1s;
	}

	.btn-icon:hover:not(:disabled) {
		border-color: var(--text-primary);
		color: var(--text-primary);
	}

	.btn-icon:disabled { opacity: 0.45; cursor: not-allowed; }

	.btn-icon--danger:hover:not(:disabled) {
		border-color: #ef4444;
		color: #ef4444;
	}

	.btn-icon--danger-outline {
		color: var(--text-secondary);
	}

	.btn-icon--danger-outline:hover:not(:disabled) {
		border-color: #ef4444;
		color: #ef4444;
	}
</style>
