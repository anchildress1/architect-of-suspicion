<div class="resume">
  <h2 class="resume-name">Ashley Childress</h2>
  <p class="resume-role">Software Engineer</p>

  <hr class="resume-divider" />

  <section class="resume-section">
    <h3 class="resume-section-title">Experience</h3>
    <div class="resume-entry">
      <p class="resume-entry-title">Senior Software Engineer</p>
      <p class="resume-entry-meta">Placeholder Company &middot; 2022 &ndash; Present</p>
      <ul class="resume-list">
        <li>Led architecture and delivery of full-stack applications</li>
        <li>Designed cloud infrastructure and CI/CD pipelines</li>
        <li>Integrated AI capabilities into production workflows</li>
      </ul>
    </div>
    <div class="resume-entry">
      <p class="resume-entry-title">Software Engineer</p>
      <p class="resume-entry-meta">Placeholder Company &middot; 2019 &ndash; 2022</p>
      <ul class="resume-list">
        <li>Built and maintained web applications and APIs</li>
        <li>Collaborated across teams to ship user-facing features</li>
        <li>Contributed to open-source tooling and developer experience</li>
      </ul>
    </div>
  </section>

  <section class="resume-section">
    <h3 class="resume-section-title">Skills</h3>
    <div class="resume-skills">
      {#each ['Full-Stack Development', 'Cloud Infrastructure', 'AI Integration', 'TypeScript', 'Python', 'SvelteKit', 'React', 'Node.js', 'AWS', 'Supabase'] as skill (skill)}
        <span class="resume-skill">{skill}</span>
      {/each}
    </div>
  </section>

  <section class="resume-section">
    <h3 class="resume-section-title">Education</h3>
    <p class="resume-entry-title">Bachelor of Science</p>
    <p class="resume-entry-meta">Placeholder University</p>
  </section>

  <p class="resume-disclaimer">
    Placeholder content. Actual resume details require Ashley&rsquo;s approval.
  </p>
</div>

<style>
  .resume {
    user-select: text;
    color: var(--color-paper);
  }

  .resume-name {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.6rem;
    color: var(--color-bone);
    line-height: 1;
  }

  .resume-role {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-top: 0.35rem;
  }

  .resume-divider {
    border: none;
    border-top: 1px solid rgba(233, 228, 216, 0.18);
    margin: 1.25rem 0;
  }

  .resume-section {
    margin-bottom: 1.4rem;
  }

  .resume-section-title {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-bone);
    margin-bottom: 0.65rem;
  }

  .resume-entry {
    margin-bottom: 1rem;
  }

  .resume-entry-title {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-bone);
  }

  .resume-entry-meta {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.12em;
    color: var(--color-brass-dim);
    margin-top: 0.15rem;
  }

  .resume-list {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--color-paper-dim);
    line-height: 1.7;
    margin-top: 0.4rem;
    padding-left: 1.1rem;
    list-style: square;
  }

  .resume-skills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .resume-skill {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    color: var(--color-paper);
    background: rgba(58, 58, 66, 0.5);
    padding: 0.25rem 0.55rem;
    border: 1px solid rgba(233, 228, 216, 0.16);
  }

  .resume-disclaimer {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 0.78rem;
    color: var(--color-brass-dim);
    text-align: center;
    margin-top: 1.4rem;
  }
</style>
