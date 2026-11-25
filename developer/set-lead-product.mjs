#!/usr/bin/env node

/**
 * Move a CRM lead between DialTone.Menu and DialTone.Med.
 *
 * The CRM edit form deliberately ignores product changes, so a lead entered
 * under the wrong product is corrected here. Dry run by default.
 *
 *   pnpm crm:set-product --lead "B-Levee Primary Care" --product dialtone_med --business-type general_practice
 *   pnpm crm:set-product --lead 55520d81-8267-4e82-9cc2-a75cf1bfccb0 --product dialtone_med --apply
 *
 * The leads CHECK constraints (developer/migrations/021, 022) decide what else
 * must change: a business type from the other product is cleared, and moving a
 * lead to Menu clears the Med-only fields (clinical_specialty, npi, npi_entity_type).
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Keep in sync with src/lib/products.ts.
const BUSINESS_TYPES = {
	dialtone_menu: ['food_truck', 'single_location', 'multi_configuration', 'multi_location', 'enterprise'],
	dialtone_med: ['general_practice', 'specialty_practice', 'specialty_pharmacy']
};
const MED_ONLY_FIELDS = ['clinical_specialty', 'npi', 'npi_entity_type'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
	const args = { lead: null, product: null, businessType: undefined, apply: false };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--apply') {
			args.apply = true;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			args.help = true;
			continue;
		}
		const value = argv[i + 1];
		if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
		i += 1;
		if (arg === '--lead') args.lead = value;
		else if (arg === '--product') args.product = value;
		else if (arg === '--business-type') args.businessType = value;
		else throw new Error(`Unknown argument: ${arg}`);
	}
	return args;
}

const USAGE = `Usage: pnpm crm:set-product --lead <lead id | exact business name> --product dialtone_menu|dialtone_med
                           [--business-type <type>] [--apply]

Business types:
  dialtone_menu: ${BUSINESS_TYPES.dialtone_menu.join(', ')}
  dialtone_med:  ${BUSINESS_TYPES.dialtone_med.join(', ')}

Dry run unless --apply is given.`;

async function findLead(client, lead) {
	const fields = 'lead_id, business_name, city, state, status, product, business_type, clinical_specialty, npi, npi_entity_type';
	const query = client.from('leads').select(fields);
	const { data, error } = UUID.test(lead)
		? await query.eq('lead_id', lead)
		: await query.ilike('business_name', lead.replace(/[%_\\]/g, '\\$&'));
	if (error) throw new Error(error.message);
	if (!data?.length) throw new Error(`No lead matches "${lead}".`);
	if (data.length > 1) {
		const list = data.map((row) => `  ${row.lead_id}  ${row.business_name} (${row.city}, ${row.state})`).join('\n');
		throw new Error(`${data.length} leads match "${lead}". Pass one lead id:\n${list}`);
	}
	return data[0];
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.lead || !args.product) {
		console.log(USAGE);
		process.exit(args.help ? 0 : 1);
	}
	if (!BUSINESS_TYPES[args.product]) throw new Error(`--product must be dialtone_menu or dialtone_med.`);
	if (args.businessType !== undefined && !BUSINESS_TYPES[args.product].includes(args.businessType)) {
		throw new Error(`"${args.businessType}" is not a ${args.product} business type: ${BUSINESS_TYPES[args.product].join(', ')}`);
	}

	loadEnvFile('.env');
	loadEnvFile('.dev.vars');
	const url = process.env.SUPABASE_URL?.trim();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env or .dev.vars).');

	// The x-actor-email header attributes the change in lead_change_log, as the CRM does.
	const actor = process.env.CRM_ACTOR_EMAIL?.trim() || 'developer/set-lead-product.mjs';
	const client = createClient(url, key, { global: { headers: { 'x-actor-email': actor } } });
	const lead = await findLead(client, args.lead);

	const update = { product: args.product };
	if (args.businessType !== undefined) {
		update.business_type = args.businessType;
	} else if (lead.business_type && !BUSINESS_TYPES[args.product].includes(lead.business_type)) {
		update.business_type = null;
	}
	if (args.product === 'dialtone_menu') {
		for (const field of MED_ONLY_FIELDS) if (lead[field] !== null) update[field] = null;
	}

	const changes = Object.entries(update).filter(([field, value]) => lead[field] !== value);
	console.log(`${lead.business_name} (${lead.city}, ${lead.state}) — ${lead.lead_id}`);
	if (changes.length === 0) {
		console.log('Already up to date; nothing to change.');
		return;
	}
	for (const [field, value] of changes) console.log(`  ${field}: ${lead[field] ?? '—'} → ${value ?? '—'}`);

	if (!args.apply) {
		console.log('\nDry run. Re-run with --apply to write this change.');
		return;
	}
	const { error } = await client.from('leads').update(Object.fromEntries(changes)).eq('lead_id', lead.lead_id);
	if (error) throw new Error(error.message);
	console.log('\nUpdated.');
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
