<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';

  let feedContainer: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (gameState.current.feed.length > 0 && feedContainer) {
      feedContainer.scrollTop = feedContainer.scrollHeight;
    }
  });
</script>

<div
  class="architect-feed"
  bind:this={feedContainer}
  aria-live="polite"
  aria-label="Architect commentary feed"
>
  {#if gameState.current.feed.length === 0}
    <p class="feed-empty">The Architect observes in silence...</p>
  {:else}
    {#each gameState.current.feed as entry (entry.id)}
      <div class="feed-entry">
        {#if entry.type === 'action'}
          <p class="feed-text feed-text-action">{entry.text}</p>
        {:else if entry.type === 'reaction'}
          <p class="feed-text feed-text-reaction">{entry.text}</p>
        {:else if entry.type === 'narration'}
          <p class="feed-text feed-text-narration">{entry.text}</p>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .architect-feed {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .feed-empty {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-style: italic;
    color: var(--color-parchment-dim);
  }

  .feed-entry {
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(196, 162, 78, 0.06);
    animation: feedIn 0.5s ease forwards;
  }

  .feed-entry:last-child {
    border-bottom: none;
  }

  .feed-text {
    line-height: 1.55;
  }

  .feed-text-action {
    font-family: var(--font-body);
    font-size: 0.78rem;
    font-style: normal;
    color: var(--color-parchment-dim);
  }

  .feed-text-action::before {
    content: '\2192  ';
    color: var(--color-brass-dim);
  }

  .feed-text-reaction {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-style: italic;
    color: var(--color-brass);
    line-height: 1.6;
  }

  .feed-text-narration {
    font-family: var(--font-body);
    font-size: 0.88rem;
    font-weight: 500;
    font-style: italic;
    color: var(--color-parchment-dim);
    line-height: 1.6;
  }

  @keyframes feedIn {
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
