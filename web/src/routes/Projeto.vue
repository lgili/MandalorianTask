<script setup lang="ts">
// A página do projeto. É aqui que "registrar tarefa dentro de projeto" deixa
// de ser um <select> escondido num drawer e vira a operação natural: estar na
// tela do projeto JÁ é a atribuição.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Archive, Trash2, Play } from 'lucide-vue-next';
import CapturaLinha from '../components/CapturaLinha.vue';
import type { TaskCard, TaskStatus } from '../lib/types';
import { STATUS } from '../lib/types';
import * as api from '../lib/db';
import { abreDetalhe, carregaProjetos, move, projetoDe, recarregaTudo, rodando } from '../lib/store';
import { toast } from '../lib/toast';
import { fmtHM, relativo } from '../lib/tempo';

const route = useRoute();
const router = useRouter();

/** 'caixa' é a rota das tarefas sem projeto. */
const ehCaixa = computed(() => route.params.id === 'caixa');
const id = computed(() => (ehCaixa.value ? null : Number(route.params.id)));
const projeto = computed(() => projetoDe(id.value));

const itens = ref<TaskCard[]>([]);
const carregando = ref(false);
const editandoNome = ref(false);
const nome = ref('');
const codigo = ref('');
const confirmandoExclusao = ref(false);

async function carrega(): Promise<void> {
  carregando.value = true;
  try {
    itens.value = await api.tarefasDoProjeto(id.value);
  } catch (e) {
    toast.erro(api.dbErro(e));
  } finally {
    carregando.value = false;
  }
}

watch(() => route.params.id, async () => {
  await carregaProjetos();
  await carrega();
  nome.value = projeto.value?.name ?? '';
  codigo.value = projeto.value?.code ?? '';
  editandoNome.value = false;
  confirmandoExclusao.value = false;
}, { immediate: true });

// ── números do cabeçalho ──────────────────────────────────────────────────
const vivas = computed(() => itens.value.filter((t) => !t.archived_at));
const feitas = computed(() => itens.value.filter((t) => t.status === 'feito').length);
const minutos = computed(() => itens.value.reduce((s, t) => s + t.minutos, 0));
const progresso = computed(() => (itens.value.length ? feitas.value / itens.value.length : 0));
const ultima = computed(() => {
  const d = itens.value.map((t) => t.created_at).sort();
  return d.length ? d[d.length - 1] : null;
});

/** Agrupado por status — os "headings" do Things, de graça. */
const grupos = computed(() => STATUS
  .map((s) => ({ ...s, itens: vivas.value.filter((t) => t.status === s.id) }))
  .filter((g) => g.itens.length));

