<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { gameState } from '$lib/stores/gameState.svelte';
  import CoverLetter from '$lib/components/CoverLetter.svelte';
  import Resume from '$lib/components/Resume.svelte';
  import type { CoverLetterResponse, Verdict } from '$lib/types';

  let { data } = $props();

  type Phase = 'choose' | 'composing' | 'sealed';

  let phase = $state<Phase>('choose');
  let letter = $state('');
  let closing = $state('');
  let claim = $state('');
  let verdict = $state<Verdict>('pardon');
  let chosenVerdict = $state<Verdict | null>(null);
  let armProgress = $state(0);
  let armTimer: ReturnType<typeof setInterval> | null = null;
  let errorMsg = $state('');

  function clearArm() {
    if (armTimer) {
      clearInterval(armTimer);
      armTimer = null;
    }
  }

  function startArm(v: Verdict) {
    if (chosenVerdict) return;
    clearArm();
    chosenVerdict = v;
    armProgress = 4;
    armTimer = setInterval(() => {
      armProgress = Math.min(100, armProgress + 6);
      if (armProgress >= 100) {
        clearArm();
        void seal(v);
      }
    }, 55);
  }

  function cancelArm() {
    if (phase !== 'choose') return;
    clearArm();
    armProgress = 0;
    chosenVerdict = null;
  }

  async function seal(v: Verdict) {
    if (!gameState.current.sessionId) return;
    phase = 'composing';
    errorMsg = '';
    try {
      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: gameState.current.sessionId,
          verdict: v,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message ?? 'The Architect could not seal the record.');
      }
      const body = (await res.json()) as CoverLetterResponse;
      letter = body.cover_letter;
      closing = body.architect_closing;
      claim = gameState.current.claimText;
      verdict = v;
      gameState.setVerdict(v);
      phase = 'sealed';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      phase = 'choose';
      chosenVerdict = null;
      armProgress = 0;
    }
  }

  function playAgain() {
    gameState.reset();
    goto(resolve('/'));
  }

  onMount(() => {
    // Prefer server-loaded sealed record; otherwise begin the choose flow.
    if (data.session?.cover_letter && data.session.verdict) {
      letter = data.session.cover_letter;
      closing = data.session.architect_closing ?? '';
      claim = data.session.claim ?? gameState.current.claimText;
      verdict = data.session.verdict as Verdict;
      phase = 'sealed';
      return;
    }
    if (!gameState.current.sessionId) {
      goto(resolve('/'));
    }
  });
</script>

<svelte:head>
  <title>The Verdict | Architect of Suspicion</title>
</svelte:head>

<main class="verdict-main noise" aria-label="The verdict">
  <div class="verdict-shell">
    {#if phase === 'choose'}
      <section class="choose reveal">
        <p class="choose-eyebrow">The court awaits your ruling</p>
        <h1 class="choose-headline">Render the verdict.</h1>
        <blockquote class="choose-claim">&ldquo;{gameState.current.claimText}&rdquo;</blockquote>

        <div class="choose-tally">
          <div class="ct-item">
            <span class="ct-count">{gameState.proofCount}</span>
            <span class="ct-label">Proof</span>
          </div>
          <div class="ct-item">
            <span class="ct-count">{gameState.objectionCount}</span>
            <span class="ct-label">Objections</span>
          </div>
          <div class="ct-item">
            <span class="ct-count">{gameState.dismissedCount}</span>
            <span class="ct-label">Struck</span>
          </div>
        </div>

        <p class="choose-prompt">The record cannot be amended. Hold to seal.</p>

        {#if errorMsg}
          <p class="choose-error" role="alert">{errorMsg}</p>
        {/if}

        <div class="choose-buttons">
          {@render verdictButton('pardon', 'Hold to Pardon')}
          {@render verdictButton('accuse', 'Hold to Accuse')}
        </div>

        <a class="choose-cancel" href={resolve('/mansion')}>&larr; Reconsider in the Mansion</a>
      </section>
    {:else if phase === 'composing'}
      <section class="composing reveal" aria-live="polite">
        <p class="composing-eyebrow">The Architect composes the record</p>
        <p class="composing-headline">
          The gallery falls silent.<br />The pen moves.
        </p>
        <div class="composing-spinner" aria-hidden="true"></div>
      </section>
    {:else}
      <section class="sealed reveal">
        <header class="sealed-head">
          <div>
            <p class="sealed-eyebrow">The Record &middot; Sealed</p>
            <h1 class="sealed-title">Verdict Rendered</h1>
          </div>
          <div class="sealed-stamp" data-verdict={verdict}>
            <span class="sealed-stamp-word">{verdict === 'accuse' ? 'Accused' : 'Pardoned'}</span>
            <span class="sealed-stamp-year">MMXXVI &middot; Case 0426</span>
          </div>
        </header>

        <div class="sealed-grid">
          <div class="sealed-letter-wrap">
            <CoverLetter {letter} {claim} {verdict} {closing} />
          </div>

          <aside class="sealed-resume">
            <p class="sealed-resume-eyebrow">Corporate record &middot; the subject</p>
            <Resume />
          </aside>
        </div>

        <footer class="sealed-actions">
          <button class="link-btn" type="button" onclick={() => window.print()}>Print Letter</button
          >
          <button class="link-btn link-btn-primary" type="button" onclick={playAgain}>
            Investigate Again
          </button>
        </footer>
      </section>
    {/if}
  </div>
</main>

{#snippet verdictButton(v: Verdict, label: string)}
  <button
    type="button"
    class="vb"
    class:vb-accuse={v === 'accuse'}
    class:vb-pardon={v === 'pardon'}
    class:vb-active={chosenVerdict === v}
    onpointerdown={() => startArm(v)}
    onpointerup={cancelArm}
    onpointerleave={cancelArm}
    onpointercancel={cancelArm}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startArm(v);
      }
    }}
    onkeyup={(e) => {
      if (e.key === 'Enter' || e.key === ' ') cancelArm();
    }}
  >
    <span class="vb-label">{label}</span>
    <span class="vb-track" aria-hidden="true">
      <span class="vb-fill" style="width: {chosenVerdict === v ? armProgress : 0}%"></span>
    </span>
  </button>
{/snippet}

