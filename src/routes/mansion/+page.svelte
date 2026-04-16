<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { roomsByGrid } from '$lib/rooms';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';
  import VerdictConfirmation from '$lib/components/VerdictConfirmation.svelte';
  import type { Verdict } from '$lib/types';

  let wanderNarrated = false;

  const hasEvidence = $derived(gameState.current.evidence.length > 0);
  const playableRoomCount = roomsByGrid.filter((r) => r.isPlayable).length;
  const visitedCount = $derived(gameState.current.roomsVisited.length);
  const evidenceCount = $derived(gameState.current.evidence.length);
  const tensionTier = $derived(
    evidenceCount >= 10 ? 'high' : evidenceCount >= 5 ? 'mid' : 'low',
  );
  let pendingVerdict = $state<Verdict | null>(null);

  function roomEvidenceCount(category: string): number {
    return gameState.current.evidence.filter((e) => e.card.category === category).length;
  }

  function excludeQuery(category: string): string {
    const collected = gameState.current.evidence
      .filter((e) => e.card.category === category)
      .map((e) => e.card.objectID);
    if (collected.length === 0) return '';
    return `?exclude=${collected.join(',')}`;
  }

  function openVerdict(v: Verdict) {
    pendingVerdict = v;
  }

  function cancelVerdict() {
    pendingVerdict = null;
  }

  onMount(() => {
    if (!wanderNarrated && gameState.current.roomsVisited.length >= 2) {
      wanderNarrated = true;
      requestNarration('wander', 'mansion');
    }
  });
</script>

<svelte:head>
  <title>The Mansion | Architect of Suspicion</title>
  <link rel="preload" as="image" href="/backgrounds/house-exterior.webp" fetchpriority="high" />
</svelte:head>

