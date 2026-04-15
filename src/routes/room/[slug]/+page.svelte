<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';
  import EvidenceCard from '$lib/components/EvidenceCard.svelte';
  import type { Card, Classification } from '$lib/types';

  let { data } = $props();

  // Intentionally capture initial server data — hand/pool are managed client-side
  const room = untrack(() => data.room);
  let hand = $state<Card[]>(untrack(() => [...data.cards]));
  let drawPool = $state<Card[]>(untrack(() => [...data.pool]));
  let exhausted = $derived(hand.length === 0 && drawPool.length === 0);
  let evaluating = $state(false);

  onMount(() => {
    gameState.visitRoom(room.slug);
    requestNarration('enter_room', room.slug);
  });

  async function handleClassify(card: Card, classification: Classification) {
    gameState.addFeedEntry({
      id: crypto.randomUUID(),
      type: 'action',
      text: `Classified "${card.title}" as ${classification}`,
      timestamp: Date.now(),
    });

    const idx = hand.findIndex((c) => c.objectID === card.objectID);
    if (idx !== -1) {
      if (drawPool.length > 0) {
        const replacement = drawPool[0];
        hand = [...hand.slice(0, idx), replacement, ...hand.slice(idx + 1)];
        drawPool = drawPool.slice(1);
      } else {
        hand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
      }
    }

    const deliberatingId = crypto.randomUUID();
    gameState.addFeedEntry({
      id: deliberatingId,
      type: 'narration',
      text: 'The Architect deliberates...',
      timestamp: Date.now(),
    });

    evaluating = true;

    let reactionText: string | null = null;

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: gameState.current.sessionId,
          claim: gameState.current.claim,
          card_id: card.objectID,
          classification,
        }),
      });

      if (res.ok) {
        const { ai_reaction } = await res.json();
        reactionText = ai_reaction;
      }
    } finally {
      gameState.removeFeedEntry(deliberatingId);
      if (reactionText) {
        gameState.addFeedEntry({
          id: crypto.randomUUID(),
          type: 'reaction',
          text: reactionText,
          timestamp: Date.now(),
        });
      }
      gameState.addEvidence({ card, classification });
      evaluating = false;
    }
  }
</script>

<svelte:head>
  <title>{room.name} | Architect of Suspicion</title>
</svelte:head>

<div class="flex h-screen overflow-hidden">
  <ArchitectPanel />

  <main
    class="relative flex flex-1 flex-col overflow-hidden"
    style="background: url('{room.background}') center/cover no-repeat"
  >
    <!-- Dark overlay -->
    <div class="bg-void/50 absolute inset-0"></div>

    <!-- Content -->
    <div class="relative z-10 flex flex-1 flex-col">
      <!-- Top bar -->
      <header class="flex items-center justify-between px-6 py-4">
        <div>
          <h1 class="font-display text-parchment text-lg">{room.name}</h1>
          {#if room.category}
            <p class="font-readout text-brass-dim text-xs uppercase tracking-wider">
              {room.category}
            </p>
          {/if}
        </div>
        <a
          href={resolve('/mansion')}
          class="font-readout text-brass-dim hover:text-brass text-xs uppercase tracking-wider transition-colors"
        >
          Back to Mansion
        </a>
      </header>

      <!-- Card hand -->
      <div class="flex flex-1 items-center justify-center p-6">
        {#if exhausted}
          <div class="text-center">
            <p class="font-display text-brass mb-2 text-lg">Room Explored</p>
            <p class="font-body text-parchment-dim text-sm">
              All evidence in this room has been examined.
            </p>
            <a
              href={resolve('/mansion')}
              class="font-readout text-brass-dim hover:text-brass mt-4 inline-block text-xs uppercase tracking-wider transition-colors"
            >
              Return to Mansion
            </a>
          </div>
        {:else}
          <div class="grid grid-cols-3 gap-4">
            {#each hand as card (card.objectID)}
              <EvidenceCard {card} onClassify={handleClassify} disabled={evaluating} />
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </main>
</div>
