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
    border: 1px solid rgba(145, 141, 134, 0.22);
    background: rgba(10, 12, 18, 0.38);
    padding: 1rem;
    user-select: text;
  }

  .resume-name {
    font-family: var(--font-body);
    font-size: 1.5rem;
    color: #e5e7eb;
    letter-spacing: 0.01em;
    font-weight: 700;
  }

  .resume-role {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-top: 0.25rem;
  }

  .resume-divider {
    border: none;
    border-top: 1px solid rgba(196, 162, 78, 0.2);
    margin: 1.25rem 0;
  }

  .resume-section {
    margin-bottom: 1.25rem;
  }

  .resume-section-title {
    font-family: var(--font-readout);
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #d1d5db;
    margin-bottom: 0.75rem;
  }

  .resume-entry {
    margin-bottom: 1rem;
  }

  .resume-entry-title {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-parchment);
  }

  .resume-entry-meta {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    color: #9ca3af;
  }

  .resume-list {
    font-family: var(--font-body);
    font-size: 0.75rem;
    color: #d1d5db;
    line-height: 1.7;
    margin-top: 0.35rem;
    list-style: disc inside;
  }

  .resume-list li {
    margin-bottom: 0.15rem;
  }

  .resume-skills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .resume-skill {
    font-family: var(--font-readout);
    font-size: 0.6rem;
    color: #d1d5db;
    background: rgba(31, 41, 55, 0.5);
    padding: 0.3rem 0.6rem;
    border-radius: 0.15rem;
    border: 1px solid rgba(107, 114, 128, 0.32);
  }

  .resume-disclaimer {
    font-family: var(--font-body);
    font-size: 0.7rem;
    font-style: italic;
    color: rgba(145, 141, 134, 0.5);
    text-align: center;
    margin-top: 1.5rem;
  }
</style>
