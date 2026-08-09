import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { canAccessPortalAdmin } from '$lib/server/authorization';
import { assessStripeTax, type StripeTaxAddress } from '$lib/server/stripe-tax';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type PortalAccountRow = {
	id: string;
	email: string;
	full_name: string | null;
	auth_user_id: string | null;
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
	setup_fee_cents: number | null;
	ein: string | null;
	ein_verified: boolean | null;
	address_verified: boolean | null;
	onboarded: boolean | null;
	onboarded_at: string | null;
	recurring_billing_starts_at: string | null;
	dialtone_location_id: string | null;
	address: string | null;
	address_city: string | null;
	address_state: string | null;
	address_postal_code: string | null;
	phone: string | null;
};

type LocationRow = {
	id: string;
	restaurant_id: string | null;
	address_line1: string | null;
	city: string | null;
	state: string | null;
	postal_code: string | null;
	country: string | null;
	latitude: number | null;
	longitude: number | null;
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

function parseStructuredAddress(body: Record<string, unknown>): StripeTaxAddress | null {
	const line1 = normalizeText(body.address_street, 200);
	const city = normalizeText(body.address_city, 100);
	const state = normalizeText(body.address_state, 2).toUpperCase();
	const postalCode = normalizeText(body.address_zip, 10);
	if (!line1 || !city || !state || !postalCode) return null;
	if (!/^[A-Z]{2}$/.test(state)) return null;
	if (!/^\d{5}(?:-\d{4})?$/.test(postalCode)) return null;
	return { line1, city, state, postalCode, country: 'US' };
}

function currentBillingMonthStart(): string {
	const now = new Date();
	const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	return first.toISOString().slice(0, 10);
}

async function getStripeTaxConfig(): Promise<{ secretKey: string; taxCode: string; enabled: boolean }> {
	// Environment variable takes precedence as an override
	const envEnabled = env.ENABLE_TAX_ASSESSMENT?.trim().toLowerCase();
	let enabled = false;

	if (envEnabled === 'true' || envEnabled === 'false') {
		enabled = envEnabled === 'true';
	} else {
		// Check database setting
		const supabase = getSupabase();
		const { data } = await supabase
			.from('app_settings')
			.select('value')
			.eq('key', 'enable_tax_assessment')
			.maybeSingle();
		enabled = data?.value === 'true';
	}

	return {
		secretKey: env.STRIPE_SECRET_KEY?.trim() ?? '',
		taxCode: env.STRIPE_TAX_CODE?.trim() || 'txcd_10103001',
		enabled
	};
}

async function handleCustomers(): Promise<Response> {
	const supabase = getSupabase();

	const { data: rawAccounts, error: accountsError } = await supabase
		.from('portal_accounts')
		.select('id,email,full_name,auth_user_id,business_id,product,role,status,is_admin,invited_at,activated_at')
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
			.select('id,name,business_type,monthly_amount_cents,setup_fee_cents,ein,ein_verified,address_verified,onboarded,onboarded_at,recurring_billing_starts_at,dialtone_location_id,address,address_city,address_state,address_postal_code,phone')
			.in('id', businessIds);

		if (businessError) return jsonResponse({ error: businessError.message }, 500);

		for (const business of (businesses ?? []) as BusinessRow[]) {
			businessesById[business.id] = business;
		}
	}

	// Fetch location address + geocode data for businesses that have a dialtone_location_id
	const locationIds = [...new Set(
		Object.values(businessesById)
			.map((b) => b.dialtone_location_id)
			.filter((id): id is string => Boolean(id))
	)];
	const locationsById: Record<string, LocationRow> = {};

	if (locationIds.length > 0) {
		const { data: locations } = await supabase
			.from('locations')
			.select('id,restaurant_id,address_line1,city,state,postal_code,country,latitude,longitude')
			.in('id', locationIds);

		for (const loc of (locations ?? []) as LocationRow[]) {
			locationsById[loc.id] = loc;
		}
	}
	const restaurantIds = [...new Set(Object.values(locationsById).map((location) => location.restaurant_id).filter((id): id is string => Boolean(id)))];
	const restaurantsById: Record<string, { tier: string | null; phone_number: string | null }> = {};
	if (restaurantIds.length > 0) {
		const { data: restaurants } = await supabase
			.from('restaurants')
			.select('id,tier,phone_number')
			.in('id', restaurantIds);
		for (const restaurant of restaurants ?? []) {
			if (restaurant.id) restaurantsById[restaurant.id] = restaurant;
		}
	}

	return jsonResponse(
		accounts.map((account) => {
			const business = account.business_id ? businessesById[account.business_id] : undefined;
			const location = business?.dialtone_location_id ? locationsById[business.dialtone_location_id] : undefined;
			const restaurant = location?.restaurant_id ? restaurantsById[location.restaurant_id] : undefined;
			const address = location
				? [location.address_line1, location.city, location.state, location.postal_code].filter(Boolean).join(', ')
				: [business?.address, business?.address_city, business?.address_state, business?.address_postal_code].filter(Boolean).join(', ') || null;
			return {
				id: account.id,
				email: account.email,
				full_name: account.full_name,
				business_id: account.business_id,
				business_name: business?.name ?? null,
				business_type: business?.business_type ?? null,
				product: account.product,
				tier: restaurant?.tier ?? null,
				status: account.status,
				ein: business?.ein ?? null,
				ein_verified: business?.ein_verified ?? false,
				address,
				address_street: location?.address_line1 ?? business?.address ?? null,
				address_city: location?.city ?? business?.address_city ?? null,
				address_state: location?.state ?? business?.address_state ?? null,
				address_zip: location?.postal_code ?? business?.address_postal_code ?? null,
				address_verified: business?.address_verified ?? false,
				phone: restaurant?.phone_number ?? business?.phone ?? null,
				monthly_amount_cents: business?.monthly_amount_cents ?? null,
				setup_fee_cents: business?.setup_fee_cents ?? 10000,
				onboarded: business?.onboarded ?? false,
				onboarded_at: business?.onboarded_at ?? null,
				recurring_billing_starts_at: business?.recurring_billing_starts_at ?? null,
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
		.select('id,business_id,billing_month,subtotal_cents,tax_cents,amount_cents,stripe_tax_calculation_id,stripe_tax_breakdown,tax_assessed_at,due_date,status,paid_at')
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
	const stripeTax = await getStripeTaxConfig();
	if (stripeTax.enabled && !stripeTax.secretKey) {
		return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured' }, 503);
	}

	const { data: businesses, error: businessError } = await supabase
		.from('businesses')
		.select('id,monthly_amount_cents,next_billing_at,dialtone_location_id')
		.eq('business_type', 'restaurant')
		.eq('onboarded', true)
		.lte('next_billing_at', now.toISOString());

	if (businessError) return jsonResponse({ error: businessError.message }, 500);

	const locationIds = (businesses ?? [])
		.map((business) => business.dialtone_location_id)
		.filter((id): id is string => Boolean(id));
	const locationsById: Record<string, StripeTaxAddress> = {};
	if (locationIds.length > 0) {
		const { data: locations, error: locationsError } = await supabase
			.from('locations')
			.select('id,address_line1,city,state,postal_code,country')
			.in('id', locationIds);
		if (locationsError) return jsonResponse({ error: locationsError.message }, 500);
		for (const location of locations ?? []) {
			if (!location.id) continue;
			locationsById[location.id] = {
				line1: location.address_line1 ?? '',
				city: location.city ?? '',
				state: location.state ?? '',
				postalCode: location.postal_code ?? '',
				country: location.country ?? 'US'
			};
		}
	}

	let created = 0;
	let failed = 0;
	for (const business of businesses ?? []) {
		if (!business.id || !business.next_billing_at) continue;
		const amount = typeof business.monthly_amount_cents === 'number' ? business.monthly_amount_cents : 0;
		const dueAt = new Date(business.next_billing_at);
		const billingMonth = new Date(Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth(), 1)).toISOString().slice(0, 10);
		const dueDate = dueAt.toISOString().slice(0, 10);
		let taxAssessment = {
			calculationId: null as string | null,
			subtotalCents: amount,
			taxCents: 0,
			totalCents: amount,
			taxBreakdown: [] as unknown[]
		};
		if (amount > 0 && stripeTax.enabled) {
			const location = business.dialtone_location_id ? locationsById[business.dialtone_location_id] : undefined;
			if (!location) {
				failed += 1;
				console.error(`Recurring tax assessment failed for business ${business.id}: verified location not found`);
				continue;
			}
			try {
				taxAssessment = await assessStripeTax({
					...stripeTax,
					amountCents: amount,
					address: location,
					reference: `recurring-${business.id}-${dueDate}`
				});
			} catch (error) {
				failed += 1;
				console.error(`Recurring tax assessment failed for business ${business.id}:`, error instanceof Error ? error.message : error);
				continue;
			}
		}
		const { error } = await supabase
			.from('billing_schedule')
			.upsert(
				{
					business_id: business.id,
					billing_month: billingMonth,
					due_date: dueDate,
					subtotal_cents: taxAssessment.subtotalCents,
					tax_cents: taxAssessment.taxCents,
					amount_cents: taxAssessment.totalCents,
					stripe_tax_calculation_id: taxAssessment.calculationId,
					stripe_tax_breakdown: taxAssessment.taxBreakdown,
					tax_assessed_at: amount > 0 ? now.toISOString() : null,
					status: 'pending',
					product: 'dialtone_menu_recurring'
				},
				{ onConflict: 'business_id,billing_month,product' }
			);

		if (!error) {
			created += 1;
			const nextBillingAt = new Date(dueAt);
			nextBillingAt.setUTCDate(nextBillingAt.getUTCDate() + 30);
			await supabase
				.from('businesses')
				.update({ next_billing_at: nextBillingAt.toISOString() })
				.eq('id', business.id);
		} else {
			failed += 1;
			console.error(`Billing generation failed for business ${business.id}:`, error.message);
		}
	}

	return jsonResponse({ ok: failed === 0, created, failed }, failed > 0 ? 207 : 200);
}

async function sendInviteEmail(email: string): Promise<boolean> {
	if (!env.RESEND_API_KEY) return false;
	const baseUrl = typeof publicEnv.PUBLIC_BASE_URL === 'string' && publicEnv.PUBLIC_BASE_URL.trim()
		? publicEnv.PUBLIC_BASE_URL.trim()
		: 'https://bytestreams.info';
	const portalUrl = `${baseUrl}/portal.html`;
	const logoUrl = `${baseUrl}/assets/blue-side-logo.png`;

	const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>DialTone Portal Invite</title>
	<!--[if mso]>
	<style type="text/css">
		body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
	</style>
	<![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;">
	<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
		<tr>
			<td style="padding: 40px 20px;">
				<!-- Main Container -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
					<!-- Header with Logo -->
					<tr>
						<td style="background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); padding: 32px 40px; border-radius: 12px 12px 0 0; text-align: center;">
							<img src="${logoUrl}" alt="ByteStreams" width="180" style="display: block; margin: 0 auto; max-width: 100%; height: auto;">
						</td>
					</tr>

					<!-- Body Content -->
					<tr>
						<td style="padding: 40px 40px 32px 40px;">
							<h1 style="margin: 0 0 24px 0; color: #0d1117; font-size: 24px; font-weight: 600; line-height: 1.3;">
								Welcome to DialTone Portal
							</h1>
							<p style="margin: 0 0 24px 0; color: #21262d; font-size: 16px; line-height: 1.6;">
								You've been invited to access your DialTone customer portal. Click the button below to sign in:
							</p>

							<!-- CTA Button -->
							<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 32px 0;">
								<tr>
									<td style="border-radius: 8px; background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%);">
										<a href="${portalUrl}" target="_blank" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
											Sign In to Portal
										</a>
									</td>
								</tr>
							</table>

							<p style="margin: 24px 0 0 0; color: #484f58; font-size: 14px; line-height: 1.6;">
								Or copy and paste this link into your browser:<br>
								<a href="${portalUrl}" style="color: #2563eb; text-decoration: none; word-break: break-all;">${portalUrl}</a>
							</p>
						</td>
					</tr>

					<!-- Info Box -->
					<tr>
						<td style="padding: 0 40px 40px 40px;">
							<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f9ff; border-radius: 8px; border-left: 4px solid #2563eb;">
								<tr>
									<td style="padding: 20px;">
										<p style="margin: 0; color: #1d4ed8; font-size: 14px; line-height: 1.6;">
											<strong style="display: block; margin-bottom: 8px;">🔒 Passwordless Login</strong>
											Use your email address (<strong>${email}</strong>) to sign in. No password required.
										</p>
									</td>
								</tr>
							</table>
						</td>
					</tr>

					<!-- Footer -->
					<tr>
						<td style="padding: 24px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
							<p style="margin: 0; color: #8b949e; font-size: 12px; line-height: 1.5; text-align: center;">
								© ${new Date().getFullYear()} ByteStreams. All rights reserved.<br>
								Questions? Contact us at <a href="mailto:support@bytestreams.ai" style="color: #2563eb; text-decoration: none;">support@bytestreams.ai</a>
							</p>
						</td>
					</tr>
				</table>

				<!-- Footer Text -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 24px auto 0;">
					<tr>
						<td style="text-align: center;">
							<p style="margin: 0; color: #8b949e; font-size: 12px; line-height: 1.5;">
								If you didn't request this invitation, you can safely ignore this email.
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>
	`.trim();

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
			html: htmlBody,
			text: `Welcome to DialTone Portal\n\nSign in to your DialTone customer portal: ${portalUrl}\n\nUse this email address (${email}) — no password required.\n\nIf you didn't request this invitation, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ByteStreams. All rights reserved.`
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

async function verifyAddressWithPostGrid(address: StripeTaxAddress): Promise<{
	verified: boolean;
	normalized?: string;
	line1?: string | null;
	city?: string | null;
	state?: string | null;
	postalCode?: string | null;
	lat?: number | null;
	lng?: number | null;
	geocodeAccuracy?: number | null;
	geocodeAccuracyType?: string | null;
}> {
	const apiKey = env.POSTGRID_API_KEY?.trim();
	if (!apiKey) return { verified: false };
	try {
		const res = await fetch('https://api.postgrid.com/v1/addver/verifications?geocode=true', {
			method: 'POST',
			headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
			body: JSON.stringify({ address: {
				line1: address.line1,
				city: address.city,
				provinceOrState: address.state,
				postalOrZip: address.postalCode,
				country: address.country
			} })
		});
		if (!res.ok) {
			const errorText = await res.text().catch(() => 'Unknown error');
			console.error(`[PostGrid] Address verification failed: ${res.status} ${res.statusText}`, errorText);
			return { verified: false };
		}
		const body = await res.json() as {
			status?: string;
			data?: {
				status?: string;
				line1?: string; city?: string; provinceOrState?: string; postalOrZip?: string;
				geocodeResult?: {
					location?: { lat?: number; lng?: number };
					accuracy?: number;
					accuracyType?: string;
				};
			};
		};
		const d = body.data;
		const verified = d?.status === 'verified' || d?.status === 'corrected';
		const geo = d?.geocodeResult;
		console.log(`[PostGrid] Address verification result: ${verified ? 'verified' : 'unverified'} (status: ${d?.status})`);
		return {
			verified,
			normalized: d ? [d.line1, d.city, d.provinceOrState, d.postalOrZip].filter(Boolean).join(', ') : undefined,
			line1: d?.line1 ?? null,
			city: d?.city ?? null,
			state: d?.provinceOrState ?? null,
			postalCode: d?.postalOrZip ?? null,
			lat: geo?.location?.lat ?? null,
			lng: geo?.location?.lng ?? null,
			geocodeAccuracy: geo?.accuracy ?? null,
			geocodeAccuracyType: geo?.accuracyType ?? null,
		};
	} catch (error) {
		console.error('[PostGrid] Address verification exception:', error);
		return { verified: false };
	}
}

async function verifyEINWithCobalt(params: {
	ein: string;
	businessName: string;
}): Promise<boolean> {
	const apiKey = env.COBALT_API_KEY?.trim();
	if (!apiKey) return false;

	const { ein, businessName } = params;
	if (!ein || !businessName) return false;

	try {
		// Cobalt Intelligence TIN verification via Secretary of State business lookup
		// Uses standard apigateway endpoint with x-api-key authentication
		// Does NOT send state — restaurant location may differ from business registration state
		// Strip dashes from EIN (Cobalt expects format like 421992050, not 42-1992050)
		const searchParams = new URLSearchParams({
			businessName,
			tin: ein.replace(/-/g, '')
		});

		const res = await fetch(
			`https://apigateway.cobaltintelligence.com/tinVerification?${searchParams.toString()}`,
			{
				headers: {
					'x-api-key': apiKey,
					'accept': 'application/json'
				}
			}
		);

		if (!res.ok) {
			const errorText = await res.text().catch(() => 'Unknown error');
			console.error(`[Cobalt] EIN verification failed: ${res.status} ${res.statusText}`, errorText);
			return false;
		}

		const data = await res.json() as {
			verified?: boolean;
			status?: string;
			tinMatch?: boolean;
			tinVerified?: boolean;
			match?: boolean;
		};

		// Check multiple possible verification field patterns
		// Cobalt returns status: 'TIN Matched' or 'Did Not Match'
		const verified = (
			data.verified === true ||
			data.tinVerified === true ||
			data.tinMatch === true ||
			data.match === true ||
			data.status === 'verified' ||
			data.status === 'matched' ||
			data.status === 'TIN Matched'  // Cobalt's actual success status
		);
		console.log(`[Cobalt] EIN verification result: ${verified ? 'verified' : 'unverified'}`, data);
		return verified;
	} catch (error) {
		console.error('[Cobalt] EIN verification exception:', error);
		return false;
	}
}

async function handleInvite(request: Request): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const businessName = normalizeText(body.business_name, 200);
	const product = normalizeText(body.product, 50);

	if (!businessName) return jsonResponse({ error: 'business_name is required' }, 400);
	if (!product) return jsonResponse({ error: 'product is required' }, 400);

	const supabase = getSupabase();

	// Reject if email already has a portal account
	const emailInput = normalizeText(body.email, 254);
	if (emailInput) {
		const { data: existing } = await supabase
			.from('portal_accounts')
			.select('id')
			.eq('email', emailInput)
			.maybeSingle();
		if (existing) return jsonResponse({ error: `A portal account already exists for ${emailInput}` }, 409);
	}

	// ── DialTone.Menu ──────────────────────────────────────────────────────────
	if (product === 'dialtone_menu') {
		const restaurantName = normalizeText(body.restaurant_name, 200);
		const einRaw = normalizeText(body.ein, 20);
		const einDigits = einRaw.replace(/\D/g, '').slice(0, 9);
		const address = parseStructuredAddress(body);
		const email = normalizeText(body.email, 254);
		const phone = normalizeText(body.phone, 30);
		const tier = normalizeText(body.tier, 50);
		const isFoodTruck = Boolean(body.is_food_truck);
		const billingAddressSame = Boolean(body.billing_address_same);
		const amountCents = Number.isInteger(body.monthly_amount_cents) ? (body.monthly_amount_cents as number) : 0;

		if (!restaurantName) return jsonResponse({ error: 'restaurant_name is required' }, 400);
		if (!einDigits)      return jsonResponse({ error: 'ein is required' }, 400);
		if (!address)        return jsonResponse({ error: 'Street, city, two-character state, and valid ZIP code are required' }, 400);
		if (!email)          return jsonResponse({ error: 'email is required' }, 400);
		if (!phone)          return jsonResponse({ error: 'phone is required' }, 400);
		if (!tier)           return jsonResponse({ error: 'tier is required' }, 400);

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return jsonResponse({ error: 'Invalid email' }, 400);
		}

		// Address validation + geocoding via PostGrid
		const addrResult = await verifyAddressWithPostGrid(address);

		// EIN verification via Cobalt
		const einVerified = await verifyEINWithCobalt({
			ein: einDigits,
			businessName: businessName  // Use legal business name, not restaurant name
		});

		const stripeTax = await getStripeTaxConfig();
		let setupTax;
		if (stripeTax.enabled) {
			try {
				setupTax = await assessStripeTax({
					...stripeTax,
					amountCents: 10000,
					address: {
						line1: addrResult.line1 ?? address.line1,
						city: addrResult.city ?? address.city,
						state: addrResult.state ?? address.state,
						postalCode: addrResult.postalCode ?? address.postalCode,
						country: 'US'
					},
					reference: `setup-${email}`
				});
			} catch (error) {
				return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe Tax assessment failed' }, 502);
			}
		} else {
			setupTax = {
				calculationId: '',
				subtotalCents: 10000,
				taxCents: 0,
				totalCents: 10000,
				taxBreakdown: []
			};
		}

		let authUserId: string | null = null;
		try {
			authUserId = await ensureSupabaseAuthUser(email);
		} catch (err) {
			return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create auth user' }, 502);
		}

		// Step 1: create the restaurant record
		const baseSlug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
		const slug = `${baseSlug}-${Date.now().toString(36)}`;
		const { data: restaurant, error: restaurantError } = await supabase
			.from('restaurants')
			.insert({
				name: restaurantName,
				display_name: businessName,
				slug,
				phone_number: phone,
				tier,
				is_active: false,
			})
			.select('id')
			.single();

		if (restaurantError || !restaurant?.id) {
			return jsonResponse({ error: restaurantError?.message ?? 'Failed to create restaurant' }, 500);
		}

		// Step 2: create the location record with PostGrid geocoordinates
		const { data: location, error: locationError } = await supabase
			.from('locations')
			.insert({
				restaurant_id: restaurant.id,
				name: restaurantName,
				address_line1: addrResult.line1 ?? address.line1,
				city: addrResult.city ?? address.city,
				state: addrResult.state ?? address.state,
				postal_code: addrResult.postalCode ?? address.postalCode,
				country: 'US',
				latitude: addrResult.lat ?? null,
				longitude: addrResult.lng ?? null,
				is_primary: true,
				is_active: false,
				delivery_enabled: false,
			})
			.select('id')
			.single();

		if (locationError || !location?.id) {
			return jsonResponse({ error: locationError?.message ?? 'Failed to create location' }, 500);
		}

		// Step 3: create the business record linked to the location
		const { data: business, error: businessError } = await supabase
			.from('businesses')
			.insert({
				name: businessName,
				business_type: 'restaurant',
				dialtone_location_id: location.id,
				monthly_amount_cents: amountCents,
				ein: einDigits,
				ein_verified: einVerified,
				ein_verified_at: einVerified ? new Date().toISOString() : null,
				address_verified: addrResult.verified,
				is_food_truck: isFoodTruck,
				billing_address_same: billingAddressSame,
				setup_fee_cents: 10000,
				onboarded: false,
			})
			.select('id')
			.single();

		if (businessError || !business?.id) {
			return jsonResponse({ error: businessError?.message ?? 'Failed to create business' }, 500);
		}

		const setupDueDate = new Date().toISOString().slice(0, 10);
		const { error: setupBillingError } = await supabase
			.from('billing_schedule')
			.upsert({
				business_id: business.id,
				billing_month: currentBillingMonthStart(),
				due_date: setupDueDate,
				subtotal_cents: setupTax.subtotalCents,
				tax_cents: setupTax.taxCents,
				amount_cents: setupTax.totalCents,
				stripe_tax_calculation_id: setupTax.calculationId,
				stripe_tax_breakdown: setupTax.taxBreakdown,
				tax_assessed_at: new Date().toISOString(),
				status: 'pending',
				product: 'dialtone_menu_setup'
			}, { onConflict: 'business_id,billing_month,product' });

		if (setupBillingError) {
			return jsonResponse({ error: `Customer created but setup billing failed: ${setupBillingError.message}` }, 500);
		}

		// Step 4: create the portal account
		const { error: accountError } = await supabase
			.from('portal_accounts')
			.insert({
				email,
				auth_user_id: authUserId,
				business_id: business.id,
				product,
				role: 'owner',
				status: 'setup_pending',
				is_admin: false,
				invited_at: new Date().toISOString()
			});

		if (accountError) {
			return jsonResponse({ error: accountError.message ?? 'Failed to create portal account' }, 500);
		}

		const warnings: string[] = [];
		if (!addrResult.verified) warnings.push(env.POSTGRID_API_KEY
			? 'Address was saved but could not be verified.'
			: 'Address verification skipped (POSTGRID_API_KEY not set).');
		if (!einVerified) warnings.push(env.COBALT_API_KEY
			? 'EIN was saved but could not be verified.'
			: 'EIN verification skipped (COBALT_API_KEY not set).');

		if (!env.RESEND_API_KEY) {
			return jsonResponse({
				ok: true, ein_verified: einVerified, address_verified: addrResult.verified,
				warning: ['Customer created but invite email not sent (RESEND_API_KEY not set).', ...warnings].join(' ')
			});
		}

		const sent = await sendInviteEmail(email);
		return jsonResponse({
			ok: true, ein_verified: einVerified, address_verified: addrResult.verified,
			warning: [sent ? null : 'Invite email failed to send.', ...warnings].filter(Boolean).join(' ') || undefined
		});
	}

	// ── DialTone.Med ───────────────────────────────────────────────────────────
	if (product === 'dialtone_med') {
		const email = normalizeText(body.email, 254);
		const fullName = normalizeText(body.full_name, 200) || null;
		const einDigits = normalizeText(body.ein, 20).replace(/\D/g, '').slice(0, 9);
		const amountCents = Number.isInteger(body.monthly_amount_cents) ? (body.monthly_amount_cents as number) : 0;

		if (!email) return jsonResponse({ error: 'email is required' }, 400);
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Invalid email' }, 400);

		let authUserId: string | null = null;
		try {
			authUserId = await ensureSupabaseAuthUser(email);
		} catch (err) {
			return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create auth user' }, 502);
		}

		const { data: business, error: businessError } = await supabase
			.from('businesses')
			.insert({
				name: businessName,
				business_type: 'clinic',
				monthly_amount_cents: amountCents,
				ein: einDigits || null,
				ein_verified: false
			})
			.select('id')
			.single();

		if (businessError || !business?.id) {
			return jsonResponse({ error: businessError?.message ?? 'Failed to create business' }, 500);
		}

		const { error: accountError } = await supabase
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
			});

		if (accountError) {
			return jsonResponse({ error: accountError.message ?? 'Failed to create portal account' }, 500);
		}

		if (!env.RESEND_API_KEY) {
			return jsonResponse({ ok: true, ein_verified: false, warning: 'Customer created but invite email not sent (RESEND_API_KEY not set).' });
		}
		const sent = await sendInviteEmail(email);
		return jsonResponse({ ok: true, ein_verified: false, warning: sent ? undefined : 'Invite email failed to send.' });
	}

	// ── Other ──────────────────────────────────────────────────────────────────
	if (product === 'other') {
		const email = normalizeText(body.email, 254);
		const fullName = normalizeText(body.full_name, 200) || null;
		const address = parseStructuredAddress(body);
		const serviceProvided = normalizeText(body.service_provided, 1000);
		const phone = normalizeText(body.phone, 30) || null;
		const billingAddressSame = Boolean(body.billing_address_same);
		const amountCents = Number.isInteger(body.monthly_amount_cents) ? (body.monthly_amount_cents as number) : 0;

		if (!email)                    return jsonResponse({ error: 'email is required' }, 400);
		if (!address)                  return jsonResponse({ error: 'Street, city, two-character state, and valid ZIP code are required' }, 400);
		if (serviceProvided.length < 25) return jsonResponse({ error: 'service_provided must be at least 25 characters' }, 400);
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Invalid email' }, 400);

		let authUserId: string | null = null;
		try {
			authUserId = await ensureSupabaseAuthUser(email);
		} catch (err) {
			return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to create auth user' }, 502);
		}

		const { data: business, error: businessError } = await supabase
			.from('businesses')
			.insert({
				name: businessName,
				business_type: 'other',
				monthly_amount_cents: amountCents,
				address: address.line1,
				address_city: address.city,
				address_state: address.state,
				address_postal_code: address.postalCode,
				phone,
				billing_address_same: billingAddressSame,
				service_provided: serviceProvided,
			})
			.select('id')
			.single();

		if (businessError || !business?.id) {
			return jsonResponse({ error: businessError?.message ?? 'Failed to create business' }, 500);
		}

		const { error: accountError } = await supabase
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
			});

		if (accountError) {
			return jsonResponse({ error: accountError.message ?? 'Failed to create portal account' }, 500);
		}

		if (!env.RESEND_API_KEY) {
			return jsonResponse({ ok: true, warning: 'Customer created but invite email not sent (RESEND_API_KEY not set).' });
		}
		const sent = await sendInviteEmail(email);
		return jsonResponse({ ok: true, warning: sent ? undefined : 'Invite email failed to send.' });
	}

	return jsonResponse({ error: `Unknown product: ${product}` }, 400);
}

