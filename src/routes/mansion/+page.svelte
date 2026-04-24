<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { rooms } from '$lib/rooms';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';

  // Pin coordinates expressed as percent of the house exterior image. Tuned
  // to land each pin over the corresponding window/door in the artwork.
  // `flip: true` means the leader/tag are drawn to the LEFT of the pin.
  const PINS: Record<string, { x: number; y: number; flip: boolean; chamber: string }> = {
    attic: { x: 12, y: 16, flip: false, chamber: 'I' },
    gallery: { x: 48, y: 10, flip: false, chamber: 'II' },
    'control-room': { x: 86, y: 20, flip: true, chamber: 'III' },
    parlor: { x: 10, y: 50, flip: false, chamber: 'IV' },
    'entry-hall': { x: 52, y: 44, flip: false, chamber: 'V' },
    library: { x: 88, y: 54, flip: true, chamber: 'VI' },
    workshop: { x: 14, y: 82, flip: false, chamber: 'VII' },
    cellar: { x: 46, y: 76, flip: false, chamber: 'VIII' },
    'back-hall': { x: 84, y: 86, flip: true, chamber: 'IX' },
  };

  let wanderNarrated = $state(false);

  onMount(async () => {
    if (!gameState.current.sessionId || !gameState.current.claimId) {
      // No session — bounce back to summons.
      window.location.href = resolve('/');
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
  <meta name="description" content="The mansion — nine chambers, each holding witnesses. Choose where to begin." />
</svelte:head>

<div class="mansion-shell">
  <ArchitectPanel />

  <main class="mansion-main">
    <div class="board reveal">
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
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &middot; chamber clock
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
              <a href={resolve('/attic')} class="pin-tag pin-tag-meta">
                <p class="pin-row1">
                  <span>Ch. {pin.chamber}</span>
                  <span class="pin-tag-status">Meta</span>
                </p>
                <p class="pin-name">{room.name}</p>
                <p class="pin-cat">How to play &middot; bio &middot; credits</p>
              </a>
            {:else}
              <a
                href={resolve('/room/[slug]', { slug: room.slug })}
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

  .board {
    position: relative;
    width: 100%;
    max-width: 1280px;
    aspect-ratio: 1440 / 900;
    border: 1px solid rgba(233, 228, 216, 0.16);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    isolation: isolate;
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

  .pin-dot {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-ember);
    box-shadow:
      0 0 0 3px rgba(210, 58, 42, 0.18),
      0 0 18px rgba(210, 58, 42, 0.5);
    animation: pinPulse 3.6s ease-in-out infinite;
  }

  .room-pin-visited .pin-dot {
    background: var(--color-bone);
    box-shadow:
      0 0 0 3px rgba(233, 228, 216, 0.18),
      0 0 14px rgba(233, 228, 216, 0.4);
  }

  .room-pin-sealed .pin-dot {
    background: var(--color-rivet);
    box-shadow: none;
    animation: none;
  }

  @keyframes pinPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.18);
      opacity: 0.85;
    }
  }

  .pin-leader {
    position: absolute;
    top: 50%;
    left: 12px;
    width: 60px;
    height: 1px;
    background: linear-gradient(90deg, rgba(210, 58, 42, 0.55), transparent);
    transform-origin: left;
  }

  .room-pin-flip .pin-leader {
    left: auto;
    right: 12px;
    background: linear-gradient(270deg, rgba(210, 58, 42, 0.55), transparent);
  }

  .room-pin-visited .pin-leader {
    background: linear-gradient(90deg, rgba(233, 228, 216, 0.45), transparent);
  }

  .room-pin-visited.room-pin-flip .pin-leader {
    background: linear-gradient(270deg, rgba(233, 228, 216, 0.45), transparent);
  }

  .pin-tag {
    position: absolute;
    top: -28px;
    left: 72px;
    width: 200px;
    padding: 0.55rem 0.7rem;
    background: rgba(11, 11, 13, 0.92);
    border: 1px solid rgba(233, 228, 216, 0.18);
    text-decoration: none;
    color: var(--color-paper);
    transition: all 0.3s ease;
    backdrop-filter: blur(8px);
  }

  .room-pin-flip .pin-tag {
    left: auto;
    right: 72px;
    text-align: right;
  }

  .pin-tag:hover {
    border-color: var(--color-ember);
    background: rgba(20, 20, 23, 0.96);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    transform: translateY(-2px);
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
