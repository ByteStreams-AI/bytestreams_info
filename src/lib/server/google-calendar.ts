/**
 * Google Calendar integration via per-user OAuth 2.0.
 *
 * Each user connects their own Google account (consent screen). Events are
 * created/updated/deleted directly on their real primary Google Calendar,
 * with `sendUpdates=all` so attendees receive genuine Google Calendar
 * invites (accept/decline, reminders, etc. all handled natively by Google).
 */

import { env } from '$env/dynamic/private';
import {
	getGoogleCalendarTokens,
	saveGoogleCalendarTokens,
	deleteGoogleCalendarTokens,
	type GoogleCalendarTokens
} from '$lib/server/supabase';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// Our UI color swatches mapped to the nearest Google Calendar event colorId.
const COLOR_TO_GOOGLE_ID: Record<string, string> = {
	'#3b82f6': '9', // Blueberry
	'#8b5cf6': '3', // Grape
	'#22c55e': '10', // Basil
	'#f59e0b': '6', // Tangerine
	'#ef4444': '11', // Tomato
	'#06b6d4': '7' // Peacock
};
const GOOGLE_ID_TO_COLOR: Record<string, string> = Object.fromEntries(
	Object.entries(COLOR_TO_GOOGLE_ID).map(([hex, id]) => [id, hex])
);

export interface GoogleCalendarEventInput {
	title: string;
	description?: string | null;
	start_at: string; // ISO 8601 UTC
	end_at: string; // ISO 8601 UTC
	all_day: boolean;
	color?: string | null;
	attendees?: string[];
}

export interface GoogleCalendarEvent {
	id: string;
	title: string;
	description: string | null;
	start_at: string;
	end_at: string;
	all_day: boolean;
	color: string | null;
	created_by: string;
	attendees: string[];
}

function getOAuthConfig() {
	const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
	const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
	const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
	if (!clientId || !clientSecret || !redirectUri) {
		throw new Error(
			'GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI must be set'
		);
	}
	return { clientId, clientSecret, redirectUri };
}

/** Builds the Google consent screen URL for a user to connect their calendar. */
export function buildAuthUrl(state: string): string {
	const { clientId, redirectUri } = getOAuthConfig();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: SCOPE,
		access_type: 'offline',
		// Force Google to reissue a refresh_token even on repeat consent.
		prompt: 'consent',
		state
	});
	return `${AUTH_URL}?${params.toString()}`;
}

/** Exchanges an OAuth authorization code for tokens and persists them for the user. */
export async function connectAccount(userEmail: string, code: string): Promise<void> {
	const { clientId, clientSecret, redirectUri } = getOAuthConfig();
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});
	if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);

	const json = (await res.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in: number;
		scope: string;
	};
	if (!json.refresh_token) {
		throw new Error(
			'Google did not return a refresh token. Revoke access at myaccount.google.com/permissions and reconnect.'
		);
	}

	await saveGoogleCalendarTokens(userEmail, {
		access_token: json.access_token,
		refresh_token: json.refresh_token,
		expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
		scope: json.scope
	});
}

/** Whether a user has connected their Google Calendar. */
export async function isConnected(userEmail: string): Promise<boolean> {
	return (await getGoogleCalendarTokens(userEmail)) !== null;
}

/** Disconnects a user's Google Calendar (removes stored tokens). */
export async function disconnectAccount(userEmail: string): Promise<void> {
	await deleteGoogleCalendarTokens(userEmail);
}

/** Returns a valid (non-expired) access token, refreshing it via Google if needed. */
async function getValidAccessToken(userEmail: string): Promise<string> {
	const tokens = await getGoogleCalendarTokens(userEmail);
	if (!tokens) throw new Error('Google Calendar is not connected for this user.');

	const expiresAt = new Date(tokens.expires_at).getTime();
	if (expiresAt - Date.now() > 60_000) return tokens.access_token;

	const { clientId, clientSecret } = getOAuthConfig();
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: tokens.refresh_token,
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token'
		})
	});
	if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);

	const json = (await res.json()) as { access_token: string; expires_in: number };
	const refreshed: GoogleCalendarTokens = {
		access_token: json.access_token,
		refresh_token: tokens.refresh_token,
		expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
		scope: tokens.scope
	};
	await saveGoogleCalendarTokens(userEmail, refreshed);
	return refreshed.access_token;
}

async function googleFetch(userEmail: string, path: string, init: RequestInit = {}): Promise<Response> {
	const accessToken = await getValidAccessToken(userEmail);
	return fetch(`${EVENTS_API}${path}`, {
		...init,
		headers: {
			...init.headers,
			authorization: `Bearer ${accessToken}`,
			'content-type': 'application/json'
		}
	});
}

