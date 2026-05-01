<script lang="ts">
  import { moodFor, ATTENTION_MIN, ATTENTION_MAX } from '$lib/attention';

  interface Props {
    /** Current needle position in [0, 100]. */
    value: number;
  }

  let { value }: Props = $props();

  // Half-circle gauge from -90° (left/Exonerating) to +90° (right/Damning).
  const angle = $derived(-90 + ((value - ATTENTION_MIN) / (ATTENTION_MAX - ATTENTION_MIN)) * 180);
  const mood = $derived(moodFor(value));
</script>

<div class="meter">
  <p class="meter-eyebrow" aria-hidden="true">Inclination</p>

  <span class="meter-sr" aria-live="polite" aria-atomic="true">
    The Architect's inclination: {mood}.
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

  .meter-eyebrow {
    font-family: var(--font-readout);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-align: center;
    margin-bottom: 0.35rem;
  }

  .meter svg {
    width: 100%;
    height: auto;
  }

  /* SR-only live region: keeps mood + value available to assistive tech.
     The gauge SVG itself is aria-hidden — decorative. */
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

  @media (prefers-reduced-motion: reduce) {
    .needle-g {
      transition: none;
    }
  }
</style>
