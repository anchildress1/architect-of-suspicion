<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { roomsByGrid } from '$lib/rooms';
  import { gameState } from '$lib/stores/gameState.svelte';
  import { requestNarration } from '$lib/narrate';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';
  import VerdictConfirmation from '$lib/components/VerdictConfirmation.svelte';
  import type { Verdict } from '$lib/types';

  const hasEvidence = $derived(gameState.current.evidence.length > 0);
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
    if (gameState.current.roomsVisited.length >= 2) {
      requestNarration('wander', 'mansion');
    }
  });
</script>

<svelte:head>
  <title>The Mansion | Architect of Suspicion</title>
</svelte:head>

<div class="flex h-screen overflow-hidden">
  <ArchitectPanel />

  <main
    class="mansion-main"
    style="background: url('/backgrounds/house-exterior.webp') center/cover no-repeat"
  >
    <!-- Dark overlay -->
    <div class="mansion-overlay"></div>

    <!-- Content -->
    <div class="mansion-content">
      <!-- Top bar -->
      <header class="top-bar">
        <h1 class="top-bar-title">Architect of Suspicion</h1>
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

      <!-- Claim reminder -->
      <div class="claim-reminder">
        <p class="font-body text-parchment-dim text-center text-sm italic">
          &ldquo;{gameState.current.claim}&rdquo;
        </p>
      </div>

      <!-- 3x3 Room Grid -->
      <div class="mansion-grid-area">
        <nav class="mansion-grid" aria-label="Mansion rooms">
          {#each roomsByGrid as room (room.slug)}
            {@const visited = gameState.current.roomsVisited.includes(room.slug)}
            {@const count = roomEvidenceCount(room.category)}
            {#if room.slug === 'entry-hall'}
              <!-- Entry Hall: non-interactive, atmospheric -->
              <div class="room-door room-door-inert" aria-hidden="true">
                <span class="room-name room-name-dim">{room.name}</span>
                <span class="room-inert-label">No entry</span>
              </div>
            {:else if room.slug === 'attic'}
              <!-- Attic: links to /attic -->
              <a href={resolve('/attic')} class="room-door room-door-attic">
                <span class="room-name">{room.name}</span>
                <span class="room-category">{room.category}</span>
              </a>
            {:else}
              <!-- Gameplay rooms -->
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
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mansion-overlay {
    position: absolute;
    inset: 0;
    background: rgba(8, 9, 12, 0.6);
  }

  .mansion-content {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  /* Top bar */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: linear-gradient(to bottom, rgba(10, 12, 18, 0.9), transparent);
  }

  .top-bar-title {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .top-bar-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Buttons */
  .btn {
    font-family: var(--font-display);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.6rem 1.2rem;
    border: 1px solid rgba(196, 162, 78, 0.2);
    background: rgba(19, 22, 31, 0.8);
    color: var(--color-parchment-dim);
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(8px);
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

  .claim-reminder {
    padding: 0 1.5rem;
  }

  /* Grid area */
  .mansion-grid-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    min-height: 0;
  }

  .mansion-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    max-width: 600px;
    width: 100%;
  }

  /* Room tiles */
  .room-door {
    position: relative;
    border: 1px solid rgba(196, 162, 78, 0.2);
    background: rgba(19, 22, 31, 0.8);
    backdrop-filter: blur(12px);
    padding: 1.25rem;
    cursor: pointer;
    transition: all 0.4s ease;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    text-decoration: none;
  }

  .room-door:hover {
    border-color: rgba(196, 162, 78, 0.45);
    background: rgba(196, 162, 78, 0.06);
    transform: translateY(-2px);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 1px var(--color-brass-dim);
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
    background: linear-gradient(90deg, transparent, var(--color-brass-dim), transparent);
    opacity: 0;
    transition: opacity 0.4s;
  }

  .room-door-visited {
    border-color: rgba(196, 162, 78, 0.4);
    box-shadow: 0 0 12px rgba(196, 162, 78, 0.08);
  }

  .room-door-inert {
    border-color: rgba(196, 162, 78, 0.08);
    opacity: 0.25;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }

  .room-inert-label {
    font-family: var(--font-readout);
    font-size: 0.45rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-parchment-dim);
  }

  .room-door-attic {
    border-color: rgba(196, 162, 78, 0.12);
    opacity: 0.55;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .room-door-attic:hover {
    opacity: 0.8;
  }

  .room-name {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-parchment);
    display: block;
    transition: color 0.3s;
  }

  .room-name-dim {
    color: var(--color-brass-dim);
    font-size: 0.75rem;
  }

  .room-name-visited {
    color: var(--color-brass);
  }

  .room-door:hover .room-name:not(.room-name-visited):not(.room-name-dim) {
    color: var(--color-brass-glow);
  }

  .room-category {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.25rem;
    display: block;
  }

  .room-footer {
    margin-top: auto;
  }

  .room-visited-label {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(196, 162, 78, 0.6);
  }

  .room-status {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
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

  @media (max-width: 767px) {
    .mansion-grid {
      grid-template-columns: repeat(2, 1fr);
      max-width: 100%;
    }

    .room-door {
      aspect-ratio: auto;
      min-height: 5rem;
    }
  }
</style>
