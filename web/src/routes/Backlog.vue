<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { CornerDownLeft, Trash2, ArrowRight } from 'lucide-vue-next';
import type { TaskCard, TaskKind } from '../lib/types';
import { analisa } from '../lib/captura';
import * as api from '../lib/db';
import { abreDetalhe, backlog, carregaQuadro, projetos, rodando, tarefas } from '../lib/store';
import { toast } from '../lib/toast';
import { rotuloDia, dayKey } from '../lib/tempo';

const campo = ref<HTMLInputElement | null>(null);
const linha = ref('');
/** Ids mandados para a fila nesta sessão de tela: continuam visíveis, carimbados. */
const enfileirados = ref<Set<number>>(new Set());

/** Pré-visualização do que os tokens vão fazer, enquanto digita. */
const previa = computed(() => analisa(linha.value, projetos.value));

/**
 * Agrupa por CONTEXTO DE CAPTURA, não por hora.
 * Tudo que nasceu durante a mesma tarefa em curso vira um bloco — na prática,
 * "as 7 coisas que saíram da reunião de revisão". Ninguém digitou isso.
 */
interface Grupo { chave: string; rotulo: string; contexto: string | null; itens: TaskCard[] }

const grupos = computed<Grupo[]>(() => {
  const out = new Map<string, Grupo>();
  for (const t of backlog.value) {
    const d = t.created_at.slice(0, 10);
    const chave = `${t.origem_id ?? 'solo'}|${d}`;
    if (!out.has(chave)) {
      out.set(chave, {
        chave,
        rotulo: d === dayKey() ? 'Hoje' : rotuloDia(dayKeyDe(t.created_at)),
        contexto: t.origem_title,
        itens: [],
      });
    }
    out.get(chave)!.itens.push(t);
  }
  return [...out.values()];
});

