<script lang="ts">
  import '../app.css';
  import { onNavigate } from '$app/navigation';
  import MobileGate from '$lib/components/MobileGate.svelte';

  let { children } = $props();

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

{@render children()}