// ── edição do projeto ─────────────────────────────────────────────────────
async function salva(patch: { name?: string; code?: string | null; color?: string }): Promise<void> {
  if (id.value == null) return;
  try {
    await api.updateProject(id.value, patch);
    await carregaProjetos();
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

function salvaNome(): void {
  editandoNome.value = false;
  const n = nome.value.trim();
  if (!n || n === projeto.value?.name) { nome.value = projeto.value?.name ?? ''; return; }
  salva({ name: n });
}

async function arquiva(): Promise<void> {
  if (id.value == null) return;
  try {
    await api.updateProject(id.value, { archived_at: new Date().toISOString() });
    await carregaProjetos();
    toast.ok(`${projeto.value?.name ?? 'Projeto'} arquivado`);
    router.push('/projetos');
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

async function apaga(): Promise<void> {
  if (id.value == null) return;
  try {
    await api.deleteProject(id.value);
    await recarregaTudo();
    toast.ok('Projeto apagado — as tarefas foram para a Caixa');
    router.push('/projetos');
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

async function moveERecarrega(t: TaskCard, para: TaskStatus): Promise<void> {
  await move(t.id, para);
  await carrega();
}

const prazoCurto = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-[880px] px-6 pb-14 pt-6">
      <button class="mb-4 flex items-center gap-1.5 text-[12px] text-fg-subtle hover:text-fg"
        @click="router.push('/projetos')">
        <ArrowLeft class="h-3.5 w-3.5" />Projetos
      </button>

      <!-- ── cabeçalho ── -->
      <div class="flex items-start gap-4">
        <!-- anel de progresso: peça gráfica, sem número, sem denominador inventado -->
        <svg class="mt-1 h-9 w-9 flex-none -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(var(--surface-3))" stroke-width="4" />
          <circle v-if="progresso > 0" cx="18" cy="18" r="15" fill="none" stroke-width="4"
            stroke-linecap="round"
            :stroke="projeto?.color ? `rgb(var(--${projeto.color}))` : 'rgb(var(--fg-subtle))'"
            :stroke-dasharray="`${progresso * 94.2} 94.2`" />
        </svg>

        <div class="min-w-0 flex-1">
          <input v-if="editandoNome && !ehCaixa" v-model="nome"
            class="display w-full bg-transparent text-[32px] leading-none text-fg outline-none"
            @blur="salvaNome" @keydown.enter="salvaNome" @keydown.esc="editandoNome = false">
          <h1 v-else class="display m-0 text-[32px] leading-none"
            :class="!ehCaixa && 'cursor-text'"
            @click="ehCaixa || (editandoNome = true)">
            {{ ehCaixa ? 'Caixa' : projeto?.name ?? '…' }}
          </h1>

          <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-fg-subtle">
            <span>{{ itens.length }} {{ itens.length === 1 ? 'tarefa' : 'tarefas' }}</span>
            <span>·</span><span>{{ feitas }} feitas</span>
            <span>·</span><span class="text-fg-muted">{{ fmtHM(minutos) }} medidas</span>
            <template v-if="ultima"><span>·</span><span>última {{ relativo(ultima) }}</span></template>
          </div>
        </div>

        <div v-if="!ehCaixa" class="flex flex-none items-center gap-1.5">
          <!-- cor: seis bolinhas, não um color picker com hex -->
          <div class="mr-1 flex items-center gap-1">
            <button v-for="c in api.PALETA" :key="c" class="h-4 w-4 rounded-full transition"
              :style="{ background: `rgb(var(--${c}))` }"
              :class="projeto?.color === c
                ? 'ring-2 ring-fg/50 ring-offset-2 ring-offset-surface-1'
                : 'opacity-40 hover:opacity-100'"
              :aria-label="`Cor ${c}`" @click="salva({ color: c })" />
          </div>
          <input v-model="codigo" class="inp med !w-[92px] !py-1 !text-[11px]" placeholder="código"
            @change="salva({ code: codigo.trim() || null })">
          <button class="btn btn-ghost btn-icone" title="Arquivar" @click="arquiva">
            <Archive class="h-3.5 w-3.5" /></button>
          <button class="btn btn-ghost btn-icone btn-perigo" title="Apagar"
            @click="confirmandoExclusao = true"><Trash2 class="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div v-if="confirmandoExclusao"
        class="painel mt-4 flex flex-wrap items-center gap-3 !border-danger/40 p-3">
        <span class="text-[12px]">
          Apagar <b>{{ projeto?.name }}</b>? As {{ itens.length }} tarefas vão para a Caixa —
          nenhuma hora medida se perde.
        </span>
        <button class="btn btn-perigo ml-auto" @click="apaga">Apagar</button>
        <button class="btn" @click="confirmandoExclusao = false">Cancelar</button>
      </div>

      <!-- ── captura: o projeto já vem preenchido ── -->
      <div class="mt-6">
        <CapturaLinha :projeto-fixo="id"
          :placeholder="`nova tarefa em ${ehCaixa ? 'Caixa' : projeto?.name ?? ''}…`"
          @criada="carrega" />
      </div>

      <!-- ── tarefas, agrupadas por status ── -->
      <div class="mt-6 space-y-6">
        <div v-for="g in grupos" :key="g.id">
          <div class="mb-1 flex items-baseline gap-2 border-b border-rule pb-1">
            <span class="rot">{{ g.label }}</span>
            <span class="med ml-auto text-[11px] text-fg-subtle">{{ g.itens.length }}</span>
          </div>

          <div v-for="t in g.itens" :key="t.id"
            class="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2
                   transition-colors hover:bg-surface">
            <button class="flex min-w-0 items-baseline gap-2 text-left" @click="abreDetalhe(t.id)">
              <span class="truncate text-[14px] leading-snug hover:text-accent-ink">{{ t.title }}</span>
              <span v-if="t.origem_title"
                class="max-w-[180px] flex-none truncate text-[11px] text-fg-subtle/70">
                de {{ t.origem_title }}</span>
            </button>
            <div class="flex flex-none items-center gap-2.5">
              <span v-if="t.kind === 'reuniao'" class="chip bg-reuniao/15 text-reuniao">reunião</span>
              <span v-if="t.due_at" class="med text-[11px] text-warn">{{ prazoCurto(t.due_at) }}</span>
              <span class="med w-12 text-right text-[12px]"
                :class="t.minutos ? 'text-fg-muted' : 'text-fg-subtle/50'">
                {{ t.minutos ? fmtHM(t.minutos) : '—' }}</span>
              <span v-if="rodando?.task_id === t.id" class="chip bg-vivo/15 text-vivo-ink">rodando</span>
              <button v-else-if="t.status !== 'feito'"
                class="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-3
                       hover:text-fg group-hover:opacity-100 group-focus-within:opacity-100"
                title="Começar agora" @click="moveERecarrega(t, 'fazendo')">
                <Play class="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>

        <p v-if="!carregando && !itens.length" class="py-10 text-center text-[14px] text-fg-subtle">
          Nada aqui ainda.<br>
          <span class="text-[12px]">Digite acima e aperte enter.</span>
        </p>
      </div>
    </div>
  </div>
</template>
