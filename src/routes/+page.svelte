<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { gameState } from '$lib/stores/gameState.svelte';

  let entering = $state(false);
  let errorMsg = $state('');

  onMount(() => {
    gameState.reset();
  });

  async function enterMansion() {
    if (entering) return;
    entering = true;
    errorMsg = '';

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: gameState.current.claim }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message ?? 'Failed to create session');
      }

      const { session_id } = await res.json();
      gameState.setSessionId(session_id);
      goto(resolve('/mansion'));
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      entering = false;
    }
  }
</script>

<svelte:head>
  <title>Architect of Suspicion</title>
</svelte:head>

<main
  class="bg-void flex min-h-screen flex-col items-center justify-center p-8"
  style="background: radial-gradient(ellipse at center, rgba(19, 22, 31, 1) 0%, rgba(8, 9, 12, 1) 70%)"
>
  <div class="fade-up flex max-w-2xl flex-col items-center text-center">
    <p class="font-readout text-brass-dim mb-8 text-xs uppercase tracking-[0.3em]">
      The case has been filed
    </p>

    <blockquote class="mb-8">
      <span class="font-display text-brass-dim text-4xl leading-none select-none">&ldquo;</span>
      <p class="font-display text-parchment -mt-6 text-3xl leading-relaxed md:text-4xl">
        {gameState.current.claim}
      </p>
      <span class="font-display text-brass-dim mt-2 block text-right text-4xl leading-none select-none"
        >&rdquo;</span
      >
    </blockquote>

    <p class="font-body text-parchment-dim fade-up mb-12 text-sm italic" style="--fade-delay: 0.5s">
      &mdash; filed by an anonymous informant
    </p>

    <button
      onclick={enterMansion}
      disabled={entering}
      class="font-display bg-brass/10 border-brass/30 text-brass hover:bg-brass/20 hover:border-brass/50 fade-up rounded border px-8 py-3 text-sm uppercase tracking-widest transition-all duration-300 disabled:opacity-50"
      style="--fade-delay: 1s"
    >
      {entering ? 'Entering...' : 'Enter the Mansion'}
    </button>

    {#if errorMsg}
      <p class="font-body text-forge-orange mt-4 text-sm">{errorMsg}</p>
    {/if}
  </div>
</main>

<style>
  .fade-up {
    --fade-delay: 0s;
    animation: fadeUp 1s ease-out var(--fade-delay) forwards;
    opacity: 0;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
