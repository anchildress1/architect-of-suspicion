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
  let evaluatingIdx = $state<number | null>(null);

  onMount(() => {
    gameState.visitRoom(room.slug);
    requestNarration('enter_room', room.slug);
  });

  async function handleClassify(card: Card, classification: Classification) {
    const deliberatingId = crypto.randomUUID();
    gameState.addFeedEntry({
      id: deliberatingId,
      type: 'narration',
      text: 'The Architect deliberates...',
      timestamp: Date.now(),
    });

    evaluating = true;
    evaluatingIdx = hand.findIndex((c) => c.objectID === card.objectID);

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

      if (!res.ok) {
        gameState.removeFeedEntry(deliberatingId);
        gameState.addFeedEntry({
          id: crypto.randomUUID(),
          type: 'narration',
          text: 'The gears seize — this evidence could not be processed.',
          timestamp: Date.now(),
        });
        return;
      }

      const { ai_reaction } = await res.json();

      // Only advance state after successful evaluation
      gameState.addFeedEntry({
        id: crypto.randomUUID(),
        type: 'action',
        text: `Classified "${card.title}" as ${classification}`,
        timestamp: Date.now(),
      });
      gameState.removeFeedEntry(deliberatingId);

      if (ai_reaction) {
        gameState.addFeedEntry({
          id: crypto.randomUUID(),
          type: 'reaction',
          text: ai_reaction,
          timestamp: Date.now(),
        });
      }

      gameState.addEvidence({ card, classification });

      // Replace card in hand from draw pool
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
    } catch {
      gameState.removeFeedEntry(deliberatingId);
      gameState.addFeedEntry({
        id: crypto.randomUUID(),
        type: 'narration',
        text: 'The gears seize — this evidence could not be processed.',
        timestamp: Date.now(),
      });
    } finally {
      evaluating = false;
      evaluatingIdx = null;
    }
  }
</script>

<svelte:head>
  <title>{room.name} | Architect of Suspicion</title>
  <link rel="preload" as="image" href={room.background} fetchpriority="high" />
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
            {#each hand as card, i (card.objectID)}
              {#if evaluatingIdx === i}
                <div class="card-shimmer" aria-label="Evaluating evidence">
                  <div class="shimmer-accent"></div>
                  <div class="shimmer-body">
                    <div class="shimmer-line shimmer-line-short"></div>
                    <div class="shimmer-line shimmer-line-long"></div>
                    <div class="shimmer-line shimmer-line-med"></div>
                  </div>
                </div>
              {:else}
                <EvidenceCard {card} onClassify={handleClassify} disabled={evaluating} />
              {/if}
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
    background: linear-gradient(
      to bottom,
      rgba(8, 9, 12, 0.7) 0%,
      rgba(8, 9, 12, 0.4) 40%,
      rgba(8, 9, 12, 0.6) 100%
    );
  }

  .room-content {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Top bar */
  .room-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 2rem;
    background: linear-gradient(to bottom, rgba(10, 12, 18, 0.95), transparent);
    flex-shrink: 0;
  }

  .room-title {
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 3vw, 1.6rem);
    font-weight: 700;
    color: var(--color-parchment);
    letter-spacing: 0.06em;
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  }

  .room-subtitle {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.25rem;
  }

  .btn-back {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-decoration: none;
    padding: 0.4rem 0.75rem;
    border: 1px solid rgba(196, 162, 78, 0.2);
    border-radius: 0.25rem;
    transition: all 0.25s;
  }

  .btn-back:hover {
    color: var(--color-brass);
    border-color: rgba(196, 162, 78, 0.4);
    background: rgba(196, 162, 78, 0.06);
  }

  /* Card area */
  .card-area {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1.5rem 2rem 2rem;
    overflow-y: auto;
    min-height: 0;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
    max-width: 52rem;
    width: 100%;
  }

  /* Exhausted state */
  .room-exhausted {
    text-align: center;
    align-self: center;
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

  /* Shimmer placeholder during evaluation */
  .card-shimmer {
    display: flex;
    flex-direction: column;
    width: 15rem;
    min-height: 13rem;
    background: linear-gradient(
      165deg,
      rgba(28, 31, 42, 0.95) 0%,
      rgba(19, 22, 31, 0.92) 50%,
      rgba(13, 16, 23, 0.95) 100%
    );
    border: 1px solid rgba(196, 162, 78, 0.25);
    border-radius: 0.5rem;
    overflow: hidden;
    animation: shimmerPulse 1.5s ease-in-out infinite;
  }

  .shimmer-accent {
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--color-brass-dim), transparent);
    animation: shimmerSlide 1.5s ease-in-out infinite;
  }

  .shimmer-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem 1.125rem;
  }

  .shimmer-line {
    height: 0.75rem;
    background: rgba(196, 162, 78, 0.06);
    border-radius: 0.25rem;
  }

  .shimmer-line-short {
    width: 40%;
  }

  .shimmer-line-long {
    width: 85%;
  }

  .shimmer-line-med {
    width: 60%;
  }

  @keyframes shimmerPulse {
    0%, 100% {
      border-color: rgba(196, 162, 78, 0.15);
    }
    50% {
      border-color: rgba(196, 162, 78, 0.35);
    }
  }

  @keyframes shimmerSlide {
    0% {
      opacity: 0.3;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.3;
    }
  }

  @media (max-width: 900px) {
    .card-grid {
      grid-template-columns: repeat(2, 1fr);
      max-width: 34rem;
    }
  }

  @media (max-width: 540px) {
    .card-grid {
      grid-template-columns: 1fr;
      max-width: 17rem;
    }
  }
</style>
