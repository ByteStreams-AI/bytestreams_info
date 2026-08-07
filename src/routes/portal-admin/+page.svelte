<script lang="ts">
	import { onMount } from 'svelte';
	import Nav from '$lib/components/Nav.svelte';

	let { data } = $props();

	onMount(() => {
		const getEl = <T = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

		type PortalCustomerRow = {
			id: string;
			email: string;
			full_name: string | null;
			business_id: string | null;
			business_name: string | null;
			business_type: string | null;
			product: string | null;
			status: string | null;
			ein: string | null;
			ein_verified: boolean;
			monthly_amount_cents: number | null;
			invited_at: string | null;
			activated_at: string | null;
		};

		type BillingRow = {
			id: string;
			business_id: string | null;
			business_name: string | null;
			billing_month: string;
			amount_cents: number;
			due_date: string;
			status: string;
			paid_at: string | null;
		};

		function fmtDate(iso: string | null | undefined) {
			if (!iso) return '—';
			return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		}
		function fmtMonth(d: string) {
			return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
		}
		function fmtCents(c: number) {
			return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
		}
		function statusBadge(s: string) {
			const m: Record<string, [string, string, string]> = {
				active:        ['badge-success', 'fa-circle-check',       'Active'],
				setup_pending: ['badge-warning', 'fa-clock',              'Setup Pending'],
				churned:       ['badge-neutral', 'fa-circle-minus',       'Churned'],
				paid:          ['badge-success', 'fa-circle-check',       'Paid'],
				pending:       ['badge-warning', 'fa-clock',              'Due'],
				overdue:       ['badge-error',   'fa-circle-exclamation', 'Overdue'],
			};
			const [cls, icon, label] = m[s] ?? ['badge-neutral', 'fa-circle', s];
			return `<span class="badge ${cls}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
		}
		function escHtml(v: unknown) {
			return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
		}

		const API = '/portal-admin/api';
		const authHeaders = () => ({ 'Content-Type': 'application/json' });

		// ── Tabs ──────────────────────────────────────────────────────────────────
		document.querySelectorAll('.tab-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
				(btn as HTMLElement).classList.add('active');
				['customers','billing','messages'].forEach(t => getEl(`tab-${t}`).classList.add('hidden'));
				getEl(`tab-${(btn as HTMLElement).dataset.tab}`).classList.remove('hidden');
				if ((btn as HTMLElement).dataset.tab === 'billing') loadBilling();
			});
		});

		// ── Customers ────────────────────────────────────────────────────────────
		async function loadCustomers() {
			try {
				const res = await fetch(`${API}/customers`);
				const payload = await res.json() as unknown;
				getEl('customers-loading').classList.add('hidden');

				if (!res.ok) {
					throw new Error((payload as { error?: string } | null)?.error ?? 'Failed to load customers');
				}
				if (!Array.isArray(payload)) {
					throw new Error('Invalid customers response');
				}
				const data = payload as PortalCustomerRow[];

				if (!data.length) { getEl('customers-empty').classList.remove('hidden'); return; }

				getEl('stat-total').textContent = String(data.length);
				getEl('stat-active').textContent = String(data.filter((r) => r.status === 'active').length);
				getEl('stat-pending').textContent = String(data.filter((r) => r.status === 'setup_pending').length);
				getEl('stat-churned').textContent = String(data.filter((r) => r.status === 'churned').length);

				const tbody = getEl('customers-tbody');
				tbody.innerHTML = data.map((r) => `
					<tr>
						<td>
							<p class="cell-name">${escHtml(r.business_name ?? '—')}</p>
							<p class="text-mono">${escHtml(r.business_type ?? '')}</p>
						</td>
						<td>
							<p class="cell-email">${escHtml(r.email)}</p>
							<p class="text-mono">${escHtml(r.full_name ?? '')}</p>
						</td>
						<td><span class="badge badge-info">${escHtml(r.product ?? 'dialtone_menu')}</span></td>
						<td>${statusBadge(r.status ?? '')}</td>
						<td>${r.ein_verified ? '<span class="badge badge-success"><i class="fa-solid fa-shield-check"></i> Verified</span>' : (r.ein ? '<span class="badge badge-warning">Unverified</span>' : '—')}</td>
						<td>${r.monthly_amount_cents ? fmtCents(r.monthly_amount_cents) : '—'}</td>
						<td>${fmtDate(r.invited_at)}</td>
						<td>
							<button class="btn btn-ghost btn-sm resend-btn" data-id="${escHtml(r.id)}" data-email="${escHtml(r.email)}">
								<i class="fa-solid fa-paper-plane"></i> Resend
							</button>
						</td>
					</tr>
				`).join('');

				getEl('customers-table').classList.remove('hidden');

				getEl('customers-tbody').querySelectorAll('.resend-btn').forEach(btn => {
					btn.addEventListener('click', () => resendInvite((btn as HTMLElement).dataset.id!, (btn as HTMLElement).dataset.email!, btn as HTMLButtonElement));
				});
			} catch (err: unknown) {
				console.error('Load customers:', err);
				const empty = getEl('customers-empty');
				empty.textContent = err instanceof Error ? err.message : 'Failed to load customers';
				empty.classList.remove('hidden');
			}
		}

		async function resendInvite(accountId: string, email: string, btn: HTMLButtonElement) {
			btn.disabled = true;
			try {
				const res = await fetch(`${API}/resend-invite`, {
					method: 'POST', headers: authHeaders(),
					body: JSON.stringify({ account_id: accountId, email })
				});
				const data = await res.json() as { error?: string };
				if (!res.ok) throw new Error(data.error ?? 'Failed');
				btn.innerHTML = '<i class="fa-solid fa-check"></i> Sent';
			} catch {
				btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Failed';
			}
			setTimeout(() => {
				btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Resend';
				btn.disabled = false;
			}, 3000);
		}

		// ── Billing ───────────────────────────────────────────────────────────────
		async function loadBilling() {
			const now = new Date();
			getEl('billing-month-label').textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
			getEl('billing-loading').classList.remove('hidden');
			getEl('billing-table').classList.add('hidden');
			getEl('billing-empty').classList.add('hidden');

			try {
				const res = await fetch(`${API}/billing`);
				const payload = await res.json() as unknown;
				getEl('billing-loading').classList.add('hidden');

				if (!res.ok) {
					throw new Error((payload as { error?: string } | null)?.error ?? 'Failed to load billing');
				}
				if (!Array.isArray(payload)) {
					throw new Error('Invalid billing response');
				}
				const rows = payload as BillingRow[];

				if (!rows.length) { getEl('billing-empty').classList.remove('hidden'); return; }

				const tbody = getEl('billing-tbody');
				tbody.innerHTML = rows.map((r) => `
					<tr>
						<td class="cell-name">${escHtml(r.business_name ?? '—')}</td>
						<td>${fmtMonth(r.billing_month)}</td>
						<td>${fmtCents(r.amount_cents)}</td>
						<td>${fmtDate(r.due_date)}</td>
						<td>${statusBadge(r.status)}</td>
						<td>${r.paid_at ? fmtDate(r.paid_at) : '—'}</td>
					</tr>
				`).join('');
				getEl('billing-table').classList.remove('hidden');
			} catch (err: unknown) {
				console.error('Load billing:', err);
				const empty = getEl('billing-empty');
				empty.textContent = err instanceof Error ? err.message : 'Failed to load billing';
				empty.classList.remove('hidden');
			}
		}

		getEl('gen-billing-btn').addEventListener('click', async () => {
			const btn = getEl<HTMLButtonElement>('gen-billing-btn');
			const status = getEl('gen-status');
			btn.disabled = true;
			status.className = 'hidden';

			try {
				const res  = await fetch(`${API}/generate-billing`, { method: 'POST', headers: authHeaders() });
				const data = await res.json() as { error?: string; created?: number };
				if (!res.ok) throw new Error(data.error ?? 'Failed');
				status.className = 'status-msg success';
				status.innerHTML = `<i class="fa-solid fa-circle-check"></i> Created ${data.created ?? 0} billing record(s).`;
				await loadBilling();
			} catch (err: unknown) {
				status.className = 'status-msg error';
				status.textContent = err instanceof Error ? err.message : 'Failed';
			}
			status.classList.remove('hidden');
			btn.disabled = false;
		});

		// ── Messages ─────────────────────────────────────────────────────────────
		async function loadBusinessesForMsgDropdown() {
			try {
				const res = await fetch(`${API}/customers`);
				const payload = await res.json() as unknown;
				if (!res.ok || !Array.isArray(payload)) return;
				const data = payload as PortalCustomerRow[];
				const sel = getEl<HTMLSelectElement>('msg-target');
				data.forEach((r) => {
					const opt = document.createElement('option');
					opt.value = r.business_id ?? '';
					opt.textContent = r.business_name ?? r.email;
					if (opt.value) sel.appendChild(opt);
				});
			} catch (err: unknown) {
				console.error('Load message recipients:', err);
			}
		}

		getEl<HTMLFormElement>('msg-form').addEventListener('submit', async e => {
			e.preventDefault();
			const btn = getEl<HTMLButtonElement>('msg-btn');
			const statusEl = getEl('msg-status');
			btn.disabled = true;
			statusEl.className = 'hidden';

			try {
				const res = await fetch(`${API}/message`, {
					method: 'POST', headers: authHeaders(),
					body: JSON.stringify({
						business_id: getEl<HTMLSelectElement>('msg-target').value || null,
						body: getEl<HTMLTextAreaElement>('msg-body').value.trim(),
						is_active: getEl<HTMLInputElement>('msg-active').checked
					})
				});
				const data = await res.json() as { error?: string };
				if (!res.ok) throw new Error(data.error ?? 'Failed');
				statusEl.className = 'status-msg success';
				statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Message posted.';
				getEl<HTMLTextAreaElement>('msg-body').value = '';
			} catch (err: unknown) {
				statusEl.className = 'status-msg error';
				statusEl.textContent = err instanceof Error ? err.message : 'Failed';
			}
			statusEl.classList.remove('hidden');
			btn.disabled = false;
		});

		// ── New Customer Modal ────────────────────────────────────────────────────
		getEl('invite-btn').addEventListener('click',    () => { getEl('invite-modal').classList.remove('hidden'); });
		getEl('invite-cancel').addEventListener('click', () => closeModal());
		getEl('invite-modal').addEventListener('click',  e => { if (e.target === getEl('invite-modal')) closeModal(); });

		function closeModal() {
			getEl('invite-modal').classList.add('hidden');
			getEl<HTMLFormElement>('invite-form').reset();
			getEl('invite-error').classList.add('hidden');
			getEl('invite-success').classList.add('hidden');
			getEl('invite-submit-label').textContent = 'Create & Send Invite';
			getEl<HTMLButtonElement>('invite-submit-btn').disabled = false;
			getEl('invite-form').classList.remove('hidden');
		}

		function syncProductFields() {
			const p = getEl<HTMLSelectElement>('inv-product').value;
			getEl('inv-slug-wrap').classList.toggle('hidden', p !== 'dialtone_menu');
			getEl('inv-other-wrap').classList.toggle('hidden', p !== 'other');
		}
		getEl('inv-product').addEventListener('change', syncProductFields);
		syncProductFields();

		getEl<HTMLFormElement>('invite-form').addEventListener('submit', async e => {
			e.preventDefault();
			const btn = getEl<HTMLButtonElement>('invite-submit-btn');
			const label = getEl('invite-submit-label');
			const errEl = getEl('invite-error');
			btn.disabled = true;
			label.textContent = 'Creating…';
			errEl.classList.add('hidden');

			const amountCents = Math.round(parseFloat(getEl<HTMLInputElement>('inv-amount').value) * 100);
			const product = getEl<HTMLSelectElement>('inv-product').value;
			const bizTypeMap: Record<string, string> = { dialtone_menu: 'restaurant', dialtone_med: 'clinic' };
			const bizType = bizTypeMap[product] ?? (getEl<HTMLTextAreaElement>('inv-biz-desc').value.trim().slice(0, 110) || 'other');

			try {
				const res = await fetch(`${API}/invite`, {
					method: 'POST', headers: authHeaders(),
					body: JSON.stringify({
						business_name: getEl<HTMLInputElement>('inv-biz-name').value.trim(),
						business_type: bizType,
						dialtone_slug: getEl<HTMLInputElement>('inv-slug').value.trim() || null,
						product,
						ein: getEl<HTMLInputElement>('inv-ein').value.trim() || null,
						email: getEl<HTMLInputElement>('inv-email').value.trim(),
						full_name: getEl<HTMLInputElement>('inv-name').value.trim() || null,
						monthly_amount_cents: amountCents
					})
				});
				const data = await res.json() as { error?: string; ein_verified?: boolean };
				if (!res.ok) throw new Error(data.error ?? 'Failed');

				getEl('invite-success').innerHTML =
					`<i class="fa-solid fa-circle-check"></i> Customer created and invite sent!` +
					(data.ein_verified ? ' <span class="badge badge-success" style="margin-left:6px;"><i class="fa-solid fa-shield-check"></i> EIN Verified</span>' : '');
				getEl('invite-form').classList.add('hidden');
				getEl('invite-success').classList.remove('hidden');
				setTimeout(() => { closeModal(); loadCustomers(); }, 2500);
			} catch (err: unknown) {
				errEl.textContent = err instanceof Error ? err.message : 'Failed';
				errEl.classList.remove('hidden');
				btn.disabled = false;
				label.textContent = 'Create & Send Invite';
			}
		});

		// Init
		loadCustomers();
		loadBusinessesForMsgDropdown();
	});
</script>

<svelte:head>
	<title>Portal Admin | ByteStreams Intranet</title>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</svelte:head>

<Nav user={data.user} />

<div id="page-admin">
	<nav class="tab-nav">
		<button class="tab-btn active" data-tab="customers">
			<i class="fa-solid fa-store"></i> Customers
		</button>
		<button class="tab-btn" data-tab="billing">
			<i class="fa-solid fa-file-invoice-dollar"></i> Billing
		</button>
		<button class="tab-btn" data-tab="messages">
			<i class="fa-solid fa-message"></i> Messages
		</button>
	</nav>

	<div class="admin-content">

		<!-- Customers tab -->
		<div id="tab-customers">
			<div class="stats-row">
				<div class="stat-card"><p class="stat-label">Total Customers</p><p id="stat-total" class="stat-value">—</p></div>
				<div class="stat-card"><p class="stat-label">Active</p><p id="stat-active" class="stat-value">—</p></div>
				<div class="stat-card"><p class="stat-label">Setup Pending</p><p id="stat-pending" class="stat-value">—</p></div>
				<div class="stat-card"><p class="stat-label">Churned</p><p id="stat-churned" class="stat-value">—</p></div>
			</div>
			<div class="panel">
				<div class="panel-header">
					<span class="panel-title">All Customers</span>
					<button id="invite-btn" class="btn btn-secondary btn-sm">
						<i class="fa-solid fa-plus"></i> New Customer
					</button>
				</div>
				<p id="customers-loading" class="text-muted" style="padding:24px;">Loading…</p>
				<p id="customers-empty" class="text-muted hidden" style="padding:24px;">No customers yet.</p>
				<table id="customers-table" class="data-table hidden">
					<thead>
						<tr>
							<th>Business</th><th>Contact</th><th>Product</th>
							<th>Status</th><th>EIN</th><th>Monthly</th><th>Invited</th><th></th>
						</tr>
					</thead>
					<tbody id="customers-tbody"></tbody>
				</table>
			</div>
		</div>

		<!-- Billing tab -->
		<div id="tab-billing" class="hidden">
			<div class="panel">
				<div class="panel-header">
					<span class="panel-title">Billing Overview — <span id="billing-month-label"></span></span>
					<button id="gen-billing-btn" class="btn btn-secondary btn-sm">
						<i class="fa-solid fa-rotate"></i> Generate This Month
					</button>
				</div>
				<p id="billing-loading" class="text-muted" style="padding:24px;">Loading…</p>
				<p id="billing-empty" class="text-muted hidden" style="padding:24px;">No billing records for this month.</p>
				<table id="billing-table" class="data-table hidden">
					<thead>
						<tr>
							<th>Business</th><th>Period</th><th>Amount</th>
							<th>Due Date</th><th>Status</th><th>Paid On</th>
						</tr>
					</thead>
					<tbody id="billing-tbody"></tbody>
				</table>
				<div id="gen-status" class="hidden" style="padding:0 24px 24px;"></div>
			</div>
		</div>

		<!-- Messages tab -->
		<div id="tab-messages" class="hidden">
			<div class="panel">
				<div class="panel-header"><span class="panel-title">Post a Portal Message</span></div>
				<div class="panel-body">
					<form id="msg-form">
						<div class="form-row">
							<div class="form-group">
								<label for="msg-target">Recipient</label>
								<select id="msg-target">
									<option value="">All customers (general)</option>
								</select>
							</div>
							<div class="form-group">
								<div aria-hidden="true" style="height:20px;"></div>
								<div style="display:flex;align-items:center;gap:8px;height:41px;">
									<input type="checkbox" id="msg-active" checked style="width:auto;">
									<label for="msg-active" style="text-transform:none;letter-spacing:0;font-size:0.875rem;color:var(--bright);margin:0;">Active (visible in portal)</label>
								</div>
							</div>
						</div>
						<div class="form-group">
							<label for="msg-body">Message</label>
							<textarea id="msg-body" rows="3" placeholder="Message shown on customer dashboard…" required maxlength="1000"></textarea>
						</div>
						<button type="submit" class="btn btn-secondary btn-sm" id="msg-btn" style="width:auto;">
							<i class="fa-solid fa-paper-plane"></i> Post message
						</button>
						<div id="msg-status" class="hidden"></div>
					</form>
				</div>
			</div>
		</div>

	</div><!-- /admin-content -->
</div><!-- /page-admin -->

<!-- New Customer Modal -->
<div id="invite-modal" class="modal-backdrop hidden">
	<div class="modal">
		<h2><i class="fa-solid fa-store" style="color:var(--stream-blue);"></i> New Customer</h2>
		<form id="invite-form">
			<div class="form-group">
				<label for="inv-biz-name">Business name</label>
				<input id="inv-biz-name" type="text" required placeholder="The Golden Fork">
			</div>
			<div class="form-group">
				<label for="inv-product">Product</label>
				<select id="inv-product">
					<option value="dialtone_menu">DialTone.Menu</option>
					<option value="dialtone_med">DialTone.Med</option>
					<option value="other">Other</option>
				</select>
			</div>
			<div class="form-group hidden" id="inv-other-wrap">
				<label for="inv-biz-desc">Business type description</label>
				<textarea id="inv-biz-desc" rows="2" maxlength="110" placeholder="Describe the business type (max 110 chars)"></textarea>
			</div>
			<div class="form-group" id="inv-slug-wrap">
				<label for="inv-slug">DialTone Restaurant Slug (optional)</label>
				<input id="inv-slug" type="text" placeholder="the-golden-fork">
			</div>
			<div class="form-group">
				<label for="inv-ein">EIN (optional)</label>
				<input id="inv-ein" type="text" placeholder="XX-XXXXXXX" maxlength="10">
			</div>
			<div class="form-row">
				<div class="form-group">
					<label for="inv-email">Operator email</label>
					<input id="inv-email" type="email" required placeholder="owner@restaurant.com">
				</div>
				<div class="form-group">
					<label for="inv-name">Operator name</label>
					<input id="inv-name" type="text" placeholder="Jane Smith">
				</div>
			</div>
			<div class="form-group">
				<label for="inv-amount">Monthly amount (USD)</label>
				<input id="inv-amount" type="number" min="0" step="0.01" value="99.00" required>
			</div>
			<div id="invite-error" class="status-msg error hidden"></div>
			<div class="modal-footer">
				<button type="button" id="invite-cancel" class="btn btn-ghost">Cancel</button>
				<button type="submit" class="btn btn-primary" id="invite-submit-btn" style="width:auto;">
					<i class="fa-solid fa-envelope"></i>
					<span id="invite-submit-label">Create &amp; Send Invite</span>
				</button>
			</div>
		</form>
		<div id="invite-success" class="status-msg success hidden">
			<i class="fa-solid fa-circle-check"></i> Customer created and invite email sent!
		</div>
	</div>
</div>

<style>
	:global(.hidden) { display: none !important; }

	:global(#page-admin) {
		--void: #0D1117;
		--carbon: #161B22;
		--slate: #21262D;
		--edge: #30363D;
		--bright: #F0F6FC;
		--muted: #8B949E;
		--faded: #484F58;
		--stream-blue: #2563EB;
		--flow-blue: #3B82F6;
		--signal-green: #10B981;
		--byte-amber: #F59E0B;
		--error: #EF4444;
		--font: 'Inter', -apple-system, 'Segoe UI', sans-serif;
		--mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
		display: flex;
		flex-direction: column;
		min-height: calc(100vh - 64px);
	}

	/* Forms */
	:global(.form-group) { text-align: left; margin-bottom: 16px; }
	:global(.form-group label) {
		display: block; font-size: 0.75rem; font-weight: 600;
		color: var(--muted); margin-bottom: 6px;
		text-transform: uppercase; letter-spacing: 0.05em;
	}
	:global(.form-group input),
	:global(.form-group select),
	:global(.form-group textarea) {
		width: 100%; background: var(--slate); border: 1px solid var(--edge);
		border-radius: 8px; padding: 10px 14px; color: var(--bright);
		font-family: var(--font); font-size: 0.9375rem; outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	:global(.form-group input:focus),
	:global(.form-group select:focus),
	:global(.form-group textarea:focus) { border-color: var(--stream-blue); box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
	:global(.form-group select option) { background: var(--slate); }
	:global(.form-group textarea) { resize: vertical; min-height: 80px; }
	:global(.form-row) { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	@media (max-width: 560px) { :global(.form-row) { grid-template-columns: 1fr; } }

	/* Buttons */
	:global(.btn) {
		display: inline-flex; align-items: center; justify-content: center; gap: 8px;
		padding: 10px 20px; border-radius: 8px;
		font-family: var(--font); font-size: 0.9375rem; font-weight: 600;
		cursor: pointer; border: none; outline: none;
		transition: background 0.15s, opacity 0.15s; text-decoration: none;
	}
	:global(.btn:disabled) { opacity: 0.55; cursor: not-allowed; }
	:global(.btn-primary) { background: var(--stream-blue); color: #fff; width: 100%; }
	:global(.btn-primary:hover:not(:disabled)) { background: var(--flow-blue); }
	:global(.btn-secondary) { background: var(--slate); color: var(--bright); border: 1px solid var(--edge); }
	:global(.btn-secondary:hover:not(:disabled)) { background: var(--edge); }
	:global(.btn-ghost) { background: transparent; color: var(--muted); border: 1px solid var(--edge); padding: 7px 14px; font-size: 0.875rem; }
	:global(.btn-ghost:hover:not(:disabled)) { color: var(--bright); border-color: var(--muted); }
	:global(.btn-sm) { padding: 6px 14px; font-size: 0.8125rem; }

	/* Badges */
	:global(.badge) {
		display: inline-flex; align-items: center; gap: 4px;
		padding: 3px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: 600;
	}
	:global(.badge-info)    { background: rgba(37,99,235,0.14);  color: var(--flow-blue);    border: 1px solid rgba(37,99,235,0.3); }
	:global(.badge-success) { background: rgba(16,185,129,0.12); color: var(--signal-green); border: 1px solid rgba(16,185,129,0.3); }
	:global(.badge-warning) { background: rgba(245,158,11,0.12); color: var(--byte-amber);   border: 1px solid rgba(245,158,11,0.3); }
	:global(.badge-error)   { background: rgba(239,68,68,0.12);  color: var(--error);        border: 1px solid rgba(239,68,68,0.3); }
	:global(.badge-neutral) { background: rgba(139,148,158,0.12); color: var(--muted);       border: 1px solid rgba(139,148,158,0.2); }

	/* Status messages */
	:global(.status-msg) {
		padding: 12px 16px; border-radius: 8px; font-size: 0.875rem; margin-top: 16px;
		display: flex; align-items: center; gap: 8px;
	}
	:global(.status-msg.success) { background: rgba(16,185,129,0.1);  color: var(--signal-green); border: 1px solid rgba(16,185,129,0.25); }
	:global(.status-msg.error)   { background: rgba(239,68,68,0.1);   color: var(--error);        border: 1px solid rgba(239,68,68,0.25); }

	/* Tab nav */
	:global(.tab-nav) {
		display: flex; gap: 0; border-bottom: 1px solid var(--edge);
		background: var(--carbon); padding: 0 24px;
	}
	:global(.tab-btn) {
		padding: 14px 18px; font-size: 0.875rem; font-weight: 600;
		background: none; border: none; border-bottom: 2px solid transparent;
		color: var(--muted); cursor: pointer; transition: color 0.15s;
		display: flex; align-items: center; gap: 7px;
		margin-bottom: -1px;
	}
	:global(.tab-btn:hover) { color: var(--bright); }
	:global(.tab-btn.active) { color: var(--bright); border-bottom-color: var(--stream-blue); }

	/* Content area */
	:global(.admin-content) { max-width: 1100px; margin: 0 auto; padding: 32px 24px 80px; width: 100%; }

	/* Panels */
	:global(.panel) {
		background: var(--carbon); border: 1px solid var(--edge);
		border-radius: 16px; overflow: hidden; margin-bottom: 24px;
	}
	:global(.panel-header) {
		padding: 20px 24px; border-bottom: 1px solid var(--edge);
		display: flex; align-items: center; justify-content: space-between;
	}
	:global(.panel-title) { font-size: 1rem; font-weight: 700; }
	:global(.panel-body)  { padding: 24px; }

	/* Data table */
	:global(.data-table) { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
	:global(.data-table th) {
		text-align: left; padding: 10px 16px;
		font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: 0.06em; color: var(--muted);
		border-bottom: 1px solid var(--edge); white-space: nowrap;
	}
	:global(.data-table td) {
		padding: 12px 16px; border-bottom: 1px solid rgba(48,54,61,0.5);
		vertical-align: middle;
	}
	:global(.data-table tr:last-child td) { border-bottom: none; }
	:global(.data-table tr:hover td) { background: rgba(255,255,255,0.02); }
	:global(.cell-name)  { font-weight: 600; }
	:global(.cell-email) { font-family: var(--mono); font-size: 0.8rem; color: var(--muted); }
	:global(.text-muted) { color: var(--muted); font-size: 0.875rem; }
	:global(.text-mono)  { font-family: var(--mono); font-size: 0.8125rem; color: var(--muted); }

	/* Stats */
	:global(.stats-row) { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
	@media (max-width: 700px) { :global(.stats-row) { grid-template-columns: 1fr 1fr; } }
	:global(.stat-card) {
		background: var(--carbon); border: 1px solid var(--edge);
		border-radius: 12px; padding: 20px 24px;
	}
	:global(.stat-label) { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 6px; }
	:global(.stat-value) { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.03em; }

	/* Modal */
	:global(.modal-backdrop) {
		position: fixed; inset: 0; z-index: 500;
		background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
		display: flex; align-items: center; justify-content: center; padding: 24px;
	}
	:global(.modal) {
		background: var(--carbon); border: 1px solid var(--edge);
		border-radius: 16px; padding: 32px; width: 100%; max-width: 520px;
		max-height: 90vh; overflow-y: auto;
	}
	:global(.modal h2) { font-size: 1.25rem; font-weight: 700; margin-bottom: 24px; letter-spacing: -0.02em; }
	:global(.modal-footer) { display: flex; gap: 12px; margin-top: 24px; }
	:global(.modal-footer .btn) { width: auto; flex: 1; }
</style>
