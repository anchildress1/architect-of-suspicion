<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
  import ArchitectFeed from './ArchitectFeed.svelte';
  import EvidenceTally from './EvidenceTally.svelte';
</script>

<aside class="architect-panel">
  <div class="architect-header">
    <h2 class="panel-title">The Architect</h2>
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
    width: 300px;
    height: 100%;
    flex-shrink: 0;
    background: rgba(17, 25, 40, 0.78);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px) saturate(150%);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
  }

  .architect-header {
    padding: 1.25rem 1.25rem 0.75rem;
    border-bottom: 1px solid rgba(196, 162, 78, 0.1);
  }

  .panel-title {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--color-brass);
  }

  .claim-display {
    margin-top: 0.75rem;
    padding: 0.625rem 0.75rem;
    background: rgba(196, 162, 78, 0.04);
    border: 1px solid rgba(196, 162, 78, 0.1);
    border-radius: 0.25rem;
  }

  .claim-label {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .claim-text {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-style: italic;
    color: var(--color-parchment);
    line-height: 1.5;
    margin-top: 0.25rem;
  }

  @media (max-width: 767px) {
    .architect-panel {
      display: none;
    }
  }
</style>
