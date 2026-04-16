<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
  import ArchitectFeed from './ArchitectFeed.svelte';
  import EvidenceTally from './EvidenceTally.svelte';
</script>

<aside class="architect-panel">
  <div class="architect-header">
    <div class="panel-title-wrap">
      <h2 class="panel-title">The Architect</h2>
      <span class="panel-subtitle">Magistrate Feed</span>
    </div>
    {#if gameState.current.claim}
      <div class="claim-display">
        <span class="claim-label">The Claim</span>
        <p class="claim-text">&ldquo;{gameState.current.claim}&rdquo;</p>
      </div>
    {/if}
  </div>
  <ArchitectFeed />
  <EvidenceTally />
</aside>

<style>
  .architect-panel {
    display: flex;
    flex-direction: column;
    width: 332px;
    height: 100%;
    flex-shrink: 0;
    background:
      linear-gradient(180deg, rgba(22, 25, 36, 0.95) 0%, rgba(13, 16, 23, 0.93) 100%);
    border-right: 1px solid rgba(196, 162, 78, 0.32);
    box-shadow:
      10px 0 34px rgba(0, 0, 0, 0.4),
      inset -1px 0 0 rgba(255, 255, 255, 0.05);
    position: relative;
  }

  .architect-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 20% -10%, rgba(240, 141, 60, 0.12), transparent 38%),
      radial-gradient(circle at 80% 100%, rgba(196, 162, 78, 0.08), transparent 40%);
  }

  .architect-header {
    position: relative;
    z-index: 1;
    padding: 1rem 1.15rem 0.75rem;
    border-bottom: 1px solid rgba(196, 162, 78, 0.28);
  }

  .panel-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .panel-title {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--color-brass-glow);
    text-shadow: 0 0 14px rgba(196, 162, 78, 0.24);
  }

  .panel-subtitle {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-parchment-dim);
  }

  .claim-display {
    margin-top: 0.85rem;
    padding: 0.75rem 0.85rem;
    background: rgba(196, 162, 78, 0.05);
    border: 1px solid rgba(196, 162, 78, 0.16);
    border-radius: 0.2rem;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25);
  }

  .claim-label {
    font-family: var(--font-readout);
    font-size: 0.52rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .claim-text {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-style: italic;
    color: var(--color-parchment);
    line-height: 1.45;
    margin-top: 0.35rem;
  }

  @media (max-width: 767px) {
    .architect-panel {
      display: none;
    }
  }
</style>
