<script setup lang="ts">
import { computed } from 'vue';
import { Check, Clock } from 'lucide-vue-next';
import type { BoardCard } from '../lib/types';
import { fmtHM } from '../lib/tempo';

const props = defineProps<{ card: BoardCard }>();

/** Prazo em dias. Negativo = atrasado. */
const dias = computed(() => {
  if (!props.card.due_at) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(props.card.due_at); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
});

const urgente = computed(() => dias.value !== null && dias.value <= 3);

const rotuloPrazo = computed(() => {
  const n = dias.value;
  if (n === null) return '';
  if (n < 0) return `${-n}d atrasado`;
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n <= 6) return `${n}d`;
  return props.card.due_at!.slice(5, 10).split('-').reverse().join('/');
});
</script>

<template>
  <div class="cursor-grab rounded-md border border-rule bg-surface-1 px-2.5 py-2.5 shadow-card
              hover:border-rule-strong active:cursor-grabbing">
    <div class="text-[13px] font-semibold leading-snug tracking-[-0.005em]">{{ card.title }}</div>

    <div v-if="card.project_code || card.project_name"
         class="mt-1 font-mono text-[10px] uppercase tracking-[0.05em] text-fg-subtle">
      {{ card.project_code ?? card.project_name }}
    </div>

    <div class="mt-2.5 flex items-center gap-2.5 font-mono text-[10.5px] tabular-nums text-fg-subtle">
      <span v-if="dias !== null" class="inline-flex items-center gap-1"
            :class="urgente ? 'text-danger' : 'text-warn'">
        <Clock class="h-3 w-3" />{{ rotuloPrazo }}
      </span>
      <Check v-if="card.status === 'feito'" class="h-3 w-3 text-ok" />
      <span class="ml-auto font-medium text-fg-muted">{{ fmtHM(card.minutes) }}</span>
    </div>
  </div>
</template>
