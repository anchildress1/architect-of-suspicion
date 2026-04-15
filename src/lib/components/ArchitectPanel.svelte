<script lang="ts">
  import ArchitectFeed from './ArchitectFeed.svelte';
  import EvidenceTally from './EvidenceTally.svelte';
</script>

<aside
  class="bg-chamber/80 border-r-brass/20 flex h-full w-[300px] shrink-0 flex-col border-r backdrop-blur-sm"
>
  <div class="border-b-brass/20 border-b px-4 py-3">
    <h2 class="font-display text-brass text-sm tracking-widest uppercase">The Architect</h2>
  </div>
  <ArchitectFeed />
  <EvidenceTally />
</aside>