function dayKeyDe(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Enter grava. Ctrl+Enter grava e já manda pra fila. O cursor nunca sai daqui. */
async function registra(paraFila = false): Promise<void> {
  const a = analisa(linha.value, projetos.value);
  if (!a.titulo) { linha.value = ''; return; }   // linha vazia: nada acontece, sem erro

  const kind: TaskKind = rodando.value?.kind === 'reuniao' && !paraFila ? 'trabalho' : 'trabalho';
  try {
    const id = await api.capturaTarefa(a.titulo, a.projeto?.id ?? null, kind, a.prazo);
    if (paraFila) {
      await api.moveTask(id, 'fila');
      enfileirados.value.add(id);
    }
    linha.value = '';
    await carregaQuadro();
    // devolve o foco depois do re-render — o cursor não pode andar
    await nextTick();
    campo.value?.focus();
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

async function paraFila(t: TaskCard): Promise<void> {
  try {
    await api.moveTask(t.id, 'fila');
    enfileirados.value.add(t.id);
    await carregaQuadro();
  } catch (e) { toast.erro(api.dbErro(e)); }
}

async function apaga(t: TaskCard): Promise<void> {
  try {
    await api.deleteTask(t.id);
    await carregaQuadro();
  } catch (e) { toast.erro(api.dbErro(e)); }
}

const capturadasHoje = computed(() =>
  tarefas.value.filter((t) => t.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length);

onMounted(() => campo.value?.focus());
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- ── campo de captura: fixo no topo, a lista cresce PARA BAIXO ──
         Campo embaixo estilo chat obrigaria a lista a rolar a cada item, e
         rolar durante reunião mata a captura. -->
    <div class="flex-none border-b border-rule bg-surface px-4 pb-2.5 pt-3">
      <div class="relative">
        <CornerDownLeft class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5
                               -translate-y-1/2 text-fg-subtle" />
        <input ref="campo" v-model="linha"
          class="inp !py-2 !pl-8 !text-[13.5px]"
          placeholder="o que precisa ser feito…"
          spellcheck="false" autocomplete="off"
          @keydown.enter.exact.prevent="registra(false)"
          @keydown.ctrl.enter.prevent="registra(true)"
          @keydown.meta.enter.prevent="registra(true)"
          @keydown.esc="($event.target as HTMLInputElement).blur()">
      </div>

      <!-- prévia dos tokens: mostra o efeito ANTES de gravar -->
      <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px]
                  text-fg-subtle">
        <span><b class="font-semibold text-fg-muted">enter</b> registra</span>
        <span><b class="font-semibold text-fg-muted">ctrl+enter</b> vai pra fila</span>
        <span><b class="font-semibold text-fg-muted">#</b> projeto</span>
        <span><b class="font-semibold text-fg-muted">!</b> prazo</span>
        <span><b class="font-semibold text-fg-muted">esc</b> sai do campo</span>

        <template v-if="previa.projeto || previa.prazo || previa.ignorados.length">
          <span class="ml-auto flex items-center gap-2">
            <span v-if="previa.projeto" class="chip bg-accent/15 text-accent-ink">
              {{ previa.projeto.code ?? previa.projeto.name }}</span>
            <span v-if="previa.prazo" class="chip bg-warn/15 text-warn">
              {{ new Date(previa.prazo).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }}</span>
            <span v-for="ig in previa.ignorados" :key="ig" class="text-fg-subtle/70 line-through">{{ ig }}</span>
          </span>
        </template>
      </div>
    </div>

    <!-- ── lista ── -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3">
      <p v-if="!grupos.length" class="mt-16 text-center text-[13px] text-fg-subtle">
        Nada no backlog.<br>
        <span class="text-[12px]">Digite acima e aperte enter — durante a reunião, sem tirar o olho dela.</span>
      </p>

      <div v-for="g in grupos" :key="g.chave" class="mb-5">
        <div class="mb-1.5 flex items-baseline gap-2 border-b border-rule pb-1">
          <span class="rot">{{ g.rotulo }}</span>
          <span v-if="g.contexto" class="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <span class="text-fg-subtle/50">·</span> durante
            <span class="chip bg-reuniao/15 text-reuniao">{{ g.contexto }}</span>
          </span>
          <span class="med ml-auto text-[10.5px] text-fg-subtle">{{ g.itens.length }}</span>
        </div>

        <div v-for="t in g.itens" :key="t.id"
          class="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2.5 py-2
                 transition-colors hover:bg-surface"
          :class="enfileirados.has(t.id) && 'opacity-55'">
          <div class="flex min-w-0 items-baseline gap-2">
            <button class="truncate text-left text-[13.5px] leading-snug hover:text-accent-ink" @click="abreDetalhe(t.id)">{{ t.title }}</button>
            <span v-if="enfileirados.has(t.id)" class="med flex-none text-[10px] text-ok">→ fila</span>
          </div>

          <div class="flex flex-none items-center gap-2.5">
            <span v-if="t.project_code" class="chip"
              :style="t.project_color ? { background: `rgb(var(--${t.project_color}) / .15)`, color: `rgb(var(--${t.project_color}))` } : undefined"
              :class="!t.project_color && 'bg-surface-3 text-fg-muted'">{{ t.project_code }}</span>
            <span v-if="t.due_at" class="med text-[10.5px] text-warn">
              {{ new Date(t.due_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }}</span>

            <div class="flex items-center gap-0.5 opacity-0 transition-opacity
                        group-hover:opacity-100 group-focus-within:opacity-100">
              <button class="rounded-[3px] p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
                title="Mandar pra fila" @click="paraFila(t)">
                <ArrowRight class="h-3.5 w-3.5" />
              </button>
              <button class="rounded-[3px] p-1 text-fg-subtle hover:bg-surface-3 hover:text-danger"
                title="Apagar" @click="apaga(t)">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-none items-center gap-3 border-t border-rule bg-surface px-4 py-1.5
                font-mono text-[10.5px] text-fg-subtle">
      <span>{{ backlog.length }} no backlog</span>
      <span>·</span>
      <span>{{ capturadasHoje }} capturadas hoje</span>
    </div>
  </div>
</template>
