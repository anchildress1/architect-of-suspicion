<script lang="ts">
  import { moodFor, ATTENTION_MIN, ATTENTION_MAX } from '$lib/attention';

  interface Props {
    /** Current needle position in [0, 100]. */
    value: number;
  }

  let { value }: Props = $props();

  // Half-circle gauge from -90° (left/Drifting) to +90° (right/Riveted).
  // Smooth easing applied via CSS transition; per-pick deltas stay illegible.
  const angle = $derived(
    -90 + ((value - ATTENTION_MIN) / (ATTENTION_MAX - ATTENTION_MIN)) * 180,
  );
  const mood = $derived(moodFor(value));
</script>

<div class="meter" role="img" aria-label="The Architect's attention: {mood}">
  <svg viewBox="0 0 260 150" aria-hidden="true">
    <defs>
      <linearGradient id="meter-arc" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#3a3a42" />
        <stop offset="50%" stop-color="#a5a090" />
        <stop offset="100%" stop-color="#e9e4d8" />
      </linearGradient>
      <radialGradient id="meter-hub" cx="0.35" cy="0.3">
        <stop offset="0%" stop-color="#e9e4d8" />
        <stop offset="100%" stop-color="#1a1a1e" />
      </radialGradient>
    </defs>

    <!-- Outer ring -->
    <path d="M 20 130 A 110 110 0 0 1 240 130" fill="none" stroke="rgba(233,228,216,0.15)" stroke-width="1" />
    <path d="M 30 130 A 100 100 0 0 1 230 130" fill="none" stroke="url(#meter-arc)" stroke-width="6" opacity="0.5" />

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
      <line {x1} {y1} {x2} {y2} stroke="rgba(233,228,216,0.42)" stroke-width={i % 5 === 0 ? 1.2 : 0.6} />
    {/each}

    <!-- Needle -->
    <g transform="translate(130,130) rotate({angle})" class="needle-g">
      <polygon points="0,-96 -3,6 3,6" fill="#d23a2a" stroke="#5a0e07" stroke-width="0.6" />
      <polygon points="0,-96 -1.5,-50 0,-58 1.5,-50" fill="#ffd2cc" opacity="0.55" />
    </g>

    <!-- Hub -->
    <circle cx="130" cy="130" r="10" fill="url(#meter-hub)" stroke="#3e3c34" stroke-width="1.2" />
    <circle cx="130" cy="130" r="3" fill="#0b0b0d" />
  </svg>

  <div class="meter-track" aria-hidden="true">
    {#each ['Drifting', 'Watching', 'Interested', 'Riveted'] as label (label)}
      <span class="meter-tick" class:meter-tick-active={mood === label}>{label}</span>
    {/each}
  </div>

  <div class="meter-caption">
    <span class="meter-eyebrow">The Architect</span>
    <span class="meter-mood">{mood}</span>
  </div>
</div>

<style>
  .meter {
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

  .needle-g {
    transition: transform 800ms cubic-bezier(0.2, 0.8, 0.2, 1);
    transform-origin: 130px 130px;
    transform-box: view-box;
  }

  .meter-track {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
    margin-top: 0.5rem;
  }

  .meter-tick {
    font-family: var(--font-readout);
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-align: center;
    transition: color 600ms ease;
  }

  .meter-tick:nth-child(1) {
    text-align: left;
  }
  .meter-tick:last-child {
    text-align: right;
  }

  .meter-tick-active {
    color: var(--color-bone);
  }

  .meter-caption {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 0.6rem;
  }

  .meter-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .meter-mood {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.05rem;
    color: var(--color-bone);
    transition: color 600ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .needle-g {
      transition: none;
    }
  }
</style>
