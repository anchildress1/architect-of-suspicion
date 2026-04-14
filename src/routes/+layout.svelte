<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import MobileGate from '$lib/components/MobileGate.svelte';

  let { children } = $props();
</script>

<MobileGate />

{#key page.url.pathname}
  <div class="page-transition-enter">
    {@render children()}
  </div>
{/key}
