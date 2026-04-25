<script lang="ts">
</script>

<svelte:head>
  <title>The Attic | Architect of Suspicion</title>
</svelte:head>

<main class="attic noise" aria-label="The Attic">
  <div
    class="attic-bg"
    style="background-image: url('/backgrounds/attic.webp')"
    aria-hidden="true"
  ></div>
  <div class="attic-overlay" aria-hidden="true"></div>

  <div class="attic-content reveal">
    <a href="/mansion" class="attic-back">&larr; Back to the Mansion</a>

    <header class="attic-head">
      <p class="attic-eyebrow">Chamber I &middot; Meta</p>
      <h1 class="attic-title">The Attic</h1>
    </header>

    <section class="attic-section">
      <h2 class="attic-section-title">How to play</h2>
      <p>
        A claim has been filed against Ashley Childress. The mansion holds nine chambers, each
        containing witnesses &mdash; pieces of evidence drawn from real career decisions. You will
        examine each in turn and rule it as <strong>Proof</strong> (it supports the claim),
        <strong>Objection</strong> (it counters the claim), or
        <strong>Struck from the record</strong>
        (you decline to rule).
      </p>
      <p>
        The Architect, on the left rail, watches your trajectory. Their attention drifts and
        sharpens with the case &mdash; they will not say which calls were right.
      </p>
      <p>
        When the gallery has heard enough, render your verdict. The Architect will compose a sealed
        letter from the ruled evidence.
      </p>
    </section>

    <section class="attic-section">
      <h2 class="attic-section-title">About</h2>
      <p>
        Architect of Suspicion is an interactive investigative experience built as a portfolio
        piece. It explores perception, judgment, and the stories we construct about others from
        limited evidence.
      </p>
      <p>
        Designed and developed by Ashley Childress as an experiment in narrative-driven web
        experiences.
      </p>
    </section>

    <section class="attic-section">
      <h2 class="attic-section-title">Credits</h2>
      <p><span class="credit-label">Design &amp; development:</span> Ashley Childress</p>
      <p><span class="credit-label">AI collaborator:</span> Claude by Anthropic</p>
      <p>
        <span class="credit-label">Type:</span> Instrument Serif &middot; Geist &middot; JetBrains Mono
      </p>
    </section>
  </div>
</main>

<style>
  .attic {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
  }

  .attic-bg {
    position: fixed;
    inset: 0;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    z-index: 0;
  }

  .attic-overlay {
    position: fixed;
    inset: 0;
    background: linear-gradient(180deg, rgba(11, 11, 13, 0.6) 0%, rgba(11, 11, 13, 0.92) 100%);
    z-index: 1;
  }

  .attic-content {
    position: relative;
    z-index: 5;
    max-width: 42rem;
    margin: 0 auto;
    padding: 3rem 1.5rem 4rem;
  }

  .attic-back {
    display: inline-block;
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    text-decoration: none;
    transition: color 0.3s;
    margin-bottom: 2rem;
  }

  .attic-back:hover {
    color: var(--color-bone);
  }

  .attic-head {
    margin-bottom: 2.5rem;
    padding-bottom: 1.4rem;
    border-bottom: 1px solid rgba(233, 228, 216, 0.16);
  }

  .attic-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
  }

  .attic-title {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 2.6rem;
    color: var(--color-bone);
    line-height: 1;
    margin-top: 0.4rem;
  }

  .attic-section {
    margin-bottom: 2.4rem;
  }

  .attic-section-title {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--color-bone);
    margin-bottom: 1rem;
  }

  .attic-section p {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--color-paper-dim);
    line-height: 1.75;
    margin-bottom: 0.85rem;
  }

  .attic-section p:last-child {
    margin-bottom: 0;
  }

  .attic-section strong {
    color: var(--color-bone);
    font-weight: 600;
  }

  .credit-label {
    color: var(--color-bone);
    font-weight: 500;
  }
</style>
