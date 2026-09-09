<script setup lang="ts">
import { computed } from 'vue';
import { Clock, Repeat } from 'lucide-vue-next';
import type { TaskCard } from '../lib/types';
import { fmtHM } from '../lib/tempo';
import { agora, decorrido, minutosDecorridos } from '../lib/relogio';

const props = defineProps<{ card: TaskCard; rodandoDesde?: string | null }>();

const tempo = computed(() => props.rodandoDesde
  ? fmtHM(props.card.minutos + minutosDecorridos(props.rodandoDesde, agora.value))
  : fmtHM(props.card.minutos));

const relogio = computed(() =>
  props.rodandoDesde ? decorrido(props.rodandoDesde, agora.value) : null);

/** Espinha de cor do projeto. É codificação — sem ela a coluna vira um muro. */
const espinha = computed(() => props.rodandoDesde
  ? 'rgb(var(--vivo))'
  : props.card.project_color ? `rgb(var(--${props.card.project_color}))` : 'rgb(var(--rule-strong))');

const dias = computed(() => {
  if (!props.card.due_at) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(props.card.due_at); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
});

const prazo = computed(() => {
  const n = dias.value;
  if (n === null) return null;
  if (n < 0) return `${-n}d atrasado`;
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n <= 6) return `${n}d`;
  return new Date(props.card.due_at!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
});
</script>

<template>
  <div class="relative grid cursor-grab grid-cols-[3px_minmax(0,1fr)] overflow-hidden rounded-[6px]
              border bg-surface shadow-card transition-shadow hover:shadow-pop active:cursor-grabbing"
    :class="rodandoDesde ? 'border-vivo/50' : 'border-rule'">

    <!-- espinha: projeto, ou âmbar cheio quando está rodando -->
    <div :style="{ background: espinha }" />

    <div class="min-w-0 px-2.5 py-2">
      <div class="line-clamp-2 text-[13px] font-semibold leading-[1.32] tracking-[-0.008em]">
        {{ card.title }}
      </div>

      <div v-if="card.origem_title" class="mt-1 truncate text-[10.5px] leading-tight text-fg-subtle">
        de {{ card.origem_title }}
      </div>

      <div class="mt-2 flex items-center gap-2 font-mono text-[10px] leading-none text-fg-subtle">
        <span v-if="card.project_code"
          class="rounded-[3px] px-1.5 py-[3px] font-semibold"
          :style="card.project_color
            ? { background: `rgb(var(--${card.project_color}) / .13)`, color: `rgb(var(--${card.project_color}))` }
            : undefined"
          :class="!card.project_color && 'bg-surface-2 text-fg-subtle'">{{ card.project_code }}</span>

        <span v-if="card.kind === 'reuniao'" class="text-reuniao">reunião</span>
        <span v-else-if="card.kind === 'admin'">admin</span>

        <span v-if="prazo" class="flex items-center gap-1 font-medium"
          :class="dias !== null && dias <= 1 ? 'text-danger' : 'text-warn'">
          <Clock class="h-2.5 w-2.5" />{{ prazo }}
        </span>

        <span v-if="card.sessoes > 2" class="flex items-center gap-0.5" :title="`${card.sessoes} sessões`">
          <Repeat class="h-2.5 w-2.5" />{{ card.sessoes }}
        </span>

        <!-- a maior coisa do card é a duração: é a tese do app -->
        <span class="ml-auto text-[12.5px] font-semibold leading-none"
          :class="rodandoDesde ? 'text-vivo' : 'text-fg-muted'">
          {{ relogio ?? tempo }}
        </span>
      </div>
    </div>

    <!-- tarja âmbar contínua no que está rodando -->
    <div v-if="rodandoDesde" class="pointer-events-none absolute inset-0 bg-vivo/[0.07]" />
  </div>
</template>
