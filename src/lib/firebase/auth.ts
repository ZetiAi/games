import {
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	signInAnonymously,
	signInWithEmailAndPassword,
	signOut,
	type User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { Firebase } from '$lib/firebase/init';
import { authReady, user } from '$lib/stores/user';
import type { User } from '$lib/types/user_interfaces';

/** The ID other players use to invite a guest, derived from their account. */
export const guestIdFor = (uid: string): string => `guest-${uid.slice(0, 8).toLowerCase()}`;

export const normalizePlayerId = (value: string): string => value.trim().toLowerCase();

/**
 * Loads the player's profile, creating it on first sign-in. The profile is what
 * makes a player (including a guest) findable for invitations.
 */
const ensureUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
	const db = Firebase.getInstance().getFirestore();
	const userRef = doc(db, `users/${firebaseUser.uid}`);
	const snapshot = await getDoc(userRef);

	if (snapshot.exists()) {
		const data = snapshot.data();
		return {
			id: firebaseUser.uid,
			email: data.email,
			displayName: data.displayName ?? data.email,
			photoURL: data.photoURL ?? 'no-image',
			isGuest: data.isGuest ?? firebaseUser.isAnonymous,
			gameRecord: data.gameRecord ?? { wins: 0, losses: 0, draws: 0 }
		};
	}

	const email = firebaseUser.isAnonymous
		? guestIdFor(firebaseUser.uid)
		: normalizePlayerId(firebaseUser.email ?? firebaseUser.uid);

	const profile: User = {
		id: firebaseUser.uid,
		email,
		displayName: firebaseUser.displayName ?? email,
		photoURL: firebaseUser.photoURL ?? 'no-image',
		isGuest: firebaseUser.isAnonymous,
		gameRecord: { wins: 0, losses: 0, draws: 0 }
	};
	await setDoc(userRef, { ...profile, createdAt: serverTimestamp() });
	return profile;
};

let started = false;

/** Starts tracking the sign-in state. Browser only; safe to call repeatedly. */
export const initAuth = (): void => {
	if (started || typeof window === 'undefined') return;
	started = true;

	const auth = Firebase.getInstance().getAuth();
	onAuthStateChanged(auth, async (firebaseUser) => {
		try {
			user.setUser(firebaseUser ? await ensureUserProfile(firebaseUser) : null);
		} catch (err) {
			console.error('could not load the player profile', err);
			user.setUser(null);
		} finally {
			authReady.set(true);
		}
	});
};

export const signInAsGuest = async (): Promise<void> => {
	await signInAnonymously(Firebase.getInstance().getAuth());
};

export const signInWithEmail = async (email: string, password: string): Promise<void> => {
	await signInWithEmailAndPassword(Firebase.getInstance().getAuth(), email.trim(), password);
};

export const signUpWithEmail = async (email: string, password: string): Promise<void> => {
	await createUserWithEmailAndPassword(Firebase.getInstance().getAuth(), email.trim(), password);
};

export const signOutUser = async (): Promise<void> => {
	await signOut(Firebase.getInstance().getAuth());
};
