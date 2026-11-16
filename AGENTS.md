# Games

## Summary

Matthew's pet project: chess with friends and tic-tac-toe, built with SvelteKit and Rust WebAssembly.
Local app: http://localhost:5173. Firebase console: https://console.firebase.google.com/project/zeti-games/overview.
There is one cloud project, `zeti-games`; no QA environment (Matthew, 2026-11-15).
The website has not been deployed. The cloud database stays closed until player-specific rules are implemented and tested.

## Architecture

SvelteKit → Firebase Auth and Firestore; browser → bundled Rust chess/tic-tac-toe WebAssembly.
Local Docker Compose supplies Auth/Firestore emulators and a tic-tac-toe AI stand-in.
The external production AI service is not included in this repo.

## Folder structure

- `src/`: app, Firebase client, games and components.
- `packages/`: bundled WebAssembly engines.
- `docker/`: local services and browser-test images.
- `scripts/`, `tests/`: environment lifecycle and persistence tests.
- `static/`: images and WebAssembly assets.
- `contracts/`: old Solana experiment, unused by the app.
- `docs/`: agent notes and human HTML pages. Root docs are README.md, AGENTS.md and release-please's CHANGELOG.md, plus LICENSE.

## Install

Use Bun, pinned in `package.json`, and Docker Compose 2.24 or newer.
`bun install --frozen-lockfile`; `bun run node_modules/@sveltejs/kit/svelte-kit.js sync`.
Never use npm, pnpm or yarn. Docker images use Bun too.
Keep `cm-chessboard` pinned to 5.0.1 until the input handlers are migrated: later 5.x versions rename `moveStart`/`moveDone` and silently stop moves from working.

## Run

`docker compose up --build` starts http://localhost:5173 and the emulator UI on http://localhost:4000.
Firestore: 8080; Auth: 9099; AI stand-in: 8787. Ports bind to loopback by default.
Create a disposable account or choose Continue as guest. Stop with `docker compose stop` to preserve data.
`docker compose down --volumes` deliberately resets the local database.

## Test

`bun run test:e2e` builds an isolated `games-test` Compose stack, with no host ports, then tests gameplay,
the emulator dashboard, acknowledged writes during shutdown, and registered/guest recovery after
stop/start, down/up and forced termination. Never run it in the evaluation container.
`VITE_USE_EMULATOR=true bun run build` checks compilation; `bun run check` runs TypeScript/Svelte diagnostics.
`SKIP_BUILD=1 bun run test:e2e` reuses already-built test images after a local infrastructure interruption.
Browser scratch files use a 1 GiB temporary memory filesystem; persistent profiles and reports remain on `.e2e`.
Failure screenshots/traces live in `.e2e/results`. On macOS, run the test script outside the sandbox
when an old `.e2e` folder needs moving to the Trash.

## Deployment map

- Dev: local Docker Compose, `demo-games` emulator project, fake data only.
- Production: Firebase `zeti-games`, Spark/free plan, owned by `zetiapp@gmail.com`. No paid services or billing link.
- Web app ID: `1:669905884271:web:8bfdc9bbf8cb73ff6b699a`. Firestore `(default)` is in `us-central1` with deletion protection; email/password and anonymous Auth are enabled. Anonymous auto-cleanup is off to preserve guests.
- No QA project; this is a pet project. Production deployment still requires Matthew's explicit instruction.
- `firebase.json` and `firestore.rules` are local-only. Never deploy their permissive rules.
- Cloud configuration lives in `firebase.cloud.json`; its rules deny all client access until cloud gameplay authorization is ready.
- Release-please owns versions and releases. Never merge its release PRs without Matthew's word.

## Import provenance and credentials

Imported from evaluation lane `prework-PREWORK_oahxzn1z-ee3dd406755548e6830cd6c11479866c-model_a`,
`/exp/PREWORK_oahxzn1z/model_a`, at `ca95fee3220d83b44cb6965cd451a8ce03a79ded`.
Both tracked edits and 37 untracked source files were exported and verified before adapting this checkout.
The lane must remain untouched; the original patch, archive and SHA-256 manifest are outside this repo
at `~/Agents/codex/games-import/`.

Never run `firebase login:list --json`: it prints stored authentication tokens. Use project-list commands
to verify access. Never print, commit or copy CLI credential files or environment values.
