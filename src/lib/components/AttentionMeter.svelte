<script lang="ts">
  import { untrack } from 'svelte';
  import { moodFor, ATTENTION_MIN, ATTENTION_MAX } from '$lib/attention';

  interface Props {
    /** Current needle position in [0, 100]. */
    value: number;
  }

  let { value }: Props = $props();

  // Half-circle gauge from -90° (left/Drifting) to +90° (right/Riveted).
  const angle = $derived(-90 + ((value - ATTENTION_MIN) / (ATTENTION_MAX - ATTENTION_MIN)) * 180);
  const mood = $derived(moodFor(value));

  // Per-pick delta callout: mono pill that fades in on attention change.
  // We capture the initial value intentionally so the first frame doesn't
  // flash a delta of `value - undefined`.
  let previous = $state(untrack(() => value));
  let delta = $state<number | null>(null);
  let deltaSeq = $state(0);

  $effect(() => {
    // Track only `value`. Reading `previous` directly would also subscribe to
    // it, and since the effect updates `previous` it would re-run, clearing
    // its own pending `setTimeout` before the fade-out could fire. `untrack`
    // keeps the read but skips the dependency.
    const v = value;
    const prev = untrack(() => previous);
    if (v === prev) return;
    delta = v - prev;
    previous = v;
    deltaSeq += 1;
    const t = setTimeout(() => {
      delta = null;
    }, 1850);
    return () => clearTimeout(t);
  });
</script>

<div class="meter">
  <p class="meter-mood-line" aria-hidden="true">
    <span class="meter-mood-name">{mood}</span>
    <span class="meter-mood-sep">·</span>
    <span class="meter-mood-value">{value}<small>/100</small></span>
  </p>

  <span class="meter-sr" aria-live="polite" aria-atomic="true">
    The Architect's attention: {mood}, {value} of 100.
  </span>

  <svg viewBox="0 0 260 150" aria-hidden="true">
    <defs>
      <linearGradient id="meter-arc" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#6b8fb0" />
        <stop offset="50%" stop-color="#c9c4b4" />
        <stop offset="100%" stop-color="#d23a2a" />
      </linearGradient>
      <radialGradient id="meter-hub" cx="0.35" cy="0.3">
        <stop offset="0%" stop-color="#e9e4d8" />
        <stop offset="100%" stop-color="#1a1a1e" />
      </radialGradient>
    </defs>

    <!-- Outer ring -->
    <path
      d="M 20 130 A 110 110 0 0 1 240 130"
      fill="none"
      stroke="rgba(233,228,216,0.15)"
      stroke-width="1"
    />
    <path
      d="M 30 130 A 100 100 0 0 1 230 130"
      fill="none"
      stroke="url(#meter-arc)"
      stroke-width="6"
      opacity="0.7"
    />

    <!-- Tick marks -->
    {#each Array.from({ length: 21 }, (_, idx) => idx) as i (i)}
      {@const t = i / 20}
      {@const a = Math.PI + Math.PI * t}
      {@const r1 = 102}
      {@const r2 = i % 5 === 0 ? 86 : 94}
      {@const x1 = 130 + Math.cos(a) * r1}
      {@const y1 = 130 + Math.sin(a) * r1}
      {@const x2 = 130 + Math.cos(a) * r2}
      {@const y2 = 130 + Math.sin(a) * r2}
      <line
        {x1}
        {y1}
        {x2}
        {y2}
        stroke="rgba(233,228,216,0.55)"
        stroke-width={i % 5 === 0 ? 1.2 : 0.6}
      />
    {/each}

    <!-- Mood labels — geographic on the arc. -->
    <text x="24" y="146" class="meter-arc-label" text-anchor="start">COOL</text>
    <text x="130" y="36" class="meter-arc-label" text-anchor="middle">ENGAGED</text>
    <text x="236" y="146" class="meter-arc-label" text-anchor="end">FURY</text>

    <!-- Needle: polygon points sit at absolute viewBox coords. CSS rotates
         the group around the hub center (130, 130). Combining translate
         and rotate in the SVG attribute caused matrix interpolation to
         translate the pivot during transitions. -->
    <g class="needle-g" style="transform: rotate({angle}deg);">
      <polygon points="130,30 125,134 135,134" fill="#d23a2a" stroke="#5a0e07" stroke-width="0.6" />
      <polygon points="130,30 128,90 130,82 132,90" fill="#ffd2cc" opacity="0.7" />
    </g>

    <!-- Hub -->
    <circle cx="130" cy="130" r="10" fill="url(#meter-hub)" stroke="#3e3c34" stroke-width="1.2" />
    <circle cx="130" cy="130" r="3" fill="#0b0b0d" />
  </svg>

  {#if delta !== null}
    {#key deltaSeq}
      <span
        class="meter-delta"
        class:delta-up={delta > 0}
        class:delta-down={delta < 0}
        class:delta-flat={delta === 0}
        aria-hidden="true"
      >
        {delta > 0 ? `+${delta}` : delta}
      </span>
    {/key}
  {/if}
</div>

<style>
  .meter {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 1rem 1rem 0.75rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.08);
  }

  .meter svg {
    width: 100%;
    height: auto;
  }

  /* SR-only live region: keeps mood + value in parity with sighted users.
     Visual readout above is aria-hidden because the gauge SVG carries it,
     and the SVG itself is decorative. */
  .meter-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .needle-g {
    transition: transform 800ms cubic-bezier(0.2, 0.8, 0.2, 1);
    transform-origin: 130px 130px;
    transform-box: view-box;
  }

  .meter-arc-label {
    font-family: var(--font-readout, monospace);
    font-size: 9px;
    letter-spacing: 0.22em;
    fill: var(--color-bone-dim);
  }

  /* Mood + value above the gauge, mono and quiet. */
  .meter-mood-line {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.35rem;
    margin-bottom: 0.35rem;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-bone);
  }

  .meter-mood-sep {
    color: var(--color-brass);
  }

  .meter-mood-value small {
    font-size: 0.78em;
    color: var(--color-brass);
    margin-left: 0.05em;
  }

  .meter-delta {
    position: absolute;
    bottom: 0.4rem;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    padding: 2px 8px;
    border: 1px solid currentColor;
    background: rgba(11, 11, 13, 0.8);
    pointer-events: none;
    animation: deltaPop 1850ms ease forwards;
  }

  .delta-up {
    color: var(--color-ember);
  }

  .delta-down {
    color: var(--color-cyan-ink);
  }

  .delta-flat {
    color: var(--color-brass-dim);
  }

  @keyframes deltaPop {
    0% {
      opacity: 0;
      transform: translate(-50%, 6px);
    }
    20% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .needle-g {
      transition: none;
    }
    .meter-delta {
      animation: none;
      opacity: 1;
    }
  }
</style>
