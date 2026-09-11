<script setup lang="ts">
// A identidade visual do projeto, num lugar só.
//
// Existiam quatro cópias disto (Card, Backlog, TaskDetail, Dashboard), cada
// uma com um fallback diferente — uma delas ficava invisível quando o projeto
// não tinha cor, que era o caso de 100% dos projetos reais.
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  nome?: string | null;
  codigo?: string | null;
  cor?: string | null;
  /** ponto: só a bolinha · chip: bolinha+código · linha: bolinha+nome */
  variante?: 'ponto' | 'chip' | 'linha';
  tamanho?: 'sm' | 'md';
}>(), { variante: 'chip', tamanho: 'sm' });

/** Sem cor a bolinha não some: vira cinza. Ausência tem que ser visível. */
const rgb = computed(() => (props.cor ? `rgb(var(--${props.cor}))` : null));
const rotulo = computed(() => props.codigo || props.nome || 'Caixa');
const px = computed(() => (props.tamanho === 'md' ? 10 : 8));
</script>

<template>
  <span v-if="variante === 'ponto'" class="inline-block flex-none rounded-full"
    :style="{ width: px + 'px', height: px + 'px', background: rgb ?? 'rgb(var(--rule-strong))' }" />

  <span v-else-if="variante === 'linha'" class="inline-flex min-w-0 items-center gap-1.5">
    <span class="inline-block flex-none rounded-full"
      :style="{ width: px + 'px', height: px + 'px', background: rgb ?? 'rgb(var(--rule-strong))' }" />
    <span class="truncate" :style="rgb ? { color: rgb } : undefined"
      :class="!rgb && 'text-fg-muted'">{{ nome || 'Caixa' }}</span>
  </span>

  <span v-else class="chip max-w-[140px] truncate"
    :style="rgb ? { background: `rgb(var(--${cor}) / .15)`, color: rgb } : undefined"
    :class="!rgb && 'bg-surface-3 text-fg-muted'">{{ rotulo }}</span>
</template>
