<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Plus } from 'lucide-vue-next';
import Card from '../components/Card.vue';
import type { TaskCard, TaskStatus } from '../lib/types';
import * as api from '../lib/db';
import { carregaProjetos, carregaQuadro, move, rodando, tarefas } from '../lib/store';
import { toast } from '../lib/toast';
import { fmtHM } from '../lib/tempo';

// O Backlog é uma tela própria, então o quadro tem três colunas largas em vez
// de quatro apertadas — o que também o faz caber no Windows a 150% de escala.
const COLUNAS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'fila', label: 'Fila' },
  { id: 'fazendo', label: 'Fazendo' },
  { id: 'feito', label: 'Feito · 14d' },
];

const arrastando = ref<number | null>(null);
const sobre = ref<TaskStatus | null>(null);
const novo = ref('');
const criando = ref(false);

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

async function cria(): Promise<void> {
  const t = novo.value.trim();
  if (!t) return;
  try {
    const id = await api.capturaTarefa(t);
    await api.moveTask(id, 'fila');
    novo.value = '';
    criando.value = false;
    await carregaQuadro();
  } catch (e) { toast.erro(api.dbErro(e)); }
}

onMounted(async () => { await carregaProjetos(); await carregaQuadro(); });
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-none items-center gap-2 px-4 pb-2 pt-3">
      <template v-if="criando">
        <input class="inp max-w-[360px]" v-model="novo" placeholder="Título da tarefa" autofocus
               @keydown.enter="cria" @keydown.esc="criando = false">
        <button class="btn" @click="cria">Criar na fila</button>
        <button class="btn" @click="criando = false">Cancelar</button>
      </template>
      <button v-else class="btn" @click="criando = true">
        <Plus class="h-3.5 w-3.5" />Nova na fila
      </button>
      <span class="ml-auto font-mono text-[10.5px] text-fg-muted">
        arraste entre colunas · <span class="text-vivo">Fazendo</span> começa a contar
      </span>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-hidden px-4 pb-4">
      <div v-for="col in colunas" :key="col.id"
        class="faixa flex min-h-0 flex-col transition-colors"
        :class="sobre === col.id && '!border-vivo !bg-vivo-halo'"
        @dragover.prevent="sobre = col.id" @dragleave="sobre = null" @drop.prevent="solta(col.id)">

        <div class="flex flex-none items-center gap-2 px-2.5 pb-1.5 pt-2.5">
          <span class="rot !text-fg-muted">{{ col.label }}</span>
          <span class="med rounded-full bg-surface-3/70 px-1.5 py-[1px] text-[10px] font-semibold
                       leading-[15px] text-fg-muted">{{ col.itens.length }}</span>
          <!-- três em curso, uma rodando: a distinção que o app faz -->
          <span v-if="col.id === 'fazendo' && rodando"
            class="flex items-center gap-1 text-[10px] font-semibold text-vivo">
            <span class="h-1.5 w-1.5 rounded-full bg-vivo" />1 rodando
          </span>
          <span class="med ml-auto text-[11px] font-semibold text-fg-muted">{{ totalColuna(col.itens) }}</span>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          <div v-for="t in col.itens" :key="t.id" draggable="true"
            :class="arrastando === t.id && 'opacity-40'"
            @dragstart="arrastando = t.id" @dragend="arrastando = null; sobre = null">
            <Card :card="t" :rodando-desde="desde(t)" />
          </div>
          <p v-if="!col.itens.length" class="px-1 py-2 text-[11.5px] text-fg-subtle">
            {{ col.id === 'fila' ? 'Puxe do backlog.' : 'vazio' }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
