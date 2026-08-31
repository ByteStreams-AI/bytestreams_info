#!/usr/bin/env node

/**
 * Remove one portal customer and everything created for them, keyed by email.
 *
 * The runnable form of developer/cleanup-test-data.sql: same tables, same
 * order, same dry-run-by-default posture, but the email is an argument rather
 * than a literal you edit before pasting into the SQL editor.
 *
 * The two New Customer flows leave different trails, and the email is the only
 * thing they share:
 *   DialTone.Menu  restaurants -> locations -> businesses -> billing_schedule
 *                  -> portal_accounts -> auth.users
 *   Other          businesses -> billing_schedule -> portal_accounts -> auth.users
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const ACCOUNT_FIELDS = 'id,email,full_name,auth_user_id,business_id,product,role,status,is_admin';
const PAGE_SIZE = 1000;

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
		email: null,
		apply: false,
		yes: false,
		keepAuthUser: false,
		allowAdmin: false,
		backup: null,
		help: false
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			args.help = true;
			continue;
		}
		if (arg === '--apply') {
			args.apply = true;
			continue;
		}
		if (arg === '--yes' || arg === '-y') {
			args.yes = true;
			continue;
		}
		if (arg === '--keep-auth-user') {
			args.keepAuthUser = true;
			continue;
		}
		if (arg === '--allow-admin') {
			args.allowAdmin = true;
			continue;
		}

		const next = argv[i + 1];
		if (!next || next.startsWith('--')) {
			throw new Error(`Missing value for ${arg}`);
		}

		switch (arg) {
			case '--email':
				args.email = next.trim();
				i += 1;
				break;
			case '--backup':
				args.backup = next.trim();
				i += 1;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return args;
}

function usage() {
	console.log(`Remove one portal customer and everything created for them, keyed by email.

Usage:
  node developer/remove-portal-customer.mjs --email <email> [--apply]

Required:
  --email <email>      Portal account email (matched case-insensitively)

Optional:
  --apply              Actually delete. Without it the script only reports.
  --yes, -y            Skip the confirmation prompt (required when non-interactive)
  --keep-auth-user     Leave the Supabase auth user in place
  --allow-admin        Permit removing an account with is_admin = true
  --backup <path>      Write a JSON snapshot of every row before deleting
  --help               Show this help

Deletes in FK-safe order:
  billing_notifications -> billing_schedule -> portal_messages -> portal_accounts
  -> businesses -> staff -> locations -> restaurants -> auth.users

The restaurant/location/staff chain exists only for DialTone.Menu customers;
Other customers stop at businesses.

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

function supabaseHost(url) {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/** PostgREST reports an absent table rather than throwing; those steps are skipped, not fatal. */
function isMissingTable(error) {
	return (
		error?.code === '42P01' ||
		error?.code === 'PGRST205' ||
		/does not exist|could not find the table/i.test(error?.message ?? '')
	);
}

/** Same idea for a column this project's migrations have not added. */
function isMissingColumn(error) {
	return error?.code === '42703' || /column .* does not exist/i.test(error?.message ?? '');
}

function describeError(table, verb, error) {
	if (error.code === '23503') {
		return `Cannot ${verb} ${table}: rows elsewhere still reference it (${error.details ?? error.message}).`;
	}
	return `Failed to ${verb} ${table}: ${error.message}`;
}

async function countRows(supabase, table, column, values) {
	if (values.length === 0) return 0;
	const { count, error } = await supabase
		.from(table)
		.select('id', { count: 'exact', head: true })
		.in(column, values);
	if (error) {
		if (isMissingTable(error)) return null;
		throw new Error(describeError(table, 'count', error));
	}
	return count ?? 0;
}

async function fetchRows(supabase, table, column, values) {
	if (values.length === 0) return [];
	const { data, error } = await supabase.from(table).select('*').in(column, values);
	if (error) {
		if (isMissingTable(error)) return [];
		throw new Error(describeError(table, 'read', error));
	}
	return data ?? [];
}

