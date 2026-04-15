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
          session_id: gameState.current.sessionId,
        }),
      );

      goto(resolve(`/verdict?session=${gameState.current.sessionId}`));
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      loading = false;
    }
  }
</script>

<div
  bind:this={overlayEl}
  class="verdict-overlay"
  tabindex="-1"
  role="presentation"
  onkeydown={(e) => {
    if (e.key === 'Escape' && !loading) oncancel();
  }}
>
  <div
    class="verdict-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm verdict"
  >
    {#if loading}
      <div class="verdict-loading">
        <div class="verdict-spinner"></div>
        <p class="verdict-loading-title">
          The Architect is composing the record...
        </p>
        <p class="verdict-loading-subtitle">
          The gears turn. The ink flows. Patience.
        </p>
      </div>
    {:else}
      <div class="verdict-badge-area">
        <span
          class="verdict-badge"
          class:verdict-badge-accuse={isAccuse}
          class:verdict-badge-pardon={!isAccuse}
        >
          {isAccuse ? 'Accusation' : 'Pardon'}
        </span>
      </div>

      <blockquote class="verdict-claim">
        <p class="font-display text-parchment text-center text-lg leading-relaxed">
          &ldquo;{gameState.current.claim}&rdquo;
        </p>
      </blockquote>

      <div class="verdict-tally">
        <div class="verdict-tally-item">
          <span class="verdict-tally-count verdict-tally-count-proof">{gameState.proofCount}</span>
          <span class="verdict-tally-label">Proof</span>
        </div>
        <div class="verdict-tally-item">
          <span class="verdict-tally-count verdict-tally-count-objection">{gameState.objectionCount}</span>
          <span class="verdict-tally-label">Objections</span>
        </div>
      </div>

      <p class="verdict-prompt">
        Are you certain? The record cannot be amended.
      </p>

      {#if errorMsg}
        <p class="verdict-error" role="alert">{errorMsg}</p>
      {/if}

      <div class="verdict-buttons">
        <button onclick={oncancel} class="verdict-btn verdict-btn-cancel">
          Reconsider
        </button>
        <button
          onclick={confirm}
          class="verdict-btn"
          class:verdict-btn-accuse={isAccuse}
          class:verdict-btn-confirm={!isAccuse}
        >
          {isAccuse ? 'Accuse' : 'Pardon'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .verdict-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(8, 9, 12, 0.9);
    backdrop-filter: blur(4px);
  }

  .verdict-dialog {
    background: rgba(17, 25, 40, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 2rem;
    margin: 1rem;
    width: 100%;
    max-width: 28rem;
    backdrop-filter: blur(20px) saturate(150%);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(196, 162, 78, 0.06);
  }

  /* Loading state */
  .verdict-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 0;
  }

  .verdict-spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 2px solid rgba(196, 162, 78, 0.3);
    border-top-color: var(--color-brass);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1.5rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .verdict-loading-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--color-brass);
    text-align: center;
  }

  .verdict-loading-subtitle {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-style: italic;
    color: var(--color-parchment-dim);
    text-align: center;
    margin-top: 0.5rem;
  }

  /* Badge */
  .verdict-badge-area {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .verdict-badge {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 0.35rem 0.75rem;
    border-radius: 0.25rem;
    display: inline-block;
  }

  .verdict-badge-accuse {
    background: rgba(212, 102, 58, 0.1);
    color: var(--color-forge-orange);
    border: 1px solid rgba(212, 102, 58, 0.3);
  }

  .verdict-badge-pardon {
    background: rgba(196, 162, 78, 0.1);
    color: var(--color-brass-glow);
    border: 1px solid rgba(196, 162, 78, 0.3);
  }

  /* Claim */
  .verdict-claim {
    margin-bottom: 1.5rem;
  }

  /* Tally */
  .verdict-tally {
    display: flex;
    justify-content: center;
    gap: 2rem;
    padding: 1rem 0;
    border-top: 1px solid rgba(196, 162, 78, 0.1);
    border-bottom: 1px solid rgba(196, 162, 78, 0.1);
    margin-bottom: 1.5rem;
  }

  .verdict-tally-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .verdict-tally-count {
    font-family: var(--font-readout);
    font-size: 1.5rem;
  }

  .verdict-tally-count-proof {
    color: var(--color-brass-glow);
  }

  .verdict-tally-count-objection {
    color: var(--color-copper);
  }

  .verdict-tally-label {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-parchment-dim);
  }

  /* Prompt */
  .verdict-prompt {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-style: italic;
    color: var(--color-parchment-dim);
    text-align: center;
    margin-bottom: 2rem;
  }

  .verdict-error {
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--color-forge-orange);
    text-align: center;
    margin-bottom: 1rem;
  }

  /* Buttons */
  .verdict-buttons {
    display: flex;
    gap: 1rem;
  }

  .verdict-btn {
    flex: 1;
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.65rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .verdict-btn-cancel {
    border: 1px solid rgba(196, 162, 78, 0.2);
    background: transparent;
    color: var(--color-parchment-dim);
  }

  .verdict-btn-cancel:hover {
    border-color: rgba(196, 162, 78, 0.4);
    color: var(--color-parchment);
  }

  .verdict-btn-accuse {
    border: 1px solid rgba(212, 102, 58, 0.4);
    background: rgba(212, 102, 58, 0.1);
    color: var(--color-forge-orange);
  }

  .verdict-btn-accuse:hover {
    background: rgba(212, 102, 58, 0.2);
  }

  .verdict-btn-confirm {
    border: 1px solid rgba(196, 162, 78, 0.4);
    background: rgba(196, 162, 78, 0.1);
    color: var(--color-brass-glow);
  }

  .verdict-btn-confirm:hover {
    background: rgba(196, 162, 78, 0.2);
  }
</style>
