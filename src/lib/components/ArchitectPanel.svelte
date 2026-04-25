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
  <div class="panel-head">
    <p class="panel-eyebrow">Magistrate &middot; Presiding</p>
    <h2 class="panel-title">The Architect</h2>
    <div class="panel-flourish" aria-hidden="true">
      <span class="bar"></span>
      <span class="diamond"></span>
      <span class="bar bar-flip"></span>
    </div>
  </div>

  <AttentionMeter value={gameState.attention} />

  {#if gameState.current.claimText}
    <div class="panel-claim transition-claim">
      <span class="claim-eyebrow">The Claim</span>
      <blockquote class="claim-text">&ldquo;{gameState.current.claimText}&rdquo;</blockquote>
    </div>
  {/if}

  <ArchitectFeed />

  <EvidenceTally />

  {#if showVerdictLink && gameState.current.sessionId}
    <a
      class="panel-render"
      href={'/verdict?session=' + gameState.current.sessionId}
      data-active={gameState.ruledCount > 0}
    >
      <span class="pr-mark">&sect;</span>
      <span class="pr-text">Render your verdict</span>
      <span class="pr-arrow">&rarr;</span>
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

  .panel-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .panel-title {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.6rem;
    color: var(--color-bone);
    margin-top: 0.3rem;
  }

  .panel-flourish {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .bar {
    width: 36px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-bone), transparent);
    opacity: 0.6;
  }

  .bar-flip {
    transform: scaleX(-1);
  }

  .diamond {
    width: 5px;
    height: 5px;
    background: var(--color-bone);
    transform: rotate(45deg);
    opacity: 0.7;
  }

  .panel-claim {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.08);
    background: rgba(20, 20, 23, 0.5);
  }

  .claim-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .claim-text {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--color-paper);
    line-height: 1.4;
    margin-top: 0.35rem;
    border-left: 2px solid rgba(210, 58, 42, 0.45);
    padding-left: 0.6rem;
  }

  .panel-render {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.6rem;
    align-items: center;
    padding: 0.85rem 1rem;
    border-top: 1px solid rgba(233, 228, 216, 0.1);
    text-decoration: none;
    color: var(--color-brass-dim);
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    transition: all 0.3s ease;
    background: rgba(11, 11, 13, 0.7);
  }

  .panel-render[data-active='true'] {
    color: var(--color-bone);
  }

  .panel-render:hover {
    background: rgba(233, 228, 216, 0.06);
    color: var(--color-bone);
  }

  .pr-mark {
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--color-ember);
  }

  .pr-arrow {
    transition: transform 0.3s ease;
  }

  .panel-render:hover .pr-arrow {
    transform: translateX(3px);
  }

  @media (max-width: 767px) {
    .architect-panel {
      display: none;
    }
  }
</style>
