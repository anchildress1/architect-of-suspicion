<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
</script>

<div class="tally" aria-label="Evidence ruled and struck">
  <div class="tally-row tally-row-proof">
    <span class="tally-label tally-proof">Proof</span>
    <span class="tally-numeral">
      <span class="tally-count">{gameState.proofCount}</span>
      <span class="tally-cap">collected</span>
    </span>
  </div>
  <div class="tally-row tally-row-objection">
    <span class="tally-label tally-objection">Objection</span>
    <span class="tally-numeral">
      <span class="tally-count">{gameState.objectionCount}</span>
      <span class="tally-cap">collected</span>
    </span>
  </div>
  <div class="tally-row tally-row-dismiss">
    <span class="tally-label tally-dismiss">Struck</span>
    <span class="tally-numeral">
      <span class="tally-count">{gameState.dismissedCount}</span>
      <span class="tally-cap">collected</span>
    </span>
  </div>
</div>

<style>
  .tally {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    padding: 0.85rem 1rem;
    border-top: 1px solid rgba(233, 228, 216, 0.08);
    background: rgba(11, 11, 13, 0.5);
  }

  .tally-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }

  .tally-label {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .tally-proof {
    color: var(--color-cyan-ink);
  }
  .tally-objection {
    color: var(--color-ember);
  }
  .tally-dismiss {
    color: var(--color-brass-dim);
  }

  .tally-numeral {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    line-height: 1;
  }

  .tally-count {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
  }

  .tally-cap {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--color-brass-dim);
  }

  /* Proof = blue (cyan-ink), Objection = red (ember), Struck stays neutral. */
  .tally-row-proof .tally-count {
    color: var(--color-cyan-ink);
  }
  .tally-row-objection .tally-count {
    color: var(--color-ember);
  }
  .tally-row-dismiss .tally-count {
    color: var(--color-brass-dim);
  }
</style>
