<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Classification, ClaimCardEntry } from '$lib/types';

  interface Props {
    card: ClaimCardEntry;
    index: number;
    total: number;
    onDecide: (card: ClaimCardEntry, classification: Classification) => void;
    disabled?: boolean;
  }

  let { card, index, total, onDecide, disabled = false }: Props = $props();
  let chosen = $state<Classification | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function decide(c: Classification) {
    if (chosen || disabled) return;
    chosen = c;
    // Let the stamp animation read before swapping the witness.
    timer = setTimeout(() => onDecide(card, c), 360);
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<article
  class="witness-card reveal"
  class:exit-proof={chosen === 'proof'}
  class:exit-objection={chosen === 'objection'}
  class:exit-dismiss={chosen === 'dismiss'}
  aria-label="Exhibit {index + 1} of {total}: {card.title}"
>
  <div class="wc-edge" aria-hidden="true"></div>

  <header class="wc-head">
    <span class="wc-cat">{card.category}</span>
    <span class="wc-id">Exhibit {index + 1} / {total}</span>
  </header>

  <h2 class="wc-title">{card.title}</h2>
  <p class="wc-body">{card.blurb}</p>

  <footer class="wc-foot">
    <span class="wc-who">Case 23&middot;{(index + 11).toString().padStart(2, '0')}</span>
    <span class="wc-line"></span>
  </footer>

  <div class="wc-stamp wc-stamp-proof" aria-hidden={chosen !== 'proof'}>Proof</div>
  <div class="wc-stamp wc-stamp-objection" aria-hidden={chosen !== 'objection'}>Objection</div>
  <div class="wc-stamp wc-stamp-dismiss" aria-hidden={chosen !== 'dismiss'}>Struck</div>

  {#if !chosen}
    <div class="wc-levers">
      <button class="lv lv-dismiss" onclick={() => decide('dismiss')} disabled={disabled}>
        <span class="lv-key">&larr; &#x232B;</span>
        <span class="lv-name">Dismiss</span>
        <span class="lv-hint">Strike from record</span>
      </button>
      <button class="lv lv-objection" onclick={() => decide('objection')} disabled={disabled}>
        <span class="lv-key">&uarr; O</span>
        <span class="lv-name">Objection</span>
        <span class="lv-hint">Counter-evidence</span>
      </button>
      <button class="lv lv-proof" onclick={() => decide('proof')} disabled={disabled}>
        <span class="lv-key">P &rarr;</span>
        <span class="lv-name">Proof</span>
        <span class="lv-hint">Enter as evidence</span>
      </button>
    </div>
  {/if}
</article>

<style>
  .witness-card {
    position: relative;
    width: min(100%, 36rem);
    background:
      linear-gradient(180deg, rgba(20, 20, 23, 0.92) 0%, rgba(11, 11, 13, 0.96) 100%);
    border: 1px solid rgba(233, 228, 216, 0.18);
    box-shadow:
      0 30px 60px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(233, 228, 216, 0.04);
    padding: 2rem 2.25rem 1.4rem;
    overflow: hidden;
    transition:
      transform 360ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity 360ms ease;
  }

  .wc-edge {
    position: absolute;
    inset: 12px;
    border: 1px solid rgba(233, 228, 216, 0.08);
    pointer-events: none;
  }

  .wc-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1.4rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px dashed rgba(233, 228, 216, 0.16);
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .wc-title {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(1.4rem, 2vw, 1.85rem);
    color: var(--color-bone);
    line-height: 1.25;
    text-wrap: balance;
    margin-bottom: 1rem;
  }

  .wc-body {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--color-paper-dim);
    line-height: 1.65;
    margin-bottom: 1.8rem;
    text-wrap: pretty;
  }

  .wc-foot {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 1.2rem;
  }

  .wc-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--color-brass-deep), transparent);
  }

  /* Stamps — overlay when a verdict is rendered */
  .wc-stamp {
    position: absolute;
    top: 25%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-8deg) scale(0.6);
    font-family: var(--font-display);
    font-style: italic;
    font-size: 4rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 6px double currentColor;
    padding: 0.5rem 1.5rem;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 240ms ease,
      transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .wc-stamp-proof {
    color: var(--color-bone);
  }

  .wc-stamp-objection {
    color: var(--color-cyan-ink);
  }

  .wc-stamp-dismiss {
    color: var(--color-brass-dim);
  }

  .exit-proof .wc-stamp-proof,
  .exit-objection .wc-stamp-objection,
  .exit-dismiss .wc-stamp-dismiss {
    opacity: 0.85;
    transform: translate(-50%, -50%) rotate(-8deg) scale(1);
  }

  /* Card exits */
  .exit-proof,
  .exit-objection,
  .exit-dismiss {
    opacity: 0;
  }

  .exit-proof {
    transform: translateX(36px) rotate(2deg);
  }

  .exit-objection {
    transform: translateX(-36px) rotate(-2deg);
  }

  .exit-dismiss {
    transform: translateY(28px) scale(0.97);
  }

  /* Lever strip */
  .wc-levers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .lv {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.85rem 0.9rem;
    background: rgba(11, 11, 13, 0.7);
    border: 1px solid rgba(233, 228, 216, 0.12);
    color: var(--color-paper-dim);
    cursor: pointer;
    text-align: left;
    transition: all 0.25s ease;
  }

  .lv:hover:not(:disabled) {
    border-color: rgba(233, 228, 216, 0.4);
    background: rgba(20, 20, 23, 0.88);
  }

  .lv:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .lv-key {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .lv-name {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.15rem;
    color: var(--color-bone);
  }

  .lv-hint {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .lv-proof:hover:not(:disabled) {
    border-color: var(--color-bone);
  }

  .lv-objection:hover:not(:disabled) {
    border-color: var(--color-cyan-ink);
  }

  .lv-objection:hover:not(:disabled) .lv-name {
    color: var(--color-cyan-ink);
  }

  .lv-dismiss:hover:not(:disabled) {
    border-color: var(--color-brass-dim);
  }
</style>
