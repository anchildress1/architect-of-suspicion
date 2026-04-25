<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Classification, ClaimCardEntry } from '$lib/types';

  interface Props {
    card: ClaimCardEntry;
    index: number;
    total: number;
    onDecide: (card: ClaimCardEntry, classification: Classification) => void;
    disabled?: boolean;
    peek?: boolean;
  }

  let { card, index, total, onDecide, disabled = false, peek = false }: Props = $props();
  let chosen = $state<Classification | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function decide(c: Classification) {
    if (peek || chosen || disabled) return;
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
  class:peek
  class:exit-proof={!peek && chosen === 'proof'}
  class:exit-objection={!peek && chosen === 'objection'}
  class:exit-dismiss={!peek && chosen === 'dismiss'}
  aria-label={peek ? undefined : `Exhibit ${index + 1} of ${total}: ${card.title}`}
  aria-hidden={peek}
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

  {#if !peek && !chosen}
    <div class="wc-levers">
      <button class="lv lv-dismiss" onclick={() => decide('dismiss')} {disabled}>
        <span class="lv-key">&larr; &#x232B;</span>
        <span class="lv-name">Dismiss</span>
        <span class="lv-hint">Strike from record</span>
      </button>
      <button class="lv lv-objection" onclick={() => decide('objection')} {disabled}>
        <span class="lv-key">&uarr; O</span>
        <span class="lv-name">Objection</span>
        <span class="lv-hint">Counter-evidence</span>
      </button>
      <button class="lv lv-proof" onclick={() => decide('proof')} {disabled}>
        <span class="lv-key">P &rarr;</span>
        <span class="lv-name">Proof</span>
        <span class="lv-hint">Enter as evidence</span>
      </button>
    </div>
  {/if}
</article>

<style>
  /* Parchment witness card — bone broadsheet on dark stage. */
  .witness-card {
    position: relative;
    width: min(100%, 36rem);
    background: var(--color-bone);
    color: var(--color-paper-ink);
    box-shadow:
      0 30px 60px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.6);
    padding: 2.75rem 3.5rem 2.25rem;
    overflow: hidden;
    transition:
      transform 360ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity 360ms ease,
      filter 360ms ease;
  }

  /* On-deck peek — next witness, behind the active card. */
  .witness-card.peek {
    transform: translate(32px, 36px) scale(0.94);
    opacity: 0.55;
    filter: grayscale(0.35) brightness(0.85);
    pointer-events: none;
    user-select: none;
  }

  .witness-card.peek .wc-body,
  .witness-card.peek .wc-foot,
  .witness-card.peek .wc-stamp,
  .witness-card.peek .wc-levers {
    display: none;
  }

  /* 3px ember left rule — the only chromatic event on the parchment */
  .wc-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    background: var(--color-ember);
    pointer-events: none;
  }

  .wc-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1.4rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid rgba(20, 20, 26, 0.15);
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(20, 20, 26, 0.55);
  }

  .wc-title {
    font-family: var(--font-display);
    font-style: normal;
    font-weight: 400;
    font-size: clamp(2rem, 4vw, 3.25rem);
    color: var(--color-paper-ink);
    line-height: 1.05;
    letter-spacing: -0.005em;
    text-wrap: balance;
    margin-bottom: 1.2rem;
  }

  .wc-body {
    font-family: var(--font-body);
    font-size: 1.0625rem;
    color: rgba(20, 20, 26, 0.78);
    line-height: 1.55;
    max-width: 56ch;
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
    color: rgba(20, 20, 26, 0.55);
    margin-bottom: 1.2rem;
  }

  .wc-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(20, 20, 26, 0.18), transparent);
  }

  /* Stamps — top-right, hand-pressed onto parchment */
  .wc-stamp {
    position: absolute;
    top: 36px;
    right: 44px;
    transform-origin: top right;
    transform: rotate(-8deg) scale(1.2);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    border: 3px solid currentColor;
    padding: 0.4rem 0.9rem;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 180ms ease-out,
      transform 180ms cubic-bezier(0.3, 1.5, 0.4, 1);
  }

  .wc-stamp-proof {
    color: #0a6a4a;
  }
  .wc-stamp-objection {
    color: var(--color-ember);
  }
  .wc-stamp-dismiss {
    color: #5a5a5a;
  }

  .exit-proof .wc-stamp-proof,
  .exit-objection .wc-stamp-objection,
  .exit-dismiss .wc-stamp-dismiss {
    opacity: 0.92;
    transform: rotate(-8deg) scale(1);
  }

  /* Card exits — tuned per verdict (proof rises, objection falls right, dismiss drains) */
  .exit-proof,
  .exit-objection,
  .exit-dismiss {
    opacity: 0;
  }

  .exit-proof {
    transform: translateY(-24px) rotate(1deg);
  }

  .exit-objection {
    transform: translateX(40px) rotate(-2deg);
  }

  .exit-dismiss {
    transform: translateX(-32px) scale(0.97);
    filter: grayscale(1);
  }

  /* Lever strip — embossed slate switches with warm-brass borders.
     The only place warm gold lives in the chamber: the levers are the
     physical mechanism the player throws to render a verdict. */
  .wc-levers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .lv {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    padding: 14px 12px;
    background: linear-gradient(180deg, #22262f 0%, #14171f 100%);
    border: 1px solid rgba(196, 162, 78, 0.35);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.08),
      inset 0 -1px 0 rgba(0, 0, 0, 0.5),
      0 4px 14px rgba(0, 0, 0, 0.45);
    color: var(--color-paper-dim);
    cursor: pointer;
    text-align: left;
    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease,
      background 0.2s ease;
  }

  .lv:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .lv-key {
    font-family: var(--font-readout);
    font-size: 9px;
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
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-paper-dim);
    letter-spacing: 0;
    text-transform: none;
    line-height: 1.3;
  }

  /* Per-verdict hover: 1px ring inside, glow outside, hint colors match. */
  .lv-proof:hover:not(:disabled) {
    border-color: var(--color-bone);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.12),
      inset 0 -1px 0 rgba(0, 0, 0, 0.5),
      0 0 0 1px var(--color-bone),
      0 8px 24px rgba(233, 228, 216, 0.18);
  }

  .lv-objection:hover:not(:disabled) {
    border-color: var(--color-ember);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.12),
      inset 0 -1px 0 rgba(0, 0, 0, 0.5),
      0 0 0 1px var(--color-ember),
      0 8px 24px rgba(210, 58, 42, 0.32);
  }

  .lv-objection:hover:not(:disabled) .lv-name {
    color: var(--color-ember);
  }

  .lv-dismiss:hover:not(:disabled) {
    border-color: var(--color-brass-dim);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.1),
      inset 0 -1px 0 rgba(0, 0, 0, 0.5),
      0 0 0 1px var(--color-brass-dim),
      0 8px 24px rgba(122, 118, 104, 0.25);
  }
</style>
