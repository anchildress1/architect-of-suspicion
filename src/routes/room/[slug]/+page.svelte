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
    class="room-main"
    style="background: url('{room.background}') center/cover no-repeat"
  >
    <!-- Dark overlay -->
    <div class="room-overlay"></div>

    <!-- Content -->
    <div class="room-content">
      <!-- Top bar -->
      <header class="room-top-bar">
        <div>
          <h1 class="room-title">{room.name}</h1>
          {#if room.category}
            <p class="room-subtitle">{room.category}</p>
          {/if}
        </div>
        <a href={resolve('/mansion')} class="btn-back" aria-label="Return to mansion">
          Back to Mansion
        </a>
      </header>

      <!-- Card hand -->
      <div class="card-area">
        {#if exhausted}
          <div class="room-exhausted">
            <p class="room-exhausted-title">Room Explored</p>
            <p class="room-exhausted-text">
              All evidence in this room has been examined.
            </p>
            <a href={resolve('/mansion')} class="btn-back" aria-label="Return to mansion">
              Return to Mansion
            </a>
          </div>
        {:else}
          <div class="card-grid">
            {#each hand as card (card.objectID)}
              <EvidenceCard {card} onClassify={handleClassify} disabled={evaluating} />
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </main>
</div>

<style>
  .room-main {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .room-overlay {
    position: absolute;
    inset: 0;
    background: rgba(8, 9, 12, 0.5);
  }

  .room-content {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  /* Top bar */
  .room-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: linear-gradient(to bottom, rgba(10, 12, 18, 0.9), transparent);
  }

  .room-title {
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 3vw, 1.8rem);
    font-weight: 700;
    color: var(--color-parchment);
    letter-spacing: 0.06em;
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  }

  .room-subtitle {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.25rem;
  }

  .btn-back {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-decoration: none;
    transition: color 0.3s;
  }

  .btn-back:hover {
    color: var(--color-brass);
  }

  /* Card area */
  .card-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 1rem;
    justify-content: center;
  }

  /* Exhausted state */
  .room-exhausted {
    text-align: center;
  }

  .room-exhausted-title {
    font-family: var(--font-display);
    font-size: 1.2rem;
    color: var(--color-brass);
    margin-bottom: 0.5rem;
  }

  .room-exhausted-text {
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-parchment-dim);
    margin-bottom: 1rem;
  }

  @media (max-width: 767px) {
    .card-grid {
      grid-template-columns: repeat(2, auto);
      gap: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
