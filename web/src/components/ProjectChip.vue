<script setup lang="ts">
// The project's visual identity, in one place.
//
// There were four copies of this (Card, Capture, TaskDetail, Dashboard), each
// with a different fallback — one of them went invisible when the project
// had no color, which was the case for 100% of real projects.
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  name?: string | null;
  code?: string | null;
  color?: string | null;
  /** dot: just the dot · chip: dot+code · line: dot+name */
  variant?: 'dot' | 'chip' | 'line';
  size?: 'sm' | 'md';
}>(), { variant: 'chip', size: 'sm' });

/** Without a color the dot doesn't vanish: it turns grey. Absence has to be visible. */
const rgb = computed(() => (props.color ? `rgb(var(--${props.color}))` : null));
const label = computed(() => props.code || props.name || 'Inbox');
const px = computed(() => (props.size === 'md' ? 10 : 8));
</script>

<template>
  <span v-if="variant === 'dot'" class="inline-block flex-none rounded-full"
    :style="{ width: px + 'px', height: px + 'px', background: rgb ?? 'rgb(var(--rule-strong))' }" />

  <span v-else-if="variant === 'line'" class="inline-flex min-w-0 items-center gap-1.5">
    <span class="inline-block flex-none rounded-full"
      :style="{ width: px + 'px', height: px + 'px', background: rgb ?? 'rgb(var(--rule-strong))' }" />
    <span class="truncate" :style="rgb ? { color: rgb } : undefined"
      :class="!rgb && 'text-fg-muted'">{{ name || 'Inbox' }}</span>
  </span>

  <span v-else class="chip max-w-[140px] truncate"
    :style="rgb ? { background: `rgb(var(--${color}) / .15)`, color: rgb } : undefined"
    :class="!rgb && 'bg-surface-3 text-fg-muted'">{{ label }}</span>
</template>
