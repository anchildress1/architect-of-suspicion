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

  // ?debug=pins paints the surface + tag bounding boxes so collisions can
  // be spotted at a glance during artwork tuning. It also skips the session
  // redirect below so the layout is inspectable without a real game in
  // progress. See docs/mansion-pin-layout.md.
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
    // game. Chambers won't be enterable but the surfaces / tags render so
    // the contract in docs/mansion-pin-layout.md can be verified visually.
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

        {#each rooms as room (room.slug)}
          {@const pin = getMansionPin(room.slug)}
          {@const visited = gameState.current.roomsVisited.includes(room.slug)}
          {@const exhausted = isExhausted(room.category)}
          {@const sealed = (!room.isPlayable && room.slug !== 'attic') || exhausted}
          {#if pin}
            <!-- The pin's surface is its only visual budget. overflow:hidden
                 below makes that a hard guarantee — a future tweak that
                 over-sizes the dot or tag will be clipped, not leaked into
                 neighbouring chambers or out of the brass frame.
                 Contract: docs/mansion-pin-layout.md -->
            <div
              class="pin-surface"
              class:pin-surface-flip={pin.flip}
              class:pin-surface-visited={visited && !exhausted}
              class:pin-surface-sealed={sealed}
              class:pin-surface-exhausted={exhausted}
              class:pin-surface-debug={debugPins}
              style="left: {pin.surface.x}%; top: {pin.surface.y}%; width: {pin.surface
                .w}%; height: {pin.surface.h}%"
            >
              <span class="pin-dot" aria-hidden="true"></span>

              {#if sealed}
                <div class="pin-tag pin-tag-sealed" aria-hidden="true">
                  <p class="pin-row1">
                    <span>Ch. {pin.chamber}</span>
                    <span class="pin-tag-status">{exhausted ? '✓' : '— — —'}</span>
                  </p>
                  <p class="pin-name">{room.name}</p>
                  <p class="pin-cat">{exhausted ? 'Closed · all ruled' : 'Sealed · no entry'}</p>
                </div>
              {:else if room.slug === 'attic'}
                <a href="/attic" class="pin-tag pin-tag-meta">
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
            </div>
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

  /* The board: a brass-bordered frame; the photograph is set INTO it. */
  .board {
    position: relative;
    width: 100%;
    max-width: 1280px;
    aspect-ratio: 1440 / 900;
    background: #0a0a0d;
    border: 1px solid rgba(196, 162, 78, 0.4);
    box-shadow:
      inset 0 0 0 6px rgba(0, 0, 0, 0.5),
      0 30px 80px rgba(0, 0, 0, 0.7);
    isolation: isolate;
  }

  /* Canvas sits inside the frame; pins reference its dimensions. */
  .board-canvas {
    position: absolute;
    inset: 26px;
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
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.35rem;
  }

  /* Pin surface: the bounding box for one chamber's pin. The dot sits in
     one top corner (controlled by .pin-surface-flip) and the tag fills the
     rest. overflow:hidden is the contract enforcer — any geometry tweak
     that would push content past these bounds is clipped, not leaked into
     other surfaces or the brass frame. See $lib/mansionPins.ts. */
  .pin-surface {
    position: absolute;
    z-index: 4;
    overflow: hidden;
    pointer-events: none; /* re-enabled on .pin-tag for hit testing */
  }

  /* Pinging brass dot, anchored to the top-left of the surface (default)
     or top-right when flipped. Inset slightly so the ping rings stay
     visible inside overflow:hidden. */
  .pin-dot {
    position: absolute;
    top: 6px;
    left: 6px;
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #f0c24d, #8a7235 65%, #3a2f18 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  .pin-surface-flip .pin-dot {
    left: auto;
    right: 6px;
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

  .pin-surface-visited .pin-dot {
    background: radial-gradient(circle at 35% 30%, #ffd76a, #c89a3a 65%, #5a4220 100%);
  }

  .pin-surface-visited .pin-dot::before,
  .pin-surface-visited .pin-dot::after {
    border-color: rgba(255, 215, 106, 0.65);
  }

  .pin-surface-sealed .pin-dot {
    background: radial-gradient(circle at 35% 30%, #4a4248, #2a2428 65%, #1a141a 100%);
  }

  .pin-surface-sealed .pin-dot::before,
  .pin-surface-sealed .pin-dot::after {
    border-color: rgba(210, 58, 42, 0.45);
    animation: none;
    transform: scale(1);
    opacity: 0.55;
  }

  .pin-surface-exhausted .pin-dot {
    background: radial-gradient(circle at 35% 30%, #6b8fb0, #2c3e52 65%, #1a2030 100%);
  }

  .pin-surface-exhausted .pin-dot::before,
  .pin-surface-exhausted .pin-dot::after {
    border-color: rgba(107, 143, 176, 0.5);
    animation: none;
    transform: scale(1);
    opacity: 0.6;
  }

  .pin-surface-exhausted .pin-tag {
    border-color: rgba(107, 143, 176, 0.4);
  }

  /* Debug overlay (?debug=pins): paint the surface and tag boxes so
     out-of-bounds tweaks are visible at a glance. */
  .pin-surface-debug {
    outline: 1px dashed rgba(107, 143, 176, 0.85);
    outline-offset: 0;
  }

  .pin-surface-debug .pin-tag {
    outline: 1px dashed rgba(255, 215, 106, 0.6);
  }

  /* The tag fills the rest of the surface beside the dot. Dimensions are
     surface-relative (calc(100% - dot_keepout)), never pixel-clamped, so
     the tag can never grow past its declared box. */
  .pin-tag {
    position: absolute;
    top: 0;
    left: 28px;
    right: 0;
    bottom: 0;
    padding: 0.4rem 0.6rem;
    background: linear-gradient(180deg, rgba(20, 22, 30, 0.85) 0%, rgba(11, 12, 18, 0.9) 100%);
    border: 1px solid rgba(196, 162, 78, 0.45);
    text-decoration: none;
    color: var(--color-paper);
    pointer-events: auto;
    transition:
      border-color var(--motion-base) var(--ease-out),
      box-shadow var(--motion-base) var(--ease-out),
      transform var(--motion-base) var(--ease-out);
    backdrop-filter: blur(2px);
    overflow: hidden;
  }

  .pin-surface-flip .pin-tag {
    left: 0;
    right: 28px;
    text-align: right;
  }

  .pin-tag:hover,
  .pin-tag:focus-visible {
    border-color: rgba(255, 215, 106, 0.75);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 215, 106, 0.35);
    /* No translate — the surface is the budget, and translate would push
       the tag past it and get clipped. Use a glow instead. */
    outline: none;
  }

  .pin-surface-visited .pin-tag {
    border-color: rgba(255, 215, 106, 0.55);
  }

  .pin-surface-sealed .pin-tag {
    border-color: rgba(210, 58, 42, 0.4);
  }

  .pin-tag-sealed {
    cursor: default;
    opacity: 0.55;
    pointer-events: none;
  }

  .pin-tag-meta {
    border-color: rgba(233, 228, 216, 0.1);
    opacity: 0.85;
  }

  .pin-row1 {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.25rem;
  }

  .pin-tag-status {
    color: var(--color-bone);
  }

  .pin-name {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--color-bone);
    line-height: 1.1;
  }

  .pin-cat {
    font-family: var(--font-readout);
    font-size: 0.5rem;
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
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 0.25rem;
  }

  .bl-status {
    color: var(--color-bone);
  }

  .bl-name {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1rem;
    color: var(--color-bone);
    line-height: 1.15;
  }

  .bl-cat {
    font-family: var(--font-readout);
    font-size: 0.5rem;
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
    .pin-surface {
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
