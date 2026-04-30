<script lang="ts">
  import type { ClaimCardEntry, Classification } from '$lib/types';

  interface Props {
    deck: ClaimCardEntry[];
    rulings: Record<string, Classification>;
    currentIndex: number;
    onJump: (index: number) => void;
  }

  let { deck, rulings, currentIndex, onJump }: Props = $props();

  // All remaining witnesses in stable deck order. Position N stays the same
  // card until it's ruled, at which point it drops out and later cards shift
  // up. Container scrolls if the list outgrows the rail.
  const upcoming = $derived(
    deck
      .map((card, originalIndex) => ({ card, originalIndex }))
      .filter(({ card }) => !rulings[card.objectID]),
  );
</script>

<aside class="next-up" aria-label="Next up — pick a witness">
  <header class="nu-head">
    <span class="nu-title">Next Up</span>
    <span class="nu-count">{upcoming.length} remaining</span>
  </header>

  {#if upcoming.length === 0}
    <p class="nu-empty">All witnesses called.</p>
  {:else}
    <ol class="nu-list">
      {#each upcoming as { card, originalIndex }, i (card.objectID)}
        <li class="nu-item" class:nu-item-current={originalIndex === currentIndex}>
          <button
            class="nu-pick"
            onclick={() => onJump(originalIndex)}
            aria-label={originalIndex === currentIndex
              ? `Currently called: ${card.title}`
              : `Call witness: ${card.title}`}
            aria-current={originalIndex === currentIndex ? 'true' : undefined}
          >
            <span class="nu-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <span class="nu-text">{card.title}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</aside>

<style>
  .next-up {
    /* Explicit position + z-index so the picker stays above the chamber-bg
       and chamber-overlay even if their pointer-events guards regress. */
    position: relative;
    z-index: 5;
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: rgba(11, 11, 13, 0.8);
    border-left: 1px solid rgba(233, 228, 216, 0.08);
    backdrop-filter: blur(12px);
    /* The rail is a grid child of `.chamber-main`. Without min-height: 0,
       a long deck pushes the 1fr row past its allocation and the chamber
       stage (and its centered witness card) gets shoved out of view. The
       internal nu-list scroll only kicks in once the rail itself is bounded. */
    min-height: 0;
  }

  .nu-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 1rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.08);
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .nu-title {
    color: var(--color-bone);
  }

  .nu-count {
    color: var(--color-brass);
  }

  .nu-empty {
    padding: 1.5rem 1rem;
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--color-paper-dim);
    text-align: center;
  }

  .nu-list {
    flex: 1;
    overflow-y: auto;
    list-style: none;
    padding: 0.5rem 0;
    margin: 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(233, 228, 216, 0.18) transparent;
  }

  .nu-item + .nu-item {
    border-top: 1px solid rgba(233, 228, 216, 0.06);
  }

  .nu-pick {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.75rem;
    align-items: start;
    width: 100%;
    padding: 0.85rem 1rem;
    background: none;
    border: none;
    border-left: 2px solid transparent;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--motion-snap) var(--ease-out),
      border-color var(--motion-snap) var(--ease-out);
  }

  .nu-pick:hover {
    background: rgba(233, 228, 216, 0.05);
    border-left-color: var(--color-cyan-ink);
  }

  .nu-pick:focus-visible {
    outline: 2px solid var(--color-bone);
    outline-offset: -2px;
  }

  .nu-item-current .nu-pick {
    background: rgba(210, 58, 42, 0.06);
    border-left-color: var(--color-ember);
    cursor: default;
  }

  .nu-num {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--color-brass);
    padding-top: 0.15rem;
  }

  .nu-item-current .nu-num {
    color: var(--color-ember);
  }

  .nu-text {
    min-width: 0;
    font-family: var(--font-body);
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--color-bone);
    text-wrap: balance;
  }

  .nu-item-current .nu-text {
    color: var(--color-paper);
  }

  @media (max-width: 1100px) {
    .next-up {
      width: 240px;
    }
  }

  @media (max-width: 900px) {
    .next-up {
      display: none;
    }
  }
</style>