<div class="flex h-screen overflow-hidden">
  <ArchitectPanel />

  <main class="mansion-main" data-tension={tensionTier}>
    <!-- Top bar -->
    <header class="top-bar">
      <h1 class="top-bar-title">Architect of Suspicion</h1>
      <div class="top-bar-meta">
        <p class="claim-reminder-text">
          &ldquo;{gameState.current.claim}&rdquo;
        </p>
        <p class="progress-indicator">
          {visitedCount} of {playableRoomCount} rooms explored &middot; {evidenceCount} evidence logged
        </p>
      </div>
      <div class="top-bar-actions">
        <button
          class="btn btn-accuse"
          disabled={!hasEvidence}
          onclick={() => openVerdict('accuse')}
          aria-label="Accuse the subject"
        >
          Accuse
        </button>
        <button
          class="btn btn-pardon"
          disabled={!hasEvidence}
          onclick={() => openVerdict('pardon')}
          aria-label="Pardon the subject"
        >
          Pardon
        </button>
      </div>
    </header>

    <!-- Board: house image with room grid overlay -->
    <div class="board-area">
      <div class="board-frame">
        <img
          class="board-bg"
          src="/backgrounds/house-exterior.webp"
          alt="The Mansion exterior"
          draggable="false"
        />
        <div class="board-overlay"></div>
        <div class="board-hud mechanical-label">Select chamber</div>
        <nav class="board-grid" aria-label="Mansion rooms">
          {#each roomsByGrid as room (room.slug)}
            {@const visited = gameState.current.roomsVisited.includes(room.slug)}
            {@const count = roomEvidenceCount(room.category)}
            {#if room.slug === 'entry-hall'}
              <div class="room-door room-door-inert" aria-hidden="true">
                <span class="room-name room-name-dim">{room.name}</span>
                <span class="room-inert-label">No entry</span>
              </div>
            {:else if room.slug === 'attic'}
              <a href={resolve('/attic')} class="room-door room-door-attic">
                <span class="room-name">{room.name}</span>
                <span class="room-category">{room.category}</span>
              </a>
            {:else}
              <a
                href="{resolve('/room/[slug]', { slug: room.slug })}{excludeQuery(room.category)}"
                class="room-door"
                class:room-door-visited={visited}
                aria-label="{room.name} - {room.category}{visited ? ' (visited)' : ''}"
              >
                <div>
                  <span class="room-name" class:room-name-visited={visited}>{room.name}</span>
                  <span class="room-category">{room.category}</span>
                </div>
                <div class="room-footer">
                  {#if visited}
                    <span class="room-visited-label">
                      {count > 0 ? `${count} card${count !== 1 ? 's' : ''}` : 'Visited'}
                    </span>
                  {/if}
                </div>
                <div class="room-status" class:room-status-visited={visited}></div>
                <div class="room-top-line"></div>
              </a>
            {/if}
          {/each}
        </nav>
      </div>
    </div>
  </main>

  {#if pendingVerdict}
    <VerdictConfirmation verdict={pendingVerdict} oncancel={cancelVerdict} />
  {/if}
</div>

<style>
  .mansion-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background:
      radial-gradient(circle at top center, rgba(240, 141, 60, 0.08), transparent 38%),
      var(--color-void);
    position: relative;
  }

  .mansion-main::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 100% 100%, rgba(196, 162, 78, 0.08), transparent 36%),
      linear-gradient(180deg, rgba(8, 9, 12, 0.12), rgba(8, 9, 12, 0.42));
    z-index: 0;
  }

  /* Top bar */
  .top-bar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 1.1rem;
    padding: 0.6rem 1rem;
    background: rgba(10, 12, 18, 0.86);
    border-bottom: 1px solid rgba(196, 162, 78, 0.16);
    flex-shrink: 0;
    backdrop-filter: blur(8px);
  }

  .top-bar-title {
    font-family: var(--font-display);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-glow);
    white-space: nowrap;
  }

  .top-bar-meta {
    flex: 1;
    text-align: center;
    min-width: 0;
  }

  .claim-reminder-text {
    font-family: var(--font-display);
    font-size: 0.82rem;
    font-style: italic;
    color: var(--color-parchment);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .progress-indicator {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.15rem;
  }

  .top-bar-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Buttons */
  .btn {
    font-family: var(--font-display);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 0.45rem 0.82rem;
    border: 1px solid rgba(196, 162, 78, 0.28);
    background: rgba(19, 22, 31, 0.9);
    color: var(--color-parchment-dim);
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      inset 0 -1px 0 rgba(0, 0, 0, 0.2);
  }

  .btn:hover:not(:disabled) {
    border-color: rgba(196, 162, 78, 0.45);
    color: var(--color-parchment);
    background: rgba(196, 162, 78, 0.08);
  }

  .btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn-accuse {
    border-color: rgba(180, 60, 60, 0.4);
    color: #d4756a;
  }

  .btn-accuse:hover:not(:disabled) {
    border-color: rgba(180, 60, 60, 0.7);
    background: rgba(180, 60, 60, 0.1);
    color: #e8988e;
  }

  .btn-pardon {
    border-color: rgba(196, 162, 78, 0.2);
    color: var(--color-parchment-dim);
  }

  /* Board area — centers the house frame */
  .board-area {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 0.8rem;
    overflow: hidden;
  }

  /* Board frame — maintains image aspect ratio */
  .board-frame {
    position: relative;
    aspect-ratio: 2528 / 1696;
    width: 100%;
    max-height: 100%;
    border: 1px solid rgba(196, 162, 78, 0.2);
    box-shadow:
      0 20px 40px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .board-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    user-select: none;
    pointer-events: none;
  }

  .board-overlay {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at center, rgba(255, 255, 255, 0.02), transparent 45%),
      rgba(8, 9, 12, 0.4);
    pointer-events: none;
  }

  .board-hud {
    position: absolute;
    top: 0.65rem;
    left: 0.75rem;
    z-index: 2;
    font-size: 0.48rem;
    color: var(--color-brass-dim);
    background: rgba(8, 9, 12, 0.7);
    border: 1px solid rgba(196, 162, 78, 0.2);
    padding: 0.16rem 0.35rem;
  }

  /* Room grid — positioned over the windows */
  .board-grid {
    position: absolute;
    top: 6%;
    bottom: 14%;
    left: 10%;
    right: 10%;
    display: grid;
    grid-template-columns: 1fr 1.5fr 1fr;
    grid-template-rows: 1.1fr 1fr 1fr;
    gap: 2.3% 2.8%;
  }

  /* Room tiles */
  .room-door {
    position: relative;
    border: 1px solid rgba(196, 162, 78, 0.24);
    background: rgba(8, 9, 12, 0.58);
    backdrop-filter: blur(6px);
    padding: 0.5rem 0.58rem;
    cursor: pointer;
    transition: all 0.4s ease;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    text-decoration: none;
    border-radius: 1px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25);
  }

  .room-door:hover {
    border-color: rgba(196, 162, 78, 0.7);
    background: rgba(196, 162, 78, 0.16);
    box-shadow:
      0 0 24px rgba(196, 162, 78, 0.18),
      inset 0 0 20px rgba(196, 162, 78, 0.05);
  }

  .room-door:hover .room-top-line {
    opacity: 1;
  }

  .room-top-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--color-brass), transparent);
    opacity: 0;
    transition: opacity 0.4s;
  }

  .room-door-visited {
    border-color: rgba(196, 162, 78, 0.45);
    background: rgba(196, 162, 78, 0.08);
    box-shadow: 0 0 12px rgba(196, 162, 78, 0.08);
  }

  .room-door-inert {
    border-color: rgba(196, 162, 78, 0.08);
    opacity: 0.3;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
  }

  .room-inert-label {
    font-family: var(--font-readout);
    font-size: 0.4rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-parchment-dim);
  }

  .room-door-attic {
    border-color: rgba(196, 162, 78, 0.15);
    opacity: 0.78;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .room-door-attic:hover {
    opacity: 1;
  }

  .room-name {
    font-family: var(--font-display);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--color-parchment);
    display: block;
    transition: color 0.3s;
  }

  .room-name-dim {
    color: var(--color-brass-dim);
    font-size: 0.65rem;
  }

  .room-name-visited {
    color: var(--color-brass);
  }

  .room-door:hover .room-name:not(.room-name-visited):not(.room-name-dim) {
    color: var(--color-brass-glow);
  }

  .room-category {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.17em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.15rem;
    display: block;
  }

  .room-footer {
    margin-top: auto;
  }

  .room-visited-label {
    font-family: var(--font-readout);
    font-size: 0.46rem;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .room-status {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-brass-dim);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .room-status-visited {
    opacity: 1;
    background: var(--color-brass);
  }

  .mansion-main[data-tension='mid'] .room-door-visited {
    border-color: rgba(196, 162, 78, 0.55);
    box-shadow:
      0 0 18px rgba(196, 162, 78, 0.16),
      inset 0 0 20px rgba(196, 162, 78, 0.06);
  }

  .mansion-main[data-tension='high'] .board-overlay {
    background:
      radial-gradient(circle at 20% 15%, rgba(240, 141, 60, 0.12), transparent 36%),
      rgba(8, 9, 12, 0.5);
  }

  .mansion-main[data-tension='high'] .top-bar-title {
    color: var(--color-ember);
  }

  @media (max-width: 767px) {
    .top-bar {
      flex-wrap: wrap;
    }

    .top-bar-meta {
      order: 3;
      flex-basis: 100%;
    }

    .board-grid {
      top: 4%;
      bottom: 12%;
      left: 6%;
      right: 6%;
    }

    .room-name {
      font-size: 0.6rem;
    }

    .room-category {
      font-size: 0.35rem;
    }
  }
</style>
