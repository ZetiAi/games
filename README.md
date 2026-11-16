# This is the UI For the games

This code is in the Svelte Kit framework.
The web assembly rust code is at https://github.com/ZetiAi/zarena

The backend is Firebase (Auth + Firestore). For local development and tests it
runs against the Firebase emulators, so no Firebase project is needed.

## Local environment

Requirements: Docker with Compose v2.24 or newer.

```sh
docker compose up --build
```

| What                        | Where                  |
| --------------------------- | ---------------------- |
| App (vite dev, live reload) | http://localhost:5173  |
| Firebase Emulator UI        | http://localhost:4000  |
| Firestore / Auth emulators  | localhost:8080 / :9099 |
| AI service stand-in         | http://localhost:8787  |

Stop with Ctrl-C (once; a second Ctrl-C kills the containers before they have
saved) or `docker compose stop`; start again with the same `docker compose up`. Edits under `src/` and `static/` reload live; after
changing `package.json` or a config file, run `docker compose up --build`.

### Playing a match with two players

1. Each player opens http://localhost:5173/login in their own browser profile
   (or a private window, or another device, see below) and either creates an
   account or picks **Continue as guest**.
2. The header shows the player's ID: the e-mail address, or a guest ID such as
   `guest-3fk29xqa`.
3. Player one: Games → Chess → **Invite a friend**, and enters the other
   player's ID.
4. Player two: Games → **Invites** → **Accept**. The match now shows up under
   **Games** for both; **See game** opens it. The match URL can be bookmarked.

To let someone join from another device on your network, start with
`BIND_ADDRESS=0.0.0.0 docker compose up --build` and open
`http://<your-ip>:5173`. The Emulator UI is then at `http://<your-ip>:4000`.
This also exposes the emulators, which have no access control, to that network.

### What is kept across a stop and restart

Everything lives in the Auth and Firestore emulators: accounts and guests,
invitations, matches (board, turn, castling rights, players and colours, draw
offers, result), chat messages and win/loss/draw records. The emulators keep
their data in memory, so `docker/firebase/entrypoint.sh` saves it to the
`firebase-data` Docker volume:

- on every normal stop (`docker compose stop`, `docker compose down`, Ctrl-C),
  and loads it again on the next start. Clients are disconnected before that
  save begins, so anything the backend acknowledged is in it: the emulators
  are only reachable through a small forwarder (`docker/firebase/gate.mjs`)
  that is opened once the saved state is loaded and closed before saving.
  Because the emulators therefore listen inside the container only, the
  forwarder also corrects the connection settings the Emulator UI hands to the
  browser, so that it connects to the address it was opened on;
- additionally every 60 seconds (`SNAPSHOT_INTERVAL_SECONDS`), so that a crash
  or a killed container loses at most the last minute of play.

Players stay signed in across a restart. A registered player can also sign in
again from any browser. A **guest** is recognised only by the sign-in their
browser stored, so a guest resumes in the same browser profile they played in.
Signing out as a guest, or clearing that browser's site data, gives up the
guest's matches for good; the app asks before a guest signs out.

Stock emulators would sign every player out on each restart (they invalidate
all earlier sign-ins when they load saved accounts), which a guest cannot
recover from. `docker/firebase/keep-sessions-on-import.mjs` patches that in the
emulator image and fails the image build if the patch no longer fits, e.g.
after changing `FIREBASE_TOOLS_VERSION` in `docker/firebase/Dockerfile`.

To start over with no accounts and no matches:

```sh
docker compose down --volumes
```

### Running the app outside Docker

```sh
docker compose up --build firebase ai   # just the backing services
cp .env.example .env
bun install                            # version pinned in package.json
bun run dev
```

## Tests

```sh
scripts/test-e2e.sh        # or: bun run test:e2e
```

This builds a separate, throw-away copy of the environment (Compose project
`games-test`, own data volume, no published ports, so it can run next to the
development environment) and runs the Playwright tests in `tests/` against a
production build of the app:

- `tests/app`: sign-in as guest and with an account, tic-tac-toe against the AI
  stand-in, a chess match played to checkmate.
- `tests/dashboard`: the Emulator UI, opened the way another device would
  open it, connects to the emulators and shows their data.
- `tests/shutdown`: documents and accounts are written continuously while the
  environment is stopped; every write that was acknowledged must still be
  there after the restart.
- `tests/restart`: registered players and guests start matches, the environment
  is stopped and started (`stop`/`start`, then `down`/`up`, then a hard kill),
  and after each restart every player reopens their own browser profile and
  must find the same board, turn, chat, pending draw offer and records, and be
  able to play on.

Screenshots and traces of failed tests are written to `.e2e/results`.

## Notes on what is local-only

- `docker/ai-stub` is a stand-in for the AI service behind `VITE_API_AI`, which
  is not in this repository. It answers the tic-tac-toe request the UI sends.
- `src/lib/i18n/en.json`, `windi.config.js` (brand colours) and the placeholder
  images in `static/svg` and `static/assets` replace texts, theme and artwork
  that are not in this repository.
- `firestore.rules` only requires a signed-in user. It is meant for the
  emulator, not for a deployed project.
- `contracts/` (the Solana program) is not used by the UI and is not part of
  this environment.

## Firebase project

The single cloud project is [Games](https://console.firebase.google.com/project/zeti-games/overview) (`zeti-games`, free Spark plan). There is no QA environment. The web app is registered; the website has not been deployed.

Local Docker uses `demo-games` and the permissive emulator rules in `firebase.json`. Cloud configuration is separate in `firebase.cloud.json` and denies client database access while player-specific authorization is prepared. Never deploy the local emulator rules to the cloud project.
