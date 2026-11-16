import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	acceptInvitation,
	boardFen,
	continueAsGuest,
	createAccount,
	fenAfter,
	gameCard,
	invite,
	move,
	playerId,
	signIn,
	turnBanner
} from '../support/app';

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const newPlayerPage = async (browser: Browser): Promise<Page> => {
	const context = await browser.newContext();
	return context.newPage();
};

test('home page lists the games', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Tic Tac Toe')).toBeVisible();
	await expect(page.getByText('Chess', { exact: true })).toBeVisible();
});

test('tic-tac-toe is playable against the local AI service', async ({ page }) => {
	const aiAnswer = page.waitForResponse(
		(response) => response.url().endsWith('/play') && response.request().method() === 'POST'
	);
	await page.goto('/games/gato');

	const cells = page.locator('#game_board button');
	await expect(cells).toHaveCount(9);
	await expect(page.getByText('Your turn')).toBeVisible();

	// Whoever starts, after our first move the AI has answered at least once.
	await cells.and(page.locator(':not(.cross):not(.nought)')).first().click();
	expect((await aiAnswer).status()).toBe(200);
	await expect
		.poll(() => page.locator('#game_board button.cross, #game_board button.nought').count())
		.toBeGreaterThanOrEqual(2);
});

test('a guest keeps the same identity across page loads and is warned before signing out', async ({
	page
}) => {
	const guest = await continueAsGuest(page);

	await page.reload();
	expect(await playerId(page)).toBe(guest);

	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('cannot be recovered');
	await page.getByRole('button', { name: 'Stay' }).click();
	expect(await playerId(page)).toBe(guest);
});

test('a registered player can sign out and back in', async ({ page }) => {
	const email = `player-${unique()}@example.test`;
	expect(await createAccount(page, email)).toBe(email);

	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();

	await signIn(page, email);
	expect(await playerId(page)).toBe(email);
});

test('a match link asks a signed-out visitor to sign in and then opens the match', async ({
	browser
}) => {
	const host = await newPlayerPage(browser);
	const friend = await newPlayerPage(browser);
	const hostEmail = `host-${unique()}@example.test`;
	await createAccount(host, hostEmail);
	const friendId = await continueAsGuest(friend);
	await invite(host, friendId);
	const room = await acceptInvitation(friend, hostEmail);

	const visitor = await newPlayerPage(browser);
	await visitor.goto(room);
	await expect(visitor.getByText('Sign in to open this match.')).toBeVisible();
	await signIn(visitor, hostEmail, room);
	await expect.poll(() => boardFen(visitor)).toBe(fenAfter([]));
});

test('checkmate ends the match and is counted for both players', async ({ browser }) => {
	const a = await newPlayerPage(browser);
	const b = await newPlayerPage(browser);
	const aId = await continueAsGuest(a);
	const bId = await continueAsGuest(b);
	await invite(a, bId);
	const room = await acceptInvitation(b, aId);
	await a.goto(room);
	await b.goto(room);

	// Colours are assigned at random when the invitation is accepted.
	await expect(turnBanner(a)).toHaveText(/Your turn|Waiting for your opponent/);
	const aIsWhite = (await turnBanner(a).innerText()).includes('Your turn');
	const [white, black] = aIsWhite ? [a, b] : [b, a];
	const [whiteId, blackId] = aIsWhite ? [aId, bId] : [bId, aId];

	// Fool's mate: black mates white.
	const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
	for (let ply = 0; ply < moves.length; ply++) {
		const mover = ply % 2 === 0 ? white : black;
		await expect(turnBanner(mover)).toContainText('Your turn');
		await move(mover, moves[ply]);
		const expected = fenAfter(moves.slice(0, ply + 1));
		await expect.poll(() => boardFen(white)).toBe(expected);
		await expect.poll(() => boardFen(black)).toBe(expected);
	}

	await expect(turnBanner(white)).toContainText('Black wins');
	await expect(turnBanner(black)).toContainText('Black wins');

	await black.goto('/games');
	await expect(black.getByTestId('record-wins')).toHaveText('1');
	await expect(black.getByTestId('record-losses')).toHaveText('0');
	await expect(gameCard(black, whiteId)).toHaveCount(0);

	await white.goto('/games');
	await expect(white.getByTestId('record-losses')).toHaveText('1');
	await expect(white.getByTestId('record-wins')).toHaveText('0');
	await expect(gameCard(white, blackId)).toHaveCount(0);
});
