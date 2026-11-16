/**
 * Base URL of the AI service. With the local emulators and no explicit
 * VITE_API_AI, use the stub that docker-compose starts next to them.
 */
const aiBaseUrl = (): string => {
	const configured = import.meta.env.VITE_API_AI;
	if (configured) return configured;
	if (import.meta.env.VITE_USE_EMULATOR === 'true' && typeof window !== 'undefined') {
		return `${window.location.protocol}//${window.location.hostname}:8787`;
	}
	return '';
};

export const playTicTacToe = async (
	firstPlayer: string,
	board: string[][]
): Promise<any> => {
	try {
		const body = JSON.stringify({
			game: 'tictactoe',
			player: firstPlayer === 'user' ? 2 : 1,
			game_state: board.map((rows) => {
				return rows.map((i) => {
					if (i === 'Nil') return 0;
					if (i === 'Cross') return -1;
					return 1;
				});
			})
		});

		const resp = await fetch(aiBaseUrl() + '/play', {
			method: 'POST',
			body,
			headers: {
				'Content-Type': 'application/json; charset=UTF-8'
			}
		});

		if (!resp.ok) throw new Error(`AI service answered ${resp.status}`);
		const json = await resp.json();
		return [json.row - 1, json.col - 1];
	} catch (e) {
		console.log(e);
		return e;
	}
};

export const playChess = async (gameState: [[]]): Promise<any> => {
	try {
		const body = JSON.stringify({
			game: 'chess',
			player: 0,
			game_state: gameState
		});

		const resp = await fetch(aiBaseUrl() + '/play', {
			method: 'POST',
			body,
			headers: {
				'Content-Type': 'application/json; charset=UTF-8'
			}
		});

		const json = await resp.json();
		console.log(json);
		return json;
	} catch (e) {
		console.log(e);
		return e;
	}
};
