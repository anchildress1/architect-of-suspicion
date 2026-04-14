<svelte:head>
  <title>The Attic | Architect of Suspicion</title>
</svelte:head>

<main
  class="relative min-h-screen"
  style="background: url('/backgrounds/attic.webp') center/cover no-repeat fixed"
>
  <!-- Dark overlay -->
  <div class="bg-void/70 absolute inset-0"></div>

  <!-- Content -->
  <div class="relative z-10 mx-auto max-w-2xl px-6 py-12">
    <a
      href="/mansion"
      class="font-readout text-brass-dim hover:text-brass mb-8 inline-block text-xs uppercase tracking-wider transition-colors"
    >
      &larr; Back to Mansion
    </a>

    <h1 class="font-display text-brass mb-12 text-3xl">The Attic</h1>

    <!-- How to Play -->
    <section class="mb-12">
      <h2 class="font-display text-parchment border-b-brass/20 mb-4 border-b pb-2 text-xl">
        How to Play
      </h2>
      <div class="font-body text-parchment-dim space-y-3 text-sm leading-relaxed">
        <p>
          A claim has been filed against Ashley Childress. Your task is to investigate the mansion,
          gather evidence, and render a verdict.
        </p>
        <p>
          Explore the rooms of the mansion. Each room contains cards representing different facets of
          Ashley's work and character. Examine each card and classify it as
          <strong class="text-brass">Proof</strong> (supporting the claim) or
          <strong class="text-copper">Objection</strong> (refuting the claim).
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
    <section class="mb-12">
      <h2 class="font-display text-parchment border-b-brass/20 mb-4 border-b pb-2 text-xl">
        About
      </h2>
      <div class="font-body text-parchment-dim space-y-3 text-sm leading-relaxed">
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
    <section class="mb-12">
      <h2 class="font-display text-parchment border-b-brass/20 mb-4 border-b pb-2 text-xl">
        Credits
      </h2>
      <div class="font-body text-parchment-dim space-y-2 text-sm leading-relaxed">
        <p><span class="text-brass">Design &amp; Development:</span> Ashley Childress</p>
        <p><span class="text-brass">AI Assistant:</span> Claude by Anthropic</p>
        <p>
          <span class="text-brass">Fonts:</span> Cinzel, Rajdhani, IBM Plex Mono, Share Tech Mono
        </p>
      </div>
    </section>
  </div>
</main>
