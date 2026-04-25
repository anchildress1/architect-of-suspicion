<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';
  import WitnessCard from '$lib/components/WitnessCard.svelte';
  import WitnessQueue from '$lib/components/WitnessQueue.svelte';
  import type { Classification, ClaimCardEntry, EvaluateResponse } from '$lib/types';

  let { data } = $props();

  const room = untrack(() => data.room);
  const initialDeck = untrack(() => data.cards);

  let deck = $state<ClaimCardEntry[]>(initialDeck);
  let rulings = $state<Record<string, Classification>>({});
  let evaluating = $state(false);
  let pointer = $state(0);

  const remaining = $derived(deck.filter((c) => !rulings[c.objectID]).length);
  const current = $derived(deck[pointer]);
  const exhausted = $derived(remaining === 0);

  function nextUnruledIndex(from: number): number {
    for (let i = from + 1; i < deck.length; i++) {
      if (!rulings[deck[i].objectID]) return i;
    }
    for (let i = 0; i < deck.length; i++) {
      if (!rulings[deck[i].objectID]) return i;
    }
    return -1;
  }

  function jumpTo(index: number) {
    if (index < 0 || index >= deck.length) return;
    pointer = index;
  }

  async function decide(card: ClaimCardEntry, classification: Classification) {
    if (!gameState.current.sessionId || !gameState.current.claimId) return;

    const deliberatingId = crypto.randomUUID();
    gameState.addFeedEntry({
      id: deliberatingId,
      type: 'narration',
      text: 'The Architect deliberates&hellip;',
      timestamp: Date.now(),
    });

    evaluating = true;
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: card.objectID,
          classification,
        }),
      });

      gameState.removeFeedEntry(deliberatingId);

      if (!res.ok) {
        gameState.addFeedEntry({
          id: crypto.randomUUID(),
          type: 'narration',
          text: 'The mechanism seized — that exhibit could not be read.',
          timestamp: Date.now(),
        });
        return;
      }

      const { ai_reaction, attention } = (await res.json()) as EvaluateResponse;

      gameState.addFeedEntry({
        id: crypto.randomUUID(),
        type: 'action',
        text:
          classification === 'dismiss'
            ? `Struck "${card.title}" from the record.`
            : `Classified "${card.title}" as ${classification}.`,
        timestamp: Date.now(),
      });

      if (ai_reaction) {
        gameState.addFeedEntry({
          id: crypto.randomUUID(),
          type: 'reaction',
          text: ai_reaction,
          timestamp: Date.now(),
        });
      }

      gameState.addEvidence({ card, classification });
      gameState.setAttention(attention);

      rulings = { ...rulings, [card.objectID]: classification };
      const next = nextUnruledIndex(pointer);
      if (next >= 0) pointer = next;
    } catch {
      gameState.removeFeedEntry(deliberatingId);
      gameState.addFeedEntry({
        id: crypto.randomUUID(),
        type: 'narration',
        text: 'The mechanism seized — that exhibit could not be read.',
        timestamp: Date.now(),
      });
    } finally {
      evaluating = false;
    }
  }

  onMount(async () => {
    if (!gameState.current.sessionId) {
      window.location.href = '/';
      return;
    }
    const alreadyVisited = gameState.current.roomsVisited.includes(room.slug);
    gameState.visitRoom(room.slug);
    if (!alreadyVisited) {
      await requestNarration('enter_room', room.slug);
    }
  });
</script>

<svelte:head>
  <title>{room.name} | Architect of Suspicion</title>
  <link rel="preload" as="image" href={room.background} fetchpriority="high" />
</svelte:head>

