<script lang="ts">
  import type { Verdict } from '$lib/types';

  let {
    letter,
    claim,
    verdict,
  }: {
    letter: string;
    claim: string;
    verdict: Verdict;
  } = $props();

  let copied = $state(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(letter);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access denied — ignore silently
    }
  }

  const verdictLabel = $derived(verdict === 'accuse' ? 'Accusation' : 'Pardon');
  const paragraphs = $derived(
    letter
      .split('\n\n')
      .map((p) => p.trim())
      .filter(Boolean),
  );
</script>

<div class="cover-letter">
  <div class="cover-letter-header">
    <div>
      <h2 class="cover-letter-title">The Record</h2>
      <p class="cover-letter-verdict">Verdict: {verdictLabel}</p>
    </div>
    <button
      onclick={copyToClipboard}
      class="cover-letter-copy"
      aria-label={copied ? 'Copied to clipboard' : 'Copy cover letter to clipboard'}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  </div>

  <blockquote class="cover-letter-claim">
    <p>&ldquo;{claim}&rdquo;</p>
  </blockquote>

  <div class="cover-letter-body">
    {#each paragraphs as paragraph, i (i)}
      <p style="animation-delay: {0.2 + i * 0.15}s">{paragraph}</p>
    {/each}
  </div>
</div>

<style>
  .cover-letter {
    position: relative;
    border: 1px solid rgba(196, 162, 78, 0.2);
    background: linear-gradient(180deg, rgba(20, 24, 34, 0.5), rgba(12, 14, 20, 0.5));
    padding: 1rem;
  }

  .cover-letter::before {
    content: '';
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 1rem;
    height: 1rem;
    border: 1px solid rgba(196, 162, 78, 0.25);
    opacity: 0.6;
  }

  .cover-letter-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.2rem;
  }

  .cover-letter-title {
    font-family: var(--font-display);
    font-size: 1rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-glow);
  }

  .cover-letter-verdict {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-parchment-dim);
    margin-top: 0.25rem;
  }

  .cover-letter-copy {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    border: 1px solid rgba(196, 162, 78, 0.2);
    background: transparent;
    padding: 0.4rem 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .cover-letter-copy:hover {
    border-color: rgba(196, 162, 78, 0.4);
    color: var(--color-brass);
  }

  .cover-letter-claim {
    border-left: 2px solid rgba(196, 162, 78, 0.3);
    padding-left: 1rem;
    margin-bottom: 1.5rem;
  }

  .cover-letter-claim p {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-style: italic;
    color: var(--color-parchment-dim);
    line-height: 1.6;
  }

  .cover-letter-body {
    user-select: text;
  }

  .cover-letter-body p {
    font-family: var(--font-body);
    font-size: 0.88rem;
    color: var(--color-parchment);
    line-height: 1.72;
    margin-bottom: 1rem;
    opacity: 0;
    animation: letterFadeIn 0.6s ease-out forwards;
  }

  .cover-letter-body p:last-child {
    margin-bottom: 0;
  }

  @keyframes letterFadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
