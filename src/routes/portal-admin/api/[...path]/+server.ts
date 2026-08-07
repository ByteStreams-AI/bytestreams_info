import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { canAccessPortalAdmin } from '$lib/server/authorization';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type PortalAccountRow = {
	id: string;
	email: string;
	full_name: string | null;
	business_id: string | null;
	product: string | null;
	role: string | null;
	status: string | null;
	is_admin: boolean | null;
	invited_at: string | null;
	activated_at: string | null;
};

type BusinessRow = {
	id: string;
	name: string | null;
	business_type: string | null;
	monthly_amount_cents: number | null;
	ein: string | null;
	ein_verified: boolean | null;
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function guard(locals: App.Locals): void {
	if (!locals.user || !canAccessPortalAdmin(locals.user)) throw redirect(302, '/login');
}

function getPortalSupabaseConfig(): { url: string; key: string; source: 'portal' | 'app' } {
	const portalUrl = env.PORTAL_SUPABASE_URL?.trim();
	const portalKey = env.PORTAL_SUPABASE_SERVICE_ROLE_KEY?.trim();

	if ((portalUrl && !portalKey) || (!portalUrl && portalKey)) {
		throw new Error('Both PORTAL_SUPABASE_URL and PORTAL_SUPABASE_SERVICE_ROLE_KEY must be set together');
	}

	if (portalUrl && portalKey) {
		return { url: portalUrl, key: portalKey, source: 'portal' };
	}

	const appUrl = env.SUPABASE_URL?.trim();
	const appKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!appUrl || !appKey) {
		throw new Error(
			'Set either PORTAL_SUPABASE_URL + PORTAL_SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'
		);
	}

	return { url: appUrl, key: appKey, source: 'app' };
}

function getSupabase() {
	const { url, key } = getPortalSupabaseConfig();
	return createClient(url, key);
}

function getSupabaseHost(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return 'invalid-url';
	}
}

function normalizeText(value: unknown, maxLen: number): string {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, maxLen);
}

function currentBillingMonthStart(): string {
	const now = new Date();
	const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	return first.toISOString().slice(0, 10);
}

async function handleCustomers(): Promise<Response> {
	const supabase = getSupabase();

	const { data: rawAccounts, error: accountsError } = await supabase
		.from('portal_accounts')
		.select('id,email,full_name,business_id,product,role,status,is_admin,invited_at,activated_at')
		.order('created_at', { ascending: false });

	if (accountsError) return jsonResponse({ error: accountsError.message }, 500);

	const rawAccountRows = (rawAccounts ?? []) as PortalAccountRow[];
	const legacyNullIds = rawAccountRows
		.filter((a) => a.is_admin == null)
		.map((a) => a.id)
		.filter(Boolean);

	const accounts = rawAccountRows
		.map((a) => (a.is_admin == null ? { ...a, is_admin: false } : a))
		.filter((a) => a.is_admin === false);

	if (legacyNullIds.length > 0) {
		await Promise.all(
			legacyNullIds.map(async (id) => {
				const { error } = await supabase.from('portal_accounts').update({ is_admin: false }).eq('id', id);
				if (error) {
					console.error(`Failed to normalize portal_accounts.is_admin for ${id}:`, error.message);
				}
			})
		);
	}

	const businessIds = [...new Set(accounts.map((a) => a.business_id).filter((id): id is string => Boolean(id)))];
	const businessesById: Record<string, BusinessRow> = {};

	if (businessIds.length > 0) {
		const { data: businesses, error: businessError } = await supabase
			.from('businesses')
			.select('id,name,business_type,monthly_amount_cents,ein,ein_verified')
			.in('id', businessIds);

		if (businessError) return jsonResponse({ error: businessError.message }, 500);

		for (const business of (businesses ?? []) as BusinessRow[]) {
			businessesById[business.id] = business;
		}
	}

	return jsonResponse(
		accounts.map((account) => {
			const business = account.business_id ? businessesById[account.business_id] : undefined;
			return {
				id: account.id,
				email: account.email,
				full_name: account.full_name,
				business_id: account.business_id,
				business_name: business?.name ?? null,
				business_type: business?.business_type ?? null,
				product: account.product,
				status: account.status,
				ein: business?.ein ?? null,
				ein_verified: business?.ein_verified ?? false,
				monthly_amount_cents: business?.monthly_amount_cents ?? null,
				invited_at: account.invited_at,
				activated_at: account.activated_at
			};
		})
	);
}

