<script>
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { authReady } from '$lib/stores/user';
</script>

<div class="flex h-full justify-center">
	{#if $authReady}
		<slot />
	{:else}
		<!-- wait until we know who is signed in before rendering a game -->
		<Spinner class="!border-l-orange-400" />
	{/if}
</div>
