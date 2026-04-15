<script lang="ts">
  let dismissed = $state(false);
</script>

{#if !dismissed}
  <div
    class="mobile-gate fixed inset-0 z-[100] flex items-center justify-center bg-void/95 p-8 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="Desktop recommended notice"
  >
    <div class="max-w-sm text-center">
      <p class="font-readout text-brass-dim mb-4 text-xs uppercase tracking-[0.3em]">
        Notice from The Architect
      </p>
      <h2 class="font-display text-parchment mb-4 text-xl leading-relaxed">
        This Investigation Is Best Conducted at a Proper Desk
      </h2>
      <p class="font-body text-parchment-dim mb-8 text-sm leading-relaxed">
        The mansion's rooms, evidence cards, and Architect panel are designed for screens 768px or
        wider. You may proceed, but the experience may feel constrained.
      </p>
      <button
        onclick={() => (dismissed = true)}
        class="font-display border-brass/30 bg-brass/10 text-brass hover:bg-brass/20 hover:border-brass/50 rounded border px-6 py-2.5 text-sm uppercase tracking-widest transition-all duration-300"
      >
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
      display: flex;
    }
  }
</style>
