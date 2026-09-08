<script setup lang="ts">
import { computed } from 'vue';
import { Clock, Repeat } from 'lucide-vue-next';
import type { TaskCard } from '../lib/types';
import { fmtHM } from '../lib/tempo';
import { agora, decorrido, minutosDecorridos } from '../lib/relogio';

const props = defineProps<{ card: TaskCard; rodandoDesde?: string | null }>();

/** Tempo acumulado. Se está rodando, soma a sessão aberta ao vivo. */
const tempo = computed(() => props.rodandoDesde
  ? fmtHM(props.card.minutos + minutosDecorridos(props.rodandoDesde, agora.value))
  : fmtHM(props.card.minutos));

const relogio = computed(() =>
  props.rodandoDesde ? decorrido(props.rodandoDesde, agora.value) : null);

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

const KIND = { trabalho: '', reuniao: 'reunião', admin: 'admin' } as const;
</script>

<template>
  <div class="cursor-grab rounded-[6px] border bg-surface px-2.5 py-2 shadow-card transition-colors
              active:cursor-grabbing"
    :class="rodandoDesde
      ? 'border-vivo/60 bg-vivo-halo/40 dark:bg-vivo-halo/25'
      : 'border-rule hover:border-rule-strong'">

    <div class="flex items-start gap-2">
      <!-- o ponto só existe no que está rodando AGORA -->
      <span v-if="rodandoDesde" class="relative mt-[5px] flex h-1.5 w-1.5 flex-none">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-vivo opacity-60" />
        <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-vivo" />
      </span>
      <div class="line-clamp-2 text-[13px] font-semibold leading-[1.35] tracking-[-0.006em]">
        {{ card.title }}
      </div>
    </div>

    <div v-if="card.origem_title" class="mt-1 truncate text-[10.5px] text-fg-subtle">
      de <span class="text-reuniao">{{ card.origem_title }}</span>
    </div>

    <div class="mt-2 flex items-center gap-2 font-mono text-[10.5px] text-fg-subtle">
      <span v-if="card.project_code" class="font-medium">{{ card.project_code }}</span>
      <span v-if="KIND[card.kind]" class="text-reuniao">{{ KIND[card.kind] }}</span>

      <span v-if="prazo" class="flex items-center gap-1"
        :class="dias !== null && dias <= 1 ? 'text-danger' : 'text-warn'">
        <Clock class="h-2.5 w-2.5" />{{ prazo }}
      </span>

      <span v-if="card.sessoes > 2" class="flex items-center gap-1" :title="`${card.sessoes} sessões`">
        <Repeat class="h-2.5 w-2.5" />{{ card.sessoes }}
      </span>

      <!-- a maior coisa do card é a duração; é a tese do app -->
      <span class="ml-auto font-semibold"
        :class="rodandoDesde ? 'text-vivo' : 'text-fg-muted'">
        {{ relogio ?? tempo }}
      </span>
    </div>
  </div>
</template>
