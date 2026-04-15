<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
</script>

<div class="border-t border-brass/20 px-4 py-4">
  <h3 class="font-readout text-brass-dim mb-3 text-xs uppercase tracking-widest">Evidence Tally</h3>
  <div class="flex justify-between gap-4">
    <div class="flex flex-col items-center">
      <span class="font-readout text-brass-glow text-2xl">{gameState.proofCount}</span>
      <span class="font-readout text-parchment-dim text-xs uppercase tracking-wider">Proof</span>
    </div>
    <div class="flex flex-col items-center">
      <span class="font-readout text-copper text-2xl">{gameState.objectionCount}</span>
      <span class="font-readout text-parchment-dim text-xs uppercase tracking-wider">Objections</span>
    </div>
  </div>
</div>