async function deleteRows(supabase, table, column, values) {
	if (values.length === 0) return 0;
	const { count, error } = await supabase.from(table).delete({ count: 'exact' }).in(column, values);
	if (error) {
		if (isMissingTable(error)) return null;
		throw new Error(describeError(table, 'delete from', error));
	}
	return count ?? 0;
}

/**
 * portal_accounts.email is unique, but case variants can coexist and an ilike
 * filter would treat an underscore in the address as a wildcard — which is how
 * you delete the wrong customer. Page the table and compare in JS instead.
 */
async function fetchAllAccounts(supabase) {
	const accounts = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from('portal_accounts')
			.select(ACCOUNT_FIELDS)
			.order('id', { ascending: true })
			.range(from, from + PAGE_SIZE - 1);

		if (error) throw new Error(`Failed to query portal_accounts: ${error.message}`);
		const page = data ?? [];
		accounts.push(...page);
		if (page.length < PAGE_SIZE) return accounts;
	}
}

/**
 * A create that failed partway can leave an auth user with no portal_accounts
 * row pointing at it.
 *
 * The GoTrue admin list endpoint ignores its ?email= filter on this project and
 * happily returns an unrelated user, so page the list and match in JS. Deleting
 * whatever the filter hands back would remove the wrong person's login.
 */
async function findAuthUserIdByEmail(supabase, email) {
	const target = email.toLowerCase();
	for (let page = 1; page; ) {
		const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw new Error(`Failed to list auth users: ${error.message}`);

		const hit = (data?.users ?? []).find((user) => (user.email ?? '').toLowerCase() === target);
		if (hit) return hit.id;
		page = data?.nextPage ?? 0;
	}
	return null;
}

async function confirm(promptText, expected) {
	if (!process.stdin.isTTY) {
		throw new Error('Refusing to delete without confirmation. Re-run with --yes when running non-interactively.');
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await rl.question(promptText);
		return answer.trim().toLowerCase() === expected.toLowerCase();
	} finally {
		rl.close();
	}
}

