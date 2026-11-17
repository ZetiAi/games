/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// TODO(#12): figure out what is wrong with the types...
import { onSnapshot } from 'firebase/firestore';
import { Observable } from 'rxjs';
import type {
	DocumentData,
	DocumentReference,
	DocumentSnapshot,
	Query,
	QuerySnapshot,
	SnapshotListenOptions
} from './interfaces';

const DEFAULT_OPTIONS = { includeMetadataChanges: false };

// biome-ignore-start lint/suspicious/noExplicitAny: copied from rxfire (Google, Apache-2.0), which types its snapshot helpers with any.
export function fromRef<T = DocumentData>(
	ref: DocumentReference<T>,
	options?: SnapshotListenOptions
): Observable<DocumentSnapshot<T>>;
export function fromRef<T = DocumentData>(
	ref: Query<T>,
	options?: SnapshotListenOptions
): Observable<QuerySnapshot<T>>;
export function fromRef(
	ref: any,
	options: SnapshotListenOptions = DEFAULT_OPTIONS
): Observable<any> {
	// biome-ignore-end lint/suspicious/noExplicitAny: end of the rxfire snapshot helpers.
	return new Observable((subscriber) => {
		const unsubscribe = onSnapshot(ref, options, {
			next: subscriber.next.bind(subscriber),
			error: subscriber.error.bind(subscriber),
			complete: subscriber.complete.bind(subscriber)
		});
		return { unsubscribe };
	});
}
