import type { PlaywrightTestConfig } from '@playwright/test';

// BASE_URL is set when the app is already being served (scripts/test-e2e.sh).
// Without it, Playwright builds and previews the app itself; the emulators from
// `docker compose up` must be running and .env must set VITE_USE_EMULATOR=true.
const baseURL = process.env.BASE_URL;

const config: PlaywrightTestConfig = {
	testDir: 'tests',
	outputDir: process.env.E2E_OUTPUT_DIR ?? 'test-results',
	// The tests share one set of emulators and build on each other's data.
	workers: 1,
	fullyParallel: false,
	timeout: 180_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	use: {
		baseURL: baseURL ?? 'http://localhost:4173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'app', testMatch: 'app/*.spec.ts' },
		{ name: 'dashboard', testMatch: 'dashboard/*.spec.ts' },
		// The two halves of the stop/restart test. scripts/test-e2e.sh stops and
		// starts the environment between them.
		{ name: 'before-restart', testMatch: 'restart/before.spec.ts' },
		{ name: 'after-restart', testMatch: 'restart/after.spec.ts' }
	],
	webServer: baseURL
		? undefined
		: {
				command: 'bun run build && bun run preview',
				port: 4173,
				reuseExistingServer: true
		  }
};

export default config;
