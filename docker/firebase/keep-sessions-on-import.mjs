// Build-time patch for the Auth emulator, applied by the Dockerfile.
//
// Problem: when the emulator imports saved accounts on start, it stamps every
// account with `validSince = now`. ID tokens issued before the restart are
// then rejected with TOKEN_EXPIRED, and the Firebase web SDK reacts to that by
// signing the player out and deleting the sign-in stored in the browser. A
// registered player would have to log in again; a guest (an anonymous account
// that only that stored sign-in can reach) would lose their matches for good.
//
// Fix: restore `validSince` exactly as it was exported, so an account comes
// back from a restart the way it went in.
//
// The patch refuses to apply if the emulator code no longer looks as expected,
// which fails the image build instead of silently bringing the problem back.
// When that happens after bumping FIREBASE_TOOLS_VERSION, check how
// `batchCreate` in lib/emulator/auth/operations.js sets `validSince`.
import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('Pass the installed Auth emulator operations.js path');

const original = 'fields.validSince = (0, utils_1.toUnixTimestamp)(uploadTime).toString();';
const patched =
	'fields.validSince = userInfo.validSince; /* patched: docker/firebase/keep-sessions-on-import.mjs */';

const source = fs.readFileSync(file, 'utf8');
const occurrences = source.split(original).length - 1;
if (occurrences !== 1) {
	console.error(
		`keep-sessions-on-import: expected exactly one "${original}" in ${file}, found ${occurrences}.`
	);
	process.exit(1);
}

fs.writeFileSync(file, source.replace(original, patched));
console.log(`keep-sessions-on-import: patched ${file}`);
