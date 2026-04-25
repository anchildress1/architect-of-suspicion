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
  aria-label="The Architect's record"
>
  <div class="feed-head">
    <span>The Record</span>
    <span class="feed-count">{gameState.current.feed.length} ent.</span>
  </div>

  {#if gameState.current.feed.length === 0}
    <p class="feed-empty">The Architect observes in silence.</p>
  {:else}
    {#each gameState.current.feed as entry (entry.id)}
      <div class="feed-entry feed-{entry.type}">
        <p class="feed-text">{entry.text}</p>
      </div>
    {/each}
  {/if}
</div>

<style>
  .architect-feed {
    flex: 1;
    overflow-y: auto;
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(233, 228, 216, 0.18) transparent;
  }

  .feed-head {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.25rem;
  }

  .feed-count {
    color: var(--color-brass-dim);
    opacity: 0.7;
  }

  .feed-empty {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.95rem;
    color: rgba(233, 228, 216, 0.5);
    line-height: 1.5;
  }

  .feed-entry {
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(233, 228, 216, 0.06);
    animation: feedIn 0.45s cubic-bezier(0.2, 0, 0, 1) both;
  }

  .feed-entry:last-child {
    border-bottom: none;
  }

  .feed-text {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-style: italic;
    color: var(--color-bone);
    line-height: 1.55;
    text-wrap: pretty;
  }

  /* Action lines = machine voice (mono, terse) */
  .feed-action .feed-text {
    font-family: var(--font-readout);
    font-style: normal;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-paper-dim);
  }

  .feed-action .feed-text::before {
    content: '→ ';
    color: var(--color-brass-dim);
  }

  /* Reaction lines = the Architect speaking */
  .feed-reaction .feed-text {
    color: var(--color-bone);
  }

  /* Narration = atmospheric prompts */
  .feed-narration .feed-text {
    color: rgba(233, 228, 216, 0.74);
    font-size: 0.85rem;
  }

  @keyframes feedIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
