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
      <div class="feed-entry mb-3">
        {#if entry.type === 'action'}
          <p class="font-readout text-parchment-dim text-[11px] uppercase tracking-wider">
            {entry.text}
          </p>
        {:else if entry.type === 'reaction'}
          <p class="font-display text-brass text-sm leading-relaxed">
            {entry.text}
          </p>
        {:else if entry.type === 'narration'}
          <p class="font-body text-parchment-dim text-sm italic leading-relaxed">
            {entry.text}
          </p>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .feed-entry {
    animation: feedFadeIn 0.4s ease-out;
  }

  @keyframes feedFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
