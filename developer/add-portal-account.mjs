#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
	try {
		const content = readFileSync(filePath, 'utf8');
		for (const line of content.split('\n')) {
			const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
			if (!match) continue;
			const [, key, rawValue] = match;
			if (process.env[key]) continue;
			process.env[key] = rawValue.trim().replace(/^['\"]|['\"]$/g, '');
		}
	} catch {
		// Optional file.
	}
}

function parseArgs(argv) {
	const args = {
		authUserId: null,
		email: null,
		fullName: null,
		businessId: null,
		requireBusinessId: false,
		product: 'dialtone_menu',
		role: 'owner',
		status: 'active',
		isAdmin: false,
		updateExisting: false,
		dryRun: false,
		help: false
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			args.help = true;
			continue;
		}
		if (arg === '--dry-run') {
			args.dryRun = true;
			continue;
		}
		if (arg === '--update-existing') {
			args.updateExisting = true;
			continue;
		}
		if (arg === '--admin') {
			args.isAdmin = true;
			continue;
		}
		if (arg === '--require-business-id') {
			args.requireBusinessId = true;
			continue;
		}

		const next = argv[i + 1];
		if (!next || next.startsWith('--')) {
			throw new Error(`Missing value for ${arg}`);
		}

		switch (arg) {
			case '--auth-user-id':
				args.authUserId = next.trim();
				i += 1;
				break;
			case '--email':
				args.email = next.trim();
				i += 1;
				break;
			case '--full-name':
				args.fullName = next.trim();
				i += 1;
				break;
			case '--business-id':
				args.businessId = next.trim();
				i += 1;
				break;
			case '--product':
				args.product = next.trim();
				i += 1;
				break;
			case '--role':
				args.role = next.trim();
				i += 1;
				break;
			case '--status':
				args.status = next.trim();
				i += 1;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return args;
}

function usage() {
	console.log(`Add or update a portal_accounts row for an existing Supabase auth user.

Usage:
  node developer/add-portal-account.mjs --auth-user-id <uuid> [options]

Required:
  --auth-user-id <uuid>     Existing auth.users id

Optional:
  --email <email>           Override email (default: auth user's email)
  --full-name <name>        Override full name
  --business-id <uuid>      Business id (if omitted, derived from staff.user_id -> businesses.dialtone_location_id)
	--require-business-id      Fail if business_id cannot be resolved (default: allow null)
  --product <value>         Default: dialtone_menu
  --role <value>            Default: owner
  --status <value>          Default: active
  --admin                   Set is_admin=true (default: false)
  --update-existing         Update existing portal_accounts row for auth_user_id
  --dry-run                 Print actions without writing
  --help                    Show this help

Env resolution:
  1) PORTAL_SUPABASE_URL + PORTAL_SUPABASE_SERVICE_ROLE_KEY
  2) SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
`);
}

function resolveSupabaseConfig() {
	const portalUrl = process.env.PORTAL_SUPABASE_URL?.trim();
	const portalKey = process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY?.trim();
	if ((portalUrl && !portalKey) || (!portalUrl && portalKey)) {
		throw new Error('Both PORTAL_SUPABASE_URL and PORTAL_SUPABASE_SERVICE_ROLE_KEY must be set together');
	}
	if (portalUrl && portalKey) {
		return { url: portalUrl, key: portalKey, source: 'PORTAL_SUPABASE_*' };
	}

	const url = process.env.SUPABASE_URL?.trim();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) {
		throw new Error('Set either PORTAL_SUPABASE_URL + PORTAL_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
	}
	return { url, key, source: 'SUPABASE_*' };
}

function deriveNameFromEmail(email) {
	const prefix = (email || '').split('@')[0] || '';
	if (!prefix) return null;
	return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

async function deriveBusinessIdFromStaff(supabase, authUserId) {
	const { data: staffRow, error: staffError } = await supabase
		.from('staff')
		.select('restaurant_id,display_name,first_name,last_name')
		.eq('user_id', authUserId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (staffError) {
		throw new Error(`Failed to query staff: ${staffError.message}`);
	}
	if (!staffRow?.restaurant_id) {
		return { businessId: null, staffRow: null };
	}

	const { data: businessRow, error: businessError } = await supabase
		.from('businesses')
		.select('id')
		.eq('dialtone_location_id', staffRow.restaurant_id)
		.limit(1)
		.maybeSingle();

	if (businessError) {
		throw new Error(`Failed to map staff.restaurant_id to businesses.dialtone_location_id: ${businessError.message}`);
	}

	return { businessId: businessRow?.id ?? null, staffRow };
}

async function main() {
	loadEnvFile(resolve(process.cwd(), '.dev.vars'));
	loadEnvFile(resolve(process.cwd(), '.env'));

	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		usage();
		return;
	}
	if (!args.authUserId) {
		usage();
		throw new Error('--auth-user-id is required');
	}

	const { url, key, source } = resolveSupabaseConfig();
	const supabase = createClient(url, key);

	console.log(`Using Supabase config source: ${source}`);

	const { data: authUserResult, error: authUserError } = await supabase.auth.admin.getUserById(args.authUserId);
	if (authUserError) {
		throw new Error(`Failed to load auth user ${args.authUserId}: ${authUserError.message}`);
	}
	if (!authUserResult?.user) {
		throw new Error(`Auth user not found: ${args.authUserId}`);
	}

	const authUser = authUserResult.user;
	const email = args.email || authUser.email;
	if (!email) {
		throw new Error('No email found on auth user. Pass --email explicitly.');
	}

	let businessId = args.businessId;
	let staffRow = null;
	if (!businessId) {
		const derived = await deriveBusinessIdFromStaff(supabase, args.authUserId);
		businessId = derived.businessId;
		staffRow = derived.staffRow;
	}
	if (!businessId) {
		if (args.requireBusinessId) {
			throw new Error('Could not determine business_id. Pass --business-id or ensure staff.user_id maps to businesses.dialtone_location_id.');
		}
		console.warn('No business_id mapping found; continuing with business_id=null.');
	}

	const fullName =
		args.fullName ||
		staffRow?.display_name ||
		[staffRow?.first_name, staffRow?.last_name].filter(Boolean).join(' ').trim() ||
		authUser.user_metadata?.full_name ||
		deriveNameFromEmail(email) ||
		null;

	const nowIso = new Date().toISOString();
	const payload = {
		email,
		full_name: fullName,
		auth_user_id: args.authUserId,
		business_id: businessId,
		product: args.product,
		role: args.role,
		status: args.status,
		is_admin: args.isAdmin,
		invited_at: nowIso,
		activated_at: args.status === 'active' ? nowIso : null
	};

	const { data: existing, error: existingError } = await supabase
		.from('portal_accounts')
		.select('id,email,auth_user_id,business_id,status,is_admin')
		.eq('auth_user_id', args.authUserId)
		.limit(1)
		.maybeSingle();

	if (existingError) {
		throw new Error(`Failed to query existing portal account: ${existingError.message}`);
	}

	if (args.dryRun) {
		console.log('[dry-run] Existing row:', existing ?? null);
		console.log('[dry-run] Payload:', payload);
		return;
	}

	if (existing) {
		if (!args.updateExisting) {
			console.log('Portal account already exists for this auth user.');
			console.log('Use --update-existing to update it.');
			console.log(existing);
			return;
		}

		const { error: updateError } = await supabase
			.from('portal_accounts')
			.update(payload)
			.eq('id', existing.id);

		if (updateError) {
			throw new Error(`Failed to update portal account ${existing.id}: ${updateError.message}`);
		}

		console.log(`Updated portal_accounts row ${existing.id}`);
		return;
	}

	const { data: inserted, error: insertError } = await supabase
		.from('portal_accounts')
		.insert(payload)
		.select('id,email,auth_user_id,business_id,status,is_admin')
		.single();

	if (insertError) {
		throw new Error(`Failed to insert portal account: ${insertError.message}`);
	}

	console.log('Inserted portal account:');
	console.log(inserted);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
