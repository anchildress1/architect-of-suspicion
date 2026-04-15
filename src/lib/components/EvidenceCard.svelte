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
  role="article"
  aria-label="Evidence: {card.title}"
>
  <!-- Top accent line -->
  <div class="card-accent"></div>

  <div class="card-body">
    <div class="card-category">{card.category ?? 'Evidence'}</div>
    <h3 class="card-title">{card.title}</h3>
    <p class="card-blurb">{card.blurb}</p>
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
    width: 15rem;
    min-height: 13rem;
    background: linear-gradient(
      165deg,
      rgba(28, 31, 42, 0.88) 0%,
      rgba(19, 22, 31, 0.85) 50%,
      rgba(13, 16, 23, 0.9) 100%
    );
    backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    border-radius: 0.5rem;
    overflow: hidden;
    transition:
      border-color 0.3s ease,
      transform 0.3s ease,
      box-shadow 0.3s ease,
      opacity 0.35s ease;
  }

  .evidence-card:hover {
    border-color: rgba(196, 162, 78, 0.4);
    transform: translateY(-4px);
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.6),
      0 0 20px rgba(196, 162, 78, 0.08),
      inset 0 1px 0 rgba(196, 162, 78, 0.1);
  }

  .card-accent {
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--color-brass-dim), transparent);
    opacity: 0.5;
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
    padding: 1rem 1.125rem 0.75rem;
    gap: 0.375rem;
  }

  .card-category {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    opacity: 0.7;
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--color-parchment);
    line-height: 1.35;
  }

  .card-blurb {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--color-parchment-dim);
    line-height: 1.55;
    flex: 1;
    margin-top: 0.25rem;
  }

  .card-actions {
    display: flex;
    align-items: stretch;
    border-top: 1px solid rgba(196, 162, 78, 0.1);
    background: rgba(8, 9, 12, 0.4);
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
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.65rem 0.5rem;
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
    color: var(--color-brass-dim);
  }

  .card-action-proof:hover:not(:disabled) {
    color: var(--color-brass);
    background: rgba(196, 162, 78, 0.08);
  }

  .card-action-objection {
    color: var(--color-forge-orange);
  }

  .card-action-objection:hover:not(:disabled) {
    color: #e87a50;
    background: rgba(212, 102, 58, 0.08);
  }

  /* Exit animations */
  .exit-proof {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }

  .exit-objection {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
</style>
