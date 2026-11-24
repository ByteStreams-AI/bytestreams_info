#!/usr/bin/env node

/**
 * Import DialTone.Med leads from the NPI Registry — the Med counterpart of the Yelp
 * import in dialtone_outreach. Every registry organization names an authorized
 * official (owner, president, administrator), which becomes the lead's contact.
 *
 *   pnpm crm:import-npi --type specialty_pharmacy --state FL --city Jacksonville
 *   pnpm crm:import-npi --type general_practice --state FL --city "Orange Park" --apply
 *   pnpm crm:import-npi --type specialty_practice --taxonomy "Oral and Maxillofacial Surgery" --state FL --city Jacksonville
 *
 * Dry run by default. Existing leads are never modified: an NPI, name+city or phone
 * already in the CRM is skipped.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { MAX_SKIP, NPI_API, NPI_TYPES, PAGE_SIZE, accepts, dedupeRows, inArea, leadRow } from './npi-leads.mjs';

const USAGE = `Usage: pnpm crm:import-npi --type <business type> --state <XX> [--city <name>] [--postal-code <zip>]
                         [--taxonomy <registry specialty>] [--limit <n>] [--apply]

  --type         general_practice | specialty_pharmacy | specialty_practice
  --taxonomy     Registry specialty to search, e.g. "Oral and Maxillofacial Surgery".
                 Required for specialty_practice; overrides the default searches otherwise.
  --limit        Stop after this many new leads (default: no limit).
  --apply        Write to the CRM. Without it, only prints what would be imported.`;

function loadEnvFile(filePath) {
	try {
		for (const line of readFileSync(filePath, 'utf8').split('\n')) {
			const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
			if (!match || process.env[match[1]]) continue;
			process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
		}
	} catch {
		// Optional file.
	}
}

function parseArgs(argv) {
	const args = { apply: false, help: false };
	const names = { '--type': 'type', '--state': 'state', '--city': 'city', '--postal-code': 'postalCode', '--taxonomy': 'taxonomy', '--limit': 'limit' };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--apply') args.apply = true;
		else if (arg === '--help' || arg === '-h') args.help = true;
		else if (names[arg]) {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
			args[names[arg]] = value;
			i += 1;
		} else throw new Error(`Unknown argument: ${arg}`);
	}
	return args;
}

async function searchRegistry(taxonomy, area) {
	const results = [];
	for (let skip = 0; skip <= MAX_SKIP; skip += PAGE_SIZE) {
		const params = new URLSearchParams({
			version: '2.1',
			enumeration_type: 'NPI-2',
			taxonomy_description: taxonomy,
			state: area.state,
			limit: String(PAGE_SIZE),
			skip: String(skip)
		});
		if (area.city) params.set('city', area.city);
		if (area.postalCode) params.set('postal_code', `${area.postalCode}*`);

		const response = await fetch(`${NPI_API}?${params}`, { signal: AbortSignal.timeout(20_000) });
		if (!response.ok) throw new Error(`NPI Registry returned HTTP ${response.status} for "${taxonomy}".`);
		const body = await response.json();
		if (body.Errors?.length) {
			throw new Error(`NPI Registry rejected "${taxonomy}": ${body.Errors.map((e) => e.description).join('; ')}`);
		}
		const page = body.results ?? [];
		results.push(...page);
		if (page.length < PAGE_SIZE) return { results, truncated: false };
	}
	return { results, truncated: true };
}

async function fetchExisting(client) {
	const existing = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await client.from('leads').select('npi, business_name, city, phone').range(from, from + 999);
		if (error) throw new Error(error.message);
		existing.push(...data);
		if (data.length < 1000) return existing;
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.type || !args.state) {
		console.log(USAGE);
		process.exit(args.help ? 0 : 1);
	}
	if (!NPI_TYPES[args.type]) throw new Error(`--type must be one of: ${Object.keys(NPI_TYPES).join(', ')}`);
	if (args.type === 'specialty_practice' && !args.taxonomy) {
		throw new Error('specialty_practice needs --taxonomy, e.g. --taxonomy "Oral and Maxillofacial Surgery".');
	}
	if (!/^[A-Z]{2}$/i.test(args.state)) throw new Error('--state must be a two-letter code, e.g. FL.');
	const limit = args.limit === undefined ? Infinity : Number(args.limit);
	if (!(limit > 0)) throw new Error('--limit must be a positive number.');

	loadEnvFile('.env');
	loadEnvFile('.dev.vars');
	const url = process.env.SUPABASE_URL?.trim();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env or .dev.vars).');
	const actor = process.env.CRM_ACTOR_EMAIL?.trim() || 'developer/import-npi-leads.mjs';
	const client = createClient(url, key, { global: { headers: { 'x-actor-email': actor } } });

	const area = { state: args.state.toUpperCase(), city: args.city, postalCode: args.postalCode };
	const searches = args.taxonomy ? [args.taxonomy] : NPI_TYPES[args.type].searches;
	const byNpi = new Map();
	for (const taxonomy of searches) {
		const { results, truncated } = await searchRegistry(taxonomy, area);
		if (truncated) console.warn(`! "${taxonomy}" hit the registry's 1,200-result cap; narrow with --city or --postal-code.`);
		let accepted = 0;
		for (const result of results) {
			if (byNpi.has(result.number) || !inArea(result, area) || !accepts(result, args.type, args.taxonomy)) continue;
			byNpi.set(result.number, result);
			accepted += 1;
		}
		console.log(`"${taxonomy}": ${results.length} registry results, ${accepted} kept.`);
	}

	const rows = [...byNpi.values()].map((result) => leadRow(result, args.type));
	const { kept, skipped } = dedupeRows(rows, await fetchExisting(client));
	const toInsert = kept.slice(0, limit);

	console.log(`\n${toInsert.length} new lead${toInsert.length === 1 ? '' : 's'}:`);
	for (const row of toInsert) {
		console.log(`  + ${row.business_name} — ${row.city}, ${row.state} | ${row.clinical_specialty} | ${row.contact_name ?? 'no official'} | NPI ${row.npi}`);
	}
	if (skipped.length) {
		console.log(`\n${skipped.length} skipped:`);
		for (const { row, reason } of skipped) console.log(`  - ${row.business_name} (${row.city}): ${reason}`);
	}

	if (!args.apply) {
		console.log('\nDry run. Re-run with --apply to add these leads to the CRM.');
		return;
	}
	if (toInsert.length === 0) return;

	const { data, error } = await client
		.from('leads')
		.upsert(toInsert, { onConflict: 'business_name,city', ignoreDuplicates: true })
		.select('lead_id');
	if (error) throw new Error(error.message);
	console.log(`\nAdded ${data?.length ?? 0} lead${data?.length === 1 ? '' : 's'} to the CRM.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
