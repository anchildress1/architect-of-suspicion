<script lang="ts">
  let dismissed = $state(false);
</script>

{#if !dismissed}
  <div class="mobile-gate" role="dialog" aria-modal="true" aria-label="Desktop recommended notice">
    <div class="mobile-gate-card">
      <p class="mobile-gate-eyebrow">Notice from The Architect</p>
      <h2 class="mobile-gate-title">This investigation is best conducted at a proper desk.</h2>
      <p class="mobile-gate-body">
        The mansion, witness stand, and verdict letter are designed for screens 768&thinsp;px or
        wider. Proceed if you must.
      </p>
      <button class="mobile-gate-button" onclick={() => (dismissed = true)}>
        Proceed Anyway
      </button>
    </div>
  </div>
{/if}

<style>
  .mobile-gate {
    display: none;
  }

  @media (max-width: 767px) {
    .mobile-gate {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(11, 11, 13, 0.96);
      backdrop-filter: blur(6px);
      padding: 2rem;
    }
  }

  .mobile-gate-card {
    max-width: 22rem;
    text-align: center;
  }

  .mobile-gate-eyebrow {
    font-family: var(--font-readout);
    font-size: 0.62rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 1rem;
  }

  .mobile-gate-title {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-style: italic;
    color: var(--color-bone);
    line-height: 1.3;
    margin-bottom: 1rem;
  }

  .mobile-gate-body {
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--color-paper-dim);
    line-height: 1.6;
    margin-bottom: 2rem;
  }

  .mobile-gate-button {
    font-family: var(--font-readout);
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-bone);
    background: transparent;
    border: 1px solid rgba(233, 228, 216, 0.35);
    padding: 0.7rem 1.5rem;
    cursor: pointer;
    transition: all 0.3s;
  }

  .mobile-gate-button:hover {
    background: rgba(233, 228, 216, 0.08);
    border-color: rgba(233, 228, 216, 0.6);
  }
</style>
