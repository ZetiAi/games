// Checks that a stop never loses an update the backend has acknowledged.
//
//   node acknowledged-writes.mjs write  <file>   keep writing until the backend goes away,
//                                                then record every acknowledged update in <file>
//   node acknowledged-writes.mjs verify <file>   after the restart: every recorded update exists
//
// "Acknowledged" means the complete success response arrived. Documents are
// written to Firestore and guest accounts are created in Auth, several at a
// time, so that some are always in flight while the environment is stopping.
import fs from 'node:fs';

const [mode, file] = process.argv.slice(2);
const FIRESTORE = process.env.FIRESTORE_EMULATOR_URL ?? 'http://localhost:8080';
const AUTH = process.env.AUTH_EMULATOR_URL ?? 'http://localhost:9099';
const PROJECT = process.env.FIREBASE_PROJECT ?? 'demo-games';
const COLLECTION = 'shutdownProbe';
const WRITERS = 6;

const documents = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
// the emulators treat this token as an administrator, bypassing security rules
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Resolves to the parsed body if the request was fully and successfully answered. */
const acknowledged = async (url, init) => {
	try {
		const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
		if (!response.ok) return undefined;
		return await response.json();
	} catch {
		return undefined;
	}
};

const write = async () => {
	const run = Date.now().toString(36);
	const docs = [];
	const accounts = [];
	let lastSuccess = 0;
	let announced = false;
	const deadline = Date.now() + 5 * 60_000;

	const worker = async (id) => {
		for (let seq = 0; Date.now() < deadline; seq++) {
			const name = `${run}-${id}-${seq}`;
			const createsAccount = seq % 5 === 0;
			const body = createsAccount
				? await acknowledged(
						`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=probe`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ returnSecureToken: true })
						}
				  )
				: await acknowledged(`${documents}/${COLLECTION}/${name}`, {
						method: 'PATCH',
						headers: admin,
						body: JSON.stringify({ fields: { seq: { integerValue: String(seq) } } })
				  });

			if (body) {
				if (createsAccount) accounts.push(body.localId);
				else docs.push(name);
				lastSuccess = Date.now();
				if (!announced && docs.length >= 50) {
					announced = true;
					fs.writeFileSync(`${file}.started`, '');
				}
			} else if (lastSuccess && Date.now() - lastSuccess > 3000) {
				return; // the backend has gone away
			} else {
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		}
	};

	await Promise.all(Array.from({ length: WRITERS }, (_, id) => worker(id)));
	fs.writeFileSync(file, JSON.stringify({ docs, accounts }));
	console.log(
		`acknowledged before the backend went away: ${docs.length} documents, ${accounts.length} accounts`
	);
	if (!docs.length || !accounts.length) {
		console.error('nothing was acknowledged; was the backend running?');
		process.exit(1);
	}
};

const verify = async () => {
	const { docs, accounts } = JSON.parse(fs.readFileSync(file, 'utf8'));

	const found = new Set();
	let pageToken = '';
	do {
		const page = await acknowledged(
			`${documents}/${COLLECTION}?pageSize=1000&mask.fieldPaths=seq&pageToken=${encodeURIComponent(
				pageToken
			)}`,
			{ headers: admin }
		);
		if (!page) throw new Error('could not read the documents back');
		for (const doc of page.documents ?? []) found.add(doc.name.split('/').pop());
		pageToken = page.nextPageToken ?? '';
	} while (pageToken);
	const lostDocs = docs.filter((name) => !found.has(name));

	const lostAccounts = [];
	for (let i = 0; i < accounts.length; i += 100) {
		const batch = accounts.slice(i, i + 100);
		const result = await acknowledged(
			`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
			{ method: 'POST', headers: admin, body: JSON.stringify({ localId: batch }) }
		);
		if (!result) throw new Error('could not read the accounts back');
		const present = new Set((result.users ?? []).map((user) => user.localId));
		lostAccounts.push(...batch.filter((id) => !present.has(id)));
	}

	console.log(
		`after the restart: ${docs.length - lostDocs.length}/${docs.length} documents, ` +
			`${accounts.length - lostAccounts.length}/${accounts.length} accounts`
	);
	if (lostDocs.length || lostAccounts.length) {
		console.error(
			`LOST ${lostDocs.length} acknowledged documents and ${lostAccounts.length} acknowledged accounts`
		);
		process.exit(1);
	}
};

if (mode === 'write' && file) await write();
else if (mode === 'verify' && file) await verify();
else {
	console.error('usage: acknowledged-writes.mjs write|verify <file>');
	process.exit(2);
}
