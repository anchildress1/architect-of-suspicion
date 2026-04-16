<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Card, Classification } from '$lib/types';

  interface Props {
    card: Card;
    onClassify: (card: Card, classification: Classification) => void;
    disabled?: boolean;
  }

  let { card, onClassify, disabled = false }: Props = $props();
  let chosenClassification = $state<Classification | null>(null);
  let expanded = $state(false);
  let animationTimer: ReturnType<typeof setTimeout> | null = null;

  function handleClassify(classification: Classification) {
    if (chosenClassification || disabled) return;
    chosenClassification = classification;
    animationTimer = setTimeout(() => onClassify(card, classification), 350);
  }

  onDestroy(() => {
    if (animationTimer) clearTimeout(animationTimer);
  });
</script>

<div
  class="evidence-card"
  class:exit-proof={chosenClassification === 'proof'}
  class:exit-objection={chosenClassification === 'objection'}
  class:is-expanded={expanded}
  role="article"
  aria-label="Evidence: {card.title}"
>
  <!-- Top accent line -->
  <div class="card-accent"></div>

  <div class="card-body">
    <div class="card-category">{card.category ?? 'Evidence'}</div>
    <h3 class="card-title">{card.title}</h3>
    <button
      class="card-summary-toggle"
      onclick={() => (expanded = !expanded)}
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide evidence summary' : 'Show evidence summary'}
    >
      {expanded ? 'Fold summary' : 'Read summary'}
    </button>
    <p class="card-blurb" class:card-blurb-expanded={expanded}>{card.blurb}</p>
  </div>

  {#if !chosenClassification}
    <div class="card-actions">
      <button
        onclick={() => handleClassify('proof')}
        disabled={disabled}
        class="card-action card-action-proof"
        aria-label="Classify {card.title} as proof"
      >
        <span class="action-icon">&#9670;</span>
        Proof
      </button>
      <div class="action-divider"></div>
      <button
        onclick={() => handleClassify('objection')}
        disabled={disabled}
        class="card-action card-action-objection"
        aria-label="Classify {card.title} as objection"
      >
        <span class="action-icon">&#9671;</span>
        Objection
      </button>
    </div>
  {/if}
</div>

<style>
  .evidence-card {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 16rem;
    min-height: 12.75rem;
    background: linear-gradient(
      165deg,
      rgba(30, 34, 44, 0.9) 0%,
      rgba(21, 24, 33, 0.88) 50%,
      rgba(10, 12, 18, 0.92) 100%
    );
    backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid rgba(196, 162, 78, 0.18);
    box-shadow:
      0 6px 28px rgba(0, 0, 0, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      inset 0 -1px 0 rgba(0, 0, 0, 0.34);
    border-radius: 0.3rem;
    overflow: hidden;
    transition:
      border-color 0.3s ease,
      transform 0.3s ease,
      box-shadow 0.3s ease,
      opacity 0.35s ease;
  }

  .evidence-card:hover {
    border-color: rgba(196, 162, 78, 0.5);
    transform: translateY(-4px);
    box-shadow:
      0 16px 40px rgba(0, 0, 0, 0.52),
      0 0 20px rgba(196, 162, 78, 0.12),
      inset 0 1px 0 rgba(196, 162, 78, 0.12);
  }

  .card-accent {
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--color-brass-dim), transparent);
    opacity: 0.7;
    transition: opacity 0.3s;
  }

  .evidence-card:hover .card-accent {
    opacity: 1;
    background: linear-gradient(90deg, transparent, var(--color-brass), transparent);
  }

  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1rem 1rem 0.7rem;
    gap: 0.4rem;
  }

  .card-category {
    font-family: var(--font-readout);
    font-size: 0.52rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--color-parchment);
    line-height: 1.3;
    text-wrap: balance;
  }

  .card-summary-toggle {
    width: fit-content;
    border: 1px solid rgba(196, 162, 78, 0.18);
    background: rgba(10, 12, 18, 0.46);
    color: var(--color-brass-dim);
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 0.22rem 0.4rem;
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .card-summary-toggle:hover {
    border-color: rgba(196, 162, 78, 0.42);
    color: var(--color-brass-glow);
  }

  .card-blurb {
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--color-parchment-dim);
    line-height: 1.5;
    flex: 1;
    margin-top: 0.1rem;
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition:
      max-height 0.3s ease,
      opacity 0.25s ease;
  }

  .card-blurb-expanded {
    max-height: 7.5rem;
    opacity: 1;
  }

  .is-expanded {
    min-height: 14.4rem;
  }

  .card-actions {
    display: flex;
    align-items: stretch;
    border-top: 1px solid rgba(196, 162, 78, 0.16);
    background: rgba(8, 9, 12, 0.58);
  }

  .action-divider {
    width: 1px;
    background: rgba(196, 162, 78, 0.1);
  }

  .card-action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    font-family: var(--font-readout);
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 0.7rem 0.45rem;
    border: none;
    background: none;
    cursor: pointer;
    transition: all 0.25s;
    text-align: center;
  }

  .card-action:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .action-icon {
    font-size: 0.5rem;
    transition: transform 0.25s;
  }

  .card-action:hover:not(:disabled) .action-icon {
    transform: scale(1.3);
  }

  .card-action-proof {
    color: var(--color-brass);
  }

  .card-action-proof:hover:not(:disabled) {
    color: var(--color-brass);
    background: rgba(196, 162, 78, 0.08);
  }

  .card-action-objection {
    color: var(--color-ember);
  }

  .card-action-objection:hover:not(:disabled) {
    color: #e87a50;
    background: rgba(212, 102, 58, 0.08);
  }

  /* Exit animations */
  .exit-proof {
    opacity: 0;
    transform: translateY(-28px) scale(0.92);
  }

  .exit-objection {
    opacity: 0;
    transform: translateY(28px) scale(0.92);
  }
</style>
