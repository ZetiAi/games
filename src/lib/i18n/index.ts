/**
 * Minimal stand-in for the translation layer the components were written
 * against (`$_('some.key', { values })` and `$lang`, as in
 * svelte-intl-precompile). The original locale files are not part of this
 * repository, so the English strings in ./en.json were written for local
 * development.
 */
import { derived, writable } from 'svelte/store';
import en from './en.json';

type Messages = { [key: string]: string | Messages };
type FormatOptions = { values?: Record<string, string | number> };

const dictionaries: Record<string, Messages> = { en };

export const lang = writable('en');

const lookup = (messages: Messages, key: string): string | undefined => {
	let node: string | Messages | undefined = messages;
	for (const part of key.split('.')) {
		if (typeof node !== 'object') return undefined;
		node = node[part];
	}
	return typeof node === 'string' ? node : undefined;
};

export const _ = derived(lang, ($lang) => (key: string, options: FormatOptions = {}): string => {
	const message = lookup(dictionaries[$lang] ?? en, key) ?? lookup(en, key);
	if (message === undefined) return key;
	return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
		options.values && name in options.values ? String(options.values[name]) : placeholder
	);
});
