import { collection, orderBy, query, doc, getDoc } from 'firebase/firestore';
import { EMPTY } from 'rxjs';

import { Firebase } from '$lib/firebase/init';
import { collectionData } from './rxfire/collection';

export const chatGame = async (gameId: string) => {
	const firebase = Firebase.getInstance();
	const db = firebase.getFirestore();

	const gameRef = doc(db, `games/${gameId}`);
	const gameSnapshot = await getDoc(gameRef);

	const chatRef = gameSnapshot.data()?.chatRoom;
	if (!chatRef) return EMPTY;

	const chatQuery = query(collection(chatRef, 'chats'), orderBy('time', 'desc'));

	return collectionData(chatQuery);
};
