import { defineConfig } from 'windicss/helpers';

// The components use Windi CSS utility classes. The original theme is not in
// this repository; the brand colours below are placeholders chosen so the UI
// is usable locally.
export default defineConfig({
	darkMode: 'class',
	extract: {
		include: ['src/**/*.{html,svelte,ts,js}']
	},
	theme: {
		extend: {
			colors: {
				brand: {
					primary: '#f97316',
					secondary: '#2563eb',
					enter: '#ea580c'
				},
				'cyber-blue': {
					500: '#06b6d4'
				},
				solana: {
					green: '#00ffa3',
					blue: '#03e1ff',
					purple: '#dc1fff'
				}
			}
		}
	}
});
