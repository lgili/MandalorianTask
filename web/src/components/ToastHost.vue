<script setup lang="ts">
import { toasts } from '../lib/toast';

const BORDER = { ok: 'border-l-ok', error: 'border-l-danger', warning: 'border-l-warn' } as const;
</script>

<template>
  <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
    <div v-for="t in toasts" :key="t.id"
      class="max-w-[340px] rounded-md border border-rule-strong border-l-2 bg-surface
             px-3.5 py-2 text-[14px] shadow-pop"
      :class="BORDER[t.tone]">
      {{ t.msg }}
    </div>
  </div>
</template>
