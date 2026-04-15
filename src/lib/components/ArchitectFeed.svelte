<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';

  let feedContainer: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (gameState.current.feed.length > 0 && feedContainer) {
      feedContainer.scrollTop = feedContainer.scrollHeight;
    }
  });
</script>

<div class="flex-1 overflow-y-auto px-4 py-3" bind:this={feedContainer}>
  {#if gameState.current.feed.length === 0}
    <p class="font-body text-parchment-dim text-sm italic">The Architect observes in silence...</p>
  {:else}
    {#each gameState.current.feed as entry (entry.id)}
      <div
        class="mb-2 text-sm"
        class:text-parchment={entry.type === 'narration'}
        class:text-brass={entry.type === 'action'}
        class:text-copper={entry.type === 'reaction'}
      >
        <p class="font-body">{entry.text}</p>
      </div>
    {/each}
  {/if}
</div>
