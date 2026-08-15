#!/usr/bin/env node
/**
 * One-time migration: push existing rows from the Supabase `events` table
 * into each creator's real Google Calendar, then the `events` table can be
 * retired (see developer/migrations/012_create_google_calendar_tokens.sql).
 *
 * Only migrates events whose `created_by` user has already connected their
 * Google Calendar (visit /calendar/connect while logged in as that user).
 * Events for users who haven't connected are skipped and listed at the end.
 *
 * Usage:
 *   node developer/migrate-events-to-google-calendar.mjs             # run
 *   node developer/migrate-events-to-google-calendar.mjs --dry-run   # preview only
 *
 * Required env vars (.dev.vars or shell):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

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

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function getAccessToken(userEmail, tokenCache) {
	if (tokenCache.has(userEmail)) return tokenCache.get(userEmail);

	const { data: tokens, error } = await supabase
		.from('google_calendar_tokens')
		.select('refresh_token')
		.eq('user_email', userEmail)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!tokens) {
		tokenCache.set(userEmail, null);
		return null;
	}

	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: tokens.refresh_token,
			client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
			client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
			grant_type: 'refresh_token'
		})
	});
	if (!res.ok) throw new Error(`Token refresh failed for ${userEmail}: ${await res.text()}`);
	const json = await res.json();
	tokenCache.set(userEmail, json.access_token);
	return json.access_token;
}

function toGoogleBody(event) {
	const body = { summary: event.title, description: event.description ?? undefined };
	if (event.all_day) {
		const endExclusive = new Date(event.end_at);
		endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
		body.start = { date: event.start_at.slice(0, 10) };
		body.end = { date: endExclusive.toISOString().slice(0, 10) };
	} else {
		body.start = { dateTime: event.start_at };
		body.end = { dateTime: event.end_at };
	}
	return body;
}

async function main() {
	const { data: events, error } = await supabase
		.from('events')
		.select('id, title, description, start_at, end_at, all_day, created_by')
		.order('start_at', { ascending: true });
	if (error) throw new Error(error.message);

	console.log(`Found ${events.length} event(s) in Supabase.`);

	const tokenCache = new Map();
	const skipped = [];
	let migrated = 0;

	for (const event of events) {
		const accessToken = await getAccessToken(event.created_by, tokenCache);
		if (!accessToken) {
			skipped.push(event);
			continue;
		}

		console.log(`${DRY_RUN ? '[dry-run] would create' : 'Creating'}: "${event.title}" for ${event.created_by}`);
		if (DRY_RUN) {
			migrated++;
			continue;
		}

		const res = await fetch(EVENTS_API, {
			method: 'POST',
			headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
			body: JSON.stringify(toGoogleBody(event))
		});
		if (!res.ok) {
			console.error(`  Failed: ${await res.text()}`);
			continue;
		}
		migrated++;
	}

	console.log(`\nMigrated ${migrated}/${events.length} event(s).`);
	if (skipped.length > 0) {
		console.log(`\nSkipped ${skipped.length} event(s) — creator hasn't connected Google Calendar yet:`);
		for (const e of skipped) console.log(`  - "${e.title}" (created_by: ${e.created_by})`);
		console.log('\nAsk them to visit /calendar/connect, then re-run this script.');
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
