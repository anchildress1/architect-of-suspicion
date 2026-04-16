<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<svelte:head>
  <title>The Attic | Architect of Suspicion</title>
</svelte:head>

<main
  class="attic-view"
  style="background: url('/backgrounds/attic.webp') center/cover no-repeat fixed"
>
  <!-- Dark overlay -->
  <div class="attic-overlay"></div>

  <!-- Content -->
  <div class="attic-content">
    <a href={resolve('/mansion')} class="attic-back" aria-label="Return to mansion">
      &larr; Back to Mansion
    </a>

    <h1 class="attic-title">The Attic</h1>

    <!-- How to Play -->
    <section class="attic-section">
      <h2 class="attic-section-title">How to Play</h2>
      <div class="attic-body">
        <p>
          A claim has been filed against Ashley Childress. Your task is to investigate the mansion,
          gather evidence, and render a verdict.
        </p>
        <p>
          Explore the rooms of the mansion. Each room contains cards representing different facets of
          Ashley's work and character. Examine each card and classify it as
          <strong class="text-brass">Proof</strong> (supporting the claim) or
          <strong class="text-forge-orange">Objection</strong> (refuting the claim).
        </p>
        <p>
          When you have gathered enough evidence, return to the mansion view and choose to
          <strong class="text-parchment">Accuse</strong> or
          <strong class="text-parchment">Pardon</strong> the subject.
        </p>
        <p>
          The Architect watches from the left panel, tracking your progress and offering commentary
          on your investigation.
        </p>
      </div>
    </section>

    <!-- About -->
    <section class="attic-section">
      <h2 class="attic-section-title">About</h2>
      <div class="attic-body">
        <p>
          Architect of Suspicion is an interactive investigative experience built as a portfolio
          piece. It explores themes of perception, judgment, and the stories we construct about
          others from limited evidence.
        </p>
        <p>
          The game is designed and developed by Ashley Childress as an experiment in narrative-driven
          web experiences.
        </p>
      </div>
    </section>

    <!-- Credits -->
    <section class="attic-section">
      <h2 class="attic-section-title">Credits</h2>
      <div class="attic-body">
        <p><span class="text-brass">Design &amp; Development:</span> Ashley Childress</p>
        <p><span class="text-brass">AI Assistant:</span> Claude by Anthropic</p>
        <p>
          <span class="text-brass">Fonts:</span> Cinzel, Rajdhani, IBM Plex Mono, Share Tech Mono
        </p>
      </div>
    </section>
  </div>
</main>

<style>
  .attic-view {
    position: relative;
    min-height: 100vh;
  }

  .attic-overlay {
    position: absolute;
    inset: 0;
    background: rgba(8, 9, 12, 0.7);
  }

  .attic-content {
    position: relative;
    z-index: 1;
    max-width: 40rem;
    margin: 0 auto;
    padding: 3rem 1.5rem;
  }

  .attic-back {
    font-family: var(--font-readout);
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-brass);
    text-decoration: none;
    display: inline-block;
    margin-bottom: 2rem;
    transition: color 0.3s;
  }

  .attic-back:hover {
    color: var(--color-brass-glow);
  }

  .attic-title {
    font-family: var(--font-display);
    font-size: 2rem;
    color: var(--color-brass);
    margin-bottom: 3rem;
  }

  .attic-section {
    margin-bottom: 3rem;
  }

  .attic-section-title {
    font-family: var(--font-display);
    font-size: 1.2rem;
    color: var(--color-parchment);
    border-bottom: 1px solid rgba(196, 162, 78, 0.2);
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }

  .attic-body {
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-parchment-dim);
    line-height: 1.7;
  }

  .attic-body p {
    margin-bottom: 0.75rem;
  }

  .attic-body p:last-child {
    margin-bottom: 0;
  }
</style>
