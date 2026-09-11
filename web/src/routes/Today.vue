<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-vue-next';
import EditorSessao from '../components/SessionEditor.vue';
import type { SessionCard } from '../lib/types';
import * as api from '../lib/db';
import { carregaDia, diaAtual, sessoesDia, totaisDia } from '../lib/store';
import { toast } from '../lib/toast';
import { addDays, dayKey, duracaoMin, fmtDur, fmtHM, hhmm, rotuloDia } from '../lib/time';
import { agora, decorrido } from '../lib/clock';

const editando = ref<SessionCard | null>(null);
const ehHoje = computed(() => diaAtual.value === dayKey());

const KIND = { trabalho: 'trabalho', reuniao: 'reunião', admin: 'admin' } as const;
const COR = { trabalho: 'bg-trabalho', reuniao: 'bg-reuniao', admin: 'bg-admin' } as const;

const linhas = computed(() => sessoesDia.value.map((s) => ({
  s,
  dur: s.ended_at ? fmtDur(duracaoMin(s.started_at, s.ended_at)) : decorrido(s.started_at, agora.value),
  aberta: !s.ended_at,
})));

/** Percentual de cada tipo, para a barra de proporção do dia. */
const proporcao = computed(() => {
  const t = totaisDia.value;
  if (!t.total) return [];
  return (['trabalho', 'reuniao', 'admin'] as const)
    .filter((k) => t[k] > 0)
    .map((k) => ({ k, pct: Math.round((t[k] / t.total) * 100), min: t[k] }));
});

async function salva(id: number, patch: { started_at: string; ended_at: string }): Promise<void> {
  try {
    await api.updateSession(id, patch);
    editando.value = null;
    await carregaDia();
  } catch (e) { toast.erro(api.dbErro(e)); }
}

async function exclui(id: number): Promise<void> {
  try {
    await api.deleteSession(id);
    editando.value = null;
    await carregaDia();
  } catch (e) { toast.erro(api.dbErro(e)); }
}

onMounted(() => carregaDia());
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-none flex-wrap items-center gap-3 px-6 pb-2.5 pt-3">
      <div class="flex items-center gap-0.5">
        <button class="grid h-6 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
          aria-label="Dia anterior" @click="carregaDia(addDays(diaAtual, -1))">
          <ChevronLeft class="h-4 w-4" /></button>
        <span class="px-1.5 text-[14px] font-semibold tracking-tight">{{ rotuloDia(diaAtual) }}</span>
        <button class="grid h-6 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
          aria-label="Próximo dia" @click="carregaDia(addDays(diaAtual, 1))">
          <ChevronRight class="h-4 w-4" /></button>
        <button v-if="!ehHoje" class="btn ml-2" @click="carregaDia(dayKey())">hoje</button>
      </div>

      <div class="ml-auto flex items-baseline gap-1.5">
        <span class="med text-[24px] font-semibold leading-none">{{ fmtHM(totaisDia.total) }}</span>
        <span class="rot">registradas</span>
      </div>
    </div>

    <!-- proporção do dia: uma barra, sem gráfico -->
    <div v-if="proporcao.length" class="flex-none px-6 pb-3">
      <div class="flex h-1.5 overflow-hidden rounded-full">
        <div v-for="p in proporcao" :key="p.k" :class="COR[p.k]" :style="{ width: p.pct + '%' }"
             :title="`${KIND[p.k]} ${fmtHM(p.min)}`" />
      </div>
      <div class="mt-1.5 flex gap-4 font-mono text-[11px] text-fg-subtle">
        <span v-for="p in proporcao" :key="p.k" class="flex items-center gap-1.5">
          <i class="h-2 w-2 rounded-[2px]" :class="COR[p.k]" />
          {{ KIND[p.k] }} {{ fmtHM(p.min) }}
        </span>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
      <div class="max-w-[820px]">
      <p v-if="!linhas.length" class="mt-16 text-center text-[14px] text-fg-subtle">
        Nada registrado neste dia.<br>
        <span class="text-[12px]">Mover um card para <b>Fazendo</b> no Quadro começa a contar.</span>
      </p>

      <div v-for="l in linhas" :key="l.s.id"
        class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[5px] border-b
               border-rule px-2 py-[7px] transition-colors hover:bg-surface"
        :class="l.aberta && 'bg-accent/10'">
        <span class="med text-[11px] text-fg-subtle">
          {{ hhmm(l.s.started_at) }}–{{ l.s.ended_at ? hhmm(l.s.ended_at) : '…' }}
        </span>

        <div class="flex min-w-0 items-center gap-2">
          <span class="h-3.5 w-[3px] flex-none rounded-full" :class="COR[l.s.kind]" />
          <span class="truncate text-[14px]">{{ l.s.title }}</span>
          <span v-if="l.s.project_code" class="med flex-none text-[11px] text-fg-subtle">
            {{ l.s.project_code }}</span>
          <span v-if="l.s.source === 'manual'" class="rot flex-none !text-[11px]">manual</span>
        </div>

        <div class="flex flex-none items-center gap-2">
          <button v-if="!l.aberta"
            class="rounded-[3px] p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-2
                   hover:text-fg group-hover:opacity-100"
            title="Corrigir horário" @click="editando = l.s">
            <Pencil class="h-3.5 w-3.5" />
          </button>
          <span class="med w-[68px] text-right text-[14px] font-semibold"
            :class="l.aberta ? 'text-accent-ink' : 'text-fg-muted'">{{ l.dur }}</span>
        </div>
      </div>
      </div>
    </div>

    <EditorSessao :sessao="editando" :dia="diaAtual"
      @salvar="salva" @excluir="exclui" @fechar="editando = null" />
  </div>
</template>
