<script lang="ts">
  import type { ClaimCardEntry, Classification } from '$lib/types';

  interface Props {
    deck: ClaimCardEntry[];
    rulings: Record<string, Classification>;
    currentIndex: number;
    onJump: (index: number) => void;
  }

  let { deck, rulings, currentIndex, onJump }: Props = $props();

  const remaining = $derived(deck.filter((c) => !rulings[c.objectID]).length);

  function markFor(card: ClaimCardEntry, idx: number): string {
    const ruling = rulings[card.objectID];
    if (ruling === 'proof') return '●';
    if (ruling === 'objection') return '◆';
    if (ruling === 'dismiss') return '—';
    if (idx === currentIndex) return '▶';
    return '○';
  }
</script>

<aside class="witness-queue" aria-label="The witness queue">
  <header class="queue-head">
    <span class="queue-title">The Queue</span>
    <span class="queue-count">{remaining} remaining</span>
  </header>

  <ol class="queue-list">
    {#each deck as card, i (card.objectID)}
      {@const ruling = rulings[card.objectID]}
      <li
        class="queue-item"
        class:queue-item-current={i === currentIndex && !ruling}
        class:queue-item-done={ruling}
        data-ruling={ruling ?? 'pending'}
      >
        <button
          class="queue-jump"
          onclick={() => onJump(i)}
          aria-label="Call exhibit {i + 1}: {card.title}"
        >
          <span class="queue-mark" aria-hidden="true">{markFor(card, i)}</span>
          <span class="queue-text">{card.title}</span>
        </button>
      </li>
    {/each}
  </ol>
</aside>

<style>
  .witness-queue {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: rgba(11, 11, 13, 0.8);
    border-left: 1px solid rgba(233, 228, 216, 0.08);
    backdrop-filter: blur(12px);
  }

  .queue-head {
    display: flex;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.08);
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  .queue-title {
    color: var(--color-bone);
  }

  .queue-count {
    color: var(--color-brass-dim);
  }

  .queue-list {
    flex: 1;
    overflow-y: auto;
    list-style: none;
    padding: 0.5rem 0;
    margin: 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(233, 228, 216, 0.18) transparent;
  }

  .queue-item {
    border-bottom: 1px solid rgba(233, 228, 216, 0.04);
  }

  .queue-jump {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.55rem;
    align-items: center;
    width: 100%;
    padding: 0.55rem 1rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: var(--color-paper-dim);
    transition: all 0.2s ease;
  }

  .queue-jump:hover {
    background: rgba(233, 228, 216, 0.05);
    color: var(--color-bone);
  }

  .queue-mark {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    color: var(--color-brass-dim);
    width: 1ch;
    text-align: center;
  }

  .queue-text {
    font-family: var(--font-body);
    font-size: 0.78rem;
    line-height: 1.35;
    text-wrap: balance;
  }

  .queue-item-current .queue-jump {
    background: rgba(233, 228, 216, 0.08);
    color: var(--color-bone);
  }

  .queue-item-current .queue-mark {
    color: var(--color-bone);
  }

  .queue-item-done .queue-jump {
    color: var(--color-brass-dim);
  }

  .queue-item[data-ruling='proof'] .queue-mark {
    color: var(--color-bone);
  }

  .queue-item[data-ruling='objection'] .queue-mark {
    color: var(--color-cyan-ink);
  }

  .queue-item[data-ruling='dismiss'] .queue-mark {
    color: var(--color-brass-dim);
  }

  @media (max-width: 1100px) {
    .witness-queue {
      width: 220px;
    }
  }

  @media (max-width: 900px) {
    .witness-queue {
      display: none;
    }
  }
</style>
