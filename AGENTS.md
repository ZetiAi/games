# games

The web UI for the games: a SvelteKit app (pre-1.0 SvelteKit, Svelte 3, TypeScript) with Firebase
as the backend. The Rust game engines are built to WebAssembly in ZetiAi/zarena; `packages/chess`
and `packages/rustytac` hold that generated JavaScript glue and `.wasm`, and the build copies the
`.wasm` files into `static/` (`packages/copyWasm.cjs`). `contracts/` holds the Solana (Anchor)
contracts, with their own tooling.

## Commands

Bun only (never npm, pnpm or yarn), from the repo root.

```sh
bun install
bun run lint      # Biome format + lint check, then the TODO(#123) check
bun run format    # apply Biome's formatting and safe fixes
bun run check     # svelte-check (the type check)
bun run build
```

## Lint and format

- **Biome is the one formatter and linter, and `bun run lint` must pass:** `biome ci
  --error-on-warnings .` over every TypeScript, JavaScript, Svelte, JSON and CSS file, then
  `scripts/check-todos.sh` (every `TODO` or `FIXME` is written `TODO(#123)` with its issue). There
  is no ESLint and no Prettier: do not add them.
- The setup is the suite's standard (`~/Projects/code-style.md`): `biome.jsonc` (tabs, single
  quotes, 100 columns, no trailing commas; the strict rules as errors: unhandled promises, nullable
  conditions, missing switch cases, written types, no unexplained numbers, no `any`, small flat
  functions) and two plugin rules in `lint/` (no one-letter names except `i j a b x y`, nothing
  nested deeper than 3). New code passes as written.
- `biome-baseline.jsonc` lists, per rule, the files that had findings on 2026-11-17 (332). It only
  shrinks: delete a file's line, run `bun run lint`, fix what it reports. Never add a file to it.
  Burn-down: issue #11. TODOs that had no issue: #12.
- Left out of Biome: `contracts/` and the generated wasm glue in `packages/chess` and
  `packages/rustytac`.
- In `.svelte` files `noUndeclaredVariables` and `noInvalidUseBeforeDeclaration` are off: Svelte 3's
  `$: name = ...` declares without `let`. svelte-check still reports a name that is really undeclared.
- **What Biome 2.6.4 does not do, so take care by hand:** it does not format `.svelte` files (its
  markup formatter changes the page, so it is off; the linter still reads them), its type-reading
  rules do not run inside a `.svelte` `<script>`, and it does not flag untyped JSON (`JSON.parse`,
  `response.json()`).
- The hook is `.githooks/pre-push` (`bun run lint`; it never rewrites files). `bun install` sets
  `git config core.hooksPath .githooks` through the `prepare` script; run that once yourself if you
  install with `--ignore-scripts`.

## Known state (2026-11-17)

- `svelte-check` reports 432 errors, 28 warnings and 24 hints on master, so it is not in the hook.
- With Bun, `bun run build` fails on master: there is no `bun.lock`, and the `next` tags of
  `@sveltejs/kit` and `@sveltejs/adapter-auto` now resolve to SvelteKit 3 prereleases. The old
  `pnpm-lock.yaml` held the versions that worked. Pinning them (and moving to `bun.lock`) is open in
  PR #2.
