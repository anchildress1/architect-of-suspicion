<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';

  const total = $derived(gameState.proofCount + gameState.objectionCount);
  const proofPct = $derived(total > 0 ? (gameState.proofCount / total) * 100 : 0);
  const objectionPct = $derived(total > 0 ? (gameState.objectionCount / total) * 100 : 0);
</script>

<div class="evidence-tally" aria-label="Evidence tally">
  <h3 class="tally-header">Evidence Ledger</h3>

  <div class="tally-row">
    <span class="tally-label tally-label-proof">Proof</span>
    <div class="tally-bar">
      <div class="tally-bar-fill tally-fill-proof" style="width: {proofPct}%"></div>
    </div>
    <span class="tally-count">{gameState.proofCount}</span>
  </div>

  <div class="tally-row">
    <span class="tally-label tally-label-objection">Objection</span>
    <div class="tally-bar">
      <div class="tally-bar-fill tally-fill-objection" style="width: {objectionPct}%"></div>
    </div>
    <span class="tally-count">{gameState.objectionCount}</span>
  </div>
</div>

<style>
  .evidence-tally {
    position: relative;
    z-index: 1;
    padding: 0.9rem 1rem;
    border-top: 1px solid rgba(196, 162, 78, 0.18);
    background: rgba(10, 12, 18, 0.66);
  }

  .tally-header {
    font-family: var(--font-readout);
    font-size: 0.52rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.55rem;
  }

  .tally-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.28rem 0;
  }

  .tally-label {
    font-family: var(--font-readout);
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    min-width: 4.6rem;
  }

  .tally-label-proof {
    color: var(--color-brass-dim);
  }

  .tally-label-objection {
    color: var(--color-forge-orange);
  }

  .tally-bar {
    flex: 1;
    height: 4px;
    margin: 0 0.7rem;
    background: rgba(196, 162, 78, 0.14);
    position: relative;
    overflow: hidden;
    border-radius: 1px;
  }

  .tally-bar-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    transition: width 0.6s ease;
  }

  .tally-fill-proof {
    background: var(--color-brass-dim);
  }

  .tally-fill-objection {
    background: var(--color-forge-orange);
  }

  .tally-count {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--color-parchment-dim);
    min-width: 1.25rem;
    text-align: right;
  }
</style>