<style>
  .verdict-main {
    position: relative;
    min-height: 100vh;
    background: radial-gradient(ellipse at center, #1a1218 0%, #0b0b0d 60%);
    padding: 3rem 1.5rem 4rem;
  }

  .verdict-shell {
    max-width: 1280px;
    margin: 0 auto;
  }

  /* ============================================
     CHOOSE phase
     ============================================ */
  .choose {
    max-width: 32rem;
    margin: 6vh auto 0;
    text-align: center;
  }

  .choose-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 1rem;
  }

  .choose-headline {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(2rem, 5vw, 3rem);
    color: var(--color-bone);
    margin-bottom: 1.4rem;
    line-height: 1.1;
  }

  .choose-claim {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.1rem;
    color: var(--color-paper-dim);
    line-height: 1.5;
    border-left: 2px solid rgba(210, 58, 42, 0.55);
    padding-left: 0.9rem;
    text-align: left;
    margin: 0 auto 1.8rem;
    max-width: 26rem;
  }

  .choose-tally {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
    border-top: 1px solid rgba(233, 228, 216, 0.12);
    border-bottom: 1px solid rgba(233, 228, 216, 0.12);
    padding: 1rem 0;
    margin-bottom: 1.6rem;
  }

  .ct-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .ct-count {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.7rem;
    color: var(--color-bone);
    line-height: 1;
  }

  .ct-label {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .choose-prompt {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--color-paper-dim);
    margin-bottom: 1.5rem;
  }

  .choose-error {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-ember);
    margin-bottom: 1rem;
  }

  .choose-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .vb {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 1.2rem;
    background: rgba(11, 11, 13, 0.7);
    border: 1px solid rgba(233, 228, 216, 0.2);
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .vb-accuse {
    border-color: rgba(210, 58, 42, 0.5);
  }

  .vb-pardon {
    border-color: rgba(233, 228, 216, 0.35);
  }

  .vb:hover,
  .vb-active {
    background: rgba(20, 20, 23, 0.95);
  }

  .vb-accuse.vb-active {
    border-color: var(--color-ember);
  }

  .vb-pardon.vb-active {
    border-color: var(--color-bone);
  }

  .vb-label {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.2rem;
    color: var(--color-bone);
  }

  .vb-track {
    height: 2px;
    background: rgba(233, 228, 216, 0.1);
    overflow: hidden;
  }

  .vb-fill {
    display: block;
    height: 100%;
    transition: width 50ms linear;
  }

  .vb-accuse .vb-fill {
    background: var(--color-ember);
  }

  .vb-pardon .vb-fill {
    background: var(--color-bone);
  }

  .choose-cancel {
    display: inline-block;
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-decoration: none;
    transition: color 0.3s;
  }

  .choose-cancel:hover {
    color: var(--color-bone);
  }

  /* ============================================
     COMPOSING phase
     ============================================ */
  .composing {
    text-align: center;
    padding: 8rem 1rem;
  }

  .composing-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 1rem;
  }

  .composing-headline {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(1.6rem, 4vw, 2.4rem);
    color: var(--color-bone);
    line-height: 1.4;
  }

  .composing-spinner {
    margin: 2rem auto 0;
    width: 36px;
    height: 36px;
    border: 1px solid rgba(233, 228, 216, 0.18);
    border-top-color: var(--color-bone);
    border-radius: 50%;
    animation: spin 1.4s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ============================================
     SEALED phase
     ============================================ */
  .sealed-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 1rem 0 2rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.12);
    margin-bottom: 2rem;
  }

  .sealed-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .sealed-title {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(2rem, 4vw, 3rem);
    color: var(--color-bone);
    line-height: 1;
    margin-top: 0.4rem;
  }

  .sealed-stamp {
    width: 130px;
    height: 130px;
    border: 4px double var(--color-ember);
    color: var(--color-ember);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transform: rotate(-6deg);
    text-align: center;
  }

  .sealed-stamp[data-verdict='pardon'] {
    border-color: var(--color-bone);
    color: var(--color-bone);
  }

  .sealed-stamp-word {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.4rem;
    line-height: 1;
  }

  .sealed-stamp-year {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    margin-top: 0.4rem;
  }

  .sealed-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: start;
  }

  .sealed-letter-wrap {
    min-width: 0;
  }

  .sealed-resume {
    background: rgba(20, 20, 23, 0.7);
    border: 1px solid rgba(233, 228, 216, 0.1);
    padding: 1.5rem;
    backdrop-filter: blur(8px);
  }

  .sealed-resume-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 1rem;
  }

  .sealed-actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 3rem;
  }

  .link-btn {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 0.7rem 1.4rem;
    border: 1px solid rgba(233, 228, 216, 0.35);
    background: transparent;
    color: var(--color-bone);
    cursor: pointer;
    text-decoration: none;
    transition: all 0.3s;
  }

  .link-btn:hover {
    background: rgba(233, 228, 216, 0.06);
    border-color: var(--color-bone);
  }

  .link-btn-primary {
    border-color: var(--color-ember);
    color: var(--color-ember);
  }

  .link-btn-primary:hover {
    background: rgba(210, 58, 42, 0.12);
  }

  @media (max-width: 1024px) {
    .sealed-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .sealed-head {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }
  }
</style>