async function handleOnboardingSignoff(request: Request, actorEmail: string): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const businessId = normalizeText(body.business_id, 200);
	if (!businessId) return jsonResponse({ error: 'business_id is required' }, 400);

	const supabase = getSupabase();
	const { data: business, error } = await supabase
		.from('businesses')
		.select('id,ein_verified,address_verified,onboarded')
		.eq('id', businessId)
		.single();

	if (error || !business) return jsonResponse({ error: error?.message ?? 'Business not found' }, 404);
	if (business.onboarded) return jsonResponse({ error: 'Customer is already onboarded' }, 409);
	if (!business.ein_verified || !business.address_verified) {
		return jsonResponse({ error: 'EIN and address must both be verified before onboarding signoff' }, 422);
	}

	const onboardedAt = new Date();
	const recurringStartsAt = new Date(onboardedAt);
	recurringStartsAt.setUTCDate(recurringStartsAt.getUTCDate() + 30);

	const { error: updateError } = await supabase
		.from('businesses')
		.update({
			onboarded: true,
			onboarded_at: onboardedAt.toISOString(),
			onboarded_by_email: actorEmail,
			recurring_billing_starts_at: recurringStartsAt.toISOString(),
			next_billing_at: recurringStartsAt.toISOString()
		})
		.eq('id', businessId);

	if (updateError) return jsonResponse({ error: updateError.message }, 500);
	return jsonResponse({ ok: true, onboarded_at: onboardedAt.toISOString(), recurring_billing_starts_at: recurringStartsAt.toISOString() });
}

