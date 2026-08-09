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
			tier: string | null;
			status: string | null;
			ein: string | null;
			ein_verified: boolean;
			address: string | null;
			address_street: string | null;
			address_city: string | null;
			address_state: string | null;
			address_zip: string | null;
			address_verified: boolean;
			phone: string | null;
			monthly_amount_cents: number | null;
			setup_fee_cents: number | null;
			onboarded: boolean;
			onboarded_at: string | null;
			recurring_billing_starts_at: string | null;
			invited_at: string | null;
			activated_at: string | null;
		};

		type BillingRow = {
			id: string;
			business_id: string | null;
			business_name: string | null;
			billing_month: string;
				subtotal_cents: number;
				tax_cents: number;
			amount_cents: number;
				stripe_tax_calculation_id: string | null;
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
		let customerRows: PortalCustomerRow[] = [];

		// ── Tabs ──────────────────────────────────────────────────────────────────
		document.querySelectorAll('.tab-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
				(btn as HTMLElement).classList.add('active');
				['customers','billing','messages','settings'].forEach(t => getEl(`tab-${t}`).classList.add('hidden'));
				getEl(`tab-${(btn as HTMLElement).dataset.tab}`).classList.remove('hidden');
				if ((btn as HTMLElement).dataset.tab === 'billing') loadBilling();
				if ((btn as HTMLElement).dataset.tab === 'settings') loadSettings();
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
				customerRows = data;

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
						<td>${statusBadge(r.status ?? '')}${r.onboarded ? '<br><span class="badge badge-success" style="margin-top:5px;"><i class="fa-solid fa-clipboard-check"></i> Onboarded</span>' : ''}</td>
						<td>${r.ein_verified
						? '<span class="badge badge-success"><i class="fa-solid fa-shield-check"></i> Verified</span>'
						: `${r.ein ? '<span class="badge badge-warning">Unverified</span>' : '<span style="color:var(--muted)">—</span>'} <button class="btn btn-ghost btn-xs fix-btn" data-biz="${escHtml(r.business_id??'')}"><i class="fa-solid fa-pen-to-square"></i></button>`
					}</td>
					<td>${r.address_verified
						? '<span class="badge badge-success"><i class="fa-solid fa-location-check"></i> Verified</span>'
						: `${r.address ? '<span class="badge badge-warning">Not Verified</span>' : '<span style="color:var(--muted)">—</span>'} <button class="btn btn-ghost btn-xs fix-btn" data-biz="${escHtml(r.business_id??'')}"><i class="fa-solid fa-pen-to-square"></i></button>`
					}</td>						<td><strong>${fmtCents(r.setup_fee_cents ?? 10000)}</strong> setup<br><span class="text-mono">${fmtCents(r.monthly_amount_cents ?? 0)} recurring</span></td>
						<td>${fmtDate(r.invited_at)}</td>
						<td>
							<button class="btn btn-ghost btn-sm edit-btn" data-id="${escHtml(r.id)}" title="Edit customer">
								<i class="fa-solid fa-pen-to-square"></i> Edit
							</button>
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

				getEl('customers-tbody').querySelectorAll('.edit-btn').forEach(btn => {
					const accountId = (btn as HTMLElement).dataset.id!;
					btn.addEventListener('click', () => {
						const customer = customerRows.find((row) => row.id === accountId);
						if (customer) openEditModal(customer);
					});
				});

				getEl('customers-tbody').querySelectorAll('.fix-btn').forEach(btn => {
					const el = btn as HTMLElement;
					btn.addEventListener('click', () => {
						const customer = customerRows.find((row) => row.business_id === el.dataset.biz);
						if (customer) openReverifyModal(customer);
					});
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
						<td>${fmtCents(r.subtotal_cents)}</td>
						<td>${fmtCents(r.tax_cents)}</td>
						<td><strong>${fmtCents(r.amount_cents)}</strong></td>
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
				const data = await res.json() as { error?: string; created?: number; failed?: number };
				if (!res.ok) throw new Error(data.error ?? 'Failed');
				status.className = data.failed ? 'status-msg error' : 'status-msg success';
				status.innerHTML = data.failed
					? `<i class="fa-solid fa-circle-exclamation"></i> Created ${data.created ?? 0}; ${data.failed} tax assessment(s) will retry.`
					: `<i class="fa-solid fa-circle-check"></i> Created ${data.created ?? 0} billing record(s).`;
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

		// ── Settings ─────────────────────────────────────────────────────────────
		async function loadSettings() {
			getEl('settings-loading').classList.remove('hidden');
			getEl('settings-content').classList.add('hidden');
			try {
				const res = await fetch(`${API}/settings`);
				const data = await res.json() as { settings?: Record<string, string>; error?: string };
				if (!res.ok) throw new Error(data.error ?? 'Failed to load settings');

				getEl<HTMLInputElement>('setting-tax-enabled').checked = data.settings?.enable_tax_assessment === 'true';

				getEl('settings-loading').classList.add('hidden');
				getEl('settings-content').classList.remove('hidden');
			} catch (err: unknown) {
				console.error('Load settings:', err);
				getEl('settings-loading').textContent = err instanceof Error ? err.message : 'Failed to load settings';
			}
		}

		getEl<HTMLFormElement>('settings-form').addEventListener('submit', async e => {
			e.preventDefault();
			const btn = getEl<HTMLButtonElement>('settings-save-btn');
			const statusEl = getEl('settings-status');
			btn.disabled = true;
			statusEl.className = 'hidden';

			try {
				const res = await fetch(`${API}/settings`, {
					method: 'POST', headers: authHeaders(),
					body: JSON.stringify({
						enable_tax_assessment: getEl<HTMLInputElement>('setting-tax-enabled').checked ? 'true' : 'false'
					})
				});
				const data = await res.json() as { error?: string };
				if (!res.ok) throw new Error(data.error ?? 'Failed');
				statusEl.className = 'status-msg success';
				statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Settings saved successfully.';
			} catch (err: unknown) {
				statusEl.className = 'status-msg error';
				statusEl.textContent = err instanceof Error ? err.message : 'Failed to save settings';
			}
			statusEl.classList.remove('hidden');
			btn.disabled = false;
		});

		// ── Re-verify Modal ──────────────────────────────────────────────────────
		getEl('rv-cancel').addEventListener('click', closeReverifyModal);
		getEl('reverify-modal').addEventListener('click', e => { if (e.target === getEl('reverify-modal')) closeReverifyModal(); });

		function openReverifyModal(customer: PortalCustomerRow) {
			getEl<HTMLInputElement>('rv-business-id').value = customer.business_id ?? '';
			getEl<HTMLInputElement>('rv-address-street').value = customer.address_street ?? '';
			getEl<HTMLInputElement>('rv-address-city').value = customer.address_city ?? '';
			getEl<HTMLInputElement>('rv-address-state').value = customer.address_state ?? '';
			getEl<HTMLInputElement>('rv-address-zip').value = customer.address_zip ?? '';
			getEl<HTMLInputElement>('rv-ein').value = customer.ein ?? '';
			getEl('rv-error').classList.add('hidden');
			getEl('rv-success').classList.add('hidden');
			getEl('rv-form').classList.remove('hidden');
			getEl<HTMLButtonElement>('rv-submit').disabled = false;
			getEl('rv-submit-label').textContent = 'Re-verify';
			getEl('reverify-modal').classList.remove('hidden');
		}

		function closeReverifyModal() {
			getEl('reverify-modal').classList.add('hidden');
		}

		getEl<HTMLFormElement>('rv-form').addEventListener('submit', async e => {
			e.preventDefault();
			const btn = getEl<HTMLButtonElement>('rv-submit');
			const label = getEl('rv-submit-label');
			const errEl = getEl('rv-error');
			btn.disabled = true;
			label.textContent = 'Verifying…';
			errEl.classList.add('hidden');

			try {
				const res = await fetch(`${API}/reverify`, {
					method: 'POST', headers: authHeaders(),
					body: JSON.stringify({
						business_id: getEl<HTMLInputElement>('rv-business-id').value,
						address_street: getEl<HTMLInputElement>('rv-address-street').value.trim() || null,
						address_city: getEl<HTMLInputElement>('rv-address-city').value.trim() || null,
						address_state: getEl<HTMLInputElement>('rv-address-state').value.trim().toUpperCase() || null,
						address_zip: getEl<HTMLInputElement>('rv-address-zip').value.trim() || null,
						ein: getEl<HTMLInputElement>('rv-ein').value.trim() || null,
					})
				});
				const data = await res.json() as { error?: string; ein_verified?: boolean; address_verified?: boolean };
				if (!res.ok) throw new Error(data.error ?? 'Failed');

				let html = '<i class="fa-solid fa-circle-check"></i> Updated!';
				if (data.ein_verified != null) html += data.ein_verified
					? ' <span class="badge badge-success"><i class="fa-solid fa-shield-check"></i> EIN Verified</span>'
					: ' <span class="badge badge-warning">EIN Unverified</span>';
				if (data.address_verified != null) html += data.address_verified
					? ' <span class="badge badge-success"><i class="fa-solid fa-location-check"></i> Address Verified</span>'
					: ' <span class="badge badge-warning">Address Not Verified</span>';

				getEl('rv-success').innerHTML = html;
				getEl('rv-form').classList.add('hidden');
				getEl('rv-success').classList.remove('hidden');
				setTimeout(() => { closeReverifyModal(); loadCustomers(); }, 2000);
			} catch (err: unknown) {
				errEl.textContent = err instanceof Error ? err.message : 'Failed';
				errEl.classList.remove('hidden');
				btn.disabled = false;
				label.textContent = 'Re-verify';
			}
		});

		// ── Edit Customer Modal ──────────────────────────────────────────────────
		getEl('edit-cancel').addEventListener('click', closeEditModal);
		getEl('edit-modal').addEventListener('click', e => { if (e.target === getEl('edit-modal')) closeEditModal(); });

		function openEditModal(customer: PortalCustomerRow) {
			getEl<HTMLInputElement>('edit-account-id').value = customer.id;
			getEl<HTMLInputElement>('edit-business-name').value = customer.business_name ?? '';
			getEl<HTMLInputElement>('edit-full-name').value = customer.full_name ?? '';
			getEl<HTMLInputElement>('edit-email').value = customer.email;
			getEl<HTMLInputElement>('edit-phone').value = customer.phone ?? '';
			getEl<HTMLInputElement>('edit-ein').value = customer.ein ?? '';
			getEl<HTMLInputElement>('edit-amount').value = ((customer.monthly_amount_cents ?? 0) / 100).toFixed(2);
			getEl<HTMLInputElement>('edit-product').value = customer.product ?? '';
			const tierSelect = getEl<HTMLSelectElement>('edit-tier');
			const isMenu = customer.product === 'dialtone_menu';
			getEl('edit-tier-wrap').classList.toggle('hidden', !isMenu);
			tierSelect.value = customer.tier ?? '';
			getEl<HTMLInputElement>('edit-amount').disabled = isMenu;
			getEl('edit-amount-label').textContent = isMenu ? 'Recurring Charge USD (set by tier)' : 'Charge USD';

			const onboarded = getEl<HTMLInputElement>('edit-onboarded');
			onboarded.checked = customer.onboarded;
			onboarded.disabled = customer.onboarded || !customer.ein_verified || !customer.address_verified;
			getEl('edit-onboarding-note').textContent = customer.onboarded
				? `Signed off ${fmtDate(customer.onboarded_at)}. First recurring charge: ${fmtDate(customer.recurring_billing_starts_at)}.`
				: (!customer.ein_verified || !customer.address_verified
					? 'EIN and address must both be verified before onboarding signoff.'
					: 'Sign off setup completion to start the 30-day recurring billing cycle.');
			getEl('edit-error').classList.add('hidden');
			getEl('edit-modal').classList.remove('hidden');
		}

		function closeEditModal() {
			getEl('edit-modal').classList.add('hidden');
		}

		getEl<HTMLSelectElement>('edit-tier').addEventListener('change', e => {
			const tier = (e.target as HTMLSelectElement).value;
			getEl<HTMLInputElement>('edit-amount').value = ((TIER_AMOUNTS[tier]?.cents ?? 0) / 100).toFixed(2);
		});

		getEl<HTMLFormElement>('edit-form').addEventListener('submit', async e => {
			e.preventDefault();
			const btn = getEl<HTMLButtonElement>('edit-submit');
			const err = getEl('edit-error');
			btn.disabled = true;
			err.classList.add('hidden');
			try {
				const res = await fetch(`${API}/customer`, {
					method: 'POST', headers: authHeaders(),
					body: JSON.stringify({
						account_id: getEl<HTMLInputElement>('edit-account-id').value,
						business_name: getEl<HTMLInputElement>('edit-business-name').value.trim(),
						full_name: getEl<HTMLInputElement>('edit-full-name').value.trim(),
						email: getEl<HTMLInputElement>('edit-email').value.trim(),
						phone: getEl<HTMLInputElement>('edit-phone').value.trim(),
						ein: getEl<HTMLInputElement>('edit-ein').value.trim(),
						tier: getEl<HTMLSelectElement>('edit-tier').value,
						monthly_amount_cents: Math.round(parseFloat(getEl<HTMLInputElement>('edit-amount').value || '0') * 100),
						onboarded: getEl<HTMLInputElement>('edit-onboarded').checked
					})
				});
				const data = await res.json() as { error?: string };
				if (!res.ok) throw new Error(data.error ?? 'Failed to update customer');
				closeEditModal();
				await loadCustomers();
			} catch (error: unknown) {
				err.textContent = error instanceof Error ? error.message : 'Failed to update customer';
				err.classList.remove('hidden');
			} finally {
				btn.disabled = false;
			}
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
			getEl('inv-charge-wrap').classList.add('hidden');
			syncProductFields();
		}

		const TIER_AMOUNTS: Record<string, { cents: number; label: string; asterisk: boolean }> = {
			pilot:               { cents: 0,     label: '$0.00',   asterisk: false },
			food_truck:          { cents: 19900, label: '$199.00', asterisk: false },
			single_location:     { cents: 27900, label: '$279.00', asterisk: false },
			multi_configuration: { cents: 34900, label: '$349.00', asterisk: true  },
			multi_location:      { cents: 39900, label: '$399.00', asterisk: false },
			enterprise:          { cents: 45000, label: '$450.00', asterisk: true  },
		};

		function syncProductFields() {
			const p = getEl<HTMLSelectElement>('inv-product').value;
			getEl('inv-dm-wrap').classList.toggle('hidden', p !== 'dialtone_menu');
			getEl('inv-med-wrap').classList.toggle('hidden', p !== 'dialtone_med');
			getEl('inv-other-wrap').classList.toggle('hidden', p !== 'other');
		}

		function syncTier() {
			const tier = getEl<HTMLSelectElement>('inv-tier').value;
			const wrap = getEl('inv-charge-wrap');
			if (!tier) { wrap.classList.add('hidden'); return; }
			const info = TIER_AMOUNTS[tier];
			if (!info) { wrap.classList.add('hidden'); return; }
			getEl('inv-charge-label').textContent = info.label + (info.asterisk ? ' *' : '');
			getEl('inv-charge-asterisk').classList.toggle('hidden', !info.asterisk);
			wrap.classList.remove('hidden');
		}

		getEl('inv-product').addEventListener('change', syncProductFields);
		getEl('inv-tier').addEventListener('change', syncTier);
		syncProductFields();

		getEl<HTMLFormElement>('invite-form').addEventListener('submit', async e => {
			e.preventDefault();
			const btn = getEl<HTMLButtonElement>('invite-submit-btn');
			const label = getEl('invite-submit-label');
			const errEl = getEl('invite-error');

			function showErr(msg: string) {
				errEl.textContent = msg;
				errEl.classList.remove('hidden');
				btn.disabled = false;
				label.textContent = 'Create & Send Invite';
			}

			btn.disabled = true;
			label.textContent = 'Creating…';
			errEl.classList.add('hidden');

			const product = getEl<HTMLSelectElement>('inv-product').value;
			const businessName = getEl<HTMLInputElement>('inv-biz-name').value.trim();
			if (!businessName) { showErr('Business Name is required'); return; }
			if (!product)      { showErr('Product is required'); return; }

			const reqBody: Record<string, unknown> = { business_name: businessName, product };

			if (product === 'dialtone_menu') {
				const tier = getEl<HTMLSelectElement>('inv-tier').value;
				const restaurantName = getEl<HTMLInputElement>('inv-restaurant-name').value.trim();
				const ein = getEl<HTMLInputElement>('inv-ein').value.trim();
				const addressStreet = getEl<HTMLInputElement>('inv-address-street').value.trim();
				const addressCity = getEl<HTMLInputElement>('inv-address-city').value.trim();
				const addressState = getEl<HTMLInputElement>('inv-address-state').value.trim().toUpperCase();
				const addressZip = getEl<HTMLInputElement>('inv-address-zip').value.trim();
				const email = getEl<HTMLInputElement>('inv-email').value.trim();
				const phone = getEl<HTMLInputElement>('inv-phone').value.trim();

				if (!restaurantName) { showErr('Restaurant Name is required'); return; }
				if (!ein)            { showErr('EIN is required'); return; }
				if (!addressStreet)  { showErr('Street is required'); return; }
				if (!addressCity)    { showErr('City is required'); return; }
				if (!/^[A-Z]{2}$/.test(addressState)) { showErr('State must be a two-character code'); return; }
				if (!/^\d{5}(?:-\d{4})?$/.test(addressZip)) { showErr('Enter a valid ZIP code'); return; }
				if (!email)          { showErr('Email is required'); return; }
				if (!phone)          { showErr('Phone is required'); return; }
				if (!tier)           { showErr('Tier is required'); return; }

				reqBody.restaurant_name      = restaurantName;
				reqBody.is_food_truck        = getEl<HTMLInputElement>('inv-food-truck').checked;
				reqBody.ein                  = ein;
				reqBody.address_street       = addressStreet;
				reqBody.address_city         = addressCity;
				reqBody.address_state        = addressState;
				reqBody.address_zip          = addressZip;
				reqBody.billing_address_same = getEl<HTMLInputElement>('inv-billing-addr').checked;
				reqBody.email                = email;
				reqBody.phone                = phone;
				reqBody.tier                 = tier;
				reqBody.monthly_amount_cents = TIER_AMOUNTS[tier]?.cents ?? 0;
			} else if (product === 'dialtone_med') {
				const email = getEl<HTMLInputElement>('inv-med-email').value.trim();
				if (!email) { showErr('Email is required'); return; }
				const amountRaw = parseFloat(getEl<HTMLInputElement>('inv-med-amount').value || '0');
				reqBody.dialtone_slug        = getEl<HTMLInputElement>('inv-slug').value.trim() || null;
				reqBody.ein                  = getEl<HTMLInputElement>('inv-med-ein').value.trim() || null;
				reqBody.email                = email;
				reqBody.full_name            = getEl<HTMLInputElement>('inv-med-name').value.trim() || null;
				reqBody.monthly_amount_cents = Math.round(amountRaw * 100);
			} else if (product === 'other') {
				const addressStreet = getEl<HTMLInputElement>('inv-other-address-street').value.trim();
				const addressCity = getEl<HTMLInputElement>('inv-other-address-city').value.trim();
				const addressState = getEl<HTMLInputElement>('inv-other-address-state').value.trim().toUpperCase();
				const addressZip = getEl<HTMLInputElement>('inv-other-address-zip').value.trim();
				const serviceProvided = getEl<HTMLTextAreaElement>('inv-service-provided').value.trim();
				const email = getEl<HTMLInputElement>('inv-other-email').value.trim();
				if (!email)                          { showErr('Email is required'); return; }
				if (!addressStreet)                  { showErr('Street is required'); return; }
				if (!addressCity)                    { showErr('City is required'); return; }
				if (!/^[A-Z]{2}$/.test(addressState)) { showErr('State must be a two-character code'); return; }
				if (!/^\d{5}(?:-\d{4})?$/.test(addressZip)) { showErr('Enter a valid ZIP code'); return; }
				if (serviceProvided.length < 25)     { showErr('Service description must be at least 25 characters'); return; }
				reqBody.email                = email;
				reqBody.full_name            = getEl<HTMLInputElement>('inv-other-name').value.trim() || null;
				reqBody.phone                = getEl<HTMLInputElement>('inv-other-phone').value.trim() || null;
				reqBody.address_street       = addressStreet;
				reqBody.address_city         = addressCity;
				reqBody.address_state        = addressState;
				reqBody.address_zip          = addressZip;
				reqBody.billing_address_same = getEl<HTMLInputElement>('inv-other-billing-addr').checked;
				reqBody.service_provided     = serviceProvided;
				reqBody.monthly_amount_cents = Math.round(parseFloat(getEl<HTMLInputElement>('inv-other-amount').value || '0') * 100);
			}

			try {
				const res = await fetch(`${API}/invite`, {
					method: 'POST', headers: authHeaders(),
					body: JSON.stringify(reqBody)
				});
				const data = await res.json() as { error?: string; ein_verified?: boolean; address_verified?: boolean; warning?: string };
				if (!res.ok) throw new Error(data.error ?? 'Failed');

				let badges = '';
				if (data.ein_verified != null) badges += data.ein_verified
					? ' <span class="badge badge-success" style="margin-left:6px;"><i class="fa-solid fa-shield-check"></i> EIN Verified</span>'
					: ' <span class="badge badge-warning" style="margin-left:6px;">EIN Unverified</span>';
				if (data.address_verified != null) badges += data.address_verified
					? ' <span class="badge badge-success" style="margin-left:6px;"><i class="fa-solid fa-location-check"></i> Address Verified</span>'
					: ' <span class="badge badge-warning" style="margin-left:6px;">Address Not Verified</span>';

				getEl('invite-success').innerHTML =
					`<i class="fa-solid fa-circle-check"></i> Customer created${product !== 'other' ? ' and invite sent' : ''}!${badges}` +
					(data.warning ? `<br><small style="opacity:0.75;">${escHtml(data.warning)}</small>` : '');
				getEl('invite-form').classList.add('hidden');
				getEl('invite-success').classList.remove('hidden');
				setTimeout(() => { closeModal(); loadCustomers(); }, 2500);
			} catch (err: unknown) {
				showErr(err instanceof Error ? err.message : 'Failed');
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
		<button class="tab-btn" data-tab="settings">
			<i class="fa-solid fa-gear"></i> Settings
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
								<th>Status</th><th>EIN</th><th>Address</th><th>Billing</th><th>Invited</th><th></th>
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
							<th>Business</th><th>Period</th><th>Subtotal</th><th>Tax</th><th>Total</th>
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

		<!-- Settings tab -->
		<div id="tab-settings" class="hidden">
			<div class="panel">
				<div class="panel-header"><span class="panel-title">Application Settings</span></div>
				<p id="settings-loading" class="text-muted" style="padding:24px;">Loading…</p>
				<div id="settings-content" class="panel-body hidden">
					<form id="settings-form">
						<div class="form-group">
							<label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
								<input type="checkbox" id="setting-tax-enabled" style="width:auto;margin:0;">
								<div>
									<div style="font-size:0.9375rem;color:var(--bright);margin-bottom:4px;">Enable Tax Assessment</div>
									<div style="font-size:0.8125rem;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0;">
										When enabled, Stripe Tax will be applied to setup fees and recurring charges. When disabled, all invoices will have $0.00 tax.
									</div>
								</div>
							</label>
						</div>
						<button type="submit" class="btn btn-secondary btn-sm" id="settings-save-btn" style="width:auto;margin-top:16px;">
							<i class="fa-solid fa-floppy-disk"></i> Save Settings
						</button>
						<div id="settings-status" class="hidden"></div>
					</form>
				</div>
			</div>
		</div>

	</div><!-- /admin-content -->
</div><!-- /page-admin -->

<!-- Re-verify Modal -->
<div id="reverify-modal" class="modal-backdrop hidden">
	<div class="modal" style="max-width:440px;">
		<h2><i class="fa-solid fa-rotate" style="color:var(--stream-blue);"></i> Re-verify Customer</h2>
		<form id="rv-form">
			<input type="hidden" id="rv-business-id">
			<div class="form-group">
				<label for="rv-address-street">Street</label>
				<input id="rv-address-street" type="text" placeholder="123 Main St">
			</div>
			<div class="form-row">
				<div class="form-group">
					<label for="rv-address-city">City</label>
					<input id="rv-address-city" type="text" placeholder="Seattle">
				</div>
				<div class="form-group">
					<label for="rv-address-state">State</label>
					<input id="rv-address-state" type="text" placeholder="WA" minlength="2" maxlength="2" pattern="[A-Za-z][A-Za-z]">
				</div>
			</div>
			<div class="form-group">
				<label for="rv-address-zip">ZIP Code</label>
				<input id="rv-address-zip" type="text" inputmode="numeric" placeholder="98104" maxlength="10" pattern="[0-9][0-9][0-9][0-9][0-9](-[0-9][0-9][0-9][0-9])?">
				<p class="form-note">Re-runs PostGrid verification and updates coordinates</p>
			</div>
			<div class="form-group">
				<label for="rv-ein">EIN</label>
				<input id="rv-ein" type="text" placeholder="XX-XXXXXXX" maxlength="10">
				<p class="form-note">Re-runs Cobalt EIN verification</p>
			</div>
			<div id="rv-error" class="status-msg error hidden"></div>
			<div class="modal-footer">
				<button type="button" id="rv-cancel" class="btn btn-ghost">Cancel</button>
				<button type="submit" id="rv-submit" class="btn btn-primary" style="width:auto;">
					<i class="fa-solid fa-rotate"></i>
					<span id="rv-submit-label">Re-verify</span>
				</button>
			</div>
		</form>
		<div id="rv-success" class="status-msg success hidden"></div>
	</div>
</div>

<!-- Edit Customer Modal -->
<div id="edit-modal" class="modal-backdrop hidden">
	<div class="modal" style="max-width:560px;">
		<h2><i class="fa-solid fa-pen-to-square" style="color:var(--stream-blue);"></i> Edit Customer</h2>
		<form id="edit-form">
			<input type="hidden" id="edit-account-id">
			<div class="form-group">
				<label for="edit-business-name">Business Name <span class="req">*</span></label>
				<input id="edit-business-name" type="text">
			</div>
			<div class="form-row">
				<div class="form-group">
					<label for="edit-full-name">Contact Name</label>
					<input id="edit-full-name" type="text">
				</div>
				<div class="form-group">
					<label for="edit-email">Email <span class="req">*</span></label>
					<input id="edit-email" type="email">
				</div>
			</div>
			<div class="form-row">
				<div class="form-group">
					<label for="edit-phone">Phone</label>
					<input id="edit-phone" type="tel">
				</div>
				<div class="form-group">
					<label for="edit-ein">EIN</label>
					<input id="edit-ein" type="text" placeholder="XX-XXXXXXX" maxlength="10">
				</div>
			</div>
			<div class="form-group">
				<label for="edit-product">Product</label>
				<input id="edit-product" type="text" disabled>
			</div>
			<div id="edit-tier-wrap" class="form-group hidden">
				<label for="edit-tier">Tier <span class="req">*</span></label>
				<select id="edit-tier">
					<option value="pilot">Pilot</option>
					<option value="food_truck">Food Truck</option>
					<option value="single_location">Single Location</option>
					<option value="multi_configuration">Multi-Configuration</option>
					<option value="multi_location">Multi-Location</option>
					<option value="enterprise">Enterprise</option>
				</select>
			</div>
			<div class="form-group">
				<label id="edit-amount-label" for="edit-amount">Charge USD</label>
				<input id="edit-amount" type="number" min="0" step="0.01">
			</div>
			<div class="form-check-row">
				<input id="edit-onboarded" type="checkbox">
				<label for="edit-onboarded" class="check-label">Onboarding complete</label>
			</div>
			<p id="edit-onboarding-note" class="form-note" style="margin-top:8px;"></p>
			<div id="edit-error" class="status-msg error hidden"></div>
			<div class="modal-footer">
				<button type="button" id="edit-cancel" class="btn btn-ghost">Cancel</button>
				<button type="submit" id="edit-submit" class="btn btn-primary" style="width:auto;">
					<i class="fa-solid fa-floppy-disk"></i> Save
				</button>
			</div>
		</form>
	</div>
</div>

<!-- New Customer Modal -->
<div id="invite-modal" class="modal-backdrop hidden">
	<div class="modal">
		<h2><i class="fa-solid fa-store" style="color:var(--stream-blue);"></i> New Customer</h2>
		<form id="invite-form">

			<!-- Always visible -->
			<div class="form-group">
				<label for="inv-biz-name">Business Name <span class="req">*</span></label>
				<input id="inv-biz-name" type="text" placeholder="The Golden Fork">
			</div>
			<div class="form-group">
				<label for="inv-product">Product <span class="req">*</span></label>
				<select id="inv-product">
					<option value="" selected>Select Product</option>
					<option value="dialtone_menu">DialTone.Menu</option>
					<option value="dialtone_med">DialTone.Med</option>
					<option value="other">Other</option>
				</select>
			</div>

			<!-- DialTone.Menu fields -->
			<div id="inv-dm-wrap" class="hidden">
				<div class="form-check-row" style="margin-bottom:16px;">
					<input type="checkbox" id="inv-food-truck">
					<label for="inv-food-truck" class="check-label">Food Truck</label>
				</div>
				<div class="form-group">
					<label for="inv-restaurant-name">Restaurant Name <span class="req">*</span></label>
					<input id="inv-restaurant-name" type="text" placeholder="The Golden Fork">
					<p class="form-note"><i class="fa-solid fa-circle-info"></i> Name listed on CP575 form</p>
				</div>
				<div class="form-group">
					<label for="inv-ein">EIN <span class="req">*</span></label>
					<input id="inv-ein" type="text" placeholder="XX-XXXXXXX" maxlength="10">
				</div>
				<div class="form-group">
					<label for="inv-address-street">Restaurant Street <span class="req">*</span></label>
					<input id="inv-address-street" type="text" placeholder="123 Main St">
				</div>
				<div class="form-row">
					<div class="form-group">
						<label for="inv-address-city">City <span class="req">*</span></label>
						<input id="inv-address-city" type="text" placeholder="Seattle">
					</div>
					<div class="form-group">
						<label for="inv-address-state">State <span class="req">*</span></label>
						<input id="inv-address-state" type="text" placeholder="WA" minlength="2" maxlength="2" pattern="[A-Za-z][A-Za-z]">
					</div>
				</div>
				<div class="form-group">
					<label for="inv-address-zip">ZIP Code <span class="req">*</span></label>
					<input id="inv-address-zip" type="text" inputmode="numeric" placeholder="98104" maxlength="10" pattern="[0-9][0-9][0-9][0-9][0-9](-[0-9][0-9][0-9][0-9])?">
					<p class="form-note">Physical restaurant location used for geocoding, delivery, and tax assessment.</p>
					<div class="form-check-row" style="margin-top:8px;">
						<input type="checkbox" id="inv-billing-addr">
						<label for="inv-billing-addr" class="check-label">Also use as billing address</label>
					</div>
				</div>
				<div class="form-row">
					<div class="form-group">
						<label for="inv-email">Email <span class="req">*</span></label>
						<input id="inv-email" type="email" placeholder="owner@restaurant.com">
					</div>
					<div class="form-group">
						<label for="inv-phone">Phone <span class="req">*</span></label>
						<input id="inv-phone" type="tel" placeholder="(555) 555-5555">
					</div>
				</div>
				<div class="form-group">
					<label for="inv-tier">Tier <span class="req">*</span></label>
					<select id="inv-tier">
						<option value="">Select tier…</option>
						<option value="pilot">Pilot</option>
						<option value="food_truck">Food Truck</option>
						<option value="single_location">Single Location</option>
						<option value="multi_configuration">Multi-Configuration</option>
						<option value="multi_location">Multi-Location</option>
						<option value="enterprise">Enterprise</option>
					</select>
				</div>
				<div id="inv-charge-wrap" class="charge-box hidden">
					<span class="charge-label">Initial Setup Charge (USD)</span>
					<span class="charge-amount">$100.00</span>
					<p class="form-note" style="margin-top:4px;">Due at customer creation. Applicable tax will be added.</p>
					<span class="charge-label" style="margin-top:12px;">Recurring Charge (USD)</span>
					<span id="inv-charge-label" class="charge-amount">—</span>
					<p id="inv-charge-asterisk" class="form-note hidden">* Final cost to be determined after the completion of configuration.</p>
					<p class="form-note" style="margin-top:4px;">The first recurring charge is due 30 days after verified onboarding signoff.</p>
				</div>
			</div>

			<!-- DialTone.Med fields -->
			<div id="inv-med-wrap" class="hidden">
				<div class="form-group">
					<label for="inv-slug">DialTone Slug (optional)</label>
					<input id="inv-slug" type="text" placeholder="the-golden-fork">
				</div>
				<div class="form-group">
					<label for="inv-med-ein">EIN (optional)</label>
					<input id="inv-med-ein" type="text" placeholder="XX-XXXXXXX" maxlength="10">
				</div>
				<div class="form-row">
					<div class="form-group">
						<label for="inv-med-email">Operator Email <span class="req">*</span></label>
						<input id="inv-med-email" type="email" placeholder="owner@clinic.com">
					</div>
					<div class="form-group">
						<label for="inv-med-name">Operator Name</label>
						<input id="inv-med-name" type="text" placeholder="Jane Smith">
					</div>
				</div>
				<div class="form-group">
					<label for="inv-med-amount">Monthly Charge USD</label>
					<input id="inv-med-amount" type="number" min="0" step="0.01" value="0.00">
				</div>
			</div>

			<!-- Other fields -->
			<div id="inv-other-wrap" class="hidden">
				<div class="form-row">
					<div class="form-group">
						<label for="inv-other-email">Email <span class="req">*</span></label>
						<input id="inv-other-email" type="email" placeholder="contact@company.com">
					</div>
					<div class="form-group">
						<label for="inv-other-name">Contact Name</label>
						<input id="inv-other-name" type="text" placeholder="Jane Smith">
					</div>
				</div>
				<div class="form-group">
					<label for="inv-other-phone">Phone Number</label>
					<input id="inv-other-phone" type="tel" placeholder="(555) 555-5555">
				</div>
				<div class="form-group">
					<label for="inv-other-address-street">Street <span class="req">*</span></label>
					<input id="inv-other-address-street" type="text" placeholder="123 Main St">
				</div>
				<div class="form-row">
					<div class="form-group">
						<label for="inv-other-address-city">City <span class="req">*</span></label>
						<input id="inv-other-address-city" type="text" placeholder="Seattle">
					</div>
					<div class="form-group">
						<label for="inv-other-address-state">State <span class="req">*</span></label>
						<input id="inv-other-address-state" type="text" placeholder="WA" minlength="2" maxlength="2" pattern="[A-Za-z][A-Za-z]">
					</div>
				</div>
				<div class="form-group">
					<label for="inv-other-address-zip">ZIP Code <span class="req">*</span></label>
					<input id="inv-other-address-zip" type="text" inputmode="numeric" placeholder="98104" maxlength="10" pattern="[0-9][0-9][0-9][0-9][0-9](-[0-9][0-9][0-9][0-9])?">
					<div class="form-check-row" style="margin-top:8px;">
						<input type="checkbox" id="inv-other-billing-addr">
						<label for="inv-other-billing-addr" class="check-label">Billing Address (use for payment processing)</label>
					</div>
				</div>
				<div class="form-group">
					<label for="inv-service-provided">Service Provided <span class="req">*</span></label>
					<textarea id="inv-service-provided" rows="3" maxlength="1000" placeholder="Describe the service provided (minimum 25 characters)…"></textarea>
				</div>
				<div class="form-group">
					<label for="inv-other-amount">Charge USD</label>
					<input id="inv-other-amount" type="number" min="0" step="0.01" value="0.00">
				</div>
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
		<div id="invite-success" class="status-msg success hidden"></div>
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

	:global(.btn-xs) { padding: 3px 8px; font-size: 0.7rem; }

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

	/* Form helpers */
	:global(.req) { color: var(--error); }
	:global(.form-note) { font-size: 0.75rem; color: var(--muted); margin-top: 5px; }
	:global(.form-check-row) {
		display: flex; align-items: center; gap: 8px;
	}
	:global(.form-check-row input[type="checkbox"]) {
		width: auto; flex-shrink: 0; accent-color: var(--stream-blue); cursor: pointer;
	}
	:global(.check-label) {
		font-size: 0.875rem; color: var(--bright);
		text-transform: none; letter-spacing: 0; font-weight: 500; margin: 0; cursor: pointer;
	}

	/* Monthly charge display */
	:global(.charge-box) {
		background: var(--slate); border: 1px solid var(--edge);
		border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;
	}
	:global(.charge-label) {
		display: block; font-size: 0.7rem; font-weight: 600;
		text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 4px;
	}
	:global(.charge-amount) {
		display: block; font-size: 1.5rem; font-weight: 700;
		letter-spacing: -0.02em; color: var(--bright);
	}
</style>
