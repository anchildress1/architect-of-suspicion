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
</script>

<div class="flex flex-col">
  <div class="mb-6 flex items-start justify-between">
    <div>
      <h2 class="font-display text-brass text-lg tracking-widest uppercase">
        The Record
      </h2>
      <p class="font-readout text-parchment-dim mt-1 text-xs uppercase tracking-wider">
        Verdict: {verdictLabel}
      </p>
    </div>
    <button
      onclick={copyToClipboard}
      class="font-readout border-brass/20 text-brass-dim hover:border-brass/40 hover:text-brass shrink-0 rounded border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  </div>

  <blockquote class="border-l-brass/30 mb-6 border-l-2 pl-4">
    <p class="font-display text-parchment-dim text-sm italic leading-relaxed">
      &ldquo;{claim}&rdquo;
    </p>
  </blockquote>

  <div class="font-body text-parchment space-y-4 text-sm leading-relaxed select-text">
    {#each letter.split('\n\n') as paragraph, i (i)}
      {#if paragraph.trim()}
        <p>{paragraph.trim()}</p>
      {/if}
    {/each}
  </div>
</div>
