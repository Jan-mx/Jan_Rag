<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  description: string
}>()
</script>

<template>
  <main class="auth-split-shell">
    <section class="auth-split-shell__brand">
      <div class="auth-split-shell__brand-surface">
        <p v-if="eyebrow" class="auth-split-shell__eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <p class="auth-split-shell__description">{{ description }}</p>

        <div v-if="$slots.brand" class="auth-split-shell__brand-extra">
          <slot name="brand" />
        </div>

        <div v-if="$slots.actions" class="auth-split-shell__actions">
          <slot name="actions" />
        </div>
      </div>
    </section>

    <section class="auth-split-shell__panel">
      <slot />
    </section>
  </main>
</template>

<style scoped>
.auth-split-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(20rem, 28rem);
  gap: clamp(1.5rem, 4vw, 3.5rem);
  align-items: center;
  padding: clamp(1.25rem, 3vw, 2.25rem);
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(135deg, rgba(12, 25, 34, 0.04), transparent 34%),
    linear-gradient(180deg, #f5f8fb 0%, #e9f0f5 100%);
}

.auth-split-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(39, 82, 101, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(39, 82, 101, 0.08) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(120deg, rgba(0, 0, 0, 0.72), transparent 76%);
}

.auth-split-shell__brand,
.auth-split-shell__panel {
  min-width: 0;
}

.auth-split-shell__brand-surface {
  position: relative;
  display: grid;
  gap: 1.4rem;
  padding: clamp(1.75rem, 5vw, 4rem);
  border: 1px solid rgba(40, 77, 94, 0.12);
  border-radius: 1.15rem;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(238, 246, 247, 0.86)),
    rgba(255, 255, 255, 0.78);
  box-shadow: 0 28px 70px rgba(12, 25, 34, 0.14);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.auth-split-shell__brand-surface::before {
  content: 'JR';
  position: absolute;
  top: 1.4rem;
  right: 1.4rem;
  width: 3.2rem;
  height: 3.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(34, 126, 134, 0.22);
  border-radius: 0.8rem;
  color: #0e5d64;
  background: rgba(227, 247, 244, 0.82);
  font-weight: 900;
}

.auth-split-shell__eyebrow {
  margin: 0;
  color: #b8664f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.auth-split-shell h1 {
  margin: 0;
  max-width: 13ch;
  font-family: var(--wb-font-display);
  color: #112d3a;
  font-size: clamp(3rem, 6vw, 5.8rem);
  line-height: 0.94;
  letter-spacing: 0;
}

.auth-split-shell__description {
  margin: 0;
  max-width: 42rem;
  color: var(--wb-color-text-muted);
  font-size: 1rem;
  line-height: 1.8;
}

.auth-split-shell__brand-extra {
  display: grid;
  gap: 1rem;
}

.auth-split-shell__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: center;
}

.auth-split-shell__panel {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 960px) {
  .auth-split-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
    padding: 1rem;
  }

  .auth-split-shell__brand-surface {
    padding: 1.5rem;
    border-radius: 1rem;
  }

  .auth-split-shell__brand-surface::before {
    position: static;
    width: 2.8rem;
    height: 2.8rem;
    order: -1;
  }

  .auth-split-shell__panel {
    justify-content: stretch;
  }
}
</style>

