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
  <div class="feed-plate-label">Chronicle</div>
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
    position: relative;
    flex: 1;
    overflow-y: auto;
    padding: 0.85rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    z-index: 1;
  }

  .feed-plate-label {
    position: sticky;
    top: 0;
    z-index: 2;
    width: fit-content;
    margin-bottom: 0.35rem;
    padding: 0.2rem 0.45rem;
    font-family: var(--font-readout);
    font-size: 0.46rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    border: 1px solid rgba(196, 162, 78, 0.16);
    background: rgba(8, 9, 12, 0.75);
  }

  .feed-empty {
    font-family: var(--font-display);
    font-size: 0.92rem;
    font-style: italic;
    color: rgba(208, 204, 196, 0.8);
    line-height: 1.5;
  }

  .feed-entry {
    padding: 0.55rem 0.2rem 0.6rem;
    border-bottom: 1px solid rgba(196, 162, 78, 0.1);
    animation: feedIn 0.45s ease forwards;
  }

  .feed-entry:last-child {
    border-bottom: none;
  }

  .feed-text {
    line-height: 1.55;
  }

  .feed-text-action {
    font-family: var(--font-readout);
    font-size: 0.64rem;
    font-style: normal;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(145, 141, 134, 0.95);
  }

  .feed-text-action::before {
    content: '>> ';
    color: var(--color-brass-dim);
  }

  .feed-text-reaction {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-style: italic;
    color: var(--color-brass-glow);
    line-height: 1.7;
    text-wrap: pretty;
    text-shadow: 0 0 16px rgba(196, 162, 78, 0.18);
  }

  .feed-text-narration {
    font-family: var(--font-display);
    font-size: 0.88rem;
    font-weight: 400;
    font-style: italic;
    color: rgba(208, 204, 196, 0.84);
    line-height: 1.65;
    text-wrap: pretty;
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
