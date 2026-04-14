<script lang="ts">
  import ArchitectFeed from './ArchitectFeed.svelte';
  import EvidenceTally from './EvidenceTally.svelte';
</script>

<aside class="architect-panel">
  <div class="architect-header">
    <h2 class="font-display text-brass text-xs font-bold uppercase tracking-[0.15em]">
      The Architect
    </h2>
  </div>
  <ArchitectFeed />
  <EvidenceTally />
</aside>

<style>
  .architect-panel {
    display: flex;
    flex-direction: column;
    width: 300px;
    height: 100%;
    flex-shrink: 0;
    background: rgba(10, 12, 18, 0.96);
    border-right: 1px solid rgba(196, 162, 78, 0.2);
    backdrop-filter: blur(20px);
  }

  .architect-header {
    padding: 1.25rem 1.25rem 0.75rem;
    border-bottom: 1px solid rgba(196, 162, 78, 0.1);
  }

  @media (max-width: 767px) {
    .architect-panel {
      display: none;
    }
  }
</style>