const TIER_AMOUNTS_CENTS: Record<string, number> = {
	pilot: 0,
	food_truck: 19900,
	single_location: 27900,
	multi_configuration: 34900,
	multi_location: 39900,
	enterprise: 45000
};

async function handleUpdateCustomer(request: Request, actorEmail: string): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const accountId = normalizeText(body.account_id, 200);
	const businessName = normalizeText(body.business_name, 200);
	const email = normalizeText(body.email, 254);
	const fullName = normalizeText(body.full_name, 200) || null;
	const phone = normalizeText(body.phone, 30) || null;
	const ein = normalizeText(body.ein, 20) || null;
	const tier = normalizeText(body.tier, 50) || null;
	const requestedOnboarded = Boolean(body.onboarded);

	if (!accountId) return jsonResponse({ error: 'account_id is required' }, 400);
	if (!businessName) return jsonResponse({ error: 'business_name is required' }, 400);
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Valid email is required' }, 400);

	const supabase = getSupabase();
	const { data: account, error: accountError } = await supabase
		.from('portal_accounts')
		.select('id,email,auth_user_id,business_id,product')
		.eq('id', accountId)
		.single();
	if (accountError || !account?.business_id) return jsonResponse({ error: accountError?.message ?? 'Customer not found' }, 404);

	const { data: business, error: businessError } = await supabase
		.from('businesses')
		.select('id,name,ein,ein_verified,address_verified,onboarded,dialtone_location_id')
		.eq('id', account.business_id)
		.single();
	if (businessError || !business) return jsonResponse({ error: businessError?.message ?? 'Business not found' }, 404);

	if (requestedOnboarded && !business.onboarded && (!business.ein_verified || !business.address_verified)) {
		return jsonResponse({ error: 'EIN and address must both be verified before onboarding signoff' }, 422);
	}
	if (account.product === 'dialtone_menu' && (!tier || !(tier in TIER_AMOUNTS_CENTS))) {
		return jsonResponse({ error: 'A valid tier is required for DialTone.Menu' }, 400);
	}

	if (email !== account.email) {
		const { data: duplicate } = await supabase.from('portal_accounts').select('id').eq('email', email).neq('id', accountId).maybeSingle();
		if (duplicate) return jsonResponse({ error: `A portal account already exists for ${email}` }, 409);
		if (account.auth_user_id) {
			const { url, key } = getPortalSupabaseConfig();
			const response = await fetch(`${url}/auth/v1/admin/users/${account.auth_user_id}`, {
				method: 'PUT',
				headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
				body: JSON.stringify({ email, email_confirm: true })
			});
			if (!response.ok) return jsonResponse({ error: 'Failed to update customer login email' }, 502);
		}
	}

	const businessUpdates: Record<string, unknown> = { name: businessName };
	if (account.product === 'dialtone_menu' && tier) businessUpdates.monthly_amount_cents = TIER_AMOUNTS_CENTS[tier];
	else if (Number.isInteger(body.monthly_amount_cents)) businessUpdates.monthly_amount_cents = body.monthly_amount_cents;

	// Handle EIN updates with re-verification
	if (ein !== null && ein !== business.ein) {
		const einDigits = ein.replace(/\D/g, '').slice(0, 9);
		if (einDigits.length === 9) {
			const einVerified = await verifyEINWithCobalt({
				ein: einDigits,
				businessName: businessName || business.name || ''
			});
			businessUpdates.ein = einDigits;
			businessUpdates.ein_verified = einVerified;
			businessUpdates.ein_verified_at = einVerified ? new Date().toISOString() : null;
		} else if (einDigits.length === 0) {
			// Clear EIN if empty
			businessUpdates.ein = null;
			businessUpdates.ein_verified = false;
			businessUpdates.ein_verified_at = null;
		}
	}

	if (requestedOnboarded && !business.onboarded) {
		const onboardedAt = new Date();
		const recurringStartsAt = new Date(onboardedAt);
		recurringStartsAt.setUTCDate(recurringStartsAt.getUTCDate() + 30);
		Object.assign(businessUpdates, {
			onboarded: true,
			onboarded_at: onboardedAt.toISOString(),
			onboarded_by_email: actorEmail,
			recurring_billing_starts_at: recurringStartsAt.toISOString(),
			next_billing_at: recurringStartsAt.toISOString()
		});
	}

	const { error: updateBusinessError } = await supabase.from('businesses').update(businessUpdates).eq('id', business.id);
	if (updateBusinessError) return jsonResponse({ error: updateBusinessError.message }, 500);

	const { error: updateAccountError } = await supabase.from('portal_accounts').update({ email, full_name: fullName }).eq('id', accountId);
	if (updateAccountError) return jsonResponse({ error: updateAccountError.message }, 500);

	if (account.product === 'dialtone_menu' && business.dialtone_location_id) {
		const { data: location } = await supabase.from('locations').select('restaurant_id').eq('id', business.dialtone_location_id).single();
		if (location?.restaurant_id) {
			const { error: restaurantError } = await supabase.from('restaurants').update({ tier, phone_number: phone }).eq('id', location.restaurant_id);
			if (restaurantError) return jsonResponse({ error: restaurantError.message }, 500);
		}
	} else {
		const { error: phoneError } = await supabase.from('businesses').update({ phone }).eq('id', business.id);
		if (phoneError) return jsonResponse({ error: phoneError.message }, 500);
	}

	return jsonResponse({ ok: true });
}

