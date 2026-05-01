<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { rooms, roomsByGrid } from '$lib/rooms';
  import { getMansionPin } from '$lib/mansionPins';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';

  let { data } = $props();

  // ?debug=pins outlines every tag so the coords are easy to spot during
  // artwork tuning. It also skips the session redirect below so the layout
  // is inspectable without a real game in progress.
  // See docs/mansion-pin-layout.md.
  const debugPins = $derived(page.url.searchParams.get('debug') === 'pins');

  // Per-room exhaustion: a chamber is "exhausted" once every card in its
  // category has been ruled. Compares server-loaded category totals against
  // the player's persisted evidence count for that category.
  function isExhausted(category: string): boolean {
    const total = data.categoryCounts[category];
    if (!total || total === 0) return false;
    const ruled = gameState.current.evidence.filter((e) => e.card.category === category).length;
    return ruled >= total;
  }

  let wanderNarrated = $state(false);

  // Re-run +page.server.ts so categoryCounts reflect any deck drift since SSR
  // (claim re-seed mid-session, soft-deletes, etc.). Without this, a chamber
  // can stay marked "Closed · all ruled" — or fail to mark — for the rest of
  // the session because the counts are frozen at first paint.
  function refreshCounts() {
    void invalidateAll();
  }

  onMount(async () => {
    // ?debug=pins lets the layout be inspected without spinning up a real
    // game. Chambers won't be enterable but every dot, tag, and leader
    // renders so the coords in docs/mansion-pin-layout.md can be checked.
    if (!gameState.current.sessionId || !gameState.current.claimId) {
      if (debugPins) return;
      window.location.href = '/';
      return;
    }
    refreshCounts();
    if (!wanderNarrated && gameState.current.roomsVisited.length >= 2) {
      wanderNarrated = true;
      await requestNarration('wander', 'mansion');
    }
  });

  $effect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') refreshCounts();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });
</script>

<svelte:head>
  <title>The Mansion | Architect of Suspicion</title>
  <link rel="preload" as="image" href="/backgrounds/house-exterior.webp" fetchpriority="high" />
  <meta
    name="description"
    content="The mansion — nine chambers, each holding witnesses. Choose where to begin."
  />
</svelte:head>