interface RawGoogleEvent {
	id: string;
	summary?: string;
	description?: string;
	start: { date?: string; dateTime?: string };
	end: { date?: string; dateTime?: string };
	colorId?: string;
	creator?: { email?: string };
	attendees?: { email: string }[];
}

/** Maps a Google event onto our shape, matching the app's existing all-day convention (inclusive end-of-day). */
function fromGoogleEvent(e: RawGoogleEvent): GoogleCalendarEvent {
	const allDay = !!e.start.date;

	let endAt: string;
	if (allDay && e.end.date) {
		// Google's all-day end date is exclusive — roll it back a day.
		const endExclusive = new Date(`${e.end.date}T00:00:00.000Z`);
		endExclusive.setUTCDate(endExclusive.getUTCDate() - 1);
		endAt = `${endExclusive.toISOString().slice(0, 10)}T23:59:00.000Z`;
	} else {
		endAt = e.end.dateTime as string;
	}

	return {
		id: e.id,
		title: e.summary ?? '(untitled)',
		description: e.description ?? null,
		start_at: allDay ? `${e.start.date}T00:00:00.000Z` : (e.start.dateTime as string),
		end_at: endAt,
		all_day: allDay,
		color: (e.colorId && GOOGLE_ID_TO_COLOR[e.colorId]) ?? null,
		created_by: e.creator?.email ?? '',
		attendees: (e.attendees ?? []).map((a) => a.email)
	};
}

function toGoogleBody(fields: Partial<GoogleCalendarEventInput>): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (fields.title !== undefined) body.summary = fields.title;
	if (fields.description !== undefined) body.description = fields.description;
	if (fields.color !== undefined) body.colorId = fields.color ? COLOR_TO_GOOGLE_ID[fields.color] : null;
	if (fields.attendees !== undefined) body.attendees = fields.attendees.map((email) => ({ email }));

	if (fields.start_at && fields.end_at) {
		if (fields.all_day) {
			// Google's all-day end date is exclusive — our end_at is inclusive end-of-day.
			const endExclusive = new Date(fields.end_at);
			endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
			body.start = { date: fields.start_at.slice(0, 10) };
			body.end = { date: endExclusive.toISOString().slice(0, 10) };
		} else {
			body.start = { dateTime: fields.start_at };
			body.end = { dateTime: fields.end_at };
		}
	}
	return body;
}

/** Lists events on the user's primary calendar within a time range. */
export async function listEvents(
	userEmail: string,
	timeMin: string,
	timeMax: string
): Promise<GoogleCalendarEvent[]> {
	const params = new URLSearchParams({
		timeMin,
		timeMax,
		singleEvents: 'true',
		orderBy: 'startTime',
		maxResults: '250'
	});
	const res = await googleFetch(userEmail, `?${params.toString()}`);
	if (!res.ok) throw new Error(`Failed to list Google Calendar events: ${await res.text()}`);
	const json = (await res.json()) as { items: RawGoogleEvent[] };
	return json.items.map(fromGoogleEvent);
}

/** Creates an event, emailing real Google Calendar invites to any attendees. */
export async function createEvent(userEmail: string, fields: GoogleCalendarEventInput): Promise<string> {
	const res = await googleFetch(userEmail, '?sendUpdates=all', {
		method: 'POST',
		body: JSON.stringify(toGoogleBody(fields))
	});
	if (!res.ok) throw new Error(`Failed to create Google Calendar event: ${await res.text()}`);
	const json = (await res.json()) as { id: string };
	return json.id;
}

/** Patches an event, re-notifying attendees of the change via sendUpdates=all. */
export async function updateEvent(
	userEmail: string,
	eventId: string,
	fields: Partial<GoogleCalendarEventInput>
): Promise<void> {
	const res = await googleFetch(userEmail, `/${encodeURIComponent(eventId)}?sendUpdates=all`, {
		method: 'PATCH',
		body: JSON.stringify(toGoogleBody(fields))
	});
	if (!res.ok) throw new Error(`Failed to update Google Calendar event: ${await res.text()}`);
}

/** Deletes an event, notifying attendees it was cancelled via sendUpdates=all. */
export async function deleteEvent(userEmail: string, eventId: string): Promise<void> {
	const res = await googleFetch(userEmail, `/${encodeURIComponent(eventId)}?sendUpdates=all`, {
		method: 'DELETE'
	});
	// 410 Gone means it was already deleted — treat as success.
	if (!res.ok && res.status !== 410) throw new Error(`Failed to delete Google Calendar event: ${await res.text()}`);
}
