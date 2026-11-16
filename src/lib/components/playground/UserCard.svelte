<script>
	import Icon from 'svelte-fa';
	import { faChess } from '@fortawesome/free-solid-svg-icons';
	import { _ } from '$lib/i18n';

	export let userPhotoURL = '';
	export let userName = '';
	export let formatDistanceDate = '';
	export let roomType = '';
	export let gameId = '';
</script>

<div
	class="flex items-center justify-between space-x-4 px-4 py-1.5"
	data-testid="game-card"
	data-opponent={userName}>
	<div
		class="bg-light-900 flex h-10 w-10 items-center justify-center rounded-full">
		<img class="h-full rounded-full" src={userPhotoURL} alt="logo" />
	</div>
	<div class="text-left dark:text-white">
		<p>{userName}</p>
		<p class="text-xs text-gray-400">
			{formatDistanceDate}
		</p>
	</div>
	<div class="text-2xl dark:text-white">
		{#if roomType === 'chess'}
			<Icon icon={faChess} />
		{/if}
	</div>
	<div>
		<a href="/games/chess/{gameId}" class="w-full text-xs text-orange-400">
			{$_('pages.games.active_games.see_game')}
		</a>
	</div>
</div>
