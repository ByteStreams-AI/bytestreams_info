#!/usr/bin/env node
/**
 * Local KDE Connect bridge — listens on http://localhost:8765 and dials phone
 * numbers on a paired handset via kdeconnect-cli.
 *
 * Runs on Linux, Windows and macOS: only the path to kdeconnect-cli differs,
 * and KDECONNECT_CLI overrides it anywhere the guesses below are wrong.
 *
 * This bridge is what makes the CRM's phone links dial on Linux, where a `tel:`
 * URI usually has no handler at all. On Windows and macOS the browser's own
 * `tel:` handling (Phone Link, Skype, Teams; FaceTime) is often the better
 * route — the CRM falls back to it whenever this bridge is not answering, so
 * running it there is optional.
 *
 * See developer/dial-bridge.md for install and run-at-login instructions.
 */
import http from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 8765;

// First existing path wins; the bare command is the last resort and resolves
// through PATH, which is how a Homebrew or package-manager install is found.
const CLI_CANDIDATES = {
	linux: [
		'/usr/bin/kdeconnect-cli',
		'/usr/local/bin/kdeconnect-cli',
		'/var/lib/flatpak/exports/bin/org.kde.kdeconnect.cli',
		'kdeconnect-cli',
	],
	win32: [
		'C:\\Program Files\\KDE Connect\\bin\\kdeconnect-cli.exe',
		'C:\\Program Files (x86)\\KDE Connect\\bin\\kdeconnect-cli.exe',
		'kdeconnect-cli.exe',
	],
	darwin: [
		'/Applications/KDE Connect.app/Contents/MacOS/kdeconnect-cli',
		'/opt/homebrew/bin/kdeconnect-cli',
		'/usr/local/bin/kdeconnect-cli',
		'kdeconnect-cli',
	],
};

function resolveCli() {
	const override = process.env.KDECONNECT_CLI?.trim();
	if (override) return override;

	const candidates = CLI_CANDIDATES[process.platform] ?? CLI_CANDIDATES.linux;
	return candidates.find((path) => path.includes('/') || path.includes('\\') ? existsSync(path) : false)
		?? candidates[candidates.length - 1];
}

const KDECONNECT = resolveCli();

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

/**
 * Resolves the first paired, reachable device.
 *
 * A missing kdeconnect-cli is reported apart from an unreachable phone: they
 * need different fixes, and collapsing both into "no device" sent the previous
 * version's users looking at their handset when the CLI was the problem.
 */
function findPairedDevice(cb) {
	execFile(KDECONNECT, ['--list-devices'], (err, stdout) => {
		if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) {
			cb({ error: `kdeconnect-cli not found at ${KDECONNECT}. Install KDE Connect or set KDECONNECT_CLI.` });
			return;
		}
		if (err) {
			cb({ error: err.message });
			return;
		}
		const match = stdout?.match(/: ([0-9a-f]{32}) \(paired and reachable\)/);
		cb(match ? { deviceId: match[1] } : { error: 'No paired device reachable' });
	});
}

function sendJson(res, status, headers, body) {
	res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
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

	// Cheap liveness probe. The CRM asks once on load so that a workstation
	// without this bridge falls straight through to its own tel: handler
	// instead of waiting out a timeout on every click.
	if (url.pathname === '/health') {
		findPairedDevice((result) => {
			sendJson(res, 200, headers, {
				ok: Boolean(result.deviceId),
				platform: process.platform,
				cli: KDECONNECT,
				device: result.deviceId ?? null,
				error: result.error ?? null,
			});
		});
		return;
	}

	if (url.pathname !== '/dial') {
		res.writeHead(404, headers);
		res.end();
		return;
	}

	const number = url.searchParams.get('number');
	if (!number) {
		sendJson(res, 400, headers, { error: 'Missing number' });
		return;
	}

	findPairedDevice((result) => {
		if (!result.deviceId) {
			sendJson(res, 503, headers, { error: result.error });
			return;
		}

		execFile(KDECONNECT, ['--device', result.deviceId, '--share', `tel:${number}`], (dialErr) => {
			if (dialErr) {
				sendJson(res, 500, headers, { error: dialErr.message });
				return;
			}
			sendJson(res, 200, headers, { ok: true });
		});
	});
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`KDE Connect bridge listening on http://127.0.0.1:${PORT}`);
	console.log(`  platform: ${process.platform}`);
	console.log(`  cli:      ${KDECONNECT}`);
});
