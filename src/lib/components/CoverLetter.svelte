<script lang="ts">
  import type { Verdict } from '$lib/types';

  interface Props {
    letter: string;
    claim: string;
    verdict: Verdict;
    closing?: string;
  }

  let { letter, claim, verdict, closing = '' }: Props = $props();

  let copied = $state(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(letter);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* clipboard denied — non-critical */
    }
  }

  const isAccuse = $derived(verdict === 'accuse');
  const stampWord = $derived(isAccuse ? 'Accused' : 'Pardoned');
  const paragraphs = $derived(
    letter
      .split('\n\n')
      .map((p) => p.trim())
      .filter(Boolean),
  );
</script>

<article class="letter reveal" aria-label="The Architect's record">
  <header class="letter-head">
    <div>
      <p class="letter-from">Ashley Childress</p>
      <p class="letter-from-sub">Software Engineer &middot; Architect of Systems</p>
    </div>
    <div class="letter-meta">
      Sealed &middot; {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}<br />
      Case &numero;&nbsp;0426<br />
      By the Architect's hand
    </div>
  </header>

  <blockquote class="letter-claim">&ldquo;{claim}&rdquo;</blockquote>

  <div class="letter-body">
    {#each paragraphs as paragraph, i (i)}
      <p style="animation-delay: {0.18 + i * 0.12}s">{paragraph}</p>
    {/each}
  </div>

  <footer class="letter-sign">
    <div>
      <p class="letter-closing">Yours, {isAccuse ? 'without remorse' : 'in good faith'},</p>
      <p class="letter-signature">The Architect</p>
      <p class="letter-role">Magistrate, Case 0426 &middot; ashleychildress.dev</p>
    </div>
    <div class="wax-seal" data-verdict={verdict}>
      <span class="wax-word">{stampWord}</span>
      <span class="wax-year">MMXXVI</span>
    </div>
  </footer>

  {#if closing}
    <p class="letter-closing-line">&mdash; {closing}</p>
  {/if}

  <button class="letter-copy" type="button" onclick={copyToClipboard} aria-live="polite">
    {copied ? 'Copied to clipboard' : 'Copy letter text'}
  </button>
</article>

<style>
  .letter {
    position: relative;
    background: linear-gradient(180deg, #f4efe1 0%, #e9e4d8 100%);
    color: var(--color-paper-ink);
    padding: clamp(2rem, 5vw, 4rem) clamp(2rem, 6vw, 4.5rem);
    box-shadow:
      0 30px 80px rgba(0, 0, 0, 0.6),
      0 0 0 1px rgba(58, 58, 66, 0.18);
    user-select: text;
    overflow: hidden;
  }

  .letter::before {
    content: '';
    position: absolute;
    inset: 14px;
    border: 1px solid rgba(58, 58, 66, 0.2);
    pointer-events: none;
  }

  .letter-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(58, 58, 66, 0.25);
    padding-bottom: 1.4rem;
    margin-bottom: 1.4rem;
  }

  .letter-from {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.7rem;
    line-height: 1;
  }

  .letter-from-sub {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(20, 20, 26, 0.6);
    margin-top: 0.35rem;
  }

  .letter-meta {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(20, 20, 26, 0.6);
    text-align: right;
    line-height: 1.5;
  }

  .letter-claim {
    font-family: var(--font-letter);
    font-style: italic;
    font-size: clamp(1.1rem, 2vw, 1.4rem);
    color: rgba(20, 20, 26, 0.78);
    border-left: 3px solid rgba(210, 58, 42, 0.55);
    padding-left: 1rem;
    margin-bottom: 2rem;
    line-height: 1.5;
  }

  .letter-body p {
    font-family: var(--font-letter);
    font-size: clamp(1rem, 1.6vw, 1.18rem);
    line-height: 1.78;
    margin-bottom: 1.2rem;
    text-wrap: pretty;
    opacity: 0;
    animation: paperFade 600ms cubic-bezier(0.2, 0, 0, 1) forwards;
  }

  @keyframes paperFade {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .letter-sign {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 2.4rem;
    padding-top: 1.6rem;
    border-top: 1px solid rgba(58, 58, 66, 0.22);
  }

  .letter-closing {
    font-family: var(--font-letter);
    font-style: italic;
    font-size: 1.05rem;
  }

  .letter-signature {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 2rem;
    line-height: 1;
    margin-top: 0.4rem;
  }

  .letter-role {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(20, 20, 26, 0.6);
    margin-top: 0.5rem;
  }

  .wax-seal {
    width: 92px;
    height: 92px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #e85946, #8a1f14 70%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff5ed;
    box-shadow:
      0 4px 12px rgba(58, 12, 6, 0.4),
      inset 0 -4px 10px rgba(58, 12, 6, 0.4);
    transform: rotate(-6deg);
    flex-shrink: 0;
  }

  .wax-seal[data-verdict='pardon'] {
    background: radial-gradient(circle at 30% 30%, #d6d0c0, #6b6457 70%);
    color: #1a1a1e;
  }

  .wax-word {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.95rem;
    line-height: 1;
  }

  .wax-year {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-top: 0.25rem;
    opacity: 0.85;
  }

  .letter-closing-line {
    font-family: var(--font-letter);
    font-style: italic;
    font-size: 1rem;
    color: rgba(20, 20, 26, 0.7);
    margin-top: 1.6rem;
    text-align: right;
  }

  .letter-copy {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    background: transparent;
    border: 1px solid rgba(20, 20, 26, 0.3);
    color: rgba(20, 20, 26, 0.6);
    padding: 0.4rem 0.7rem;
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .letter-copy:hover {
    background: rgba(20, 20, 26, 0.08);
    border-color: rgba(20, 20, 26, 0.55);
    color: rgba(20, 20, 26, 0.9);
  }

  @media print {
    .letter-copy,
    .wax-seal {
      display: none;
    }

    .letter {
      box-shadow: none;
      background: white;
    }
  }
</style>
