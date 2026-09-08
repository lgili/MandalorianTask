<script setup lang="ts">
import { computed } from 'vue';
import { useNow } from '@vueuse/core';
import { AlertTriangle, Check, Plus } from 'lucide-vue-next';
import type { DayEntry } from '../lib/types';
import {
  DIA_INICIO_H, DIA_FIM_H, minutosDoDia, hhmm, duracaoMin, fmtDur, lacunas, dayKey,
} from '../lib/tempo';

const props = defineProps<{ entradas: DayEntry[]; dia: string }>();
const emit = defineEmits<{
  abrir: [entrada: DayEntry];
  confirmar: [entrada: DayEntry];
  lacuna: [de: number, ate: number];
}>();

/** Altura de uma hora, em px. Único lugar que define a escala vertical. */
const HPX = 58;

/**
 * A janela desenhada se ESTICA para caber o dado, em vez de recortá-lo.
 * Sem isto, um bloco às 05:30 recebe top negativo e some da tela — mas continua
 * somando no total. A pessoa vê o número e não acha o bloco para corrigir.
 */
const janela = computed(() => {
  let ini = DIA_INICIO_H * 60;
  let fim = DIA_FIM_H * 60;
  for (const e of props.entradas) {
    ini = Math.min(ini, minutosDoDia(e.started_at));
    fim = Math.max(fim, minutosDoDia(e.started_at) + duracaoMin(e.started_at, e.ended_at));
  }
  return { ini: Math.floor(ini / 60) * 60, fim: Math.ceil(fim / 60) * 60 };
});

const horas = computed(() => {
  const { ini, fim } = janela.value;
  const n = Math.max(1, (fim - ini) / 60);
  return Array.from({ length: n + 1 }, (_, i) => ini / 60 + i);
});

const topo = (min: number) => ((min - janela.value.ini) / 60) * HPX;
const altura = (min: number) => (min / 60) * HPX;

const blocos = computed(() =>
  [...props.entradas]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((e) => {
      const ini = minutosDoDia(e.started_at);
      const dur = duracaoMin(e.started_at, e.ended_at);
      return {
        e,
        ini,
        dur,
        candidato: e.source === 'calendar' && !e.confirmed_at,
        top: topo(ini),
        // -3px: respiro entre blocos encostados, sem mexer no dado
        h: Math.max(18, altura(dur) - 3),
      };
    }));

const buracos = computed(() => lacunas(props.entradas));

// Fonte de tempo REATIVA: sem ela o computed abaixo só depende de props.dia,
// nunca fica dirty, e a linha do "agora" congela na hora da primeira renderização.
const relogio = useNow({ interval: 30_000 });

/** Linha do "agora" só aparece se o dia mostrado for hoje. */
const agora = computed(() => {
  const d = relogio.value;
  if (props.dia !== dayKey(d)) return null;
  const min = d.getHours() * 60 + d.getMinutes();
  if (min < janela.value.ini || min > janela.value.fim) return null;
  return { top: topo(min), rotulo: hhmm(d.toISOString()) };
});

const CLASSE = {
  foco: 'bg-foco text-on-accent',
  reuniao: 'bg-reuniao text-on-accent',
  admin: 'bg-admin text-on-accent',
  pausa: 'bg-surface-3 text-fg-muted',
} as const;
</script>

<template>
  <div class="relative ml-11 border-t border-rule" :style="{ height: (horas.length - 1) * HPX + 'px' }">
    <!-- réguas -->
    <template v-for="h in horas" :key="h">
      <div class="pointer-events-none absolute -left-11 right-0 border-t border-rule"
           :style="{ top: topo(h * 60) + 'px' }">
        <b class="absolute left-0 -top-2 bg-surface-1 pr-1.5 font-mono text-[10.5px]
                  font-normal tabular-nums text-fg-subtle">{{ String(h).padStart(2, '0') }}:00</b>
      </div>
      <div class="pointer-events-none absolute -left-11 right-0 border-t border-dotted border-rule opacity-60"
           :style="{ top: topo(h * 60) + HPX / 2 + 'px' }" />
    </template>

    <!-- lacunas: clicar lança tempo ali -->
    <button v-for="g in buracos" :key="'g' + g.de" type="button"
      class="absolute left-1.5 right-1.5 flex items-center justify-center gap-2 rounded-md
             border border-dashed border-rule-strong font-mono text-[11px] text-fg-subtle
             hover:border-foco hover:bg-foco/10 hover:text-foco"
      :style="{ top: topo(g.de) + 'px', height: Math.max(16, altura(g.ate - g.de) - 3) + 'px' }"
      @click="emit('lacuna', g.de, g.ate)">
      <Plus class="h-3 w-3" />{{ fmtDur(g.ate - g.de) }} sem registro
    </button>

    <!-- blocos -->
    <button v-for="b in blocos" :key="b.e.id" type="button"
      class="absolute left-1.5 right-1.5 overflow-hidden rounded-md px-2.5 py-1.5 text-left
             shadow-card transition hover:brightness-105"
      :class="b.candidato
        ? 'border border-dashed border-reuniao bg-surface text-reuniao shadow-none'
        : CLASSE[b.e.kind]"
      :style="{ top: b.top + 'px', height: b.h + 'px' }"
      @click="emit('abrir', b.e)">
      <div class="truncate text-[12.5px] font-semibold leading-tight">
        {{ b.e.activity_title ?? b.e.note ?? 'Sem atividade' }}
      </div>
      <div class="mt-px flex flex-wrap items-center gap-2 font-mono text-[10px] opacity-90">
        <span>{{ hhmm(b.e.started_at) }}–{{ hhmm(b.e.ended_at) }}</span>
        <span>{{ fmtDur(b.dur) }}</span>
        <span v-if="b.candidato" class="inline-flex items-center gap-1 font-semibold opacity-100"
              @click.stop="emit('confirmar', b.e)">
          <AlertTriangle class="h-3 w-3" />confirmar
        </span>
        <span v-else-if="b.e.source === 'calendar'" class="inline-flex items-center gap-1">
          <Check class="h-3 w-3" />agenda
        </span>
        <span v-if="b.e.project_code">· {{ b.e.project_code }}</span>
      </div>
    </button>

    <!-- agora -->
    <div v-if="agora" class="pointer-events-none absolute -left-11 right-0 z-10 border-t border-danger"
         :style="{ top: agora.top + 'px' }">
      <span class="absolute left-[38px] -top-[3px] block h-1.5 w-1.5 rounded-full bg-danger" />
      <b class="absolute left-0 -top-2 bg-surface-1 pr-1.5 font-mono text-[10px]
                font-medium text-danger">{{ agora.rotulo }}</b>
    </div>
  </div>
</template>
