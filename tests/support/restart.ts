// Shared by the two halves of the stop/restart test (tests/restart/*.spec.ts).
//
// "before" creates players and matches and writes down what it left behind;
// scripts/test-e2e.sh then stops and starts the whole environment; "after"
// reopens each player's browser profile and checks nothing was lost.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

export const STATE_DIR = process.env.E2E_STATE_DIR ?? '';

export interface PlayerState {
	/** e-mail for registered players, guest ID for guests */
	id: string;
	registered: boolean;
}

export interface ChatLine {
	text: string;
}

export interface MatchState {
	room: string;
	white: string;
	black: string;
	moves: string[];
	chat: ChatLine[];
}

export interface FinishedMatchState {
	room: string;
	winner: string;
	loser: string;
	winnerColor: 'White' | 'Black';
	moves: string[];
}

export interface State {
	/** how many times the matches have been resumed after a restart */
	resumed: number;
	players: Record<string, PlayerState>;
	matches: MatchState[];
	finished: FinishedMatchState;
}

const stateFile = () => path.join(STATE_DIR, 'state.json');

export const loadState = (): State => JSON.parse(fs.readFileSync(stateFile(), 'utf8'));

export const saveState = (state: State): void =>
	fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));

export const resetState = (): void => {
	fs.rmSync(path.join(STATE_DIR, 'profiles'), { recursive: true, force: true });
	fs.rmSync(stateFile(), { force: true });
};

/** Every match starts with these; black is to move afterwards. */
export const OPENING = ['e2e4', 'e7e5', 'g1f3'];

/** One [black, white] pair is played each time the matches are resumed. */
export const CONTINUATION: [string, string][] = [
	['b8c6', 'f1c4'],
	['f8c5', 'c2c3'],
	['g8f6', 'd2d3'],
	['d7d6', 'b1d2'],
	['a7a6', 'a2a4'],
	['h7h6', 'h2h3']
];

/**
 * A player's own browser: a profile directory that is kept between the two
 * halves of the test, exactly like a real browser keeps its storage. For a
 * guest this profile is the only thing that identifies them.
 */
export class Browsers {
	private contexts = new Map<string, BrowserContext>();

	constructor(private baseURL: string) {}

	async open(player: string): Promise<Page> {
		const existing = this.contexts.get(player);
		if (existing) return existing.pages()[0];

		const context = await chromium.launchPersistentContext(
			path.join(STATE_DIR, 'profiles', player),
			{ baseURL: this.baseURL, viewport: { width: 1200, height: 900 } }
		);
		this.contexts.set(player, context);
		return context.pages()[0] ?? (await context.newPage());
	}

	async close(player: string): Promise<void> {
		await this.contexts.get(player)?.close();
		this.contexts.delete(player);
	}

	/** Closes every browser; on failure, attaches what each player was looking at. */
	async closeAll(testInfo: TestInfo): Promise<void> {
		for (const [player, context] of this.contexts) {
			if (testInfo.status !== testInfo.expectedStatus) {
				for (const page of context.pages()) {
					const body = await page.screenshot().catch(() => undefined);
					if (body) await testInfo.attach(`${player}.png`, { body, contentType: 'image/png' });
				}
			}
			await context.close();
		}
		this.contexts.clear();
	}
}

/**
 * Makes the sign-in saved in this browser look as old as it would be for a
 * player who comes back the next day: the short-lived ID token is expired, so
 * the app has to exchange the stored refresh token with the Auth service. That
 * only works if the account itself survived the restart.
 */
export const expireSavedSignIn = async (page: Page): Promise<void> => {
	// A static file of the app: same browser storage, but the app is not
	// running and cannot write the sign-in back while it is being edited.
	await page.goto('/robots.txt');
	const expired = await page.evaluate(
		() =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open('firebaseLocalStorageDb');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction('firebaseLocalStorage', 'readwrite');
					const store = tx.objectStore('firebaseLocalStorage');
					let count = 0;
					const all = store.getAll();
					all.onsuccess = () => {
						for (const entry of all.result) {
							if (entry?.value?.stsTokenManager) {
								entry.value.stsTokenManager.expirationTime = 0;
								store.put(entry);
								count++;
							}
						}
					};
					tx.oncomplete = () => {
						db.close();
						resolve(count);
					};
					tx.onerror = () => reject(tx.error);
				};
			})
	);
	expect(expired, 'a saved sign-in in this browser profile').toBe(1);
};

/**
 * The player comes back to /games in their own browser.
 *
 * `after` says how long they stayed away:
 * - 'minutes': the ID token stored in the browser is still fresh, so the app
 *   presents it as is. It was issued before the restart and must still be
 *   accepted.
 * - 'a day': the stored ID token has expired and has to be renewed.
 */
export const returnToGames = async (page: Page, after: 'minutes' | 'a day'): Promise<void> => {
	if (after === 'minutes') {
		await page.goto('/games');
		return;
	}
	await expireSavedSignIn(page);
	const renewal = page.waitForResponse((response) => response.url().includes('/v1/token'));
	await page.goto('/games');
	expect((await renewal).status(), 'renewing the saved sign-in').toBe(200);
};
