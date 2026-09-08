<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useMagicKeys, whenever } from '@vueuse/core';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-vue-next';
import Timeline from '../components/Timeline.vue';
import ModalEntrada from '../components/ModalEntrada.vue';
import type { DayEntry, EntryKind } from '../lib/types';
import * as api from '../lib/db';
import { toast } from '../lib/toast';
import {
  carregaDia, carregaQuadro, cards, diaAtual, entradas, pendentes, totais,
} from '../lib/store';
import { addDays, dayKey, fmtHM, rotuloDia, sobrepoe } from '../lib/tempo';
import { podeAtalho } from '../lib/teclado';

const modal = ref(false);
const editando = ref<DayEntry | null>(null);
const sugestao = ref<{ de: number; ate: number } | null>(null);

const ehHoje = computed(() => diaAtual.value === dayKey());
const prazos = computed(() =>
  cards.value.filter((c) => c.due_at && c.status !== 'feito')
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
    .slice(0, 4));
const emCurso = computed(() => cards.value.filter((c) => c.status === 'fazendo'));

async function recarrega(): Promise<void> {
  await Promise.all([carregaDia(), carregaQuadro()]);
}

function vaiPara(delta: number): void {
  carregaDia(addDays(diaAtual.value, delta));
}

function abreNovo(de?: number, ate?: number): void {
  editando.value = null;
  sugestao.value = de != null && ate != null ? { de, ate } : null;
  modal.value = true;
}

function abreEdicao(e: DayEntry): void {
  editando.value = e;
  sugestao.value = null;
  modal.value = true;
}

async function confirma(e: DayEntry): Promise<void> {
  try {
    await api.setEntryConfirmed(e.id, true);
    await carregaDia();
    toast.ok('Confirmado — entra no relatório');
  } catch (err) { toast.erro(api.dbErro(err)); }
}

async function confirmaTudo(): Promise<void> {
  if (!pendentes.value.length) return;
  try {
    const n = await api.confirmDay(diaAtual.value);
    await carregaDia();
    toast.ok(`${n} ${n === 1 ? 'bloco confirmado' : 'blocos confirmados'}`);
  } catch (err) { toast.erro(api.dbErro(err)); }
}

async function salva(d: {
  activity_id: number | null; started_at: string; ended_at: string;
  kind: EntryKind; note: string | null;
}): Promise<void> {
  // Sobreposição avisa, nunca soma em silêncio — é a regra que mantém o número honesto.
  const conflito = entradas.value.find(
    (e) => e.id !== editando.value?.id && e.kind !== 'pausa' && sobrepoe(e, d));
  if (conflito) {
    toast.aviso(`Sobrepõe "${conflito.activity_title ?? 'bloco'}". Ajuste os horários.`);
    return;
  }
  try {
    if (editando.value) await api.updateEntry(editando.value.id, d);
    else await api.createEntry({ ...d, source: 'manual' });
    modal.value = false;
    await recarrega();
  } catch (err) { toast.erro(api.dbErro(err)); }
}

async function exclui(id: number): Promise<void> {
  try {
    await api.deleteEntry(id);
    modal.value = false;
    await recarrega();
  } catch (err) { toast.erro(api.dbErro(err)); }
}

// 'a' confirma o dia. Sem checar modificador, Cmd+A (Selecionar tudo) confirmaria
// todos os blocos da agenda sem o usuário perceber.
let ultimo: KeyboardEvent | null = null;
const keys = useMagicKeys({ onEventFired: (e) => { if (e.type === 'keydown') ultimo = e; } });
whenever(keys['a'], () => {
  if (ultimo && podeAtalho(ultimo)) confirmaTudo();
});

onMounted(recarrega);
</script>

