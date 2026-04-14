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

<main class="claim-view">
  <div class="claim-container">
    <p class="claim-prelude">The case has been filed</p>

    <blockquote class="claim-quote">
      <span class="claim-mark claim-mark-open">&ldquo;</span>
      <p class="claim-text">{gameState.current.claim}</p>
      <span class="claim-mark claim-mark-close">&rdquo;</span>
    </blockquote>

    <p class="claim-attribution">&mdash; filed by an anonymous informant</p>

    <button
      onclick={enterMansion}
      disabled={entering}
      class="claim-enter"
      aria-label="Enter the mansion to begin investigation"
    >
      {entering ? 'Entering...' : 'Enter the Mansion'}
    </button>

    {#if errorMsg}
      <p class="claim-error" role="alert">{errorMsg}</p>
    {/if}
  </div>
</main>

<style>
  .claim-view {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: radial-gradient(ellipse at center bottom, #1a1520 0%, var(--color-void) 70%);
  }

  .claim-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 42rem;
  }

  .claim-prelude {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 2rem;
    opacity: 0;
    animation: fadeUp 1s 0.5s forwards;
  }

  .claim-quote {
    margin-bottom: 1.5rem;
    opacity: 0;
    animation: fadeUp 1.2s 1.2s forwards;
  }

  .claim-mark {
    font-family: var(--font-display);
    font-size: 3rem;
    color: var(--color-brass);
    line-height: 0.5;
    display: block;
  }

  .claim-mark-open {
    text-align: left;
  }

  .claim-mark-close {
    text-align: right;
    margin-top: 0.5rem;
  }

  .claim-text {
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 4vw, 3rem);
    font-weight: 700;
    color: var(--color-parchment);
    line-height: 1.3;
    text-shadow: 0 0 40px rgba(196, 162, 78, 0.15);
  }

  .claim-attribution {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    opacity: 0;
    animation: fadeUp 1s 2s forwards;
  }

  .claim-enter {
    margin-top: 3rem;
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.8rem 2.5rem;
    border: 1px solid var(--color-brass-dim);
    background: rgba(196, 162, 78, 0.1);
    color: var(--color-brass);
    cursor: pointer;
    transition: all 0.3s ease;
    opacity: 0;
    animation: fadeUp 1s 2.8s forwards;
  }

  .claim-enter:hover:not(:disabled) {
    border-color: var(--color-brass);
    background: rgba(196, 162, 78, 0.15);
    box-shadow: 0 0 20px rgba(196, 162, 78, 0.1);
  }

  .claim-enter:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .claim-error {
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--color-forge-orange);
    margin-top: 1rem;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
