<script lang="ts">
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

  function decide(c: Classification) {
    if (chosen || disabled) return;
    chosen = c;
    // Fire the pick immediately — the stamp + exit transitions on this card
    // play in parallel with the API call (typically 2–5s round-trip), giving
    // the player far more readtime than the previous 360ms cosmetic delay.
    onDecide(card, c);
  }
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
    <span class="wc-id">Exhibit {index + 1} / {total}</span>
  </header>

  <h2 class="wc-title">{card.title}</h2>
  <p class="wc-body">{card.blurb}</p>

  <div class="wc-stamp wc-stamp-proof" aria-hidden={chosen !== 'proof'}>Proof</div>
  <div class="wc-stamp wc-stamp-objection" aria-hidden={chosen !== 'objection'}>Objection</div>
  <div class="wc-stamp wc-stamp-dismiss" aria-hidden={chosen !== 'dismiss'}>Struck</div>

  {#if !chosen}
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
  /* Mechanical witness card — dark instrument panel on a darker stage.
     The 3px ember left rule is the only chromatic event at rest. */
  .witness-card {
    position: relative;
    width: min(100%, 36rem);
    background: linear-gradient(180deg, rgba(20, 20, 23, 0.92) 0%, rgba(11, 11, 13, 0.96) 100%);
    border: 1px solid rgba(233, 228, 216, 0.18);
    color: var(--color-paper);
    box-shadow:
      0 30px 60px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(233, 228, 216, 0.04);
    padding: 2rem 2.25rem 1.4rem;
    overflow: hidden;
    transition:
      transform 360ms var(--ease-snap),
      opacity 360ms ease,
      filter 360ms ease;
  }

  /* 2px ember left rule — the universal "voice" edge across the app. */
  .wc-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 2px;
    background: var(--color-ember);
    pointer-events: none;
  }

  .wc-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1.4rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.12);
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .wc-title {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 400;
    font-size: clamp(1.4rem, 2.2vw, 1.95rem);
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
    max-width: 56ch;
    margin-bottom: 1.8rem;
    text-wrap: pretty;
  }

  /* Stamps — top-right, blue/red/neutral verdict colors on dark. */
  .wc-stamp {
    position: absolute;
    top: 36px;
    right: 44px;
    transform-origin: top right;
    transform: rotate(-8deg) scale(1.2);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 3px solid currentColor;
    padding: 0.4rem 0.9rem;
    background: rgba(11, 11, 13, 0.55);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity var(--motion-snap) ease-out,
      transform var(--motion-snap) var(--ease-overshoot);
  }

  .wc-stamp-proof {
    color: var(--color-cyan-ink);
  }
  .wc-stamp-objection {
    color: var(--color-ember);
  }
  .wc-stamp-dismiss {
    color: var(--color-brass-dim);
  }

  .exit-proof .wc-stamp-proof,
  .exit-objection .wc-stamp-objection,
  .exit-dismiss .wc-stamp-dismiss {
    opacity: 0.95;
    transform: rotate(-8deg) scale(1);
  }

  /* Card exits — proof rises, objection falls right, dismiss drains. */
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

  /* Levers — neutral instrument switches; verdict color appears on hover. */
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
    background: rgba(11, 11, 13, 0.7);
    border: 1px solid rgba(233, 228, 216, 0.18);
    color: var(--color-paper-dim);
    cursor: pointer;
    text-align: left;
    transition:
      box-shadow var(--motion-base) var(--ease-out),
      border-color var(--motion-base) var(--ease-out),
      background var(--motion-base) var(--ease-out),
      color var(--motion-base) var(--ease-out);
  }

  .lv:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .lv-key {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .lv-name {
    font-family: var(--font-display);
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

  /* Per-verdict hover: ring + glow in the verdict color (blue/red/neutral). */
  .lv-proof:hover:not(:disabled) {
    border-color: var(--color-cyan-ink);
    color: var(--color-paper);
    box-shadow:
      0 0 0 1px var(--color-cyan-ink),
      0 8px 24px rgba(107, 143, 176, 0.28);
  }

  .lv-proof:hover:not(:disabled) .lv-name {
    color: var(--color-cyan-ink);
  }

  .lv-objection:hover:not(:disabled) {
    border-color: var(--color-ember);
    color: var(--color-paper);
    box-shadow:
      0 0 0 1px var(--color-ember),
      0 8px 24px rgba(210, 58, 42, 0.32);
  }

  .lv-objection:hover:not(:disabled) .lv-name {
    color: var(--color-ember);
  }

  .lv-dismiss:hover:not(:disabled) {
    border-color: var(--color-brass-dim);
    color: var(--color-paper);
    box-shadow:
      0 0 0 1px var(--color-brass-dim),
      0 8px 24px rgba(122, 118, 104, 0.22);
  }
</style>
