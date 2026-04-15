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
  let totalEvaluated = $derived(gameState.current.evidence.length);
  let roomTension = $derived(totalEvaluated >= 10 ? 'high' : totalEvaluated >= 5 ? 'mid' : 'low');
  let evaluating = $state(false);
  let evaluatingIdx = $state<number | null>(null);

  onMount(() => {
    const alreadyVisited = gameState.current.roomsVisited.includes(room.slug);
    gameState.visitRoom(room.slug);
    if (!alreadyVisited) {
      requestNarration('enter_room', room.slug);
    }
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
    data-tension={roomTension}
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
        <p class="room-ledger">Hand {hand.length} / Pool {drawPool.length}</p>
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
                  <div class="shimmer-stamp">Processing</div>
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
    background-color: var(--color-void);
  }

  .room-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(8, 9, 12, 0.78) 0%,
      rgba(8, 9, 12, 0.45) 40%,
      rgba(8, 9, 12, 0.68) 100%
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
    gap: 1rem;
    padding: 0.95rem 1.4rem;
    background: linear-gradient(to bottom, rgba(10, 12, 18, 0.95), transparent);
    flex-shrink: 0;
  }

  .room-title {
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 3vw, 1.75rem);
    font-weight: 700;
    color: var(--color-parchment);
    letter-spacing: 0.08em;
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  }

  .room-subtitle {
    font-family: var(--font-readout);
    font-size: 0.52rem;
    letter-spacing: 0.23em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.25rem;
  }

  .room-ledger {
    margin-left: auto;
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    border: 1px solid rgba(196, 162, 78, 0.2);
    background: rgba(8, 9, 12, 0.64);
    padding: 0.2rem 0.45rem;
    border-radius: 1px;
    white-space: nowrap;
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
    padding: 1.3rem 1.5rem 1.8rem;
    overflow-y: auto;
    min-height: 0;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    max-width: 54rem;
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
    width: 16rem;
    min-height: 12.75rem;
    background: linear-gradient(
      165deg,
      rgba(28, 31, 42, 0.95) 0%,
      rgba(19, 22, 31, 0.92) 50%,
      rgba(13, 16, 23, 0.95) 100%
    );
    border: 1px solid rgba(196, 162, 78, 0.25);
    border-radius: 0.3rem;
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

  .shimmer-stamp {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    border-top: 1px solid rgba(196, 162, 78, 0.15);
    padding: 0.45rem 0.6rem;
    background: rgba(8, 9, 12, 0.5);
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
    .room-ledger {
      display: none;
    }

    .room-top-bar {
      padding: 0.85rem 1rem;
    }

    .card-area {
      padding: 1rem;
    }

    .card-grid {
      grid-template-columns: repeat(2, 1fr);
      max-width: 34rem;
    }
  }

  @media (max-width: 700px) {
    .room-top-bar {
      flex-wrap: wrap;
    }
  }

  @media (max-width: 540px) {
    .card-grid {
      grid-template-columns: 1fr;
      max-width: 17rem;
    }
  }

  .room-main[data-tension='mid'] .room-title {
    color: var(--color-brass-glow);
  }

  .room-main[data-tension='high'] .room-overlay {
    background:
      radial-gradient(circle at 70% 10%, rgba(240, 141, 60, 0.18), transparent 30%),
      linear-gradient(
        to bottom,
        rgba(8, 9, 12, 0.82) 0%,
        rgba(8, 9, 12, 0.52) 40%,
        rgba(8, 9, 12, 0.72) 100%
      );
  }

  .room-main[data-tension='high'] .room-title,
  .room-main[data-tension='high'] .room-subtitle,
  .room-main[data-tension='high'] .room-ledger {
    color: var(--color-ember);
    text-shadow: 0 0 8px rgba(240, 141, 60, 0.2);
  }

  .room-main[data-tension='high'] .card-grid {
    animation: boilerPulse 4s ease-in-out infinite;
  }

  @keyframes boilerPulse {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .room-main[data-tension='high'] .card-grid {
      animation: none;
    }
  }
</style>
