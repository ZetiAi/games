/**
 * Converts what Firestore hands back for a timestamp field into a Date.
 * A `serverTimestamp()` that has not been acknowledged by the server yet reads
 * as `null`; treat it as "now".
 */
export const toDate = (value: unknown): Date => {
	if (value instanceof Date) return value;
	if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
		return (value as { toDate: () => Date }).toDate();
	}
	return new Date();
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 3600],
	['month', 30 * 24 * 3600],
	['day', 24 * 3600],
	['hour', 3600],
	['minute', 60]
];

/** "5 minutes ago", "yesterday", ... in the given language. */
export const timeAgo = (value: unknown, lang: string): string => {
	const seconds = Math.round((toDate(value).getTime() - Date.now()) / 1000);
	const formatter = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
	}
	return formatter.format(0, 'second');
};
