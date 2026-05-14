<script lang="ts">
  import { goto } from '$app/navigation';
  import { gameState } from '$lib/stores/gameState.svelte';

  let armProgress = $state(0);
  let arming = $state(false);
  let armTimer: ReturnType<typeof setInterval> | null = null;

  // Hide on the foyer (no session yet) and after a verdict is sealed (the
  // verdict screen already exposes "Investigate Again"). Mid-game only.
  let visible = $derived(
    gameState.current.sessionId !== null && gameState.current.verdict === null,
  );

  function clearArm() {
    if (armTimer) {
      clearInterval(armTimer);
      armTimer = null;
    }
  }

  function startArm() {
    if (arming) return;
    arming = true;
    armProgress = 4;
    armTimer = setInterval(() => {
      armProgress = Math.min(100, armProgress + 6);
      if (armProgress >= 100) {
        clearArm();
        commitReset();
      }
    }, 55);
  }

  function cancelArm() {
    if (!arming) return;
    clearArm();
    armProgress = 0;
    arming = false;
  }

  function commitReset() {
    gameState.reset();
    armProgress = 0;
    arming = false;
    void goto('/');
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startArm();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      cancelArm();
    }
  }
</script>

{#if visible}
  <button
    class="reset-btn"
    class:armed={arming}
    type="button"
    aria-label="Abandon the examination and start over"
    onpointerdown={startArm}
    onpointerup={cancelArm}
    onpointerleave={cancelArm}
    oncontextmenu={(e) => e.preventDefault()}
    onkeydown={onKeyDown}
    onkeyup={onKeyUp}
  >
    <svg
      class="reset-btn-key"
      width="14"
      height="14"
      viewBox="0 0 22 22"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
    >
      <path d="M4 11a7 7 0 1 1 2 4.9" />
      <polyline points="4 6 4 11 9 11" />
    </svg>
    <span class="reset-btn-label">
      {arming ? 'Hold to abandon' : 'Abandon'}
    </span>
    <span class="reset-btn-arm" style:--p="{armProgress}%" aria-hidden="true"></span>
  </button>
{/if}

<style>
  .reset-btn {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 100;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-readout);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-brass-dim);
    background: linear-gradient(180deg, rgba(20, 17, 10, 0.85) 0%, rgba(11, 11, 13, 0.85) 100%);
    border: 1px solid rgba(196, 162, 78, 0.35);
    padding: 0.55rem 0.9rem;
    cursor: pointer;
    overflow: hidden;
    backdrop-filter: blur(6px);
    transition:
      color var(--motion-base) var(--ease-out),
      border-color var(--motion-base) var(--ease-out),
      box-shadow var(--motion-base) var(--ease-out);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.08),
      0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .reset-btn:hover {
    color: var(--color-bone);
    border-color: var(--color-brass-key);
  }

  .reset-btn:focus-visible {
    outline: 2px solid var(--color-brass-key-glow);
    outline-offset: 2px;
  }

  .reset-btn.armed {
    color: var(--color-ember);
    border-color: var(--color-ember);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.12),
      0 0 18px rgba(210, 58, 42, 0.35);
  }

  .reset-btn-key {
    flex-shrink: 0;
    color: var(--color-brass-key);
    transition: color var(--motion-base) var(--ease-out);
  }

  .reset-btn.armed .reset-btn-key {
    color: var(--color-ember);
  }

  .reset-btn-label {
    position: relative;
    z-index: 2;
  }

  .reset-btn-arm {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(210, 58, 42, 0.35) 0%, rgba(210, 58, 42, 0.15) 100%);
    width: var(--p, 0%);
    transition: width 55ms linear;
    pointer-events: none;
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .reset-btn-arm {
      transition: none;
    }
  }
</style>
