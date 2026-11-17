# This is the UI For the games 

This code is in the Svelte Kit framework. 
The web assembly rust code is at https://github.com/ZetiAi/zarena 

Currently the code works with Firebase as the backend. Although will require adding Firebase boilerplate to work. 

## Lint and format

`bun run lint` (Biome and the TODO check) and `bun run format`. The pre-push hook is in `.githooks/`; `bun install` turns it on, or run `git config core.hooksPath .githooks` once. Details in `AGENTS.md`.
