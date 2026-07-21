<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import Nav from '$lib/components/Nav.svelte';
	import type { CalendarEvent } from '$lib/types';

	let { data } = $props();

	// ── Calendar instance ──────────────────────────────────────────────────────
	let calendarEl: HTMLDivElement;
	let calendar: import('@fullcalendar/core').Calendar | null = null;

	// ── Modal state ────────────────────────────────────────────────────────────
	type ModalMode = 'create' | 'edit' | null;
	let modalMode = $state<ModalMode>(null);
	let saving = $state(false);
	let deleteConfirm = $state(false);

	// Form fields
	let form = $state({
		id: '',
		title: '',
		description: '',
		start_at: '',
		end_at: '',
		all_day: false,
		color: '#3b82f6'
	});

	const EVENT_COLORS = [
		{ label: 'Blue',   value: '#3b82f6' },
		{ label: 'Violet', value: '#8b5cf6' },
		{ label: 'Green',  value: '#22c55e' },
		{ label: 'Amber',  value: '#f59e0b' },
		{ label: 'Red',    value: '#ef4444' },
		{ label: 'Cyan',   value: '#06b6d4' }
	];

	// ── Helpers ────────────────────────────────────────────────────────────────
	/** Convert ISO UTC string to local datetime-local input value */
	function toLocalInput(iso: string): string {
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	/** Convert local datetime-local input value to ISO UTC string */
	function toISO(local: string): string {
		return new Date(local).toISOString();
	}

	function openCreate(startStr?: string, endStr?: string, allDay?: boolean) {
		const now = new Date();
		const rounded = new Date(Math.ceil(now.getTime() / (30 * 60000)) * (30 * 60000));
		const defaultEnd = new Date(rounded.getTime() + 60 * 60000);

		form = {
			id: '',
			title: '',
			description: '',
			start_at: startStr ? toLocalInput(startStr) : toLocalInput(rounded.toISOString()),
			end_at: endStr ? toLocalInput(endStr) : toLocalInput(defaultEnd.toISOString()),
			all_day: allDay ?? false,
			color: '#3b82f6'
		};
		deleteConfirm = false;
		modalMode = 'create';
	}

	function openEdit(event: import('@fullcalendar/core').EventApi) {
		form = {
			id: event.id,
			title: event.title,
			description: (event.extendedProps.description as string) ?? '',
			start_at: toLocalInput(event.startStr),
			end_at: toLocalInput(event.endStr || event.startStr),
			all_day: event.allDay,
			color: event.backgroundColor || '#3b82f6'
		};
		deleteConfirm = false;
		modalMode = 'edit';
	}

	function closeModal() {
		modalMode = null;
		deleteConfirm = false;
	}

	// ── FullCalendar init ──────────────────────────────────────────────────────
	onMount(async () => {
		const { Calendar } = await import('@fullcalendar/core');
		const { default: dayGridPlugin } = await import('@fullcalendar/daygrid');
		const { default: timeGridPlugin } = await import('@fullcalendar/timegrid');
		const { default: listPlugin } = await import('@fullcalendar/list');
		const { default: interactionPlugin } = await import('@fullcalendar/interaction');

		const initialEvents = data.events.map((e: CalendarEvent) => ({
			id: e.id,
			title: e.title,
			start: e.start_at,
			end: e.end_at,
			allDay: e.all_day,
			backgroundColor: e.color ?? '#3b82f6',
			borderColor: e.color ?? '#3b82f6',
			extendedProps: { description: e.description, created_by: e.created_by }
		}));

		calendar = new Calendar(calendarEl, {
			plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
			initialView: 'dayGridMonth',
			headerToolbar: {
				left: 'prev,next today',
				center: 'title',
				right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
			},
			height: 'auto',
			editable: true,
			selectable: true,
			events: initialEvents,

			// Prevent selecting dates in the past
			selectAllow: ({ start }) => {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				return start >= today;
			},

			// Click existing event → open edit modal
			eventClick: ({ event }) => {
				openEdit(event);
			},

			// Select a date range → open create modal pre-filled
			select: ({ startStr, endStr, allDay }) => {
				openCreate(startStr, endStr, allDay);
				calendar?.unselect();
			},

			// Drag-to-move: persist new times immediately via fetch
			eventDrop: async ({ event, revert }) => {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				if (event.start && event.start < today) {
					revert();
					return;
				}
				const fd = new FormData();
				fd.append('id', event.id);
				fd.append('start_at', event.startStr);
				fd.append('end_at', event.endStr || event.startStr);
				fd.append('all_day', String(event.allDay));
				await fetch('?/update', { method: 'POST', body: fd });
			},

			// Drag-to-resize: persist new end time via fetch
			eventResize: async ({ event }) => {
				const fd = new FormData();
				fd.append('id', event.id);
				fd.append('start_at', event.startStr);
				fd.append('end_at', event.endStr || event.startStr);
				fd.append('all_day', String(event.allDay));
				await fetch('?/update', { method: 'POST', body: fd });
			}
		});

		calendar.render();
	});

	// ── After form actions: sync calendar ─────────────────────────────────────
	function afterCreate(result: { type: string; data?: { success?: boolean } }) {
		saving = false;
		if (result.type === 'success' && result.data?.success) {
			// Reload page to get fresh events from server (simplest & most reliable)
			window.location.reload();
		}
	}

	function afterUpdate(result: { type: string; data?: { success?: boolean } }) {
		saving = false;
		if (result.type === 'success' && result.data?.success) {
			window.location.reload();
		}
	}

	function afterDelete(result: { type: string; data?: { success?: boolean } }) {
		saving = false;
		if (result.type === 'success' && result.data?.success) {
			window.location.reload();
		}
	}

	async function handleDelete() {
		saving = true;
		const fd = new FormData();
		fd.append('id', form.id);
		const res = await fetch('?/delete', { method: 'POST', body: fd });
		afterDelete({ type: res.ok ? 'success' : 'error', data: res.ok ? { success: true } : undefined });
	}
</script>

<svelte:head>
	<title>Calendar — ByteStreams</title>
</svelte:head>

<Nav user={data.user} />

<main class="cal-layout">
	<div class="cal-header">
		<h1>Calendar</h1>
		<button class="btn-primary" onclick={() => openCreate()}>+ New Event</button>
	</div>

	<div class="cal-wrap" bind:this={calendarEl}></div>
</main>

<!-- ── Modal ─────────────────────────────────────────────────────────────── -->
{#if modalMode}
	<div class="modal-backdrop" onclick={closeModal} role="presentation"></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label="{modalMode === 'create' ? 'New event' : 'Edit event'}">
		<div class="modal-header">
			<h2>{modalMode === 'create' ? 'New Event' : 'Edit Event'}</h2>
			<button class="btn-close" onclick={closeModal} aria-label="Close">✕</button>
		</div>

		{#if modalMode === 'create'}
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						await update({ reset: false });
							afterCreate(result as { type: string; data?: { success?: boolean } });
					};
				}}
			>
				{@render eventFields()}
				<div class="modal-actions">
					<button type="button" class="btn-ghost" onclick={closeModal}>Cancel</button>
					<button type="submit" class="btn-primary" disabled={saving}>
						{saving ? 'Saving…' : 'Create Event'}
					</button>
				</div>
			</form>
		{:else}
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						afterUpdate(result as { type: string; data?: { success?: boolean } });
					};
				}}
			>
				<input type="hidden" name="id" value={form.id} />
				{@render eventFields()}
				<div class="modal-actions">
					{#if deleteConfirm}
						<span class="delete-confirm-text">Are you sure?</span>
						<button type="button" class="btn-danger" disabled={saving} onclick={handleDelete}>
							{saving ? 'Deleting…' : 'Yes, delete'}
						</button>
						<button type="button" class="btn-ghost" onclick={() => (deleteConfirm = false)}>Cancel</button>
					{:else}
						<button type="button" class="btn-danger-outline" onclick={() => (deleteConfirm = true)}>Delete</button>
						<div style="flex:1"></div>
						<button type="button" class="btn-ghost" onclick={closeModal}>Cancel</button>
						<button type="submit" class="btn-primary" disabled={saving}>
							{saving ? 'Saving…' : 'Save Changes'}
						</button>
					{/if}
				</div>
			</form>
		{/if}
	</div>
{/if}

<!-- ── Shared form fields snippet ────────────────────────────────────────── -->
{#snippet eventFields()}
	<label class="field-row">
		<span>Title <span class="required">*</span></span>
		<input type="text" name="title" bind:value={form.title} required autocomplete="off" />
	</label>

	<label class="field-row">
		<span>Description</span>
		<textarea name="description" rows="3" bind:value={form.description}></textarea>
	</label>

	<label class="field-row field-row--inline">
		<span>All day</span>
		<input type="checkbox" name="all_day" bind:checked={form.all_day} />
		<input type="hidden" name="all_day" value={String(form.all_day)} />
	</label>

	<label class="field-row">
		<span>Start</span>
		<input
			type={form.all_day ? 'date' : 'datetime-local'}
			name="start_at"
			value={form.all_day ? form.start_at.slice(0, 10) : form.start_at}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLInputElement).value;
				form.start_at = form.all_day ? v + 'T00:00' : v;
			}}
			required
		/>
	</label>

	<label class="field-row">
		<span>End</span>
		<input
			type={form.all_day ? 'date' : 'datetime-local'}
			name="end_at"
			value={form.all_day ? form.end_at.slice(0, 10) : form.end_at}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLInputElement).value;
				form.end_at = form.all_day ? v + 'T23:59' : v;
			}}
			required
		/>
	</label>

	<!-- Convert local input values to UTC ISO before submit -->
	<input type="hidden" name="start_at" value={toISO(form.start_at)} />
	<input type="hidden" name="end_at" value={toISO(form.end_at)} />

	<div class="field-row">
		<span class="field-label">Color</span>
		<div class="color-swatches">
			{#each EVENT_COLORS as c (c.value)}
				<button
					type="button"
					class="color-swatch"
					class:color-swatch--active={form.color === c.value}
					style="background:{c.value}"
					aria-label={c.label}
					onclick={() => (form.color = c.value)}
				></button>
			{/each}
		</div>
		<input type="hidden" name="color" value={form.color} />
	</div>
{/snippet}

<style>
	.cal-layout {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-xl);
	}

	.cal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-lg);
	}

	.cal-header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.cal-wrap {
		background: var(--bg-surface);
		border: 1px solid var(--border-edge);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
	}

	/* FullCalendar theme overrides */
	:global(.fc) {
		font-family: var(--font-sans);
		color: var(--text-primary);
	}
	:global(.fc .fc-toolbar-title) {
		font-size: 1.1rem;
		font-weight: 600;
	}
	:global(.fc .fc-button) {
		background: var(--bg-carbon);
		border-color: var(--border-edge);
		color: var(--text-primary);
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
		border-radius: var(--radius-sm);
		box-shadow: none;
		text-transform: capitalize;
	}
	:global(.fc .fc-button:hover) {
		background: var(--bg-elevated);
		border-color: var(--color-byte-blue);
		color: var(--color-byte-blue);
	}
	:global(.fc .fc-button-primary:not(:disabled).fc-button-active),
	:global(.fc .fc-button-primary:not(:disabled):active) {
		background: var(--color-byte-blue);
		border-color: var(--color-byte-blue);
		color: #fff;
	}
	:global(.fc .fc-col-header-cell-cushion),
	:global(.fc .fc-daygrid-day-number),
	:global(.fc .fc-list-event-title a) {
		color: var(--text-secondary);
		text-decoration: none;
	}
	:global(.fc .fc-daygrid-day-number:hover),
	:global(.fc .fc-list-event-title a:hover) {
		color: var(--color-byte-blue);
	}
	:global(.fc-theme-standard td),
	:global(.fc-theme-standard th),
	:global(.fc-theme-standard .fc-scrollgrid) {
		border-color: var(--border-edge);
	}
	:global(.fc .fc-daygrid-day.fc-day-today),
	:global(.fc .fc-timegrid-col.fc-day-today) {
		background: color-mix(in srgb, var(--color-byte-blue) 6%, transparent);
	}
	:global(.fc .fc-highlight) {
		background: color-mix(in srgb, var(--color-byte-blue) 12%, transparent);
	}
	:global(.fc .fc-event) {
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		cursor: pointer;
	}
	:global(.fc .fc-list-day-cushion) {
		background: var(--bg-carbon);
	}

	/* ── Modal ── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 101;
		background: var(--bg-surface);
		border: 1px solid var(--border-edge);
		border-radius: var(--radius-lg);
		padding: var(--space-xl);
		width: min(480px, 95vw);
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.modal-header h2 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-primary);
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}

	.delete-confirm-text {
		font-size: 0.85rem;
		color: var(--color-danger, #ef4444);
	}

	/* ── Field rows (reuse CRM style) ── */
	.field-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.field-row span,
	.field-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.field-row--inline {
		flex-direction: row;
		align-items: center;
	}

	.field-row input[type='text'],
	.field-row input[type='datetime-local'],
	.field-row input[type='date'],
	.field-row textarea {
		background: var(--bg-carbon);
		border: 1px solid var(--border-edge);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.9rem;
		padding: var(--space-xs) var(--space-sm);
		width: 100%;
		box-sizing: border-box;
	}

	.field-row input:focus,
	.field-row textarea:focus {
		outline: none;
		border-color: var(--color-byte-blue);
	}

	.required { color: var(--color-danger, #ef4444); }

	/* ── Color swatches ── */
	.color-swatches {
		display: flex;
		gap: var(--space-xs);
		margin-top: var(--space-xs);
	}

	.color-swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
		transition: transform 0.1s;
	}

	.color-swatch:hover { transform: scale(1.15); }

	.color-swatch--active {
		border-color: var(--text-primary);
		transform: scale(1.15);
	}

	/* ── Buttons ── */
	.btn-primary {
		background: var(--color-byte-blue);
		color: #fff;
		border: none;
		border-radius: var(--radius-sm);
		padding: var(--space-xs) var(--space-md);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-primary:hover { filter: brightness(1.1); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-ghost {
		background: transparent;
		border: 1px solid var(--border-edge);
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
		padding: var(--space-xs) var(--space-md);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.btn-ghost:hover { border-color: var(--text-primary); color: var(--text-primary); }

	.btn-danger {
		background: #ef4444;
		color: #fff;
		border: none;
		border-radius: var(--radius-sm);
		padding: var(--space-xs) var(--space-md);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-danger:hover { filter: brightness(1.1); }
	.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-danger-outline {
		background: transparent;
		border: 1px solid #ef4444;
		color: #ef4444;
		border-radius: var(--radius-sm);
		padding: var(--space-xs) var(--space-md);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.btn-danger-outline:hover { background: #ef44441a; }

	.btn-close {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 1rem;
		cursor: pointer;
		padding: 0 var(--space-xs);
	}

	.btn-close:hover { color: var(--text-primary); }
</style>
