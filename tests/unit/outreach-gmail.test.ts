import { describe, expect, it, vi } from 'vitest';
import { GmailError, buildRawMessage, encodeHeader, rfcMessageId, sendMessage, threadSenders } from '$lib/server/outreach-gmail';

function decode(raw: string): string {
	const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
	return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

function bodyOf(message: string): string {
	const encoded = message.split('\r\n\r\n')[1].replace(/\r\n/g, '');
	return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('buildRawMessage', () => {
	it('builds a plain-text UTF-8 message with CRLF lines', () => {
		const message = decode(buildRawMessage({
			from: 'Steve Cotton <hello@bytestreams.ai>',
			to: 'owner@clinic.example',
			subject: '"where\'s my refill?" calls',
			body: 'Hi Jason,\n\nOne line — with a dash.'
		}));
		expect(message).toContain('From: Steve Cotton <hello@bytestreams.ai>\r\n');
		expect(message).toContain('To: owner@clinic.example\r\n');
		expect(message).toContain('Subject: "where\'s my refill?" calls\r\n');
		expect(message).toContain('Content-Type: text/plain; charset=UTF-8');
		expect(message).not.toContain('In-Reply-To');
		expect(bodyOf(message)).toBe('Hi Jason,\r\n\r\nOne line — with a dash.');
	});

	it('threads a follow-up and encodes a non-ASCII subject', () => {
		const message = decode(buildRawMessage({
			from: 'a@b.example',
			to: 'c@d.example',
			subject: 're: café hours',
			body: 'x',
			inReplyTo: '<abc@mail.gmail.com>'
		}));
		expect(message).toContain('In-Reply-To: <abc@mail.gmail.com>\r\nReferences: <abc@mail.gmail.com>');
		expect(message).toContain(`Subject: ${encodeHeader('re: café hours')}`);
		expect(encodeHeader('re: café hours')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
	});

	it('refuses header injection', () => {
		expect(() => buildRawMessage({ from: 'a@b.example', to: 'c@d.example\r\nBcc: x@y.example', subject: 's', body: 'b' }))
			.toThrow(/line breaks/);
	});

	it('wraps long bodies into 76-character base64 lines', () => {
		const message = decode(buildRawMessage({ from: 'a@b.example', to: 'c@d.example', subject: 's', body: 'x'.repeat(500) }));
		const lines = message.split('\r\n\r\n')[1].split('\r\n');
		expect(lines.every((line) => line.length <= 76)).toBe(true);
	});
});

describe('Gmail calls', () => {
	it('sends, in a thread when given one', async () => {
		const fetcher = vi.fn().mockImplementation(async () => json({ id: 'm1', threadId: 't1' }));
		expect(await sendMessage('token', 'RAW', 't1', fetcher)).toEqual({ id: 'm1', threadId: 't1' });
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
		expect(JSON.parse(init.body)).toEqual({ raw: 'RAW', threadId: 't1' });
		expect(init.headers.authorization).toBe('Bearer token');

		await sendMessage('token', 'RAW', null, fetcher);
		expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ raw: 'RAW' });
	});

	it('reads the RFC Message-ID with a metadata-only request', async () => {
		const fetcher = vi.fn().mockResolvedValue(json({ payload: { headers: [{ name: 'Message-Id', value: '<x@mail>' }] } }));
		expect(await rfcMessageId('token', 'm1', fetcher)).toBe('<x@mail>');
		expect(fetcher.mock.calls[0][0]).toContain('/messages/m1?format=metadata&metadataHeaders=Message-ID');

		const none = vi.fn().mockResolvedValue(json({}));
		expect(await rfcMessageId('token', 'm1', none)).toBeNull();
	});

	it('reads only the From header of each message in a thread', async () => {
		const fetcher = vi.fn().mockResolvedValue(json({ messages: [
			{ payload: { headers: [{ name: 'From', value: 'hello@bytestreams.ai' }] } },
			{ payload: { headers: [] } }
		] }));
		expect(await threadSenders('token', 't1', fetcher)).toEqual(['hello@bytestreams.ai', '']);
		expect(fetcher.mock.calls[0][0]).toContain('/threads/t1?format=metadata&metadataHeaders=From');
		expect(await threadSenders('token', 't1', vi.fn().mockResolvedValue(json({})))).toEqual([]);
	});

	it('treats a deleted thread as empty and explains a missing grant', async () => {
		expect(await threadSenders('token', 't1', vi.fn().mockResolvedValue(json({}, 404)))).toEqual([]);

		const failure = await sendMessage('token', 'RAW', null, vi.fn().mockResolvedValue(new Response('nope', { status: 403 }))).catch((e) => e);
		expect(failure).toBeInstanceOf(GmailError);
		expect(failure.status).toBe(403);
		expect(failure.message).toMatch(/Reconnect Google/);

		const disabled = await sendMessage('token', 'RAW', null, vi.fn().mockResolvedValue(
			new Response('{"error":{"code":403,"message":"Gmail API has not been used in project 1 before or it is disabled."}}', { status: 403 })
		)).catch((e) => e);
		expect(disabled.message).toMatch(/Enable the Gmail API/);
		expect(disabled.message).not.toMatch(/Reconnect/);
		await expect(threadSenders('token', 't1', vi.fn().mockResolvedValue(new Response('boom', { status: 500 }))))
			.rejects.toThrow('Gmail returned HTTP 500: boom');
	});
});
