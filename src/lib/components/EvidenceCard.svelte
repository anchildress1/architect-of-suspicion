<script lang="ts">
  import type { Card, Classification } from '$lib/types';

  interface Props {
    card: Card;
    onClassify: (card: Card, classification: Classification) => void;
    disabled?: boolean;
  }

  let { card, onClassify, disabled = false }: Props = $props();
  let chosenClassification = $state<Classification | null>(null);

  function handleClassify(classification: Classification) {
    if (chosenClassification || disabled) return;
    chosenClassification = classification;
    // Delay callback so the exit animation plays before the card is removed
    setTimeout(() => onClassify(card, classification), 300);
  }
</script>

<div
  class="evidence-card bg-chamber/60 border-brass/20 hover:border-brass/50 flex h-56 w-40 flex-col rounded border backdrop-blur-sm transition-all duration-300"
  class:exit-proof={chosenClassification === 'proof'}
  class:exit-objection={chosenClassification === 'objection'}
>
  <div class="flex flex-1 flex-col p-3">
    <h3 class="font-display text-parchment mb-2 text-sm leading-tight">{card.title}</h3>
    <p class="font-body text-parchment-dim flex-1 text-xs leading-relaxed">{card.blurb}</p>
  </div>

  {#if !chosenClassification}
    <div class="border-t-brass/10 flex border-t">
      <button
        onclick={() => handleClassify('proof')}
        class="font-readout text-brass hover:bg-brass/15 flex-1 border-r border-r-brass/10 py-2 text-[10px] uppercase tracking-wider transition-colors"
      >
        Proof
      </button>
      <button
        onclick={() => handleClassify('objection')}
        class="font-readout text-forge-orange hover:bg-forge-orange/15 flex-1 py-2 text-[10px] uppercase tracking-wider transition-colors"
      >
        Objection
      </button>
    </div>
  {/if}
</div>

<style>
  .evidence-card {
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
  }
  .exit-proof {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  .exit-objection {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
</style>
