<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { gameState } from '$lib/stores/gameState.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // untrack: we intentionally want only the initial page-load value.
  // data.claim doesn't change mid-session on this page.
  let loadingClaim = $state(!untrack(() => data.claim));
  let entering = $state(false);
  let errorMsg = $state(untrack(() => (data.claim ? '' : 'The docket could not be read.')));

  onMount(() => {
    gameState.reset();
    if (data.claim) {
      gameState.setClaim(data.claim);
      loadingClaim = false;
    }
  });

  async function enterMansion() {
    const claimId = data.claim?.id ?? gameState.current.claimId;
    if (entering || !claimId) return;
    entering = true;
    errorMsg = '';

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message ?? 'Failed to create session');
      }

      const body = (await res.json()) as {
        session_id: string;
        claim_id: string;
        claim_text: string;
      };
      gameState.initSession({
        sessionId: body.session_id,
        claimId: body.claim_id,
        claimText: body.claim_text,
      });
      goto('/mansion');
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      entering = false;
    }
  }
</script>

<svelte:head>
  <title>The Summons | Architect of Suspicion</title>
</svelte:head>

<main class="summons noise" aria-label="The summons">
  <div class="ember-floor" aria-hidden="true"></div>
  {#each [12, 28, 44, 60, 76, 88] as left, i (left)}
    <div
      class="steam-shaft"
      style="left: {left}%; animation-delay: {i * 0.8}s; animation-duration: {5 + (i % 3)}s"
      aria-hidden="true"
    ></div>
  {/each}

  <div class="summons-title reveal">
    <p class="summons-eyebrow">The Court of Suspicion presents</p>
    <h1 class="summons-headline">
      Architect <span class="summons-amp">of</span> Suspicion
    </h1>
    <p class="summons-sub">
      An investigation <span class="dot">&middot;</span> in IX chambers
      <span class="dot">&middot;</span> concerning one Ashley Childress
    </p>
  </div>

  <section class="dossier reveal" aria-label="The case dossier">
    <i class="dossier-corner tl"></i>
    <i class="dossier-corner tr"></i>
    <i class="dossier-corner bl"></i>
    <i class="dossier-corner br"></i>

    <div class="dossier-head">
      <span class="dossier-id">Case &numero;&nbsp;0426 &middot; Docket&nbsp;AA-XII</span>
      <span class="dossier-date"
        >{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span
      >
    </div>

    <p class="dossier-eyebrow">The Claim, entered into evidence</p>

    {#if data.claim}
      <h2 class="dossier-claim transition-claim">{data.claim.text}</h2>
    {:else if loadingClaim}
      <h2 class="dossier-claim dossier-claim-loading">
        &hellip;the docket is being read aloud&hellip;
      </h2>
    {:else}
      <h2 class="dossier-claim dossier-claim-error">
        &ldquo;The docket is empty. Seed the claims pipeline.&rdquo;
      </h2>
    {/if}

    <div class="dossier-meta-row">
      <div>
        <p class="dossier-field">Subject</p>
        <p class="dossier-value">Ashley Childress</p>
      </div>
      <span class="dossier-sep" aria-hidden="true"></span>
      <div class="dossier-meta-right">
        <p class="dossier-field">Filed by</p>
        <p class="dossier-value">Anonymous</p>
      </div>
    </div>

    <p class="dossier-intro">
      The doors are bolted. The gallery has assembled. Witnesses await &mdash; you will pick, you
      will rule. And I, the Architect, will be watching.
    </p>

    <div class="dossier-cta">
      <button class="lever-btn" disabled={entering || !data.claim} onclick={enterMansion}>
        <svg
          class="lever-btn-key"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        >
          <circle cx="6" cy="11" r="4" />
          <circle cx="6" cy="11" r="1.4" fill="currentColor" stroke="none" />
          <line x1="10" y1="11" x2="19" y2="11" />
          <line x1="15" y1="11" x2="15" y2="13.5" />
          <line x1="18" y1="11" x2="18" y2="14" />
        </svg>
        <span class="lever-btn-label">
          {entering ? 'Bolting the doors…' : 'Enter the Mansion'}
        </span>
      </button>
      <p class="dossier-meta-text">
        Verdict required <br />
        no accounts &middot; no timer
      </p>
    </div>

    {#if errorMsg}
      <p class="dossier-error" role="alert">{errorMsg}</p>
    {/if}
  </section>
</main>

<style>
  .summons {
    position: relative;
    /* Same viewport-locked pattern as the chamber and mansion shells —
       no page-level scroll. The dossier is sized with fluid clamps below
       so it fits inside `100dvh` on a typical laptop without overflow. */
    height: 100dvh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* Vertical padding scales with viewport height so short laptops don't
       fight the dossier for room while wide displays still feel airy. */
    padding: clamp(0.75rem, 2vh, 2rem) 2rem;
    background:
      radial-gradient(ellipse 60% 40% at 50% 55%, #1a1420 0%, transparent 70%),
      radial-gradient(ellipse at 50% 100%, rgba(210, 58, 42, 0.18), transparent 55%),
      linear-gradient(180deg, #070810 0%, #05060a 100%);
  }

  .ember-floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 45%;
    background: radial-gradient(
      ellipse 70% 100% at 50% 120%,
      rgba(210, 58, 42, 0.22),
      transparent 60%
    );
    mix-blend-mode: screen;
    pointer-events: none;
  }

  .steam-shaft {
    position: absolute;
    bottom: 0;
    width: 3px;
    background: linear-gradient(
      to top,
      rgba(255, 240, 220, 0),
      rgba(255, 240, 220, 0.18) 50%,
      rgba(255, 240, 220, 0)
    );
    filter: blur(3px);
    animation: steam 6s ease-in infinite;
    pointer-events: none;
  }

  @keyframes steam {
    0% {
      transform: translateY(0) scaleY(1);
      opacity: 0;
    }
    20% {
      opacity: 0.6;
    }
    100% {
      transform: translateY(-100vh) scaleY(1.2);
      opacity: 0;
    }
  }

  .summons-title {
    position: relative;
    z-index: 5;
    text-align: center;
    margin-bottom: clamp(1rem, 2.5vh, 2.5rem);
  }

  .summons-eyebrow {
    font-family: var(--font-readout);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: clamp(0.5rem, 1.2vh, 1rem);
  }

  .summons-headline {
    font-family: var(--font-display);
    font-style: italic;
    /* Fluid clamp that respects height too — keeps the marquee from
       hogging the viewport on short laptops. */
    font-size: clamp(2rem, 4vw + 2vh, 4.25rem);
    color: var(--color-bone);
    line-height: 1;
    text-shadow: 0 4px 40px rgba(210, 58, 42, 0.18);
  }

  .summons-amp {
    font-style: italic;
    color: var(--color-ember);
    padding: 0 0.2em;
  }

  .summons-sub {
    font-family: var(--font-readout);
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-paper-dim);
    margin-top: clamp(0.5rem, 1.4vh, 1.1rem);
  }

  .summons-sub .dot {
    color: var(--color-brass-dim);
    margin: 0 0.3em;
  }

  /* The dossier — the centerpiece */
  .dossier {
    position: relative;
    z-index: 5;
    width: min(100%, 640px);
    /* Vertical padding scales with viewport height so the box stays
       inside `100dvh` on short laptops — horizontal padding is preserved
       so the typography breathing room doesn't change. */
    padding: clamp(1.25rem, 3vh, 2.75rem) clamp(1.5rem, 5vw, 3.25rem) clamp(1.5rem, 3.5vh, 3.5rem);
    background: linear-gradient(180deg, #161922 0%, #0e1118 100%);
    border: 1px solid rgba(233, 228, 216, 0.25);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.6) inset,
      0 40px 100px rgba(0, 0, 0, 0.75),
      0 0 80px rgba(210, 58, 42, 0.06);
    transform: rotate(-0.6deg);
  }

  .dossier::before {
    content: '';
    position: absolute;
    inset: 12px;
    border: 1px solid rgba(233, 228, 216, 0.1);
    pointer-events: none;
  }

  /* Printer's marks — registration marks at the dossier corners.
     38×38 brass-dim, flush with the frame. Understated, not alarmed. */
  .dossier-corner {
    position: absolute;
    width: 38px;
    height: 38px;
    border: 1px solid var(--color-brass-dim);
    pointer-events: none;
  }

  .dossier-corner.tl {
    top: -1px;
    left: -1px;
    border-right: none;
    border-bottom: none;
  }
  .dossier-corner.tr {
    top: -1px;
    right: -1px;
    border-left: none;
    border-bottom: none;
  }
  .dossier-corner.bl {
    bottom: -1px;
    left: -1px;
    border-right: none;
    border-top: none;
  }
  .dossier-corner.br {
    bottom: -1px;
    right: -1px;
    border-left: none;
    border-top: none;
  }

  .dossier-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: clamp(0.75rem, 2vh, 1.7rem);
    padding-bottom: clamp(0.5rem, 1vh, 0.85rem);
    border-bottom: 1px dashed rgba(233, 228, 216, 0.2);
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .dossier-eyebrow {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: clamp(0.4rem, 0.8vh, 0.6rem);
  }

  .dossier-claim {
    position: relative;
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(1.4rem, 1.5vw + 1.5vh, 2.4rem);
    color: var(--color-bone);
    line-height: 1.25;
    margin-bottom: clamp(0.9rem, 2vh, 1.8rem);
    text-wrap: balance;
  }

  /* Giant serif quotation marks framing the claim. Decorative — only
     the live claim gets them, not loading/error placeholders. */
  .dossier-claim:not(.dossier-claim-loading):not(.dossier-claim-error)::before,
  .dossier-claim:not(.dossier-claim-loading):not(.dossier-claim-error)::after {
    position: absolute;
    font-family: var(--font-display);
    font-style: normal;
    font-size: 72px;
    line-height: 1;
    color: var(--color-bone-dim);
    pointer-events: none;
  }

  /* Quote glyphs hang outside the claim block. Clamp the negative offset
     so on narrow viewports they don't push past the dossier edge and (now
     that the summons shell is `overflow: hidden`) get silently clipped at
     the page boundary instead of staying visible. */
  .dossier-claim:not(.dossier-claim-loading):not(.dossier-claim-error)::before {
    content: '\201C';
    top: 18px;
    left: clamp(-36px, -4vw, -12px);
  }

  .dossier-claim:not(.dossier-claim-loading):not(.dossier-claim-error)::after {
    content: '\201D';
    bottom: 18px;
    right: clamp(-36px, -4vw, -12px);
  }

  .dossier-claim-loading {
    color: var(--color-brass-dim);
    font-size: 1.1rem;
  }

  .dossier-claim-error {
    color: var(--color-ember);
    font-size: 1.1rem;
  }

  .dossier-meta-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: clamp(0.9rem, 2vh, 1.8rem);
    padding-bottom: clamp(0.7rem, 1.5vh, 1.4rem);
    border-bottom: 1px solid rgba(233, 228, 216, 0.1);
  }

  .dossier-meta-right {
    margin-left: auto;
    text-align: right;
  }

  .dossier-sep {
    width: 1px;
    height: 32px;
    background: rgba(233, 228, 216, 0.2);
  }

  .dossier-field {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .dossier-value {
    font-family: var(--font-display);
    font-size: 1.05rem;
    color: var(--color-bone);
    margin-top: 0.2rem;
  }

  .dossier-intro {
    font-family: var(--font-body);
    font-size: 0.92rem;
    color: var(--color-paper-dim);
    line-height: 1.6;
    margin-bottom: clamp(0.9rem, 2vh, 1.8rem);
    text-wrap: pretty;
  }

  .dossier-cta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
  }

  .lever-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-bone);
    background: linear-gradient(180deg, #2a2417 0%, #14110a 100%);
    border: 1px solid var(--color-bone-dim);
    padding: 0.85rem 1.4rem;
    cursor: pointer;
    transition:
      box-shadow var(--motion-base) var(--ease-out),
      border-color var(--motion-base) var(--ease-out),
      color var(--motion-base) var(--ease-out);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.2),
      inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 6px 20px rgba(0, 0, 0, 0.6);
  }

  .lever-btn-key {
    flex-shrink: 0;
    color: var(--color-brass-key);
    transition: color var(--motion-base) var(--ease-out);
  }

  .lever-btn-label {
    display: inline-block;
  }

  .lever-btn:hover:not(:disabled) {
    border-color: var(--color-brass-key-glow);
    /* The 0.25 alpha glow uses the brass-key-glow hex (#f0c24d). */
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.32),
      inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 6px 20px rgba(0, 0, 0, 0.6),
      0 0 24px rgba(240, 194, 77, 0.25);
  }

  .lever-btn:hover:not(:disabled) .lever-btn-key {
    color: var(--color-brass-key-glow);
  }

  .lever-btn:disabled {
    opacity: 0.4;
    cursor: wait;
  }

  .dossier-meta-text {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-align: right;
    line-height: 1.6;
  }

  .dossier-error {
    margin-top: 1rem;
    font-family: var(--font-readout);
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-ember);
    text-align: center;
  }
</style>