<template>
  <div class="grid h-full grid-cols-[minmax(0,1fr)_268px] max-[1000px]:grid-cols-[minmax(0,1fr)]">
    <div class="flex min-w-0 flex-col overflow-hidden">
      <div class="flex flex-none flex-wrap items-center gap-3.5 px-5 pb-3 pt-4">
        <div class="flex items-center gap-0.5">
          <button class="grid h-6 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
                  aria-label="Dia anterior" @click="vaiPara(-1)"><ChevronLeft class="h-4 w-4" /></button>
          <span class="whitespace-nowrap px-2 text-base font-semibold tracking-tight">
            {{ rotuloDia(diaAtual) }}</span>
          <button class="grid h-6 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
                  aria-label="Próximo dia" @click="vaiPara(1)"><ChevronRight class="h-4 w-4" /></button>
          <button v-if="!ehHoje" class="btn btn-sm ml-2" @click="carregaDia(dayKey())">hoje</button>
        </div>

        <div class="ml-auto flex overflow-hidden rounded-md border border-rule bg-surface shadow-card">
          <div class="min-w-[78px] border-r border-rule px-3.5 py-1.5">
            <span class="block font-mono text-[15px] font-semibold leading-tight tabular-nums">
              {{ fmtHM(totais.total) }}</span>
            <span class="rotulo">logadas</span>
          </div>
          <div class="min-w-[78px] border-r border-rule px-3.5 py-1.5">
            <span class="block font-mono text-[15px] font-semibold leading-tight tabular-nums text-foco">
              {{ fmtHM(totais.foco) }}</span>
            <span class="rotulo">foco</span>
          </div>
          <div class="min-w-[78px] px-3.5 py-1.5">
            <span class="block font-mono text-[15px] font-semibold leading-tight tabular-nums text-reuniao">
              {{ fmtHM(totais.reuniao) }}</span>
            <span class="rotulo">reunião</span>
          </div>
        </div>

        <button class="btn btn-sm btn-pri" @click="abreNovo()"><Plus class="h-3.5 w-3.5" />Novo</button>
      </div>

      <div v-if="pendentes.length"
        class="mx-5 mb-3 flex flex-none items-center gap-3 rounded-r-md border-l-2 border-warn
               bg-warn/10 px-3.5 py-2 text-[13px]">
        <AlertTriangle class="h-4 w-4 flex-none text-warn" />
        <div class="min-w-0">
          <b>{{ pendentes.length }}</b>
          {{ pendentes.length === 1 ? 'bloco do Google Agenda aguardando' : 'blocos do Google Agenda aguardando' }}
          confirmação — não {{ pendentes.length === 1 ? 'entra' : 'entram' }} em relatório até você confirmar.
        </div>
        <button class="btn btn-sm btn-pri ml-auto" @click="confirmaTudo">Confirmar tudo · A</button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 pb-7">
        <Timeline :entradas="entradas" :dia="diaAtual"
                  @abrir="abreEdicao" @confirmar="confirma"
                  @lacuna="(de, ate) => abreNovo(de, ate)" />
      </div>
    </div>

    <div class="flex flex-col gap-5 overflow-y-auto border-l border-rule bg-surface px-4 pb-6 pt-4
                max-[1000px]:hidden">
      <div>
        <h3 class="rotulo mb-2">Prazos</h3>
        <p v-if="!prazos.length" class="text-[11.5px] leading-snug text-fg-subtle">
          Nenhum prazo definido. Um card do Quadro com data aparece aqui.</p>
        <div v-for="p in prazos" :key="p.id"
             class="flex items-baseline gap-2 border-b border-rule py-1.5 text-[13px] last:border-b-0">
          <span class="min-w-0 leading-snug">{{ p.title }}</span>
          <span class="ml-auto whitespace-nowrap font-mono text-[10.5px] text-fg-subtle">
            {{ p.due_at?.slice(0, 10) }}</span>
        </div>
      </div>

      <div>
        <h3 class="rotulo mb-2">Em curso</h3>
        <p v-if="!emCurso.length" class="text-[11.5px] leading-snug text-fg-subtle">
          Nada em <i>Fazendo</i>. Arraste um card no Quadro.</p>
        <div v-for="a in emCurso" :key="a.id"
             class="grid grid-cols-[1fr_auto] items-baseline gap-2 border-b border-rule py-1.5
                    text-[13px] last:border-b-0">
          <span class="min-w-0 leading-snug">{{ a.title }}</span>
          <span class="font-mono text-[10.5px] tabular-nums text-fg-subtle">{{ fmtHM(a.minutes) }}</span>
        </div>
        <p class="mt-2.5 text-[11.5px] leading-snug text-fg-subtle">
          Clique numa lacuna da timeline para lançar tempo numa destas.</p>
      </div>
    </div>

    <ModalEntrada :aberto="modal" :dia="diaAtual" :entrada="editando" :sugestao="sugestao"
                  @salvar="salva" @excluir="exclui" @fechar="modal = false" />
  </div>
</template>
