import type { PlayerRecord } from '$lib/types/playground_interfaces';

/**
 * The profile stored at `users/{id}`.
 *
 * The rest of the data model (invitations, game rooms) identifies a player by
 * `email`. A guest has no e-mail address, so for guests this field holds their
 * generated guest ID (e.g. `guest-3fk29xqa`) instead.
 */
export interface User {
	id: string;
	email: string;
	displayName: string;
	photoURL: string;
	isGuest: boolean;
	gameRecord: PlayerRecord;
}
