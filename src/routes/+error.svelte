<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>Error | Architect of Suspicion</title>
</svelte:head>

<main class="error-view">
  <div class="error-container">
    <p class="error-label">Mechanism Failure</p>

    <h1 class="error-code">{page.status}</h1>

    <p class="error-message">
      {#if page.status === 404}
        The room you seek does not exist in this mansion.
      {:else}
        The mechanisms have seized. The Architect cannot proceed.
      {/if}
    </p>

    {#if page.error?.message}
      <p class="error-detail">{page.error.message}</p>
    {/if}

    <a href="/" class="error-link">Return to the Foyer</a>
  </div>
</main>

<style>
  .error-view {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: radial-gradient(ellipse at center, rgba(19, 22, 31, 1) 0%, rgba(8, 9, 12, 1) 70%);
  }

  .error-container {
    text-align: center;
    max-width: 32rem;
  }

  .error-label {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    margin-bottom: 1.5rem;
  }

  .error-code {
    font-family: var(--font-display);
    font-size: 4rem;
    font-weight: 700;
    color: var(--color-forge-orange);
    line-height: 1;
    margin-bottom: 1rem;
  }

  .error-message {
    font-family: var(--font-body);
    font-size: 1.1rem;
    color: var(--color-bone);
    line-height: 1.6;
    margin-bottom: 0.75rem;
  }

  .error-detail {
    font-family: var(--font-readout);
    font-size: 11px;
    color: var(--color-brass-dim);
    margin-bottom: 2rem;
  }

  .error-link {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-brass);
    border: 1px solid var(--color-brass-dim);
    padding: 0.7rem 2rem;
    text-decoration: none;
    display: inline-block;
    transition: all 0.3s ease;
    margin-top: 1rem;
  }

  .error-link:hover {
    border-color: var(--color-brass);
    background: rgba(233, 228, 216, 0.06);
  }
</style>