async function handleReverify(request: Request): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const businessId = normalizeText(body.business_id, 200);
	const hasAddressInput = ['address_street', 'address_city', 'address_state', 'address_zip']
		.some((field) => normalizeText(body[field], 200));
	const newAddress = hasAddressInput ? parseStructuredAddress(body) : null;
	const newEin = normalizeText(body.ein, 20).replace(/\D/g, '').slice(0, 9);

	if (!businessId)            return jsonResponse({ error: 'business_id is required' }, 400);
	if (hasAddressInput && !newAddress) return jsonResponse({ error: 'Street, city, two-character state, and valid ZIP code are required' }, 400);
	if (!newAddress && !newEin) return jsonResponse({ error: 'address or ein is required' }, 400);

	const supabase = getSupabase();

	const { data: business, error: bizError } = await supabase
		.from('businesses')
		.select('id,name,dialtone_location_id,address_state')
		.eq('id', businessId)
		.single();

	if (bizError || !business) return jsonResponse({ error: bizError?.message ?? 'Business not found' }, 404);

	const bizUpdates: Record<string, unknown> = {};
	let addrVerified: boolean | null = null;
	let einVerified: boolean | null = null;

	if (newAddress) {
		const addrResult = await verifyAddressWithPostGrid(newAddress);
		addrVerified = addrResult.verified;
		bizUpdates.address_verified = addrVerified;

		if (business.dialtone_location_id) {
			await supabase.from('locations').update({
				address_line1: addrResult.line1 ?? newAddress.line1,
				city: addrResult.city ?? newAddress.city,
				state: addrResult.state ?? newAddress.state,
				postal_code: addrResult.postalCode ?? newAddress.postalCode,
				latitude: addrResult.lat ?? null,
				longitude: addrResult.lng ?? null,
			}).eq('id', business.dialtone_location_id);
		} else {
			Object.assign(bizUpdates, {
				address: addrResult.line1 ?? newAddress.line1,
				address_city: addrResult.city ?? newAddress.city,
				address_state: addrResult.state ?? newAddress.state,
				address_postal_code: addrResult.postalCode ?? newAddress.postalCode
			});
		}
	}

	if (newEin) {
		const businessName = business.name || '';
		einVerified = await verifyEINWithCobalt({
			ein: newEin,
			businessName
		});
		bizUpdates.ein = newEin;
		bizUpdates.ein_verified = einVerified;
		bizUpdates.ein_verified_at = einVerified ? new Date().toISOString() : null;
	}

	if (Object.keys(bizUpdates).length > 0) {
		const { error: updateError } = await supabase.from('businesses').update(bizUpdates).eq('id', businessId);
		if (updateError) return jsonResponse({ error: updateError.message }, 500);
	}

	return jsonResponse({ ok: true, address_verified: addrVerified, ein_verified: einVerified });
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

