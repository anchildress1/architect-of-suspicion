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
  <main class="verdict-main">
    <div class="verdict-wrapper">
      <!-- Verdict header -->
      <div class="verdict-header">
        <p class="verdict-label">The verdict has been rendered</p>
        <blockquote class="verdict-closing">
          <p class="verdict-closing-text">
            &ldquo;{architectClosing}&rdquo;
          </p>
        </blockquote>
        <p class="verdict-attribution">&mdash; The Architect</p>
      </div>

      <!-- Two-column layout -->
      <div class="verdict-columns">
        <div class="verdict-card verdict-card-primary">
          <CoverLetter letter={coverLetter} {claim} {verdict} />
        </div>

        <div class="verdict-card verdict-card-secondary">
          <h2 class="font-display text-brass mb-6 text-lg tracking-widest uppercase">The Subject</h2>
          <Resume />
        </div>
      </div>

      <!-- Play again -->
      <div class="verdict-actions">
        <button onclick={playAgain} class="btn-play-again">
          Investigate Again
        </button>
        <p class="verdict-flavor">
          A new claim awaits. The mansion never sleeps.
        </p>
      </div>
    </div>
  </main>
{/if}

<style>
  .verdict-main {
    min-height: 100vh;
    background: linear-gradient(
      180deg,
      rgba(8, 9, 12, 1) 0%,
      rgba(13, 16, 23, 1) 40%,
      rgba(8, 9, 12, 1) 100%
    );
  }

  .verdict-wrapper {
    max-width: 80rem;
    margin: 0 auto;
    padding: 3rem 1.5rem 4rem;
  }

  /* Header */
  .verdict-header {
    text-align: center;
    margin-bottom: 3rem;
    animation: fadeUp 0.8s ease-out forwards;
  }

  .verdict-label {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 1rem;
  }

  .verdict-closing {
    max-width: 40rem;
    margin: 0 auto;
  }

  .verdict-closing-text {
    font-family: var(--font-display);
    font-size: clamp(1.1rem, 2.5vw, 1.5rem);
    font-style: italic;
    color: var(--color-brass);
    line-height: 1.6;
  }

  .verdict-attribution {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    color: var(--color-parchment-dim);
    margin-top: 1rem;
  }

  /* Columns */
  .verdict-columns {
    display: grid;
    gap: 2rem;
    grid-template-columns: 1fr;
    animation: fadeUp 1s 0.3s ease-out both;
  }

  @media (min-width: 1024px) {
    .verdict-columns {
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
    }
  }

  .verdict-card {
    border-radius: 0.5rem;
    padding: 1.5rem;
    backdrop-filter: blur(8px);
  }

  @media (min-width: 1024px) {
    .verdict-card {
      padding: 2rem;
    }
  }

  .verdict-card-primary {
    background: rgba(19, 22, 31, 0.6);
    border: 1px solid rgba(196, 162, 78, 0.2);
  }

  .verdict-card-secondary {
    background: rgba(19, 22, 31, 0.4);
    border: 1px solid rgba(196, 162, 78, 0.1);
  }

  /* Actions */
  .verdict-actions {
    text-align: center;
    margin-top: 3rem;
    animation: fadeUp 1s 0.6s ease-out both;
  }

  .btn-play-again {
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
    border-radius: 0.25rem;
    transition: all 0.3s ease;
  }

  .btn-play-again:hover {
    border-color: var(--color-brass);
    background: rgba(196, 162, 78, 0.15);
    box-shadow: 0 0 20px rgba(196, 162, 78, 0.1);
  }

  .verdict-flavor {
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-style: italic;
    color: var(--color-parchment-dim);
    margin-top: 0.75rem;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
