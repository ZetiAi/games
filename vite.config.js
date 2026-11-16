import { sveltekit } from '@sveltejs/kit/vite';
import WindiCSS from 'vite-plugin-windicss';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [WindiCSS(), sveltekit()],
	ssr: {
		noExternal: ['@fortawesome/free-regular-svg-icons', '@fortawesome/free-solid-svg-icons']
	}
};

export default config;
