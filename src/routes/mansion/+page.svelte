<script lang="ts">
  import { resolve } from '$app/paths';
  import { roomsByGrid } from '$lib/rooms';
  import { gameState } from '$lib/stores/gameState.svelte';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';

  const hasEvidence = $derived(gameState.current.evidence.length > 0);

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
</script>

<svelte:head>
  <title>The Mansion | Architect of Suspicion</title>
</svelte:head>

<div class="flex h-screen overflow-hidden">
  <ArchitectPanel />

  <main
    class="relative flex flex-1 flex-col overflow-hidden"
    style="background: url('/backgrounds/house-exterior.webp') center/cover no-repeat"
  >
    <!-- Dark overlay -->
    <div class="bg-void/60 absolute inset-0"></div>

    <!-- Content -->
    <div class="relative z-10 flex flex-1 flex-col">
      <!-- Top bar -->
      <header class="flex items-center justify-between px-6 py-4">
        <h1 class="font-display text-brass-dim text-sm uppercase tracking-widest">
          Architect of Suspicion
        </h1>
        <div class="flex gap-3">
          <button
            class="font-readout border-brass/30 text-brass hover:bg-brass/10 rounded border px-4 py-1.5 text-xs uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!hasEvidence}
          >
            Accuse
          </button>
          <button
            class="font-readout border-brass/30 text-brass hover:bg-brass/10 rounded border px-4 py-1.5 text-xs uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!hasEvidence}
          >
            Pardon
          </button>
        </div>
      </header>

      <!-- Claim reminder -->
      <div class="px-6">
        <p class="font-body text-parchment-dim text-center text-sm italic">
          &ldquo;{gameState.current.claim}&rdquo;
        </p>
      </div>

      <!-- 3x3 Room Grid -->
      <div class="flex flex-1 items-center justify-center p-6">
        <div class="grid grid-cols-3 gap-3">
          {#each roomsByGrid as room (room.slug)}
            {@const visited = gameState.current.roomsVisited.includes(room.slug)}
            {@const count = roomEvidenceCount(room.category)}
            {#if room.slug === 'entry-hall'}
              <!-- Entry Hall: non-interactive, atmospheric -->
              <div
                class="bg-chamber/40 border-brass/10 flex h-28 w-44 flex-col items-center justify-center rounded border opacity-40"
              >
                <span class="font-display text-parchment-dim text-sm">{room.name}</span>
              </div>
            {:else if room.slug === 'attic'}
              <!-- Attic: links to /attic -->
              <a
                href={resolve('/attic')}
                class="bg-chamber/60 border-brass/20 hover:border-brass/50 hover:bg-chamber/80 flex h-28 w-44 flex-col items-center justify-center rounded border transition-all duration-200"
              >
                <span class="font-display text-parchment text-sm">{room.name}</span>
                <span class="font-readout text-brass-dim mt-1 text-xs">{room.category}</span>
              </a>
            {:else}
              <!-- Gameplay rooms -->
              <a
                href="{resolve('/room/[slug]', { slug: room.slug })}{excludeQuery(room.category)}"
                class="group flex h-28 w-44 flex-col items-center justify-center rounded border backdrop-blur-sm transition-all duration-200 {visited
                  ? 'bg-chamber/80 border-brass/40 shadow-[0_0_12px_rgba(196,162,78,0.08)]'
                  : 'bg-chamber/60 border-brass/20 hover:border-brass/50 hover:bg-chamber/80'}"
              >
                <span
                  class="font-display text-sm transition-colors {visited
                    ? 'text-brass'
                    : 'text-parchment group-hover:text-brass-glow'}"
                >
                  {room.name}
                </span>
                <span class="font-readout text-brass-dim mt-1 text-xs">{room.category}</span>
                {#if visited}
                  <span class="font-readout text-brass/60 mt-1 text-[10px] uppercase">
                    {count > 0 ? `${count} card${count !== 1 ? 's' : ''}` : 'Visited'}
                  </span>
                {/if}
              </a>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </main>
</div>
