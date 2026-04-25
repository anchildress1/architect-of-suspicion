<script lang="ts">
  import { onMount } from 'svelte';
  import { rooms } from '$lib/rooms';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';

  // Pin coordinates expressed as percent of the house exterior image. Tuned
  // for label visibility — pins live closer to the building centerline so
  // the tag (and its 200px width) stays inside the canvas without crowding
  // a neighbor on the same band. `flip: true` draws the leader/tag LEFT.
  const PINS: Record<string, { x: number; y: number; flip: boolean; chamber: string }> = {
    attic: { x: 38, y: 22, flip: false, chamber: 'I' },
    gallery: { x: 60, y: 13, flip: false, chamber: 'II' },
    'control-room': { x: 88, y: 25, flip: true, chamber: 'III' },
    parlor: { x: 36, y: 56, flip: false, chamber: 'IV' },
    'entry-hall': { x: 60, y: 50, flip: false, chamber: 'V' },
    library: { x: 88, y: 53, flip: true, chamber: 'VI' },
    workshop: { x: 36, y: 82, flip: false, chamber: 'VII' },
    cellar: { x: 58, y: 76, flip: false, chamber: 'VIII' },
    'back-hall': { x: 88, y: 84, flip: true, chamber: 'IX' },
  };

  let wanderNarrated = $state(false);

  onMount(async () => {
    if (!gameState.current.sessionId || !gameState.current.claimId) {
      // No session — bounce back to summons.
      window.location.href = '/';
      return;
    }
    if (!wanderNarrated && gameState.current.roomsVisited.length >= 2) {
      wanderNarrated = true;
      await requestNarration('wander', 'mansion');
    }
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
          <div>
            <h1 class="board-title">The Mansion</h1>
            <p class="board-sub">Nine chambers &middot; pick one to enter</p>
          </div>
          <p class="board-clock">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &middot; chamber
            clock
          </p>
        </header>

        {#each rooms as room (room.slug)}
          {@const pin = PINS[room.slug]}
          {@const visited = gameState.current.roomsVisited.includes(room.slug)}
          {@const sealed = !room.isPlayable && room.slug !== 'attic'}
          {#if pin}
            <div
              class="room-pin"
              class:room-pin-flip={pin.flip}
              class:room-pin-visited={visited}
              class:room-pin-sealed={sealed}
              style="left: {pin.x}%; top: {pin.y}%"
            >
              <span class="pin-dot" aria-hidden="true"></span>
              <span class="pin-leader" aria-hidden="true"></span>

              {#if sealed}
                <div class="pin-tag pin-tag-sealed" aria-hidden="true">
                  <p class="pin-row1">
                    <span>Ch. {pin.chamber}</span>
                    <span class="pin-tag-status">— — —</span>
                  </p>
                  <p class="pin-name">{room.name}</p>
                  <p class="pin-cat">Sealed &middot; no entry</p>
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
    min-height: 100vh;
    background: var(--color-ink);
  }

  .mansion-main {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 2rem;
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
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
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

  .board-clock {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  /* Room pin: dot + leader + tag */
  .room-pin {
    position: absolute;
    transform: translate(-50%, -50%);
    z-index: 4;
  }

  /* Pins as physical brass dots with two pinging rings. */
  .pin-dot {
    position: relative;
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #f0c24d, #8a7235 65%, #3a2f18 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
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

  /* Visited: dot saturates to gold, ring borders brighten. */
  .room-pin-visited .pin-dot {
    background: radial-gradient(circle at 35% 30%, #ffd76a, #c89a3a 65%, #5a4220 100%);
  }

  .room-pin-visited .pin-dot::before,
  .room-pin-visited .pin-dot::after {
    border-color: rgba(255, 215, 106, 0.65);
  }

  /* Sealed: ember rim, no ping. */
  .room-pin-sealed .pin-dot {
    background: radial-gradient(circle at 35% 30%, #4a4248, #2a2428 65%, #1a141a 100%);
  }

  .room-pin-sealed .pin-dot::before,
  .room-pin-sealed .pin-dot::after {
    border-color: rgba(210, 58, 42, 0.45);
    animation: none;
    transform: scale(1);
    opacity: 0.55;
  }

  /* Leader connects dot to tag in warm brass. */
  .pin-leader {
    position: absolute;
    top: 50%;
    left: 14px;
    width: 58px;
    height: 1px;
    background: linear-gradient(90deg, rgba(196, 162, 78, 0.55), transparent);
    transform-origin: left;
  }

  .room-pin-flip .pin-leader {
    left: auto;
    right: 14px;
    background: linear-gradient(270deg, rgba(196, 162, 78, 0.55), transparent);
  }

  .room-pin-visited .pin-leader {
    background: linear-gradient(90deg, rgba(255, 215, 106, 0.6), transparent);
  }

  .room-pin-visited.room-pin-flip .pin-leader {
    background: linear-gradient(270deg, rgba(255, 215, 106, 0.6), transparent);
  }

  .pin-tag {
    position: absolute;
    top: -28px;
    left: 72px;
    width: 200px;
    padding: 0.55rem 0.7rem;
    background: linear-gradient(180deg, rgba(20, 22, 30, 0.85) 0%, rgba(11, 12, 18, 0.9) 100%);
    border: 1px solid rgba(196, 162, 78, 0.45);
    text-decoration: none;
    color: var(--color-paper);
    transition:
      border-color 0.3s ease,
      box-shadow 0.3s ease,
      transform 0.3s ease;
    backdrop-filter: blur(2px);
  }

  .room-pin-flip .pin-tag {
    left: auto;
    right: 72px;
    text-align: right;
  }

  .pin-tag:hover {
    border-color: rgba(255, 215, 106, 0.75);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 215, 106, 0.35);
    transform: translateY(-2px);
  }

  /* Visited tag border glows brass; sealed gets the ember rim. */
  .room-pin-visited .pin-tag {
    border-color: rgba(255, 215, 106, 0.55);
  }

  .room-pin-sealed .pin-tag {
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
    font-size: 1.05rem;
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

  @media (max-width: 1100px) {
    .pin-tag {
      width: 160px;
      font-size: 0.7rem;
    }
  }

  @media (max-width: 900px) {
    .board {
      max-width: 100%;
    }

    .pin-tag {
      width: 130px;
    }
  }

  @media (max-width: 767px) {
    .mansion-main {
      padding: 0.75rem;
    }
  }
</style>
