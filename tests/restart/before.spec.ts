// First half of the stop/restart test: see tests/support/restart.ts.
import { expect, test } from '@playwright/test';
import {
	acceptInvitation,
	boardFen,
	chatMessages,
	continueAsGuest,
	createAccount,
	fenAfter,
	invite,
	move,
	sendChat,
	turnBanner
} from '../support/app';
import {
	Browsers,
	OPENING,
	resetState,
	saveState,
	STATE_DIR,
	type FinishedMatchState,
	type MatchState,
	type PlayerState
} from '../support/restart';

test.skip(!STATE_DIR, 'run through scripts/test-e2e.sh, which restarts the environment');
// several browsers at once; leave room for a slow machine
test.setTimeout(10 * 60_000);

let browsers: Browsers;

test.beforeEach(({ baseURL }) => {
	browsers = new Browsers(baseURL as string);
});

// Playwright requires the first argument to be an object pattern.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
	await browsers.closeAll(testInfo);
});

/** `inviter` invites `invitee`; returns the room and who got which colour. */
const startMatch = async (
	inviter: string,
	invitee: string,
	players: Record<string, PlayerState>
) => {
	const inviterPage = await browsers.open(inviter);
	const inviteePage = await browsers.open(invitee);

	await invite(inviterPage, players[invitee].id);
	const room = await acceptInvitation(inviteePage, players[inviter].id);
	await inviterPage.goto(room);
	await inviteePage.goto(room);

	// colours are assigned at random when the invitation is accepted
	await expect(turnBanner(inviterPage)).toHaveText(/Your turn|Waiting for your opponent/);
	const inviterIsWhite = (await turnBanner(inviterPage).innerText()).includes('Your turn');
	const [white, black] = inviterIsWhite ? [inviter, invitee] : [invitee, inviter];
	return { room, white, black };
};

const play = async (match: { white: string; black: string }, moves: string[], from = 0) => {
	const whitePage = await browsers.open(match.white);
	const blackPage = await browsers.open(match.black);
	for (let ply = from; ply < moves.length; ply++) {
		const mover = ply % 2 === 0 ? whitePage : blackPage;
		await expect(turnBanner(mover)).toContainText('Your turn');
		await move(mover, moves[ply]);
		const expected = fenAfter(moves.slice(0, ply + 1));
		await expect.poll(() => boardFen(whitePage)).toBe(expected);
		await expect.poll(() => boardFen(blackPage)).toBe(expected);
	}
};

test('registered players and guests start matches', async () => {
	resetState();

	const players: Record<string, PlayerState> = {};
	for (const name of ['alice', 'bob']) {
		const id = await createAccount(await browsers.open(name), `${name}@example.test`);
		players[name] = { id, registered: true };
	}
	for (const name of ['gina', 'gus']) {
		const id = await continueAsGuest(await browsers.open(name));
		players[name] = { id, registered: false };
	}

	// Two matches that stay in progress: registered v registered, guest v guest.
	const matches: MatchState[] = [];
	for (const [inviter, invitee] of [
		['alice', 'bob'],
		['gina', 'gus']
	]) {
		const match = await startMatch(inviter, invitee, players);
		await play(match, OPENING);

		const whitePage = await browsers.open(match.white);
		const blackPage = await browsers.open(match.black);
		const chat = [
			{ text: `good luck from ${match.white}` },
			{ text: `have fun, says ${match.black}` }
		];
		await sendChat(whitePage, chat[0].text);
		await sendChat(blackPage, chat[1].text);
		await expect(chatMessages(whitePage)).toHaveCount(2);

		// leave a draw offer pending: it is part of the match too
		await whitePage.getByRole('button', { name: 'Offer draw' }).click();
		await expect(blackPage.getByText('Your opponent offers a draw')).toBeVisible();

		matches.push({ ...match, moves: [...OPENING], chat });
	}

	// One match that is over: registered v guest, the guest resigns.
	const finishedMoves = ['e2e4', 'e7e5'];
	const over = await startMatch('alice', 'gina', players);
	await play(over, finishedMoves);
	const ginaPage = await browsers.open('gina');
	await ginaPage.getByRole('button', { name: 'Resign' }).click();
	const winnerColor = over.white === 'alice' ? 'White' : 'Black';
	await expect(turnBanner(ginaPage)).toContainText(`${winnerColor} wins`);
	await expect(turnBanner(await browsers.open('alice'))).toContainText(`${winnerColor} wins`);
	const finished: FinishedMatchState = {
		room: over.room,
		winner: 'alice',
		loser: 'gina',
		winnerColor,
		moves: finishedMoves
	};

	saveState({ resumed: 0, players, matches, finished });
});
