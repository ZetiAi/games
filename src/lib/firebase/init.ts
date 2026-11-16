import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env;

export const useEmulator = env.VITE_USE_EMULATOR === 'true';

/**
 * Host the Firebase emulators are reached on.
 *
 * Defaults to the host the page was loaded from, so a second player on another
 * device (http://<your-lan-ip>:5173) talks to the emulators on the same
 * machine as the first one.
 */
export const emulatorHost = (): string =>
	env.VITE_EMULATOR_HOST ||
	(typeof window !== 'undefined' ? window.location.hostname : 'localhost');

const firebaseConfig = () => {
	if (useEmulator) {
		// A `demo-` project never talks to real Firebase services, and the
		// emulators accept any API key.
		return {
			apiKey: env.VITE_API_KEY || 'demo-api-key',
			authDomain: env.VITE_AUTH_DOMAIN || undefined,
			projectId: env.VITE_PROJECT_ID || 'demo-games'
		};
	}

	if (!env.VITE_API_KEY || !env.VITE_PROJECT_ID) {
		throw new Error(
			'Firebase is not configured. Copy .env.example to .env and either set ' +
				'VITE_USE_EMULATOR=true (local emulators) or fill in the VITE_* Firebase project settings.'
		);
	}

	return {
		apiKey: env.VITE_API_KEY,
		authDomain: env.VITE_AUTH_DOMAIN,
		projectId: env.VITE_PROJECT_ID,
		storageBucket: env.VITE_STORAGE_BUCKET,
		messagingSenderId: env.VITE_MESSAGING_SENDER_ID,
		appId: env.VITE_APP_ID
	};
};

export class Firebase {
	private static instance: Firebase | undefined;

	private app: FirebaseApp;
	private auth: Auth;
	private firestore: Firestore;

	private constructor() {
		this.app = initializeApp(firebaseConfig());
		this.auth = getAuth(this.app);
		this.firestore = getFirestore(this.app);

		if (useEmulator) {
			const host = emulatorHost();
			const authPort = env.VITE_AUTH_EMULATOR_PORT || '9099';
			const firestorePort = Number(env.VITE_FIRESTORE_EMULATOR_PORT || '8080');
			connectAuthEmulator(this.auth, `http://${host}:${authPort}`, { disableWarnings: true });
			connectFirestoreEmulator(this.firestore, host, firestorePort);
		}
	}

	public static getInstance(): Firebase {
		if (!Firebase.instance) {
			Firebase.instance = new Firebase();
		}
		return Firebase.instance;
	}

	public getAuth(): Auth {
		return this.auth;
	}

	public getFirestore(): Firestore {
		return this.firestore;
	}
}
