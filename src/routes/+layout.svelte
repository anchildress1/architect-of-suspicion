<script lang="ts">
  import '../app.css';
  import { onNavigate } from '$app/navigation';
  import MobileGate from '$lib/components/MobileGate.svelte';

  let { children } = $props();

  // 2026: View Transitions API for cinematic page-to-page motion.
  // Falls through silently when unsupported (Safari < 18, etc).
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<MobileGate />

<div class="vignette">
  {@render children()}
</div>