async function handleBilling(): Promise<Response> {
	const supabase = getSupabase();
	const billingMonth = currentBillingMonthStart();

	const { data: rows, error } = await supabase
		.from('billing_schedule')
		.select('id,business_id,billing_month,amount_cents,due_date,status,paid_at')
		.eq('billing_month', billingMonth)
		.order('created_at', { ascending: false });

	if (error) return jsonResponse({ error: error.message }, 500);

	const billingRows = rows ?? [];
	const businessIds = [...new Set(billingRows.map((r) => r.business_id).filter((id): id is string => Boolean(id)))];
	const nameById: Record<string, string> = {};

	if (businessIds.length > 0) {
		const { data: businesses, error: businessError } = await supabase
			.from('businesses')
			.select('id,name')
			.in('id', businessIds);

		if (businessError) return jsonResponse({ error: businessError.message }, 500);

		for (const business of businesses ?? []) {
			if (business.id) nameById[business.id] = business.name ?? '';
		}
	}

	return jsonResponse(
		billingRows.map((row) => ({
			...row,
			business_name: row.business_id ? (nameById[row.business_id] ?? null) : null
		}))
	);
}

async function handleGenerateBilling(): Promise<Response> {
	const supabase = getSupabase();
	const now = new Date();
	const billingMonth = currentBillingMonthStart();
	const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15)).toISOString().slice(0, 10);

	const { data: businesses, error: businessError } = await supabase
		.from('businesses')
		.select('id,monthly_amount_cents');

	if (businessError) return jsonResponse({ error: businessError.message }, 500);

	let created = 0;
	for (const business of businesses ?? []) {
		if (!business.id) continue;
		const amount = typeof business.monthly_amount_cents === 'number' ? business.monthly_amount_cents : 0;
		const { error } = await supabase
			.from('billing_schedule')
			.upsert(
				{
					business_id: business.id,
					billing_month: billingMonth,
					due_date: dueDate,
					amount_cents: amount,
					status: 'pending',
					product: 'dialtone'
				},
				{ onConflict: 'business_id,billing_month,product' }
			);

		if (!error) {
			created += 1;
		} else {
			console.error(`Billing generation failed for business ${business.id}:`, error.message);
		}
	}

	return jsonResponse({ ok: true, created });
}

async function sendInviteEmail(email: string): Promise<boolean> {
	if (!env.RESEND_API_KEY) return false;
	const baseUrl = typeof publicEnv.PUBLIC_BASE_URL === 'string' && publicEnv.PUBLIC_BASE_URL.trim()
		? publicEnv.PUBLIC_BASE_URL.trim()
		: 'https://bytestreams.info';
	const portalUrl = `${baseUrl}/portal.html`;

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${env.RESEND_API_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			from: 'ByteStreams <contact@send.bytestreams.ai>',
			to: [email],
			subject: 'Your DialTone Portal invite',
			text: `Sign in to your DialTone customer portal: ${portalUrl}\n\nUse this email address — no password required.`
		})
	});

	return response.ok;
}

async function ensureSupabaseAuthUser(email: string): Promise<string | null> {
	const { url: supabaseUrl, key: serviceKey } = getPortalSupabaseConfig();

	const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
		method: 'POST',
		headers: {
			apikey: serviceKey,
			authorization: `Bearer ${serviceKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ email, email_confirm: true })
	});

	const createBody = await createRes.json() as { msg?: string; id?: string; user?: { id?: string } };
	if (
		!createRes.ok &&
		createBody?.msg !== 'A user with this email address has already been registered'
	) {
		throw new Error(`Auth user creation failed: ${createBody?.msg ?? createRes.status}`);
	}

	const authUserId = createBody?.id ?? createBody?.user?.id ?? null;
	if (authUserId) return authUserId;

	const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=1`, {
		headers: {
			apikey: serviceKey,
			authorization: `Bearer ${serviceKey}`
		}
	});

	if (!listRes.ok) return null;
	const listBody = await listRes.json() as { users?: Array<{ id?: string }> };
	return listBody?.users?.[0]?.id ?? null;
}

