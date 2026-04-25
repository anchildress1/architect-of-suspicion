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
</div>

<style>
  .resume {
    user-select: text;
    color: var(--color-paper-ink);
  }

  .resume-name {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.6rem;
    color: var(--color-paper-ink);
    line-height: 1;
  }

  .resume-role {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(20, 20, 26, 0.6);
    margin-top: 0.35rem;
  }

  .resume-divider {
    border: none;
    border-top: 1px solid rgba(20, 20, 26, 0.15);
    margin: 1.25rem 0;
  }

  .resume-section {
    margin-bottom: 1.4rem;
  }

  /* Section labels in italic Instrument Serif with a brass underline.
     Reads like an exhibit appendix, not a SaaS sidebar. */
  .resume-section-title {
    display: inline-block;
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 400;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: none;
    color: var(--color-paper-ink);
    margin-bottom: 0.65rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid rgba(196, 162, 78, 0.55);
  }

  .resume-entry {
    margin-bottom: 1rem;
  }

  .resume-entry-title {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-paper-ink);
  }

  .resume-entry-meta {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.12em;
    color: rgba(20, 20, 26, 0.55);
    margin-top: 0.15rem;
  }

  .resume-list {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: rgba(20, 20, 26, 0.78);
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

  /* Ink-on-bone tags with a hairline border — exhibit labels, not chips. */
  .resume-skill {
    font-family: var(--font-readout);
    font-size: 0.55rem;
    letter-spacing: 0.05em;
    color: var(--color-paper-ink);
    background: transparent;
    padding: 0.25rem 0.55rem;
    border: 1px solid rgba(20, 20, 26, 0.25);
  }
</style>
