#!/usr/bin/env node
/**
 * Bulk email enrichment via Apify Google Maps scraper.
 *
 * Groups leads (without emails) by city, runs one Apify job per city with
 * scrapeContacts=true, matches results back by normalized business name, then
 * writes found emails to Supabase.
 *
 * Usage:
 *   node developer/enrich-emails.mjs                        # all cities
 *   node developer/enrich-emails.mjs --city Houston         # one city only
 *   node developer/enrich-emails.mjs --dry-run              # preview, no DB writes
 *
 * Required env vars (.dev.vars or shell):
 *   APIFY_API_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const APIFY_ACTOR = 'compass~crawler-google-places';
const APIFY_BASE = 'https://api.apify.com/v2';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 360; // 30 min max

// Apify search terms broad enough to capture most restaurants/bars
const SEARCH_TERMS = ['restaurant', 'bar', 'cafe', 'pub', 'food'];

// ---------------------------------------------------------------------------
// Load env — checks .dev.vars, .env, and sibling dialtone_outreach/.env
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
	try {
		const content = readFileSync(filePath, 'utf8');
		for (const line of content.split('\n')) {
			const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
			if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
		}
	} catch { /* file not present */ }
}

loadEnvFile(resolve(process.cwd(), '.dev.vars'));
loadEnvFile(resolve(process.cwd(), '.env'));
// APIFY_API_TOKEN lives in the dialtone_outreach repo
loadEnvFile(resolve(process.cwd(), '../dialtone_outreach/.env'));

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!APIFY_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing required env vars: APIFY_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const cityFilter = args.includes('--city') ? args[args.indexOf('--city') + 1] : null;
const dryRun = args.includes('--dry-run');

if (dryRun) console.log('[dry-run] No database writes will be made.\n');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(s) {
	return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Simple edit-distance for fuzzy matching (Levenshtein). */
function editDistance(a, b) {
	const m = a.length, n = b.length;
	const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i || j));
	for (let i = 1; i <= m; i++)
		for (let j = 1; j <= n; j++)
			dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
	return dp[m][n];
}

/** Returns true if normalized names are close enough to be the same place. */
function namesMatch(a, b) {
	const na = normalize(a), nb = normalize(b);
	if (na === nb) return true;
	if (na.includes(nb) || nb.includes(na)) return true;
	// Allow up to 20% edit distance relative to shorter string
	const maxDist = Math.floor(Math.min(na.length, nb.length) * 0.2);
	return maxDist > 0 && editDistance(na, nb) <= maxDist;
}

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

async function supabaseGet(path) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
		headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`);
	return res.json();
}

async function supabasePatch(table, id, patch) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?lead_id=eq.${encodeURIComponent(id)}`, {
		method: 'PATCH',
		headers: {
			apikey: SUPABASE_KEY,
			Authorization: `Bearer ${SUPABASE_KEY}`,
			'Content-Type': 'application/json',
			Prefer: 'return=minimal',
		},
		body: JSON.stringify(patch),
	});
	if (!res.ok) throw new Error(`Supabase PATCH ${table}/${id}: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Apify helpers
// ---------------------------------------------------------------------------

async function startApifyRun(city) {
	const input = {
		searchStringsArray: SEARCH_TERMS,
		locationQuery: city,
		language: 'en',
		scrapeContacts: true,        // visits business website, extracts emails
		website: 'withWebsite',      // only scrape places that have a website listed
		skipClosedPlaces: true,
		maxCrawledPlacesPerSearch: 500,
	};
	const res = await fetch(`${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?token=${APIFY_TOKEN}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	if (!res.ok) throw new Error(`Apify start run: ${res.status} ${await res.text()}`);
	const { data } = await res.json();
	return data.id;
}

async function pollUntilDone(runId) {
	for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
		await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
		const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
		const { data } = await res.json();
		if (data.status === 'SUCCEEDED') return data.defaultDatasetId;
		if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.status))
			throw new Error(`Apify run ${runId} ended with status: ${data.status}`);
		process.stdout.write('.');
	}
	throw new Error('Apify run timed out after 30 minutes');
}

async function fetchDatasetItems(datasetId) {
	const res = await fetch(
		`${APIFY_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&limit=10000`
	);
	if (!res.ok) throw new Error(`Fetch dataset: ${res.status}`);
	return res.json();
}

/** Extract the best email from an Apify place result. */
function extractEmail(place) {
	// scrapeContacts puts emails in place.emails[]
	if (Array.isArray(place.emails) && place.emails.length > 0) return place.emails[0];
	return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// 1. Fetch leads without emails
console.log('Fetching leads without emails from Supabase…');
const leads = await supabaseGet(
	'leads?select=lead_id,business_name,city&email=is.null&city=not.is.null&order=city'
);
console.log(`  Found ${leads.length} leads without emails.`);

// 2. Group by city
const byCityMap = new Map();
for (const lead of leads) {
	const city = lead.city?.trim();
	if (!city) continue;
	if (cityFilter && city.toLowerCase() !== cityFilter.toLowerCase()) continue;
	if (!byCityMap.has(city)) byCityMap.set(city, []);
	byCityMap.get(city).push(lead);
}

const cities = [...byCityMap.keys()].sort();
console.log(`\nCities to process (${cities.length}): ${cities.join(', ')}\n`);

let totalMatched = 0, totalUpdated = 0;

// 3. Process each city
for (const city of cities) {
	const cityLeads = byCityMap.get(city);
	console.log(`\n── ${city} (${cityLeads.length} leads without email) ──`);

	let runId;
	try {
		console.log(`  Starting Apify run…`);
		runId = await startApifyRun(city);
		console.log(`  Run ID: ${runId} — polling`);
		const datasetId = await pollUntilDone(runId);
		console.log(` done`);

		const places = await fetchDatasetItems(datasetId);
		console.log(`  Apify returned ${places.length} places`);

		// 4. Match places to leads
		for (const place of places) {
			const email = extractEmail(place);
			if (!email) continue;

			const matched = cityLeads.find(l => namesMatch(l.business_name, place.title));
			if (!matched) continue;

			totalMatched++;
			console.log(`  ✓ ${matched.business_name} → ${email}`);

			if (!dryRun) {
				await supabasePatch('leads', matched.lead_id, { email });
				totalUpdated++;
			}
		}
	} catch (err) {
		console.error(`  ✗ Error processing ${city}: ${err.message}`);
	}
}

// 5. Summary
console.log(`\n${'─'.repeat(50)}`);
console.log(`Emails matched : ${totalMatched}`);
if (!dryRun) console.log(`Supabase updated: ${totalUpdated}`);
else console.log(`(dry-run — no writes)`);
