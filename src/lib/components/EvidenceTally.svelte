<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
</script>

<div class="tally" aria-label="Evidence ruled and struck">
  <div class="tally-row">
    <span class="tally-label tally-proof">Proof</span>
    <span class="tally-count">{gameState.proofCount}</span>
  </div>
  <div class="tally-row">
    <span class="tally-label tally-objection">Objection</span>
    <span class="tally-count">{gameState.objectionCount}</span>
  </div>
  <div class="tally-row">
    <span class="tally-label tally-dismiss">Struck</span>
    <span class="tally-count">{gameState.dismissedCount}</span>
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
    gap: 0.25rem;
  }

  .tally-label {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .tally-proof {
    color: var(--color-bone);
  }
  .tally-objection {
    color: var(--color-cyan-ink);
  }
  .tally-dismiss {
    color: var(--color-brass-dim);
  }

  .tally-count {
    font-family: var(--font-display);
    font-size: 1.4rem;
    color: var(--color-bone);
    line-height: 1;
  }
</style>