async function handleInvite(request: Request): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const businessName = normalizeText(body.business_name, 200);
	const businessType = normalizeText(body.business_type, 110) || 'restaurant';
	const product = normalizeText(body.product, 50) || 'dialtone_menu';
	const einDigits = normalizeText(body.ein, 20).replace(/\D/g, '').slice(0, 9);
	const email = normalizeText(body.email, 254);
	const fullName = normalizeText(body.full_name, 200) || null;
	const amountCents = Number.isInteger(body.monthly_amount_cents) ? body.monthly_amount_cents : 9900;

	if (!businessName || !email) {
		return jsonResponse({ error: 'business_name and email are required' }, 400);
	}

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return jsonResponse({ error: 'Invalid email' }, 400);
	}

	const supabase = getSupabase();

	let authUserId: string | null = null;
	try {
		authUserId = await ensureSupabaseAuthUser(email);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create auth user';
		return jsonResponse({ error: message }, 502);
	}

	const { data: business, error: businessError } = await supabase
		.from('businesses')
		.insert({
			name: businessName,
			business_type: businessType,
			monthly_amount_cents: amountCents,
			ein: einDigits || null,
			ein_verified: false
		})
		.select('id')
		.single();

	if (businessError || !business?.id) {
		return jsonResponse({ error: businessError?.message ?? 'Failed to create business' }, 500);
	}

	const { data: account, error: accountError } = await supabase
		.from('portal_accounts')
		.insert({
			email,
			full_name: fullName,
			auth_user_id: authUserId,
			business_id: business.id,
			product,
			role: 'owner',
			status: 'setup_pending',
			is_admin: false,
			invited_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (accountError || !account?.id) {
		return jsonResponse({ error: accountError?.message ?? 'Failed to create portal account' }, 500);
	}

	if (!env.RESEND_API_KEY) {
		return jsonResponse({
			ok: true,
			ein_verified: false,
			warning: 'Customer created but invite email not sent (RESEND_API_KEY not set).'
		});
	}

	const sent = await sendInviteEmail(email);
	if (!sent) {
		return jsonResponse({
			ok: true,
			ein_verified: false,
			warning: 'Customer created but invite email failed to send.'
		});
	}

	return jsonResponse({ ok: true, ein_verified: false });
}

async function handleResendInvite(request: Request): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const email = normalizeText(body.email, 254);
	const accountId = normalizeText(body.account_id, 200);
	if (!email) return jsonResponse({ error: 'email is required' }, 400);

	if (!env.RESEND_API_KEY) return jsonResponse({ error: 'Email unavailable' }, 503);

	const sent = await sendInviteEmail(email);
	if (!sent) return jsonResponse({ error: 'Failed to send invite' }, 502);

	if (accountId) {
		const supabase = getSupabase();
		await supabase
			.from('portal_accounts')
			.update({ invited_at: new Date().toISOString() })
			.eq('id', accountId);
	}

	return jsonResponse({ ok: true });
}

async function handleMessage(request: Request): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const messageBody = normalizeText(body.body, 1000);
	const businessId = normalizeText(body.business_id, 200) || null;
	const isActive = Boolean(body.is_active ?? true);

	if (!messageBody) return jsonResponse({ error: 'Message body is required' }, 400);

	const supabase = getSupabase();
	const { error } = await supabase.from('portal_messages').insert({
		business_id: businessId,
		body: messageBody,
		is_active: isActive
	});

	if (error) return jsonResponse({ error: error.message }, 500);
	return jsonResponse({ ok: true });
}

async function handleConfigDebug(): Promise<Response> {
	const config = getPortalSupabaseConfig();
	return jsonResponse({
		ok: true,
		source: config.source,
		supabase_host: getSupabaseHost(config.url),
		has_portal_override: config.source === 'portal'
	});
}

export const GET: RequestHandler = async ({ params, locals }) => {
	guard(locals);

	if (params.path === 'customers') return handleCustomers();
	if (params.path === 'billing') return handleBilling();
	if (params.path === 'config-debug') return handleConfigDebug();

	return jsonResponse({ error: 'Not found' }, 404);
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	guard(locals);

	if (params.path === 'generate-billing') return handleGenerateBilling();
	if (params.path === 'invite') return handleInvite(request);
	if (params.path === 'resend-invite') return handleResendInvite(request);
	if (params.path === 'message') return handleMessage(request);

	return jsonResponse({ error: 'Not found' }, 404);
};
