<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { getRoomBySlug } from '$lib/rooms';
  import { gameState } from '$lib/stores/gameState.svelte';
  import ArchitectPanel from '$lib/components/ArchitectPanel.svelte';

  const room = $derived(getRoomBySlug(page.params.slug ?? ''));

  $effect(() => {
    const slug = page.params.slug;
    if (slug) {
      gameState.visitRoom(slug);
    }
  });
</script>

<svelte:head>
  <title>{room?.name ?? 'Room'} | Architect of Suspicion</title>
</svelte:head>

<div class="flex h-screen overflow-hidden">
  <ArchitectPanel />

  {#if room}
    <main
      class="relative flex flex-1 flex-col overflow-hidden"
      style="background: url('{room.background}') center/cover no-repeat"
    >
      <!-- Dark overlay -->
      <div class="bg-void/50 absolute inset-0"></div>

      <!-- Content -->
      <div class="relative z-10 flex flex-1 flex-col">
        <!-- Top bar -->
        <header class="flex items-center justify-between px-6 py-4">
          <div>
            <h1 class="font-display text-parchment text-lg">{room.name}</h1>
            {#if room.category}
              <p class="font-readout text-brass-dim text-xs uppercase tracking-wider">
                {room.category}
              </p>
            {/if}
          </div>
          <a
            href={resolve('/mansion')}
            class="font-readout text-brass-dim hover:text-brass text-xs uppercase tracking-wider transition-colors"
          >
            Back to Mansion
          </a>
        </header>

        <!-- Card slots placeholder -->
        <div class="flex flex-1 items-center justify-center p-6">
          <div class="grid grid-cols-3 gap-4">
            {#each [0, 1, 2, 3, 4, 5] as i (i)}
              <div
                class="bg-chamber/40 border-brass/15 flex h-48 w-36 flex-col items-center justify-center rounded border border-dashed"
              >
                <span class="font-readout text-brass-dim/40 text-xs">Card {i + 1}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </main>
  {:else}
    <main class="bg-void flex flex-1 items-center justify-center">
      <p class="text-parchment-dim font-body">Room not found.</p>
    </main>
  {/if}
</div>
