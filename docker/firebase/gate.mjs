// The only way clients reach the Auth and Firestore emulators and the
// Emulator UI (the dashboard).
//
// Those listen on the loopback interface, which nothing outside this container
// can reach. This process listens on the container's other addresses (where
// Docker delivers the published ports and where other containers connect) and
// forwards every connection to them.
//
// That gives the entrypoint a switch for client traffic:
// - it starts the gate only after the saved state has been loaded, and
// - it stops the gate before the final save.
// When this process exits, every client connection is closed with it, so no
// update can be acknowledged to a client after the save has begun.
//
// The dashboard asks its server where the emulators are and connects to them
// from the browser. The answer describes the inside of this container
// ("listening on 127.0.0.1"), which is wrong for a browser, above all one on
// another device. Seen from outside, the emulators are reachable wherever the
// gate is, i.e. on the address the dashboard itself was opened on. The gate
// therefore serves the dashboard port over HTTP and corrects that one answer
// (GET /api/config); everything else is passed through untouched.
//
//   node gate.mjs <port>...
//     GATE_DASHBOARD_PORT=<port>  additionally serve the dashboard on this port
//     GATE_MARKER=<file>          created while the gate is open
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';

const ports = process.argv.slice(2).map(Number);
const dashboardPort = Number(process.env.GATE_DASHBOARD_PORT || 0);
const marker = process.env.GATE_MARKER;
const log = (message) => console.log(`[gate] ${message}`);

// Link-local IPv6 addresses need a scope to bind to and are not how clients
// are routed to a container; everything else that is not loopback is served.
const addresses = Object.values(os.networkInterfaces())
	.flat()
	.filter((entry) => entry && !entry.internal && !entry.address.toLowerCase().startsWith('fe80'))
	.map((entry) => entry.address);

if (ports.length === 0 || [...ports, dashboardPort].some((port) => !Number.isInteger(port))) {
	console.error('usage: gate.mjs <port>...');
	process.exit(2);
}
if (addresses.length === 0) {
	console.error('[gate] this container has no network address to accept clients on');
	process.exit(1);
}

// ---- plain forwarding (emulator ports) -----------------------------------

const forward = (port) => (client) => {
	const upstream = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
	const drop = () => {
		client.destroy();
		upstream.destroy();
	};
	client.on('error', drop);
	upstream.on('error', drop);
	client.on('close', drop);
	upstream.on('close', drop);
	client.pipe(upstream);
	upstream.pipe(client);
};

// ---- the dashboard ---------------------------------------------------------

/**
 * Rewrites the emulator list so that it is true for the browser that asked.
 *
 * For every emulator the gate forwards, the dashboard is told it listens on
 * all addresses; that is what stock emulators report when they are reachable
 * from other devices, and makes the dashboard connect to the host name it was
 * loaded from. `host` is what it uses for the Firestore request monitor.
 */
const describeForBrowser = (config, requestHost, gatedPorts) => {
	let hostname = '';
	try {
		hostname = new URL(`http://${requestHost}`).hostname;
	} catch {
		// no usable Host header: keep the reported host
	}
	const usable = hostname && hostname !== 'localhost' && !hostname.includes(':');

	for (const emulator of Object.values(config)) {
		if (!emulator || typeof emulator !== 'object' || !gatedPorts.includes(emulator.port)) continue;
		emulator.listen = [{ address: '0.0.0.0', family: 'IPv4', port: emulator.port }];
		if (usable) {
			emulator.host = hostname;
			if (emulator.webSocketHost) emulator.webSocketHost = hostname;
		}
	}
	return config;
};

const serveDashboard = (request, response) => {
	const isConfig = request.method === 'GET' && request.url.split('?')[0] === '/api/config';
	const headers = { ...request.headers };
	if (isConfig) headers['accept-encoding'] = 'identity';

	const upstream = http.request(
		{ host: '127.0.0.1', port: dashboardPort, method: request.method, path: request.url, headers },
		(answer) => {
			if (!isConfig || answer.statusCode !== 200) {
				response.writeHead(answer.statusCode, answer.headers);
				answer.pipe(response);
				return;
			}
			const chunks = [];
			answer.on('data', (chunk) => chunks.push(chunk));
			answer.on('end', () => {
				let body = Buffer.concat(chunks);
				const answerHeaders = { ...answer.headers };
				try {
					const config = describeForBrowser(
						JSON.parse(body.toString('utf8')),
						request.headers.host,
						ports
					);
					body = Buffer.from(JSON.stringify(config));
					delete answerHeaders.etag;
					delete answerHeaders['transfer-encoding'];
					answerHeaders['content-length'] = String(body.length);
					answerHeaders['cache-control'] = 'no-store';
				} catch {
					// not the JSON we know: pass it on as it came
				}
				response.writeHead(200, answerHeaders);
				response.end(body);
			});
		}
	);
	upstream.on('error', () => {
		if (!response.headersSent) response.writeHead(502);
		response.end();
	});
	request.pipe(upstream);
};

// ---- start / stop ----------------------------------------------------------

const listen = (server, address, port) =>
	new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen({ host: address, port }, resolve);
	});

const close = () => {
	if (marker) fs.rmSync(marker, { force: true });
	// Exiting closes the listeners and every forwarded connection at once.
	process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);

try {
	const servers = [];
	for (const address of addresses) {
		for (const port of ports) {
			servers.push(listen(net.createServer({ allowHalfOpen: true }, forward(port)), address, port));
		}
		if (dashboardPort) {
			servers.push(listen(http.createServer(serveDashboard), address, dashboardPort));
		}
	}
	await Promise.all(servers);
} catch (err) {
	console.error(`[gate] cannot listen: ${err.message}`);
	process.exit(1);
}
if (marker) fs.writeFileSync(marker, addresses.join('\n'));
log(
	`open: ports ${ports.join(', ')}${
		dashboardPort ? ` and the dashboard on ${dashboardPort}` : ''
	}` + ` on ${addresses.join(', ')}`
);
