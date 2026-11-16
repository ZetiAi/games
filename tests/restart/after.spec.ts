// Second half of the stop/restart test: see tests/support/restart.ts.
// It can be run again after every further restart; each run plays one more
// move per side and records the new position for the next run.
import { expect, test } from '@playwright/test';
import {
	boardFen,
	chatMessages,
	fenAfter,
	gameCard,
	move,
	playerId,
	sendChat,
	signIn,
	turnBanner
} from '../support/app';
import {
	Browsers,
	CONTINUATION,
	loadState,
	returnToGames,
	saveState,
	STATE_DIR
} from '../support/restart';

test.skip(!STATE_DIR, 'run through scripts/test-e2e.sh, which restarts the environment');
// several browsers at once; leave room for a slow machine
test.setTimeout(10 * 60_000);
test.describe.configure({ mode: 'serial' });

let browsers: Browsers;

test.beforeEach(({ baseURL }) => {
	browsers = new Browsers(baseURL as string);
});

// Playwright requires the first argument to be an object pattern.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
	await browsers.closeAll(testInfo);
});

test('players resume their matches where they left them', async () => {
	const state = loadState();
	const { players } = state;

	for (const [index, match] of state.matches.entries()) {
		const whitePage = await browsers.open(match.white);
		const blackPage = await browsers.open(match.black);
		const position = fenAfter(match.moves);

		// One player is back within minutes, the other after a day; who is which
		// alternates between matches and from one restart to the next.
		const away = (state.resumed + index) % 2 === 0 ? ['minutes', 'a day'] : ['a day', 'minutes'];

		// Each player comes back in their own browser and is still who they were.
		for (const [name, page, opponent, list, after] of [
			[match.white, whitePage, match.black, 'their-turn', away[0]],
			[match.black, blackPage, match.white, 'your-turn', away[1]]
		] as const) {
			await returnToGames(page, after as 'minutes' | 'a day');
			expect(await playerId(page), `${name} is still signed in`).toBe(players[name].id);

			// the match is listed, under the right turn, and opens the same room
			const card = page.getByTestId(list).locator(gameCard(page, players[opponent].id));
			await expect(card).toHaveCount(1);
			await card.getByRole('link', { name: 'See game' }).click();
			await page.waitForURL(`**${match.room}`);

			// board, turn and chat are as they were
			await expect.poll(() => boardFen(page), `${name}'s board`).toBe(position);
			await expect(chatMessages(page)).toHaveCount(match.chat.length);
			for (const line of match.chat) {
				await expect(chatMessages(page).filter({ hasText: line.text })).toHaveCount(1);
			}
		}
		await expect(turnBanner(whitePage)).toContainText('Waiting for your opponent');
		await expect(turnBanner(blackPage)).toContainText('Your turn');

		// the pending draw offer is still pending, for the player it was made to
		await expect(blackPage.getByText('Your opponent offers a draw')).toBeVisible();
		await expect(blackPage.getByRole('button', { name: 'Accept draw' })).toBeVisible();
		await expect(whitePage.getByRole('button', { name: 'Offer draw' })).toBeVisible();
		await expect(whitePage.getByText('Your opponent offers a draw')).toHaveCount(0);

		// ... and the match simply goes on.
		await blackPage.getByRole('button', { name: 'Decline' }).click();
		await expect(blackPage.getByText('Your opponent offers a draw')).toHaveCount(0);

		const [blackMove, whiteMove] = CONTINUATION[state.resumed];
		for (const [page, uci] of [
			[blackPage, blackMove],
			[whitePage, whiteMove]
		] as const) {
			await expect(turnBanner(page)).toContainText('Your turn');
			await move(page, uci);
			match.moves.push(uci);
			await expect.poll(() => boardFen(whitePage)).toBe(fenAfter(match.moves));
			await expect.poll(() => boardFen(blackPage)).toBe(fenAfter(match.moves));
		}

		const line = { text: `still here after restart ${state.resumed + 1}, ${match.black}` };
		await sendChat(blackPage, line.text);
		match.chat.push(line);
		await expect(chatMessages(whitePage)).toHaveCount(match.chat.length);

		await whitePage.getByRole('button', { name: 'Offer draw' }).click();
		await expect(blackPage.getByText('Your opponent offers a draw')).toBeVisible();

		await browsers.close(match.white);
		await browsers.close(match.black);
	}

	state.resumed += 1;
	saveState(state);
});

test('a finished match keeps its result and the players keep their records', async () => {
	const { players, finished } = loadState();

	const winnerPage = await browsers.open(finished.winner);
	await returnToGames(winnerPage, 'minutes');
	await expect(winnerPage.getByTestId('record-wins')).toHaveText('1');
	await expect(winnerPage.getByTestId('record-losses')).toHaveText('0');

	const loserPage = await browsers.open(finished.loser);
	await returnToGames(loserPage, 'minutes');
	await expect(loserPage.getByTestId('record-losses')).toHaveText('1');
	await expect(loserPage.getByTestId('record-wins')).toHaveText('0');

	for (const [page, opponent] of [
		[winnerPage, finished.loser],
		[loserPage, finished.winner]
	] as const) {
		// a finished match is no longer in the list of games in progress
		const stillListed = page
			.locator(`[data-testid="game-card"][data-opponent="${players[opponent].id}"]`)
			.locator(`a[href="${finished.room}"]`);
		await expect(stillListed).toHaveCount(0);

		await page.goto(finished.room);
		await expect.poll(() => boardFen(page)).toBe(fenAfter(finished.moves));
		await expect(turnBanner(page)).toContainText(`${finished.winnerColor} wins`);
		await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
	}
});

test('a registered player can also sign in from a fresh browser', async ({ page }) => {
	const { players, matches } = loadState();
	const match = matches.find((m) => players[m.white].registered && players[m.black].registered);
	if (!match) throw new Error('no match between registered players in the saved state');

	// nothing is stored in this browser: the account itself must have survived
	await signIn(page, players[match.white].id, match.room);
	expect(await playerId(page)).toBe(players[match.white].id);
	await expect.poll(() => boardFen(page)).toBe(fenAfter(match.moves));
	await expect(chatMessages(page)).toHaveCount(match.chat.length);
});