<div class="mansion-shell">
  <ArchitectPanel />

  <main class="mansion-main">
    <div class="board reveal">
      <div class="board-canvas">
        <img
          class="board-bg"
          src="/backgrounds/house-exterior.webp"
          alt="The mansion exterior at night, nine chambers visible"
          draggable="false"
        />
        <div class="board-overlay" aria-hidden="true"></div>

        <header class="board-head">
          <h1 class="board-title">The Mansion</h1>
          <p class="board-sub">Pick a chamber to enter</p>
        </header>

        <!-- Narrow-viewport fallback. The pin overlay needs ≥1100px to
             clear collisions; below that, render a 3×3 list so the layout
             stays usable. CSS swaps which view is visible. -->
        <ul class="board-list" aria-label="Chambers">
          {#each roomsByGrid as room (room.slug)}
            {@const visited = gameState.current.roomsVisited.includes(room.slug)}
            {@const exhausted = isExhausted(room.category)}
            {@const sealed = (!room.isPlayable && room.slug !== 'attic') || exhausted}
            {@const pin = getMansionPin(room.slug)}
            <li
              class="bl-item"
              class:bl-item-visited={visited && !exhausted}
              class:bl-item-sealed={sealed}
              class:bl-item-exhausted={exhausted}
            >
              {#if sealed}
                <div class="bl-link bl-link-sealed" aria-disabled="true">
                  <p class="bl-row1">
                    <span>Ch. {pin?.chamber ?? '—'}</span>
                    <span class="bl-status">{exhausted ? '✓' : '— — —'}</span>
                  </p>
                  <p class="bl-name">{room.name}</p>
                  <p class="bl-cat">{exhausted ? 'Closed · all ruled' : 'Sealed · no entry'}</p>
                </div>
              {:else if room.slug === 'attic'}
                <a href="/attic" class="bl-link bl-link-meta">
                  <p class="bl-row1">
                    <span>Ch. {pin?.chamber ?? '—'}</span>
                    <span class="bl-status">Meta</span>
                  </p>
                  <p class="bl-name">{room.name}</p>
                  <p class="bl-cat">How to play · bio · credits</p>
                </a>
              {:else}
                <a
                  href={'/room/' + room.slug + '?claim_id=' + gameState.current.claimId}
                  class="bl-link"
                  aria-label="{room.name}, {room.category}{visited ? ', visited' : ''}"
                >
                  <p class="bl-row1">
                    <span>Ch. {pin?.chamber ?? '—'}</span>
                    <span class="bl-status">{visited ? 'Resume' : 'Enter'}</span>
                  </p>
                  <p class="bl-name">{room.name}</p>
                  <p class="bl-cat">{room.category}</p>
                </a>
              {/if}
            </li>
          {/each}
        </ul>

        <!-- Pin overlay: each pin is a free-floating dot + tag joined by an
             SVG leader. Coords come from $lib/mansionPins as canvas
             percentages so a viewport resize keeps every pin on its
             feature without any re-layout. The leader endpoint is the
             midpoint of the tag's nearest edge, so a tag placed above,
             below, left, or right of its dot gets a clean connector. -->
        <svg
          class="pin-leaders"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {#each rooms as room (room.slug)}
            {@const pin = getMansionPin(room.slug)}
            {#if pin}
              {@const visited = gameState.current.roomsVisited.includes(room.slug)}
              {@const exhausted = isExhausted(room.category)}
              {@const sealed = (!room.isPlayable && room.slug !== 'attic') || exhausted}
              {@const TAG_W = 16}
              {@const TAG_H = 7}
              {@const dx = pin.dot.x - (pin.tag.x + TAG_W / 2)}
              {@const dy = pin.dot.y - (pin.tag.y + TAG_H / 2)}
              {@const horizontal = Math.abs(dx) >= Math.abs(dy)}
              {@const endX = horizontal
                ? dx > 0
                  ? pin.tag.x + TAG_W
                  : pin.tag.x
                : pin.tag.x + TAG_W / 2}
              {@const endY = horizontal
                ? pin.tag.y + TAG_H / 2
                : dy > 0
                  ? pin.tag.y + TAG_H
                  : pin.tag.y}
              <line
                x1={pin.dot.x}
                y1={pin.dot.y}
                x2={endX}
                y2={endY}
                class="leader-line"
                class:leader-visited={visited && !exhausted}
                class:leader-sealed={sealed}
                class:leader-exhausted={exhausted}
                vector-effect="non-scaling-stroke"
              />
            {/if}
          {/each}
        </svg>

        {#each rooms as room (room.slug)}
          {@const pin = getMansionPin(room.slug)}
          {@const visited = gameState.current.roomsVisited.includes(room.slug)}
          {@const exhausted = isExhausted(room.category)}
          {@const sealed = (!room.isPlayable && room.slug !== 'attic') || exhausted}
          {#if pin}
            <span
              class="pin-dot"
              class:pin-dot-visited={visited && !exhausted}
              class:pin-dot-sealed={sealed}
              class:pin-dot-exhausted={exhausted}
              style="left: {pin.dot.x}%; top: {pin.dot.y}%"
              aria-hidden="true"
            ></span>

            {#if sealed}
              <div
                class="pin-tag pin-tag-sealed"
                class:pin-tag-debug={debugPins}
                style="left: {pin.tag.x}%; top: {pin.tag.y}%"
                aria-hidden="true"
              >
                <p class="pin-row1">
                  <span>Ch. {pin.chamber}</span>
                  <span class="pin-tag-status">{exhausted ? '✓' : '— — —'}</span>
                </p>
                <p class="pin-name">{room.name}</p>
                <p class="pin-cat">{exhausted ? 'Closed · all ruled' : 'Sealed · no entry'}</p>
              </div>
            {:else if room.slug === 'attic'}
              <a
                href="/attic"
                class="pin-tag pin-tag-meta"
                class:pin-tag-debug={debugPins}
                style="left: {pin.tag.x}%; top: {pin.tag.y}%"
              >
                <p class="pin-row1">
                  <span>Ch. {pin.chamber}</span>
                  <span class="pin-tag-status">Meta</span>
                </p>
                <p class="pin-name">{room.name}</p>
                <p class="pin-cat">How to play &middot; bio &middot; credits</p>
              </a>
            {:else}
              <a
                href={'/room/' + room.slug + '?claim_id=' + gameState.current.claimId}
                class="pin-tag"
                class:pin-tag-visited={visited}
                class:pin-tag-debug={debugPins}
                style="left: {pin.tag.x}%; top: {pin.tag.y}%"
                aria-label="{room.name}, {room.category}{visited ? ', visited' : ''}"
              >
                <p class="pin-row1">
                  <span>Ch. {pin.chamber}</span>
                  <span class="pin-tag-status">{visited ? 'Resume' : 'Enter'}</span>
                </p>
                <p class="pin-name">{room.name}</p>
                <p class="pin-cat">{room.category}</p>
              </a>
            {/if}
          {/if}
        {/each}
      </div>
    </div>
  </main>
</div>

<style>
  .mansion-shell {
    display: flex;
    /* Same viewport-locked pattern as the chamber shell — the board lives
       inside the visible frame and never causes a page-level scroll. */
    height: 100dvh;
    overflow: hidden;
    background: var(--color-ink);
  }

  .mansion-main {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 2rem;
    /* Below 1100px the layout swaps to the .board-list view, which can
       outgrow the viewport on tall lists. Allow internal scroll so the
       page itself stays put. */
    overflow-y: auto;
    min-height: 0;
  }

  /* The board holds the artwork at its native aspect ratio so pin coords
     (canvas %) keep landing on real building features. `object-fit: cover`
     on a free-shaped canvas would crop and break every pin. The board
     letterboxes against the surrounding ink — no frame, no ornament. */
  .board {
    position: relative;
    width: 100%;
    max-width: min(100%, calc((100dvh - 3rem) * 2528 / 1696));
    aspect-ratio: 2528 / 1696;
    background: var(--color-ink);
    isolation: isolate;
  }

  /* Canvas fills the board; pins reference its dimensions directly. */
  .board-canvas {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .board-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    pointer-events: none;
  }

  .board-overlay {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, rgba(11, 11, 13, 0.2) 0%, rgba(11, 11, 13, 0.45) 100%);
    pointer-events: none;
  }

  .board-head {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    padding: 1.2rem 1.5rem;
    background: linear-gradient(to bottom, rgba(11, 11, 13, 0.85), transparent);
  }

  .board-title {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.6rem;
    color: var(--color-bone);
    line-height: 1;
  }

  .board-sub {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.35rem;
  }

  /* SVG leader layer. Spans the canvas with viewBox 0 0 100 100 so each
     line's coords match the pin coords directly (canvas %). Lines are
     decorative; they sit below the dot and tag in z-order. */
  .pin-leaders {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
    pointer-events: none;
  }

  .leader-line {
    stroke: rgba(196, 162, 78, 0.6);
    stroke-width: 1;
  }

  .leader-line.leader-visited {
    stroke: rgba(255, 215, 106, 0.7);
  }

  .leader-line.leader-sealed {
    stroke: rgba(210, 58, 42, 0.4);
  }

  .leader-line.leader-exhausted {
    stroke: rgba(107, 143, 176, 0.55);
  }

  /* Brass dot — centered on its (x, y) point so resizing the canvas
     keeps the dot pinned to its architectural feature. */
  .pin-dot {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle at 35% 30%, #f0c24d, #8a7235 65%, #3a2f18 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    z-index: 5;
    pointer-events: none;
  }

  .pin-dot::before,
  .pin-dot::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 1px solid rgba(240, 194, 77, 0.45);
    animation: pinPing 2.5s ease-out infinite;
    pointer-events: none;
  }

  .pin-dot::after {
    animation-delay: 0.7s;
  }

  @keyframes pinPing {
    0% {
      transform: scale(0.6);
      opacity: 1;
    }
    100% {
      transform: scale(1.6);
      opacity: 0;
    }
  }

  .pin-dot-visited {
    background: radial-gradient(circle at 35% 30%, #ffd76a, #c89a3a 65%, #5a4220 100%);
  }
  .pin-dot-visited::before,
  .pin-dot-visited::after {
    border-color: rgba(255, 215, 106, 0.65);
  }

  .pin-dot-sealed {
    background: radial-gradient(circle at 35% 30%, #4a4248, #2a2428 65%, #1a141a 100%);
  }
  .pin-dot-sealed::before,
  .pin-dot-sealed::after {
    border-color: rgba(210, 58, 42, 0.45);
    animation: none;
    transform: scale(1);
    opacity: 0.55;
  }

  .pin-dot-exhausted {
    background: radial-gradient(circle at 35% 30%, #6b8fb0, #2c3e52 65%, #1a2030 100%);
  }
  .pin-dot-exhausted::before,
  .pin-dot-exhausted::after {
    border-color: rgba(107, 143, 176, 0.5);
    animation: none;
    transform: scale(1);
    opacity: 0.6;
  }

  /* Tag — fixed pixel width, free-floating from its top-left coord.
     Width is intentionally fixed so a long category label can't push
     the layout sideways; height is auto to hold the three text lines. */
  .pin-tag {
    position: absolute;
    width: 200px;
    padding: 0.4rem 0.65rem 0.45rem;
    background: linear-gradient(180deg, rgba(20, 22, 30, 0.92) 0%, rgba(11, 12, 18, 0.95) 100%);
    border: 1px solid rgba(196, 162, 78, 0.5);
    text-decoration: none;
    color: var(--color-paper);
    z-index: 4;
    transition:
      border-color var(--motion-base) var(--ease-out),
      box-shadow var(--motion-base) var(--ease-out);
    backdrop-filter: blur(2px);
  }

  .pin-tag:hover,
  .pin-tag:focus-visible {
    /* Pop to the top of the pin layer so an overlapped tag underneath
       can still be hovered/clicked once the user reaches its visible
       edge. Without this, the "front" tag (later in DOM order) wins
       every hit even after the user moves onto the back tag. */
    z-index: 6;
    border-color: rgba(255, 215, 106, 0.85);
    box-shadow:
      0 10px 28px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 215, 106, 0.4);
    outline: none;
  }

  .pin-tag-visited {
    border-color: rgba(255, 215, 106, 0.6);
  }

  .pin-tag-sealed {
    cursor: default;
    border-color: rgba(210, 58, 42, 0.45);
    opacity: 0.55;
    pointer-events: none;
  }

  .pin-tag-meta {
    border-color: rgba(233, 228, 216, 0.18);
    opacity: 0.9;
  }

  /* Debug overlay (?debug=pins): outline each tag so coords are easy to
     spot during artwork tuning. */
  .pin-tag-debug {
    outline: 1px dashed rgba(255, 215, 106, 0.6);
    outline-offset: 1px;
  }

  .pin-row1 {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.25rem;
  }

  .pin-tag-status {
    color: var(--color-bone);
  }

  .pin-name {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 0.95rem;
    color: var(--color-bone);
    line-height: 1.1;
  }

  .pin-cat {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.3rem;
  }

  /* Narrow-viewport list. Hidden on desktop; takes over below 1100px,
     where the pin overlay can no longer keep tags from overlapping. */
  .board-list {
    display: none;
    list-style: none;
    margin: 0;
    padding: 4.5rem 1rem 1.5rem;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    position: absolute;
    inset: 0;
    z-index: 4;
    overflow-y: auto;
  }

  .bl-item {
    min-width: 0;
  }

  .bl-link {
    display: block;
    height: 100%;
    padding: 0.7rem 0.75rem;
    background: linear-gradient(180deg, rgba(20, 22, 30, 0.9) 0%, rgba(11, 12, 18, 0.95) 100%);
    border: 1px solid rgba(196, 162, 78, 0.45);
    color: var(--color-paper);
    text-decoration: none;
    transition:
      border-color var(--motion-base) var(--ease-out),
      transform var(--motion-base) var(--ease-out);
  }

  .bl-link:hover,
  .bl-link:focus-visible {
    border-color: rgba(255, 215, 106, 0.75);
    transform: translateY(-1px);
    outline: none;
  }

  .bl-item-visited .bl-link {
    border-color: rgba(255, 215, 106, 0.55);
  }

  .bl-item-sealed .bl-link-sealed {
    border-color: rgba(210, 58, 42, 0.4);
    opacity: 0.6;
  }

  .bl-item-exhausted .bl-link-sealed {
    border-color: rgba(107, 143, 176, 0.45);
    opacity: 0.7;
  }

  .bl-link-meta {
    border-color: rgba(233, 228, 216, 0.18);
    opacity: 0.85;
  }

  .bl-row1 {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.25rem;
  }

  .bl-status {
    color: var(--color-bone);
  }

  .bl-name {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 1rem;
    color: var(--color-bone);
    line-height: 1.15;
  }

  .bl-cat {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.3rem;
  }

  @media (max-width: 1100px) {
    /* Below the pin layout's collision-safe width, swap to the list. */
    .board {
      aspect-ratio: auto;
      min-height: 70vh;
    }

    .board-bg,
    .board-overlay,
    .pin-leaders,
    .pin-dot,
    .pin-tag {
      display: none;
    }

    .board-list {
      display: grid;
    }
  }

  @media (max-width: 767px) {
    .mansion-main {
      padding: 0.75rem;
    }

    .board-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 480px) {
    .board-list {
      grid-template-columns: 1fr;
    }
  }
</style>
