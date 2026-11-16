import {
	addDoc,
	collection,
	doc,
	serverTimestamp,
	setDoc,
	type DocumentReference
} from 'firebase/firestore';

import { Firebase } from '$lib/firebase/init';

export interface ChatMessage {
	message: string;
	sendBy: string;
	state: boolean;
	time: unknown;
	uid: string;
}

/** Creates the chat room that belongs to a game and returns a reference to it. */
export const createChatRoom = async (
	userA: string,
	userB: string,
	type: string
): Promise<DocumentReference> => {
	const db = Firebase.getInstance().getFirestore();
	const chatRoomRef = doc(collection(db, 'chatRooms'));
	await setDoc(chatRoomRef, {
		id: chatRoomRef.id,
		type,
		users: [userA, userB],
		createdAt: serverTimestamp()
	});
	return chatRoomRef;
};

export const createMessageGame = async (
	message: ChatMessage,
	chatRef: DocumentReference
): Promise<void> => {
	const auth = Firebase.getInstance().getAuth();
	await addDoc(collection(chatRef, 'chats'), {
		...message,
		uid: auth.currentUser?.uid ?? '',
		time: serverTimestamp()
	});
};
