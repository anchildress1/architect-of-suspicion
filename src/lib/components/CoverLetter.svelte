<script lang="ts">
  import type { Verdict } from '$lib/types';
  import { tokenizeReaction } from '$lib/reactionFormat';

  interface Props {
    letter: string;
    claim: string;
    verdict: Verdict;
    closing?: string;
  }

  let { letter, claim, verdict, closing = '' }: Props = $props();

  let copied = $state(false);

  /**
   * Strip allowlisted emphasis tags from HTML for clipboard copy. The model
   * emits <em>/<strong> for visual emphasis; copying to clipboard should
   * land plain text in the resume document.
   */
  function letterAsPlainText(html: string): string {
    return html.replace(/<\/?(?:em|strong)>/g, '');
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(letterAsPlainText(letter));
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
      Recorded &middot; {new Date().toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })}<br />
      Record &numero;&nbsp;0426<br />
      Architect of Suspicion
    </div>
  </header>

  <blockquote class="letter-claim">&ldquo;{claim}&rdquo;</blockquote>

  <div class="letter-body">
    {#each paragraphs as paragraph, i (i)}
      <!-- Tokenize allowlisted <em>/<strong> the model emits; everything
           else (markdown, disallowed tags, attributes) renders as literal
           text via Svelte's default escaping. No {@html} = no XSS surface. -->
      <p style="animation-delay: {0.18 + i * 0.12}s">
        {#each tokenizeReaction(paragraph) as segment, j (j)}
          {#if segment.type === 'em'}<em>{segment.value}</em>
          {:else if segment.type === 'strong'}<strong>{segment.value}</strong>
          {:else}{segment.value}{/if}
        {/each}
      </p>
    {/each}
  </div>

  <footer class="letter-sign">
    <div>
      <p class="letter-signature">The Architect</p>
      <p class="letter-role">Architect of Suspicion &middot; Record &numero;&nbsp;0426</p>
    </div>
    <div class="verdict-stamp" data-verdict={verdict}>
      <span class="verdict-stamp-word">{stampWord}</span>
      <span class="verdict-stamp-year">2026</span>
    </div>
  </footer>

  {#if closing}
    <p class="letter-closing-line">&mdash; {closing}</p>
  {/if}

  <button class="letter-copy" type="button" onclick={copyToClipboard} aria-live="polite">
    {copied ? 'Copied to clipboard' : 'Copy verdict text'}
  </button>
</article>

<style>
  /* Industrial verdict record — dark instrument-panel surface, the same
     ink + bone palette as the foyer and chamber rails. No bone paper,
     no wax seal, no italic letter face. */
  .letter {
    position: relative;
    background: linear-gradient(180deg, #161922 0%, #0e1118 100%);
    color: var(--color-bone);
    padding: clamp(2rem, 5vw, 4rem) clamp(2rem, 6vw, 4.5rem);
    border: 1px solid rgba(233, 228, 216, 0.18);
    box-shadow:
      0 30px 80px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(233, 228, 216, 0.04);
    user-select: text;
    overflow: hidden;
  }

  .letter::before {
    content: '';
    position: absolute;
    inset: 14px;
    border: 1px solid rgba(233, 228, 216, 0.08);
    pointer-events: none;
  }

  .letter-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(233, 228, 216, 0.12);
    padding-bottom: 1.4rem;
    margin-bottom: 1.4rem;
  }

  .letter-from {
    font-family: var(--font-display);
    font-size: 1.7rem;
    line-height: 1;
    color: var(--color-bone);
  }

  .letter-from-sub {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.35rem;
  }

  .letter-meta {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-align: right;
    line-height: 1.5;
  }

  .letter-claim {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(1.1rem, 2vw, 1.4rem);
    color: var(--color-paper);
    border-left: 2px solid var(--color-ember);
    padding-left: 1rem;
    margin-bottom: 2rem;
    line-height: 1.5;
  }

  .letter-body p {
    font-family: var(--font-body);
    font-size: clamp(0.95rem, 1.4vw, 1.05rem);
    line-height: 1.7;
    margin-bottom: 1.2rem;
    text-wrap: pretty;
    opacity: 0;
    animation: briefFade 600ms cubic-bezier(0.2, 0, 0, 1) forwards;
  }

  @keyframes briefFade {
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
    border-top: 1px solid rgba(233, 228, 216, 0.12);
  }

  .letter-signature {
    font-family: var(--font-display);
    font-size: 1.7rem;
    line-height: 1;
    color: var(--color-bone);
  }

  .letter-role {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.5rem;
  }

  /* Verdict stamp — square, bordered, mono. Matches the verdict page's
     sealed-stamp aesthetic. No wax, no rotation, no radial gradient. */
  .verdict-stamp {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.65rem 1.1rem;
    border: 2px solid var(--color-ember);
    color: var(--color-ember);
    background: rgba(11, 11, 13, 0.55);
  }

  .verdict-stamp[data-verdict='pardon'] {
    border-color: var(--color-bone);
    color: var(--color-bone);
  }

  .verdict-stamp-word {
    font-family: var(--font-display);
    font-size: 1.05rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1;
  }

  .verdict-stamp-year {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .letter-closing-line {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--color-paper-dim);
    margin-top: 1.6rem;
    text-align: right;
  }

  .letter-copy {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    background: transparent;
    border: 1px solid rgba(233, 228, 216, 0.3);
    color: var(--color-brass-dim);
    padding: 0.4rem 0.7rem;
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .letter-copy:hover {
    background: rgba(233, 228, 216, 0.06);
    border-color: var(--color-bone);
    color: var(--color-bone);
  }

  @media print {
    .letter-copy {
      display: none;
    }

    .letter {
      box-shadow: none;
      background: white;
      color: #14141a;
      border-color: #14141a;
    }

    .letter-from,
    .letter-signature,
    .letter-claim {
      color: #14141a;
    }

    .letter-from-sub,
    .letter-meta,
    .letter-role,
    .letter-closing-line {
      color: #4a4a52;
    }
  }
</style>
