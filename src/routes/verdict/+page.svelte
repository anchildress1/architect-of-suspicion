<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { gameState } from '$lib/stores/gameState.svelte';
  import CoverLetter from '$lib/components/CoverLetter.svelte';
  import Resume from '$lib/components/Resume.svelte';
  import type { Verdict } from '$lib/types';

  let coverLetter = $state('');
  let architectClosing = $state('');
  let claim = $state('');
  let verdict = $state<Verdict>('pardon');
  let ready = $state(false);

  onMount(() => {
    const stored = sessionStorage.getItem('verdictResult');
    if (!stored) {
      goto(resolve('/'));
      return;
    }

    try {
      const data = JSON.parse(stored);
      coverLetter = data.cover_letter;
      architectClosing = data.architect_closing;
      claim = data.claim;
      verdict = data.verdict;
      ready = true;
    } catch {
      goto(resolve('/'));
    }
  });

  function playAgain() {
    sessionStorage.removeItem('verdictResult');
    gameState.reset();
    goto(resolve('/'));
  }
</script>

<svelte:head>
  <title>The Verdict | Architect of Suspicion</title>
</svelte:head>

{#if ready}
  <main
    class="min-h-screen"
    style="background: linear-gradient(180deg, rgba(8,9,12,1) 0%, rgba(13,16,23,1) 40%, rgba(8,9,12,1) 100%)"
  >
    <div class="mx-auto max-w-7xl px-6 py-12 lg:py-16">
      <div class="mb-12 text-center">
        <p class="font-readout text-brass-dim mb-4 text-xs uppercase tracking-[0.3em]">
          The verdict has been rendered
        </p>
        <blockquote class="mx-auto max-w-2xl">
          <p class="font-display text-brass text-xl leading-relaxed italic lg:text-2xl">
            &ldquo;{architectClosing}&rdquo;
          </p>
        </blockquote>
        <p class="font-readout text-parchment-dim mt-4 text-xs">
          &mdash; The Architect
        </p>
      </div>

      <div class="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div class="border-brass/20 bg-chamber/60 rounded-lg border p-6 backdrop-blur-sm lg:p-8">
          <CoverLetter letter={coverLetter} {claim} {verdict} />
        </div>

        <div class="border-brass/10 bg-chamber/40 rounded-lg border p-6 lg:p-8">
          <h2 class="font-display text-brass mb-6 text-lg tracking-widest uppercase">The Subject</h2>
          <Resume />
        </div>
      </div>

      <div class="mt-12 text-center">
        <button
          onclick={playAgain}
          class="font-display bg-brass/10 border-brass/30 text-brass hover:bg-brass/20 hover:border-brass/50 rounded border px-8 py-3 text-sm uppercase tracking-widest transition-all duration-300"
        >
          Investigate Again
        </button>
        <p class="font-body text-parchment-dim mt-3 text-xs italic">
          A new claim awaits. The mansion never sleeps.
        </p>
      </div>
    </div>
  </main>
{/if}