<div class="chamber-shell">
  <ArchitectPanel />

  <main class="chamber-main">
    <div
      class="chamber-bg"
      style="background-image: url('{room.background}')"
      aria-hidden="true"
    ></div>
    <div class="chamber-overlay" aria-hidden="true"></div>

    <header class="chamber-head">
      <a class="back-link" href="/mansion">&larr; Back to Mansion</a>
      <div class="chamber-title-wrap">
        <p class="chamber-eyebrow">{room.category}</p>
        <h1 class="chamber-title">The <span class="flourish">{room.name}</span></h1>
      </div>
      <p class="chamber-clock">
        {remaining} / {deck.length} remaining
      </p>
    </header>

    <div class="chamber-stage">
      {#if exhausted || !current}
        <div class="chamber-empty reveal">
          <p class="chamber-empty-eyebrow">All exhibits ruled</p>
          <p class="chamber-empty-text">
            The Architect rests their gaze. You may render your verdict, or seek another chamber.
          </p>
          <div class="chamber-empty-actions">
            <a class="link-btn" href="/mansion">Return to Mansion</a>
            {#if gameState.current.sessionId}
              <a class="link-btn link-btn-primary" href="/verdict"> Render Verdict &rarr; </a>
            {/if}
          </div>
        </div>
      {:else}
        {#key current.objectID}
          <WitnessCard
            card={current}
            index={pointer}
            total={deck.length}
            onDecide={decide}
            disabled={evaluating}
          />
        {/key}
      {/if}
    </div>

    <WitnessQueue {deck} {rulings} currentIndex={pointer} onJump={jumpTo} />
  </main>
</div>

<style>
  .chamber-shell {
    display: flex;
    min-height: 100vh;
    background: var(--color-ink);
  }

  .chamber-main {
    position: relative;
    flex: 1;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'head head'
      'stage queue';
    overflow: hidden;
  }

  .chamber-bg {
    position: absolute;
    inset: 0;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    /* Slow Ken Burns drift on entry — purely transform, no blur. */
    animation: kenBurns 24s ease-in-out infinite alternate;
    z-index: 0;
  }

  @keyframes kenBurns {
    from {
      transform: scale(1.04) translate(-1%, -0.5%);
    }
    to {
      transform: scale(1.08) translate(1%, 0.5%);
    }
  }

  .chamber-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.78) 100%);
    z-index: 1;
    /* Decorative wash — never absorb pointer events that belong to the
       picker (z-index auto under this layer) or any overlaid control. */
    pointer-events: none;
  }

  .chamber-head {
    grid-area: head;
    position: relative;
    z-index: 5;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 1.2rem 1.6rem;
    background: linear-gradient(to bottom, rgba(11, 11, 13, 0.85), transparent);
  }

  .back-link {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-decoration: none;
    transition: color 0.3s;
    justify-self: start;
  }

  .back-link:hover {
    color: var(--color-bone);
  }

  .chamber-title-wrap {
    text-align: center;
  }

  .chamber-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .chamber-title {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(1.6rem, 3vw, 2.4rem);
    color: var(--color-bone);
    line-height: 1.1;
    margin-top: 0.2rem;
  }

  .flourish {
    color: var(--color-ember);
  }

  .chamber-clock {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    justify-self: end;
  }

  .chamber-stage {
    grid-area: stage;
    position: relative;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 2.5rem 2rem;
    overflow: hidden;
  }

  .chamber-empty {
    text-align: center;
    max-width: 32rem;
  }

  .chamber-empty-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .chamber-empty-text {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.4rem;
    color: var(--color-bone);
    line-height: 1.4;
    margin: 1rem 0 1.8rem;
    text-wrap: balance;
  }

  .chamber-empty-actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
  }

  .link-btn {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 0.7rem 1.2rem;
    border: 1px solid rgba(233, 228, 216, 0.35);
    color: var(--color-bone);
    text-decoration: none;
    transition: all 0.3s;
  }

  .link-btn:hover {
    background: rgba(233, 228, 216, 0.06);
    border-color: var(--color-bone);
  }

  .link-btn-primary {
    border-color: var(--color-ember);
    color: var(--color-ember);
  }

  .link-btn-primary:hover {
    background: rgba(210, 58, 42, 0.1);
  }

  @media (max-width: 900px) {
    .chamber-main {
      grid-template-columns: 1fr;
      grid-template-areas:
        'head'
        'stage';
    }
    .chamber-stage {
      padding: 1rem;
    }
  }
</style>