async function main() {
	loadEnvFile(resolve(process.cwd(), '.dev.vars'));
	loadEnvFile(resolve(process.cwd(), '.env'));

	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		usage();
		return;
	}
	if (!args.email) {
		usage();
		throw new Error('--email is required');
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
		throw new Error(`Not a valid email address: ${args.email}`);
	}

	const { url, key, source } = resolveSupabaseConfig();
	const supabase = createClient(url, key);
	const target = args.email.toLowerCase();

	console.log(`Supabase : ${supabaseHost(url)} (from ${source})`);
	console.log(`Email    : ${args.email}`);
	console.log(`Mode     : ${args.apply ? 'APPLY — rows will be deleted' : 'dry run — nothing will be deleted'}`);
	console.log('─────────────────────────────────────────────');

	const allAccounts = await fetchAllAccounts(supabase);
	const matched = allAccounts.filter((account) => (account.email ?? '').toLowerCase() === target);

	// A create that died before the portal_accounts insert leaves only an auth user.
	if (matched.length === 0) {
		const orphanAuthUserId = args.keepAuthUser ? null : await findAuthUserIdByEmail(supabase, args.email);
		if (!orphanAuthUserId) {
			console.log(`No portal account found for ${args.email}. Nothing to do.`);
			return;
		}

		console.log(`No portal account found, but an auth user exists: ${orphanAuthUserId}`);
		if (!args.apply) {
			console.log('would delete 1 auth.users row');
			console.log('─────────────────────────────────────────────');
			console.log('Dry run — nothing deleted. Re-run with --apply to remove it.');
			return;
		}
		if (!args.yes && !(await confirm(`Delete orphan auth user for ${args.email}? Type the email to confirm: `, args.email))) {
			console.log('Aborted.');
			return;
		}
		const { error } = await supabase.auth.admin.deleteUser(orphanAuthUserId);
		if (error) throw new Error(`Failed to delete auth user ${orphanAuthUserId}: ${error.message}`);
		console.log('deleted 1 auth.users');
		return;
	}

	const admins = matched.filter((account) => account.is_admin === true);
	if (admins.length > 0 && !args.allowAdmin) {
		throw new Error(
			`${args.email} is a ByteStreams admin account (is_admin = true), not a customer. Pass --allow-admin if you really mean to remove it.`
		);
	}

	const businessIds = [...new Set(matched.map((account) => account.business_id).filter(Boolean))];
	if (businessIds.length > 1) {
		throw new Error(
			`${args.email} resolves to more than one business (${businessIds.join(', ')}). Resolve this by hand — the script will not guess which to remove.`
		);
	}

	const businessId = businessIds[0] ?? null;
	let business = null;
	let location = null;
	let restaurantId = null;

	if (businessId) {
		const { data, error } = await supabase
			.from('businesses')
			.select('id,name,business_type,dialtone_location_id,monthly_amount_cents,onboarded')
			.eq('id', businessId)
			.maybeSingle();
		if (error) throw new Error(`Failed to load business ${businessId}: ${error.message}`);
		business = data;

		if (!business) {
			console.warn(`Account points at business ${businessId}, which no longer exists — cleaning up the rest.`);
		} else if (business.dialtone_location_id) {
			const { data: locationRow, error: locationError } = await supabase
				.from('locations')
				.select('id,restaurant_id,name')
				.eq('id', business.dialtone_location_id)
				.maybeSingle();
			if (locationError) throw new Error(`Failed to load location ${business.dialtone_location_id}: ${locationError.message}`);
			location = locationRow;
			restaurantId = locationRow?.restaurant_id ?? null;
			if (!locationRow) {
				console.warn(`Business points at location ${business.dialtone_location_id}, which no longer exists — skipping the restaurant chain.`);
			}
		}
	}

	// Every account on the same business goes too: leaving one behind orphans a
	// login that can still sign in but has no business to read.
	const siblings = businessId
		? allAccounts.filter((account) => account.business_id === businessId && !matched.includes(account))
		: [];
	const accountIds = [...matched, ...siblings].map((account) => account.id);
	const businessIdValues = businessId ? [businessId] : [];

	// restaurants.business_id is DialTone's own pointer back at the portal row —
	// deliberately not a foreign key (dialtone migration 0209), so nothing
	// enforces that it agrees with businesses.dialtone_location_id. A restaurant
	// linked only that way is still this customer's and would be left behind.
	const restaurantIds = new Set(restaurantId ? [restaurantId] : []);
	if (businessId) {
		const { data, error } = await supabase.from('restaurants').select('id').eq('business_id', businessId);
		if (error && !isMissingTable(error) && !isMissingColumn(error)) {
			throw new Error(`Failed to query restaurants by business_id: ${error.message}`);
		}
		for (const row of data ?? []) if (row.id) restaurantIds.add(row.id);
	}
	const restaurantIdValues = [...restaurantIds];

	const authUserIds = args.keepAuthUser
		? []
		: [...new Set([...matched, ...siblings].map((account) => account.auth_user_id).filter(Boolean))];

	console.log(`account   : ${matched.map((a) => `${a.email} (${a.status}, ${a.product})`).join(', ')}`);
	console.log(`business  : ${business ? `${business.name} [${business.business_type}] id=${business.id}` : '(none)'}`);
	console.log(`location  : ${location ? `${location.name} id=${location.id}` : '(none — Other flow)'}`);
	console.log(`restaurant: ${restaurantIdValues.join(', ') || '(none — Other flow)'}`);
	console.log(`auth user : ${authUserIds.length > 0 ? authUserIds.join(', ') : args.keepAuthUser ? '(kept)' : '(none recorded)'}`);
	if (siblings.length > 0) {
		console.log('');
		console.log(`WARNING: ${siblings.length} other account(s) share this business and will also be removed:`);
		for (const sibling of siblings) console.log(`  - ${sibling.email} (${sibling.role}, ${sibling.status})`);
	}
	console.log('─────────────────────────────────────────────');

	// One ordered plan drives the preview, the backup, and the deletes.
	const steps = [
		{ table: 'billing_notifications', column: 'business_id', values: businessIdValues },
		{ table: 'billing_schedule', column: 'business_id', values: businessIdValues },
		{ table: 'portal_messages', column: 'business_id', values: businessIdValues },
		{ table: 'portal_accounts', column: 'id', values: accountIds },
		{ table: 'businesses', column: 'id', values: businessIdValues },
		// Expect more staff rows than the customer has people: dialtone migration
		// 0195 makes the support account an owner of every restaurant on insert.
		{ table: 'staff', column: 'restaurant_id', values: restaurantIdValues },
		{ table: 'locations', column: 'restaurant_id', values: restaurantIdValues },
		{ table: 'restaurants', column: 'id', values: restaurantIdValues }
	];

	for (const step of steps) {
		const count = await countRows(supabase, step.table, step.column, step.values);
		if (count === null) {
			console.log(`skip   ${step.table} (table not present in this project)`);
		} else {
			console.log(`${args.apply ? 'delete' : 'would delete'} ${count} ${step.table} row(s)`);
		}
	}
	for (const authUserId of authUserIds) {
		console.log(`${args.apply ? 'delete' : 'would delete'} auth.users row ${authUserId}`);
	}

	console.log('─────────────────────────────────────────────');

	if (!args.apply) {
		console.log('Dry run — nothing deleted. Re-run with --apply to remove this customer.');
		return;
	}

	if (!args.yes) {
		const question = `Permanently remove ${args.email} from ${supabaseHost(url)}? Type the email to confirm: `;
		if (!(await confirm(question, args.email))) {
			console.log('Aborted — nothing deleted.');
			return;
		}
	}

	if (args.backup) {
		const snapshot = {
			email: args.email,
			captured_at: new Date().toISOString(),
			supabase_host: supabaseHost(url),
			auth_user_ids: authUserIds,
			tables: {}
		};
		for (const step of steps) {
			snapshot.tables[step.table] = await fetchRows(supabase, step.table, step.column, step.values);
		}
		writeFileSync(resolve(process.cwd(), args.backup), `${JSON.stringify(snapshot, null, 2)}\n`);
		console.log(`Wrote backup to ${args.backup}`);
	}

	for (const step of steps) {
		const count = await deleteRows(supabase, step.table, step.column, step.values);
		if (count === null) {
			console.log(`skipped  ${step.table} (table not present in this project)`);
		} else {
			console.log(`deleted  ${count} ${step.table}`);
		}
	}

	for (const authUserId of authUserIds) {
		const { error } = await supabase.auth.admin.deleteUser(authUserId);
		if (error) throw new Error(`Rows removed, but deleting auth user ${authUserId} failed: ${error.message}`);
		console.log(`deleted  auth.users ${authUserId}`);
	}

	console.log('─────────────────────────────────────────────');

	// Anything still here was missed; say so rather than reporting a clean run.
	const leftovers = [];
	const remainingAccounts = (await fetchAllAccounts(supabase)).filter(
		(account) => (account.email ?? '').toLowerCase() === target || (businessId && account.business_id === businessId)
	);
	if (remainingAccounts.length > 0) leftovers.push(`${remainingAccounts.length} portal_accounts`);
	for (const step of steps.filter((s) => s.table !== 'portal_accounts')) {
		const count = await countRows(supabase, step.table, step.column, step.values);
		if (count) leftovers.push(`${count} ${step.table}`);
	}

	if (leftovers.length > 0) {
		throw new Error(`Cleanup incomplete — still present: ${leftovers.join(', ')}`);
	}
	console.log(`Verified clean. ${args.email} removed.`);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
