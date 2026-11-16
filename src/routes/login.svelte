<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import Spinner from '$lib/components/ui/Spinner.svelte';
	import SpanError from '$lib/components/ui/SpanError.svelte';
	import { signInAsGuest, signInWithEmail, signUpWithEmail } from '$lib/firebase/auth';
	import { authReady, user } from '$lib/stores/user';

	let email = '';
	let password = '';
	let busy = false;
	let error = '';

	// Only follow links back into this app.
	const nextPath = (): string => {
		const next = $page.url.searchParams.get('next') ?? '';
		return next.startsWith('/') && !next.startsWith('//') ? next : '/games';
	};

	$: if ($authReady && $user) {
		goto(nextPath(), { replaceState: true });
	}

	const MESSAGES: Record<string, string> = {
		'auth/email-already-in-use': 'There is already an account with this e-mail. Sign in instead.',
		'auth/invalid-email': 'That is not a valid e-mail address.',
		'auth/user-not-found': 'No account with this e-mail. Create one instead.',
		'auth/wrong-password': 'Wrong password.',
		'auth/weak-password': 'The password needs at least 6 characters.',
		'auth/network-request-failed':
			'Could not reach the sign-in service. Is the local environment running?'
	};

	const run = async (action: () => Promise<void>) => {
		busy = true;
		error = '';
		try {
			await action();
		} catch (e) {
			const err = e as { code?: string; message?: string };
			error = MESSAGES[err?.code ?? ''] ?? err?.message ?? 'Sign-in failed.';
		} finally {
			busy = false;
		}
	};
</script>

<svelte:head>
	<title>Sign in</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-sm flex-col space-y-4">
	<h1>Sign in</h1>

	<!-- Nothing can be typed or clicked until the app has loaded in the browser
	     and knows whether a player is already signed in. -->
	<fieldset disabled={busy || !$authReady} class="m-0 flex min-w-0 flex-col space-y-4 border-0 p-0">
		<form
			class="flex flex-col space-y-3"
			on:submit|preventDefault={() => run(() => signInWithEmail(email, password))}
		>
			<label class="flex flex-col">
				E-mail
				<input
					required
					type="email"
					name="email"
					autocomplete="email"
					bind:value={email}
					class="border p-1"
				/>
			</label>
			<label class="flex flex-col">
				Password
				<input
					required
					type="password"
					name="password"
					minlength="6"
					autocomplete="current-password"
					bind:value={password}
					class="border p-1"
				/>
			</label>
			<div class="flex space-x-2">
				<button type="submit" class="w-1/2 rounded-md bg-blue-600 p-1 text-white hover:bg-blue-800">
					Sign in
				</button>
				<button
					type="button"
					on:click={() => run(() => signUpWithEmail(email, password))}
					class="w-1/2 rounded-md border border-blue-600 p-1 text-blue-700 hover:bg-blue-100"
				>
					Create account
				</button>
			</div>
		</form>

		<div class="flex flex-col space-y-2 border-t pt-4 text-center">
			<button
				type="button"
				on:click={() => run(signInAsGuest)}
				class="rounded-md bg-orange-400 p-1 font-semibold text-white hover:bg-orange-500"
			>
				Continue as guest
			</button>
			<p class="text-sm">
				No account needed. You get a guest ID that friends can invite, and your matches stay
				available in this browser until you sign out.
			</p>
		</div>
	</fieldset>

	{#if busy}
		<div class="flex justify-center"><Spinner size={24} /></div>
	{/if}
	{#if error}
		<ul class="list-none p-0"><SpanError textError={error} isValid={false} /></ul>
	{/if}
</section>
