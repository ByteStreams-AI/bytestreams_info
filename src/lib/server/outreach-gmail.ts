/**
 * The Gmail calls outreach needs, and nothing more: send a message, read a sent message's
 * RFC Message-ID, and read the From header of each message in a thread. Scopes: gmail.send
 * and gmail.metadata, which cannot read message bodies.
 */

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface MimeInput {
	from: string;
	to: string;
	subject: string;
	body: string;
	inReplyTo?: string | null;
}

function base64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/** RFC 2047 encoded word when the header holds anything outside printable ASCII. */
export function encodeHeader(value: string): string {
	return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(utf8(value))}?=`;
}

/** A plain-text RFC 5322 message, base64url-encoded for the Gmail API's `raw` field. */
export function buildRawMessage(input: MimeInput): string {
	for (const value of [input.from, input.to, input.subject, input.inReplyTo ?? '']) {
		if (/[\r\n]/.test(value)) throw new Error('Email headers cannot contain line breaks.');
	}
	const headers = [
		`From: ${input.from}`,
		`To: ${input.to}`,
		`Subject: ${encodeHeader(input.subject)}`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: base64'
	];
	if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`);
	const body = base64(utf8(input.body.replace(/\r?\n/g, '\r\n'))).replace(/.{76}/g, '$&\r\n');
	const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
	return base64(utf8(message)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class GmailError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		this.name = 'GmailError';
	}
}

async function gmail<T>(accessToken: string, path: string, init: RequestInit, fetcher: Fetch): Promise<T> {
	const response = await fetcher(`${GMAIL_API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...init.headers }
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new GmailError(`Gmail returned HTTP ${response.status}: ${text.slice(0, 200)}${failureHint(response.status, text)}`, response.status);
	}
	return (await response.json()) as T;
}

/** A 403 is either the API switched off in Google Cloud or a token without the Gmail scopes. */
function failureHint(status: number, body: string): string {
	if (status !== 403) return '';
	if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(body)) {
		return ' Enable the Gmail API in the Google Cloud project, wait a few minutes, then click Retry.';
	}
	return ' Reconnect Google from the Outreach page to grant Gmail access.';
}

export async function sendMessage(
	accessToken: string,
	raw: string,
	threadId: string | null,
	fetcher: Fetch = fetch
): Promise<{ id: string; threadId: string }> {
	return gmail(accessToken, '/messages/send', {
		method: 'POST',
		body: JSON.stringify(threadId ? { raw, threadId } : { raw })
	}, fetcher);
}

type MetadataMessage = { payload?: { headers?: { name: string; value: string }[] } };

function header(message: MetadataMessage, name: string): string | null {
	return message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/** The RFC Message-ID Gmail assigned to a sent message, used to thread the next follow-up. */
export async function rfcMessageId(accessToken: string, messageId: string, fetcher: Fetch = fetch): Promise<string | null> {
	const message = await gmail<MetadataMessage>(
		accessToken,
		`/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Message-ID`,
		{ method: 'GET' },
		fetcher
	);
	return header(message, 'Message-ID');
}

/** The From header of every message in a thread. A deleted thread reads as empty. */
export async function threadSenders(accessToken: string, threadId: string, fetcher: Fetch = fetch): Promise<string[]> {
	try {
		const thread = await gmail<{ messages?: MetadataMessage[] }>(
			accessToken,
			`/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From`,
			{ method: 'GET' },
			fetcher
		);
		return (thread.messages ?? []).map((message) => header(message, 'From') ?? '');
	} catch (error) {
		if (error instanceof GmailError && error.status === 404) return [];
		throw error;
	}
}
