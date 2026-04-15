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
    // Delay callback so the exit animation plays before the card is removed
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
  <div class="card-indicator"></div>

  <div class="card-body">
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
        Proof
      </button>
      <button
        onclick={() => handleClassify('objection')}
        disabled={disabled}
        class="card-action card-action-objection"
        aria-label="Classify {card.title} as objection"
      >
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
    width: 10rem;
    height: 14rem;
    background: rgba(19, 22, 31, 0.8);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(196, 162, 78, 0.2);
    border-radius: 0.375rem;
    overflow: hidden;
    transition:
      border-color 0.4s ease,
      transform 0.4s ease,
      box-shadow 0.4s ease,
      opacity 0.35s ease;
  }

  .evidence-card:hover {
    border-color: rgba(196, 162, 78, 0.45);
    transform: translateY(-3px);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.5),
      0 0 1px rgba(196, 162, 78, 0.3);
  }

  .evidence-card::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-brass-dim), transparent);
    opacity: 0;
    transition: opacity 0.4s;
  }

  .evidence-card:hover::after {
    opacity: 1;
  }

  .card-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--color-brass-dim);
    margin: 0.75rem 0.75rem 0;
    flex-shrink: 0;
    transition: all 0.3s;
  }

  .evidence-card:hover .card-indicator {
    border-color: var(--color-brass);
    box-shadow: 0 0 6px rgba(196, 162, 78, 0.3);
  }

  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.75rem 0.75rem;
    overflow: hidden;
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-parchment);
    line-height: 1.4;
    margin-bottom: 0.5rem;
  }

  .card-blurb {
    font-family: var(--font-body);
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--color-parchment-dim);
    line-height: 1.5;
    flex: 1;
  }

  .card-actions {
    display: flex;
    border-top: 1px solid rgba(196, 162, 78, 0.1);
  }

  .card-action {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 0.55rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 0.5rem;
    border: none;
    background: none;
    cursor: pointer;
    transition: all 0.3s;
    text-align: center;
  }

  .card-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .card-action-proof {
    color: var(--color-brass-dim);
    border-right: 1px solid rgba(196, 162, 78, 0.1);
  }

  .card-action-proof:hover:not(:disabled) {
    color: var(--color-brass);
    background: rgba(196, 162, 78, 0.06);
  }

  .card-action-objection {
    color: var(--color-forge-orange);
  }

  .card-action-objection:hover:not(:disabled) {
    color: #e87a50;
    background: rgba(212, 102, 58, 0.06);
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
