<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
  import AttentionMeter from './AttentionMeter.svelte';
  import ArchitectFeed from './ArchitectFeed.svelte';
  import EvidenceTally from './EvidenceTally.svelte';

  interface Props {
    /** Whether to show the "Render verdict" link in the rail. */
    showVerdictLink?: boolean;
  }

  let { showVerdictLink = true }: Props = $props();
</script>

<aside class="architect-panel transition-architect" aria-label="The Architect's rail">
  <header class="panel-head">
    <h2 class="panel-title">The Architect</h2>
  </header>

  <AttentionMeter value={gameState.attention} />

  {#if gameState.current.claimText}
    <blockquote class="panel-claim transition-claim">
      &ldquo;{gameState.current.claimText}&rdquo;
    </blockquote>
  {/if}

  <ArchitectFeed />

  <EvidenceTally />

  {#if showVerdictLink && gameState.current.sessionId}
    <a class="panel-render" href="/verdict" data-active={gameState.ruledCount > 0}>
      <span class="pr-mark" aria-hidden="true">&sect;</span>
      <span class="pr-text">Render your verdict</span>
      <span class="pr-arrow" aria-hidden="true">&rarr;</span>
    </a>
  {/if}
</aside>

<style>
  .architect-panel {
    position: sticky;
    top: 0;
    z-index: 20;
    width: 320px;
    height: 100vh;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: rgba(11, 11, 13, 0.96);
    border-right: 1px solid rgba(233, 228, 216, 0.1);
    backdrop-filter: blur(20px);
  }

  .panel-head {
    padding: 1.1rem 1rem 0.85rem;
    text-align: center;
    border-bottom: 1px solid rgba(233, 228, 216, 0.08);
  }

  .panel-title {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.6rem;
    color: var(--color-bone);
    line-height: 1;
  }

  /* The italic claim with the ember left rule is its own context — no eyebrow. */
  .panel-claim {
    margin: 0;
    padding: 0.85rem 1rem 0.85rem 1.2rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.08);
    border-left: 2px solid rgba(210, 58, 42, 0.45);
    background: rgba(20, 20, 23, 0.5);
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--color-paper);
    line-height: 1.4;
  }

  .panel-render {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.6rem;
    align-items: center;
    padding: 0.95rem 1rem;
    border-top: 1px solid rgba(233, 228, 216, 0.1);
    text-decoration: none;
    color: var(--color-brass-dim);
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    background: rgba(11, 11, 13, 0.7);
    transition:
      background var(--motion-base) var(--ease-out),
      color var(--motion-base) var(--ease-out),
      box-shadow var(--motion-base) var(--ease-out);
  }

  .panel-render[data-active='true'] {
    color: var(--color-bone);
  }

  .panel-render:hover {
    background: rgba(210, 58, 42, 0.08);
    color: var(--color-bone);
    box-shadow: inset 2px 0 0 var(--color-ember);
  }

  .pr-mark {
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--color-ember);
    transition: text-shadow var(--motion-base) var(--ease-out);
  }

  .panel-render:hover .pr-mark {
    text-shadow: 0 0 12px rgba(210, 58, 42, 0.4);
  }

  .pr-arrow {
    transition: transform var(--motion-base) var(--ease-out);
  }

  .panel-render:hover .pr-arrow {
    transform: translateX(4px);
    color: var(--color-ember);
  }

  @media (max-width: 767px) {
    .architect-panel {
      display: none;
    }
  }
</style>
