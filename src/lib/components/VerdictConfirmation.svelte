<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { gameState } from '$lib/stores/gameState.svelte';
  import type { Verdict, CoverLetterResponse } from '$lib/types';

  let {
    verdict,
    oncancel,
  }: {
    verdict: Verdict;
    oncancel: () => void;
  } = $props();

  let loading = $state(false);
  let errorMsg = $state('');
  let overlayEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    overlayEl?.focus();
  });

  const isAccuse = $derived(verdict === 'accuse');

  async function confirm() {
    if (loading) return;
    loading = true;
    errorMsg = '';

    try {
      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: gameState.current.sessionId,
          claim: gameState.current.claim,
          verdict,
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message ?? 'Failed to generate letter');
      }

      const data: CoverLetterResponse = await res.json();

      gameState.setVerdict(verdict);

      sessionStorage.setItem(
        'verdictResult',
        JSON.stringify({
          cover_letter: data.cover_letter,
          architect_closing: data.architect_closing,
          claim: gameState.current.claim,
          verdict,
        }),
      );

      goto(resolve('/verdict'));
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      loading = false;
    }
  }
</script>

<div
  bind:this={overlayEl}
  class="fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm"
  tabindex="-1"
  role="presentation"
  onkeydown={(e) => {
    if (e.key === 'Escape' && !loading) oncancel();
  }}
>
  <div
    class="border-brass/30 bg-chamber mx-4 w-full max-w-lg rounded-lg border p-8 shadow-[0_0_40px_rgba(196,162,78,0.08)]"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm verdict"
  >
    {#if loading}
      <div class="flex flex-col items-center py-8">
        <div class="border-brass/30 border-t-brass mb-6 h-10 w-10 animate-spin rounded-full border-2"></div>
        <p class="font-display text-brass text-center text-lg">
          The Architect is composing the record...
        </p>
        <p class="font-body text-parchment-dim mt-2 text-center text-sm italic">
          The gears turn. The ink flows. Patience.
        </p>
      </div>
    {:else}
      <div class="mb-6 text-center">
        <span
          class="font-readout inline-block rounded px-3 py-1 text-xs uppercase tracking-widest {isAccuse
            ? 'bg-forge-orange/10 text-forge-orange border-forge-orange/30 border'
            : 'bg-brass/10 text-brass-glow border-brass/30 border'}"
        >
          {isAccuse ? 'Accusation' : 'Pardon'}
        </span>
      </div>

      <blockquote class="mb-6">
        <p class="font-display text-parchment text-center text-lg leading-relaxed">
          &ldquo;{gameState.current.claim}&rdquo;
        </p>
      </blockquote>

      <div class="border-brass/10 mb-6 flex justify-center gap-8 border-y py-4">
        <div class="flex flex-col items-center">
          <span class="font-readout text-brass-glow text-2xl">{gameState.proofCount}</span>
          <span class="font-readout text-parchment-dim text-xs uppercase tracking-wider">Proof</span>
        </div>
        <div class="flex flex-col items-center">
          <span class="font-readout text-copper text-2xl">{gameState.objectionCount}</span>
          <span class="font-readout text-parchment-dim text-xs uppercase tracking-wider">Objections</span>
        </div>
      </div>

      <p class="font-body text-parchment-dim mb-8 text-center text-sm italic">
        Are you certain? The record cannot be amended.
      </p>

      {#if errorMsg}
        <p class="font-body text-forge-orange mb-4 text-center text-sm">{errorMsg}</p>
      {/if}

      <div class="flex gap-4">
        <button
          onclick={oncancel}
          class="font-display border-brass/20 text-parchment-dim hover:border-brass/40 hover:text-parchment flex-1 rounded border py-2.5 text-sm uppercase tracking-wider transition-colors"
        >
          Reconsider
        </button>
        <button
          onclick={confirm}
          class="font-display flex-1 rounded border py-2.5 text-sm uppercase tracking-wider transition-colors {isAccuse
            ? 'border-forge-orange/40 bg-forge-orange/10 text-forge-orange hover:bg-forge-orange/20'
            : 'border-brass/40 bg-brass/10 text-brass-glow hover:bg-brass/20'}"
        >
          {isAccuse ? 'Accuse' : 'Pardon'}
        </button>
      </div>
    {/if}
  </div>
</div>
