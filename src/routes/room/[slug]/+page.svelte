<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';
  import WitnessCard from '$lib/components/WitnessCard.svelte';
  import WitnessQueue from '$lib/components/WitnessQueue.svelte';
  import type {
    Classification,
    ClaimCardEntry,
    EvaluateConflictResponse,
    EvaluateResponse,
  } from '$lib/types';

  let { data } = $props();

  const room = untrack(() => data.room);
  const initialDeck = untrack(() => data.cards);

  let deck = $state<ClaimCardEntry[]>(initialDeck);
  // Hydrate rulings from persisted client evidence so re-entering a chamber
  // (or hard-reloading mid-session) doesn't let the player re-rule a card the
  // server already has on file. The unique (session_id, card_id) constraint
  // returns 409 otherwise.
  let rulings = $state<Record<string, Classification>>(
    untrack(() =>
      Object.fromEntries(
        gameState.current.evidence
          .filter((e) => initialDeck.some((d) => d.objectID === e.card.objectID))
          .map((e) => [e.card.objectID, e.classification]),
      ),
    ),
  );
  let evaluating = $state(false);
  // Start at the first unruled card so we don't land on one we can't act on.
  let pointer = $state(
    untrack(() => {
      const ruled = new Set(Object.keys(rulings));
      const idx = initialDeck.findIndex((c) => !ruled.has(c.objectID));
      return idx >= 0 ? idx : 0;
    }),
  );

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
    // Block jumps mid-evaluate so an in-flight pick can't have its post-resolve
    // pointer advance clobber the player's manual selection.
    if (evaluating) return;
    if (index < 0 || index >= deck.length) return;
    pointer = index;
  }

  function pushFeedEntry(type: 'action' | 'reaction' | 'narration', text: string) {
    gameState.addFeedEntry({ id: crypto.randomUUID(), type, text, timestamp: Date.now() });
  }

  function pushDeliberating(): string {
    const id = crypto.randomUUID();
    gameState.addFeedEntry({
      id,
      type: 'narration',
      text: 'The Architect deliberates…',
      timestamp: Date.now(),
    });
    return id;
  }

  function pushMechanismSeized() {
    pushFeedEntry('narration', 'The mechanism seized — that exhibit could not be read.');
  }

  function commitRuling(card: ClaimCardEntry, classification: Classification, fromIndex: number) {
    // Dedupe: if the local state already records this card, don't double-add
    // evidence. This matters most on the 409 conflict-recovery path — the
    // server says the card was already ruled and we may be reconciling a
    // race or retry where the client already holds a row for this objectID.
    const wasRuled = Object.prototype.hasOwnProperty.call(rulings, card.objectID);
    rulings = { ...rulings, [card.objectID]: classification };
    if (!wasRuled) gameState.addEvidence({ card, classification });
    // Only auto-advance when the player hasn't moved off this card during the
    // in-flight evaluation. Otherwise honour their manual selection.
    if (pointer === fromIndex) {
      const next = nextUnruledIndex(fromIndex);
      if (next >= 0) pointer = next;
    }
  }

  async function applyEvaluateSuccess(
    res: Response,
    card: ClaimCardEntry,
    classification: Classification,
    ruledIndex: number,
  ) {
    const { ai_reaction, attention } = (await res.json()) as EvaluateResponse;
    pushFeedEntry(
      'action',
      classification === 'dismiss'
        ? `Struck "${card.title}" from the record.`
        : `Classified "${card.title}" as ${classification}.`,
    );
    if (ai_reaction) pushFeedEntry('reaction', ai_reaction);
    gameState.setAttention(attention);
    commitRuling(card, classification, ruledIndex);
  }

  async function applyConflictRecovery(res: Response, card: ClaimCardEntry, ruledIndex: number) {
    let canonicalClassification: Classification | null = null;
    let canonicalAttention: number | null = null;
    try {
      const body = (await res.json()) as EvaluateConflictResponse;
      canonicalClassification = body.canonical?.classification ?? null;
      canonicalAttention = body.canonical?.attention ?? null;
    } catch {
      // Older or partial body — fall through to the seized-mechanism path.
    }
    if (!canonicalClassification) {
      pushMechanismSeized();
      return;
    }
    pushFeedEntry(
      'narration',
      `That exhibit was already ruled — the record stands as ${canonicalClassification}.`,
    );
    if (canonicalAttention !== null) gameState.setAttention(canonicalAttention);
    commitRuling(card, canonicalClassification, ruledIndex);
  }

  async function decide(card: ClaimCardEntry, classification: Classification) {
    // Reentrancy guard: WitnessCard already debounces inside its 360ms stamp
    // animation, but a fast double-click on the levers (or a programmatic
    // re-entry) could otherwise enqueue two /api/evaluate requests for the
    // same card before `evaluating` flips. Bail at the door instead.
    if (evaluating) return;
    if (!gameState.current.sessionId || !gameState.current.claimId) return;

    // Capture the deck index *before* awaiting. A queue-jump during the fetch
    // would otherwise advance the pointer relative to the player's new
    // selection on resolve. commitRuling honours the player's pointer move
    // by only auto-advancing when they haven't navigated away.
    const ruledIndex = pointer;
    const deliberatingId = pushDeliberating();
    evaluating = true;
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: card.objectID, classification }),
      });
      gameState.removeFeedEntry(deliberatingId);

      if (res.ok) {
        await applyEvaluateSuccess(res, card, classification, ruledIndex);
      } else if (res.status === 409) {
        await applyConflictRecovery(res, card, ruledIndex);
      } else {
        pushMechanismSeized();
      }
    } catch {
      gameState.removeFeedEntry(deliberatingId);
      pushMechanismSeized();
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
    /* Lock the chamber to the visible viewport. `100dvh` follows the
       browser-chrome show/hide behaviour on mobile so the layout never
       falls under a tab strip. `overflow: hidden` is the contract that
       enforces the scroll budget — no page-level scrolling, ever. The
       queue rail's nu-list and the chamber stage are the only things
       that may scroll, and only inside their own boxes. */
    height: 100dvh;
    overflow: hidden;
    background: var(--color-ink);
  }

  .chamber-main {
    position: relative;
    flex: 1;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto 1fr;
    /* Queue spans both rows on the right so it sits flush with the page
       top, mirroring the Architect rail's full-height column on the left.
       The header occupies only the left column. */
    grid-template-areas:
      'head queue'
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
    /* Decorative — never absorb pointer events that belong to the
       picker (non-positioned, lives below positioned descendants
       under standard SVG/CSS painting order). */
    pointer-events: none;
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
    /* 1fr / auto / 1fr keeps the title centered with the back-link on the
       left and an empty mirror cell on the right. */
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 1.2rem 1.6rem;
    background: linear-gradient(to bottom, rgba(11, 11, 13, 0.85), transparent);
  }

  .back-link {
    font-family: var(--font-readout);
    font-size: 11px;
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
    font-size: 11px;
    letter-spacing: 0.14em;
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

  .chamber-stage {
    grid-area: stage;
    position: relative;
    z-index: 4;
    display: flex;
    /* `safe center` keeps the card centered when it fits, but pins the top
       to the start when the card is taller than the stage — otherwise the
       header and lever row get equally clipped by overflow and the player
       can't act on the card. Together with `overflow-y: auto`, the stage
       scrolls when needed instead of swallowing the levers. */
    align-items: safe center;
    justify-content: center;
    padding: 1.5rem 2.5rem 2rem;
    overflow-y: auto;
    /* Default min-height for grid items is `auto`, which lets content (e.g.
       a long tally card or a lengthy ruling) widen the row past its 1fr
       allocation. min-height: 0 keeps the row honest. */
    min-height: 0;
  }

  .chamber-empty {
    text-align: center;
    max-width: 32rem;
  }

  .chamber-empty-eyebrow {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .chamber-empty-text {
    font-family: var(--font-architect);
    font-size: 1.05rem;
    color: var(--color-bone);
    line-height: 1.55;
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
    font-size: 12px;
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
    border-color: var(--color-brass-key);
    color: var(--color-bone);
  }

  .link-btn-primary:hover {
    border-color: var(--color-brass-key-glow);
    background: rgba(240, 194, 77, 0.08);
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
