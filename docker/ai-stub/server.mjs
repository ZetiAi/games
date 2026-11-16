// Local stand-in for the AI service the app calls at `${VITE_API_AI}/play`.
//
// The real service is not part of this repository. This stub implements the
// tic-tac-toe request the UI actually sends, so the game is playable locally:
//
//   POST /play  { game: 'tictactoe', player: 1 | 2, game_state: number[3][3] }
//   -> 200      { row: 1..3, col: 1..3 }
//
// In `game_state`, 0 is an empty cell, -1 a cross and 1 a nought. `player` is
// 1 when the AI moved first and 2 when the human did; the first mover always
// plays crosses.
import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);

const LINES = [
	[
		[0, 0],
		[0, 1],
		[0, 2]
	],
	[
		[1, 0],
		[1, 1],
		[1, 2]
	],
	[
		[2, 0],
		[2, 1],
		[2, 2]
	],
	[
		[0, 0],
		[1, 0],
		[2, 0]
	],
	[
		[0, 1],
		[1, 1],
		[2, 1]
	],
	[
		[0, 2],
		[1, 2],
		[2, 2]
	],
	[
		[0, 0],
		[1, 1],
		[2, 2]
	],
	[
		[0, 2],
		[1, 1],
		[2, 0]
	]
];

const winnerOf = (board) => {
	for (const line of LINES) {
		const [a, b, c] = line.map(([i, j]) => board[i][j]);
		if (a !== 0 && a === b && b === c) return a;
	}
	return 0;
};

const emptyCells = (board) => {
	const cells = [];
	for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[i][j] === 0) cells.push([i, j]);
	return cells;
};

// Plain minimax; the board is tiny. Returns the score from `me`'s point of view.
const minimax = (board, mark, me, depth) => {
	const winner = winnerOf(board);
	if (winner !== 0) return winner === me ? 10 - depth : depth - 10;
	const cells = emptyCells(board);
	if (cells.length === 0) return 0;

	let best = mark === me ? -Infinity : Infinity;
	for (const [i, j] of cells) {
		board[i][j] = mark;
		const score = minimax(board, -mark, me, depth + 1);
		board[i][j] = 0;
		best = mark === me ? Math.max(best, score) : Math.min(best, score);
	}
	return best;
};

const bestTicTacToeMove = (board, player) => {
	const me = player === 1 ? -1 : 1;
	let best = null;
	let bestScore = -Infinity;
	for (const [i, j] of emptyCells(board)) {
		board[i][j] = me;
		const score = minimax(board, -me, me, 1);
		board[i][j] = 0;
		if (score > bestScore) {
			bestScore = score;
			best = [i, j];
		}
	}
	return best;
};

const isBoard = (value) =>
	Array.isArray(value) &&
	value.length === 3 &&
	value.every(
		(row) =>
			Array.isArray(row) && row.length === 3 && row.every((cell) => [-1, 0, 1].includes(cell))
	);

const send = (res, status, body) => {
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=UTF-8',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	});
	res.end(body === undefined ? undefined : JSON.stringify(body));
};

const server = http.createServer((req, res) => {
	const { pathname } = new URL(req.url, 'http://localhost');

	if (req.method === 'OPTIONS') return send(res, 204);
	if (req.method === 'GET' && pathname === '/health') return send(res, 200, { status: 'ok' });
	if (req.method !== 'POST' || pathname !== '/play') return send(res, 404, { error: 'not found' });

	let raw = '';
	req.on('data', (chunk) => {
		raw += chunk;
		if (raw.length > 64 * 1024) req.destroy();
	});
	req.on('end', () => {
		let body;
		try {
			body = JSON.parse(raw);
		} catch {
			return send(res, 400, { error: 'body must be JSON' });
		}

		if (body.game !== 'tictactoe') {
			return send(res, 501, {
				error: `the local AI stub only plays tictactoe, not ${JSON.stringify(body.game)}`
			});
		}
		if (!isBoard(body.game_state) || ![1, 2].includes(body.player)) {
			return send(res, 400, { error: 'expected { player: 1 | 2, game_state: 3x3 of -1 | 0 | 1 }' });
		}

		const move = bestTicTacToeMove(body.game_state, body.player);
		if (!move) return send(res, 409, { error: 'the board is full' });
		send(res, 200, { row: move[0] + 1, col: move[1] + 1 });
	});
});

server.listen(PORT, '0.0.0.0', () => console.log(`[ai-stub] listening on :${PORT}`));
for (const signal of ['SIGTERM', 'SIGINT'])
	process.on(signal, () => server.close(() => process.exit(0)));
