<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Plus } from 'lucide-vue-next';
import CardAtividade from '../components/CardAtividade.vue';
import type { ActivityStatus, BoardCard } from '../lib/types';
import * as api from '../lib/db';
import { toast } from '../lib/toast';
import { cards, carregaProjetos, carregaQuadro, projetos } from '../lib/store';

const COLUNAS: Array<{ id: ActivityStatus; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'fazendo', label: 'Fazendo' },
  { id: 'feito', label: 'Feito · 14d' },
];

/** Aviso, não trava. WIP alto é sintoma, e a pessoa sabe o que está fazendo. */
const WIP = 3;

const arrastando = ref<number | null>(null);
const sobre = ref<ActivityStatus | null>(null);

const novoTitulo = ref('');
const novoProjeto = ref<number | null>(null);
const criando = ref(false);

const daColuna = (id: ActivityStatus) => computed(() => cards.value.filter((c) => c.status === id));
const colunas = COLUNAS.map((c) => ({ ...c, itens: daColuna(c.id) }));

async function solta(status: ActivityStatus): Promise<void> {
  const id = arrastando.value;
  arrastando.value = null;
  sobre.value = null;
  if (id == null) return;
  const card = cards.value.find((c) => c.id === id);
  if (!card || card.status === status) return;
  try {
    await api.setActivityStatus(id, status);
    await carregaQuadro();
  } catch (e) { toast.erro(api.dbErro(e)); }
}

async function cria(): Promise<void> {
  const t = novoTitulo.value.trim();
  if (!t) return;
  try {
    await api.createActivity(t, novoProjeto.value, 'backlog');
    novoTitulo.value = '';
    criando.value = false;
    await carregaQuadro();
    toast.ok('Atividade criada');
  } catch (e) { toast.erro(api.dbErro(e)); }
}

function nomeCurto(c: BoardCard): string { return c.title; }

onMounted(async () => { await carregaProjetos(); await carregaQuadro(); });
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto">
    <div class="flex items-center gap-2 px-5 pb-1 pt-4">
      <template v-if="criando">
        <input class="inp max-w-[320px]" v-model="novoTitulo" placeholder="Título da atividade"
               autofocus @keydown.enter="cria" @keydown.esc="criando = false">
        <select class="inp max-w-[180px]" v-model="novoProjeto">
          <option :value="null">— sem projeto —</option>
          <option v-for="p in projetos" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="btn btn-sm btn-pri" @click="cria">Criar</button>
        <button class="btn btn-sm" @click="criando = false">Cancelar</button>
      </template>
      <button v-else class="btn btn-sm" @click="criando = true">
        <Plus class="h-3.5 w-3.5" />Nova atividade
      </button>
    </div>

    <div class="grid min-w-[900px] grid-cols-4 items-start gap-3.5 px-5 pb-7 pt-3">
      <div v-for="col in colunas" :key="col.id"
        class="flex min-h-[180px] flex-col rounded-lg border bg-surface"
        :class="sobre === col.id ? 'border-foco bg-foco/5' : 'border-rule'"
        @dragover.prevent="sobre = col.id" @dragleave="sobre = null" @drop.prevent="solta(col.id)">

        <div class="flex items-center gap-2 border-b border-rule px-3 py-2.5">
          <span class="rotulo !text-fg-muted">{{ col.label }}</span>
          <span class="ml-auto font-mono text-[10.5px]"
                :class="col.id === 'fazendo' && col.itens.value.length > WIP
                  ? 'font-semibold text-warn' : 'text-fg-subtle'">
            {{ col.itens.value.length }}<template v-if="col.id === 'fazendo'">/{{ WIP }}</template>
          </span>
        </div>

        <p v-if="col.id === 'fazendo' && col.itens.value.length > WIP"
           class="mx-2 mb-2 border-l-2 border-warn pl-2 font-mono text-[10px] leading-snug text-warn">
          Mais de {{ WIP }} em paralelo. Nada trava — só um aviso.
        </p>

        <div class="flex flex-col gap-2 p-2">
          <div v-for="c in col.itens.value" :key="c.id" draggable="true"
               :class="arrastando === c.id && 'opacity-40'"
               @dragstart="arrastando = c.id" @dragend="arrastando = null; sobre = null">
            <CardAtividade :card="c" :aria-label="nomeCurto(c)" />
          </div>
          <p v-if="!col.itens.value.length" class="px-1 py-1 text-[11.5px] text-fg-subtle">vazio</p>
        </div>
      </div>
    </div>

    <p class="max-w-[640px] px-5 pb-6 text-[11.5px] leading-relaxed text-fg-subtle">
      Arraste os cards entre colunas. <b class="text-fg-muted">Feito</b> sai do quadro depois de 14 dias
      e continua nos relatórios para sempre — é o que impede o quadro de virar cemitério.
    </p>
  </div>
</template>
