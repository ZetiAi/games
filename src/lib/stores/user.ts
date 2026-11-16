import { writable } from 'svelte/store';
import type { User } from '$lib/types/user_interfaces';

const { subscribe, set } = writable<User | null>(null);

/** The signed-in player (registered or guest), or `null` when signed out. */
export const user = {
	subscribe,
	setUser: (value: User | null) => set(value)
};

/**
 * `false` until Firebase has reported the initial sign-in state. A returning
 * player is restored from the browser asynchronously, so pages wait for this
 * before deciding that nobody is signed in.
 */
export const authReady = writable(false);
