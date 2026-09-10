<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import Card from '../components/Card.vue';
import CapturaLinha from '../components/CapturaLinha.vue';
import type { TaskCard, TaskStatus } from '../lib/types';
import { arrastando, carregaProjetos, carregaQuadro, conclui, move, pausa, rodando, tarefas } from '../lib/store';
import { fmtHM } from '../lib/tempo';
import { ref } from 'vue';

// O Backlog é uma tela própria, então o quadro tem três colunas largas em vez
// de quatro apertadas — o que também o faz caber no Windows a 150% de escala.
const COLUNAS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'fila', label: 'Fila' },
  { id: 'fazendo', label: 'Fazendo' },
  { id: 'feito', label: 'Feito · 14d' },
];

const sobre = ref<TaskStatus | null>(null);

const daColuna = (id: TaskStatus) => tarefas.value.filter((t) => t.status === id);
const colunas = computed(() => COLUNAS.map((c) => ({ ...c, itens: daColuna(c.id) })));

/** Só UMA tarefa roda de cada vez, mesmo com várias em "Fazendo". */
const rodandoId = computed(() => rodando.value?.task_id ?? null);

function desde(t: TaskCard): string | null {
  return t.id === rodandoId.value ? rodando.value!.started_at : null;
}

const totalColuna = (itens: TaskCard[]) => fmtHM(itens.reduce((s, t) => s + t.minutos, 0));

async function solta(status: TaskStatus): Promise<void> {
  const id = arrastando.value;
  arrastando.value = null;
  sobre.value = null;
  if (id != null) await move(id, status);
}

onMounted(async () => { await carregaProjetos(); await carregaQuadro(); });
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Campo permanente, não um botão que abre e fecha: o padrão antigo
         obrigava um clique por tarefa. E aqui a captura entende `#projeto`,
         então o quadro parou de fabricar tarefa órfã. -->
    <div class="flex flex-none items-start gap-3 px-6 pb-2 pt-3">
      <div class="max-w-[420px] flex-1">
        <CapturaLinha status-inicial="fila" :dicas="false"
          placeholder="nova tarefa na fila…" @criada="carregaQuadro" />
      </div>
      <span class="mt-2 ml-auto font-mono text-[11px] text-fg-subtle">
        ▶ no card começa a contar · arraste para mover
      </span>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-hidden px-6 pb-4">
      <div v-for="col in colunas" :key="col.id"
        class="faixa flex min-h-0 flex-col transition-colors"
        :class="sobre === col.id && 'ring-2 ring-inset ring-accent/60 !bg-accent/10'"
        @dragover.prevent="sobre = col.id" @dragleave="sobre = null" @drop.prevent="solta(col.id)">

        <div class="flex flex-none items-center gap-2 px-2.5 pb-1.5 pt-2.5">
          <span class="rot !text-fg-muted">{{ col.label }}</span>
          <span class="chip bg-surface-3 text-fg-muted">{{ col.itens.length }}</span>
          <!-- três em curso, uma rodando: a distinção que o app faz -->
          <span v-if="col.id === 'fazendo' && rodando"
            class="chip bg-vivo/15 text-vivo-ink gap-1">
            <span class="h-1.5 w-1.5 rounded-full bg-vivo" />1 rodando
          </span>
          <span class="med ml-auto text-[11px] font-semibold text-fg-muted">{{ totalColuna(col.itens) }}</span>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          <div v-for="t in col.itens" :key="t.id" draggable="true"
            :class="arrastando === t.id && 'opacity-40'"
            @dragstart="arrastando = t.id" @dragend="arrastando = null; sobre = null">
            <Card :card="t" :rodando-desde="desde(t)"
                  @iniciar="move($event, 'fazendo')" @pausar="pausa()"
                  @concluir="conclui($event, 'entregue', null)" />
          </div>
          <!-- 'vazio' era placeholder de dev, e era o que o usuário novo via
               em duas das três colunas na primeira abertura do Quadro. -->
          <p v-if="!col.itens.length" class="px-1 py-3 text-[12px] leading-relaxed text-fg-subtle">
            <template v-if="col.id === 'fila'">
              Nada escolhido para agora.<br>
              <RouterLink to="/backlog" class="text-accent-ink hover:underline">puxe da captura →</RouterLink>
            </template>
            <template v-else-if="col.id === 'fazendo'">
              Nada em curso.<br>Arraste um card para cá — é isso que começa a contar o tempo.
            </template>
            <template v-else>Nada concluído nos últimos 14 dias.</template>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
