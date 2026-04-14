<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';

  const total = $derived(gameState.proofCount + gameState.objectionCount);
  const proofPct = $derived(total > 0 ? (gameState.proofCount / total) * 100 : 0);
  const objectionPct = $derived(total > 0 ? (gameState.objectionCount / total) * 100 : 0);
</script>

<div class="evidence-tally" aria-label="Evidence tally">
  <h3 class="tally-header">Evidence Collected</h3>

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
    padding: 0.75rem 1.25rem;
    border-top: 1px solid rgba(196, 162, 78, 0.12);
    background: rgba(10, 12, 18, 0.5);
  }

  .tally-header {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.5rem;
  }

  .tally-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0;
  }

  .tally-label {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    min-width: 4rem;
  }

  .tally-label-proof {
    color: var(--color-brass-dim);
  }

  .tally-label-objection {
    color: var(--color-forge-orange);
  }

  .tally-bar {
    flex: 1;
    height: 2px;
    margin: 0 0.75rem;
    background: rgba(196, 162, 78, 0.08);
    position: relative;
    overflow: hidden;
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
    font-size: 0.6rem;
    color: var(--color-parchment-dim);
    min-width: 1rem;
    text-align: right;
  }
</style>
