// The Emulator UI ("dashboard") runs in the browser and connects to the
// emulators itself, using connection settings it gets from its server. Those
// settings must point at the address the dashboard was opened on, not at
// "this machine": for a second device, "this machine" is the wrong one.
//
// In the test environment the browser runs in its own container and reaches
// the dashboard by a network name, which is the same situation.
import { expect, test } from '@playwright/test';

const DASHBOARD = process.env.EMULATOR_UI_URL ?? '';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_URL ?? '';
const AUTH = process.env.AUTH_EMULATOR_URL ?? '';
const PROJECT = process.env.FIREBASE_PROJECT ?? 'demo-games';

test.skip(!DASHBOARD || !FIRESTORE || !AUTH, 'run through scripts/test-e2e.sh');

const isThisMachine = (host: string) => /^(ws )?(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);

test('opened from another device, the dashboard connects to the emulators and shows their data', async ({
	page,
	request
}) => {
	const dashboardHost = new URL(DASHBOARD).hostname;
	expect(isThisMachine(dashboardHost), 'the test must not reach the dashboard via localhost').toBe(
		false
	);

	// something to look at
	const greeting = `seen-from-another-device-${Date.now()}`;
	const email = `dashboard-${Date.now()}@example.test`;
	const document = await request.patch(
		`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/dashboardProbe/hello`,
		{
			headers: { Authorization: 'Bearer owner' },
			data: { fields: { greeting: { stringValue: greeting } } }
		}
	);
	expect(document.ok()).toBe(true);
	const account = await request.post(
		`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=dashboard-test`,
		{ data: { email, password: 'correct-horse-battery', returnSecureToken: true } }
	);
	expect(account.ok()).toBe(true);

	const contacted = new Set<string>();
	page.on('request', (r) => contacted.add(new URL(r.url()).host));
	page.on('websocket', (socket) => contacted.add(`ws ${new URL(socket.url()).host}`));

	await page.goto(`${DASHBOARD}/firestore/default/data/dashboardProbe/hello`);
	await expect(page.getByText(greeting)).toBeVisible();

	await page.goto(`${DASHBOARD}/auth`);
	await expect(page.getByText(email)).toBeVisible();

	// It talked to the emulators where the dashboard itself was found ...
	expect([...contacted]).toContain(`${dashboardHost}:${new URL(FIRESTORE).port}`);
	expect([...contacted]).toContain(`${dashboardHost}:${new URL(AUTH).port}`);
	// ... and never tried the machine the browser runs on.
	expect([...contacted].filter(isThisMachine)).toEqual([]);
});
