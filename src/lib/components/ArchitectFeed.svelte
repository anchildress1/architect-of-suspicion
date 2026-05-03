<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
  import { tokenizeReaction } from '$lib/reactionFormat';

  let feedContainer: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (gameState.current.feed.length > 0 && feedContainer) {
      feedContainer.scrollTop = feedContainer.scrollHeight;
    }
  });

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }
</script>

<div
  class="architect-feed"
  bind:this={feedContainer}
  aria-live="polite"
  aria-label="The Architect's record"
>
  {#if gameState.current.feed.length === 0}
    <p class="feed-empty">The Architect observes in silence.</p>
  {:else}
    {#each gameState.current.feed as entry (entry.id)}
      <div class="feed-entry feed-{entry.type}">
        <p class="feed-time">{formatTime(entry.timestamp)}</p>
        {#if entry.type === 'reaction'}
          <!-- Architect reactions tokenize allowlisted <em>/<strong>;
               anything else (markdown, disallowed tags, attributes) renders
               as literal text. No {@html} = no XSS surface. -->
          <p class="feed-text">
            {#each tokenizeReaction(entry.text) as segment, i (i)}
              {#if segment.type === 'em'}<em>{segment.value}</em>
              {:else if segment.type === 'strong'}<strong>{segment.value}</strong>
              {:else}{segment.value}{/if}
            {/each}
          </p>
        {:else}
          <p class="feed-text">{entry.text}</p>
        {/if}
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

  .feed-empty {
    font-family: var(--font-architect);
    font-size: 13.5px;
    color: var(--color-paper-dim);
    line-height: 1.6;
  }

  .feed-entry {
    position: relative;
    padding: 0.5rem 0 0.6rem 0.85rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.06);
    animation: feedIn 0.45s cubic-bezier(0.2, 0, 0, 1) both;
  }

  .feed-entry:last-child {
    border-bottom: none;
  }

  .feed-time {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.2rem;
  }

  .feed-text {
    font-family: var(--font-architect);
    font-size: 13.5px;
    color: #e8d8b8;
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* Action = the player's hand on the record (cyan-ink, Geist, terse). */
  .feed-action {
    border-left: 2px solid var(--color-cyan-ink);
    color: var(--color-cyan-ink);
  }

  .feed-action .feed-text {
    font-family: var(--font-body);
    font-style: normal;
    font-size: 14px;
    color: var(--color-paper-dim);
    line-height: 1.4;
    letter-spacing: 0;
    text-transform: none;
  }

  /* Reaction = the Architect speaking (ember rule). */
  .feed-reaction {
    border-left: 2px solid var(--color-ember);
    color: var(--color-ember);
  }

  /* Narration = atmospheric prompts; quiet brass-dim rule. */
  .feed-narration {
    border-left: 2px solid rgba(122, 118, 104, 0.4);
    color: var(--color-brass-dim);
  }

  .feed-narration .feed-text {
    color: var(--color-paper-dim);
    font-size: 14px;
    line-height: 1.5;
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
