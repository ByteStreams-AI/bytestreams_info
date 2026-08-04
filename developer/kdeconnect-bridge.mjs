#!/usr/bin/env node
/**
 * Local KDE Connect bridge — listens on http://localhost:8765
 * and dials phone numbers via kdeconnect-cli.
 *
 * Run once manually, or install as a systemd user service:
 *   systemctl --user enable --now kdeconnect-bridge
 */
import http from 'node:http';
import { execFile } from 'node:child_process';

const PORT = 8765;
const KDECONNECT = '/usr/bin/kdeconnect-cli';

// Origins allowed to call the bridge
const ALLOWED_ORIGINS = new Set([
	'https://bytestreams.info',
	'http://localhost:5173',
	'http://localhost:8788',
	'http://localhost:4173',
]);

function corsHeaders(origin) {
	const allowed = ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0];
	return {
		'Access-Control-Allow-Origin': allowed,
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		// Required for Chrome's Private Network Access policy (localhost from HTTPS)
		'Access-Control-Allow-Private-Network': 'true',
	};
}

function findPairedDevice(cb) {
	execFile(KDECONNECT, ['--list-devices'], (err, stdout) => {
		const match = stdout?.match(/: ([0-9a-f]{32}) \(paired and reachable\)/);
		cb(match ? match[1] : null);
	});
}

const server = http.createServer((req, res) => {
	const origin = req.headers.origin ?? '';
	const headers = corsHeaders(origin);

	if (req.method === 'OPTIONS') {
		res.writeHead(204, headers);
		res.end();
		return;
	}

	const url = new URL(req.url, `http://localhost:${PORT}`);

	if (url.pathname !== '/dial') {
		res.writeHead(404, headers);
		res.end();
		return;
	}

	const number = url.searchParams.get('number');
	if (!number) {
		res.writeHead(400, { ...headers, 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Missing number' }));
		return;
	}

	findPairedDevice((deviceId) => {
		if (!deviceId) {
			res.writeHead(503, { ...headers, 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'No paired device reachable' }));
			return;
		}

		execFile(KDECONNECT, ['--device', deviceId, '--share', `tel:${number}`], (dialErr) => {
			if (dialErr) {
				res.writeHead(500, { ...headers, 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: dialErr.message }));
				return;
			}
			res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true }));
		});
	});
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`KDE Connect bridge listening on http://127.0.0.1:${PORT}`);
});