async function handleGetSettings(): Promise<Response> {
	const supabase = getSupabase();
	const { data, error } = await supabase
		.from('app_settings')
		.select('key,value');

	if (error) return jsonResponse({ error: error.message }, 500);

	const settings: Record<string, string> = {};
	for (const row of data ?? []) {
		settings[row.key] = row.value;
	}

	return jsonResponse({ settings });
}

async function handleUpdateSettings(request: Request, actorEmail: string): Promise<Response> {
	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

	const supabase = getSupabase();
	const updates: Array<{ key: string; value: string; updated_at: string; updated_by: string }> = [];

	if (typeof body.enable_tax_assessment === 'string') {
		updates.push({
			key: 'enable_tax_assessment',
			value: body.enable_tax_assessment,
			updated_at: new Date().toISOString(),
			updated_by: actorEmail
		});
	}

	if (updates.length === 0) {
		return jsonResponse({ error: 'No valid settings to update' }, 400);
	}

	const { error } = await supabase
		.from('app_settings')
		.upsert(updates, { onConflict: 'key' });

	if (error) return jsonResponse({ error: error.message }, 500);

	return jsonResponse({ ok: true });
}

export const GET: RequestHandler = async ({ params, locals }) => {
	guard(locals);

	if (params.path === 'customers') return handleCustomers();
	if (params.path === 'billing') return handleBilling();
	if (params.path === 'settings') return handleGetSettings();
	if (params.path === 'config-debug') return handleConfigDebug();

	return jsonResponse({ error: 'Not found' }, 404);
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	guard(locals);

	if (params.path === 'generate-billing') return handleGenerateBilling();
	if (params.path === 'invite') return handleInvite(request);
	if (params.path === 'onboarding-signoff') return handleOnboardingSignoff(request, locals.user!.email);
	if (params.path === 'customer') return handleUpdateCustomer(request, locals.user!.email);
	if (params.path === 'reverify') return handleReverify(request);
	if (params.path === 'resend-invite') return handleResendInvite(request);
	if (params.path === 'message') return handleMessage(request);
	if (params.path === 'settings') return handleUpdateSettings(request, locals.user!.email);

	return jsonResponse({ error: 'Not found' }, 404);
};
