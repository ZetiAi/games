import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery';

/** The id other players use to invite this player (e-mail or guest ID). */
export const playerId = async (page: Page): Promise<string> => {
	const id = page.getByTestId('player-id');
	await expect(id).toBeVisible();
	return (await id.innerText()).trim();
};

export const createAccount = async (page: Page, email: string): Promise<string> => {
	await page.goto('/login');
	await page.getByLabel('E-mail').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.waitForURL('**/games');
	return playerId(page);
};

export const signIn = async (page: Page, email: string, next = ''): Promise<void> => {
	await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
	await page.getByLabel('E-mail').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL(`**${next || '/games'}`);
};

export const continueAsGuest = async (page: Page): Promise<string> => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Continue as guest' }).click();
	await page.waitForURL('**/games');
	const id = await playerId(page);
	expect(id).toMatch(/^guest-[a-z0-9]{8}$/);
	return id;
};

/** Sends a chess invitation from `page`'s player to `opponent`. */
export const invite = async (page: Page, opponent: string): Promise<void> => {
	await page.goto('/games/chess');
	await page.getByRole('button', { name: 'Invite a friend' }).click();
	await page.getByPlaceholder(/friend@email\.com/).fill(opponent);
	await page.getByRole('button', { name: 'Send invitation' }).click();
	await expect(page.getByText('invitation sent')).toBeVisible();
};

/** Accepts the invitation from `from` and returns the path of the new match. */
export const acceptInvitation = async (page: Page, from: string): Promise<string> => {
	await page.goto('/games');
	await page.getByTestId('tab-invites').click();
	const invitation = page.locator(`[data-testid="invitation"][data-from="${from}"]`);
	await invitation.getByRole('button', { name: 'Accept' }).click();
	await expect(invitation).toHaveCount(0);

	await page.getByTestId('tab-games').click();
	const href = await gameCard(page, from)
		.getByRole('link', { name: 'See game' })
		.getAttribute('href');
	expect(href).toMatch(/^\/games\/chess\/\w+$/);
	return href as string;
};

/** The entry for the match against `opponent` in the "Games" tab. */
export const gameCard = (page: Page, opponent: string) =>
	page.locator(`[data-testid="game-card"][data-opponent="${opponent}"]`);

const board = (page: Page) => page.locator('#board');

/** Piece placement as shown on the board, in FEN notation. */
export const boardFen = async (page: Page): Promise<string> => {
	const pieces = await board(page)
		.locator('g[data-piece][data-square]')
		.evaluateAll((nodes) =>
			nodes.map((node) => [node.getAttribute('data-square'), node.getAttribute('data-piece')])
		);
	return toFen(Object.fromEntries(pieces));
};

/**
 * Where an element of the board is on screen, once it has stopped moving. The
 * board redraws itself whenever the match changes, so a single reading may
 * catch an element that is about to be replaced.
 */
const settledBox = async (page: Page, selector: string) => {
	let previous: { x: number; y: number } | null = null;
	for (let attempt = 0; attempt < 100; attempt++) {
		const box = await board(page)
			.locator(selector)
			.boundingBox({ timeout: 1000 })
			.catch(() => null);
		if (box && previous && box.x === previous.x && box.y === previous.y) return box;
		previous = box;
		await page.waitForTimeout(100);
	}
	throw new Error(`${selector} never settled on the board`);
};

/** Drags the piece on `from` to `to`, the way a player does. */
export const move = async (page: Page, uci: string): Promise<void> => {
	const from = uci.slice(0, 2);
	const to = uci.slice(2, 4);
	const piece = `g[data-piece][data-square="${from}"]`;

	// A redraw in the middle of a drag drops the piece back; a player would
	// simply drag it again.
	for (let attempt = 1; ; attempt++) {
		const source = await settledBox(page, piece);
		const target = await settledBox(page, `rect.square[data-square="${to}"]`);

		await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
		await page.mouse.down();
		await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
		await page.mouse.up();

		try {
			await expect(board(page).locator(piece)).toHaveCount(0, { timeout: 3000 });
			return;
		} catch (err) {
			if (attempt === 3) throw new Error(`the move ${uci} was not accepted by the board`);
		}
	}
};

export const turnBanner = (page: Page) => page.getByTestId('turn-banner');

export const sendChat = async (page: Page, text: string): Promise<void> => {
	const input = page.getByPlaceholder('Escribe un mensaje...');
	await input.fill(text);
	await input.press('Enter');
	await expect(chatMessages(page).filter({ hasText: text })).toHaveCount(1);
};

export const chatMessages = (page: Page) => page.getByTestId('chat-message');

// ---- a tiny board model, enough to know what position to expect ----------

type Position = Record<string, string>;

const START: Position = (() => {
	const position: Position = {};
	const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
	'abcdefgh'.split('').forEach((file, i) => {
		position[`${file}1`] = `w${back[i]}`;
		position[`${file}2`] = 'wp';
		position[`${file}7`] = 'bp';
		position[`${file}8`] = `b${back[i]}`;
	});
	return position;
})();

const toFen = (position: Position): string => {
	const ranks: string[] = [];
	for (let rank = 8; rank >= 1; rank--) {
		let row = '';
		let empty = 0;
		for (const file of 'abcdefgh') {
			const piece = position[`${file}${rank}`];
			if (!piece) {
				empty++;
				continue;
			}
			if (empty) row += empty;
			empty = 0;
			row += piece[0] === 'w' ? piece[1].toUpperCase() : piece[1];
		}
		ranks.push(row + (empty || ''));
	}
	return ranks.join('/');
};

/** Position after playing `moves` (plain moves and captures only) from the start. */
export const fenAfter = (moves: string[]): string => {
	const position = { ...START };
	for (const uci of moves) {
		position[uci.slice(2, 4)] = position[uci.slice(0, 2)];
		delete position[uci.slice(0, 2)];
	}
	return toFen(position);
};
