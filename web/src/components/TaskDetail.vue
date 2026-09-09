<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import { X, Play, Pause, Check, Trash2, Clock } from 'lucide-vue-next';
import type { Outcome, Session, TaskCard, Transition } from '../lib/types';
import { KINDS, OUTCOMES } from '../lib/types';
import * as api from '../lib/db';
import { abreDetalhe, carregaQuadro, conclui, detalheId, move, pausa, projetos, rodando, tarefas } from '../lib/store';
import { toast } from '../lib/toast';
import { modaisAbertos } from '../lib/teclado';
import { duracaoMin, fmtDur, fmtHM, hhmm, relativo } from '../lib/tempo';
import { agora, decorrido } from '../lib/relogio';

const tarefa = computed<TaskCard | null>(() => tarefas.value.find((t) => t.id === detalheId.value) ?? null);
const sessoes = ref<Session[]>([]);
const trans = ref<Transition[]>([]);
const titulo = ref('');
const notas = ref('');
const concluindo = ref(false);
const outcome = ref<Outcome>('entregue');
const outcomeNota = ref('');

const rodandoEsta = computed(() => rodando.value?.task_id === tarefa.value?.id);
const relogio = computed(() => rodandoEsta.value ? decorrido(rodando.value!.started_at, agora.value) : null);

watch(tarefa, async (t) => {
  modaisAbertos.value = t ? 1 : 0;
  concluindo.value = false;
  if (!t) return;
  titulo.value = t.title; notas.value = t.notes ?? '';
  [sessoes.value, trans.value] = await Promise.all([api.sessoesDaTarefa(t.id), api.transicoes(t.id)]);
}, { immediate: true });

onKeyStroke('Escape', () => { if (tarefa.value) abreDetalhe(null); });

async function salva(patch: Parameters<typeof api.updateTask>[1]): Promise<void> {
  if (!tarefa.value) return;
  try { await api.updateTask(tarefa.value.id, patch); await carregaQuadro(); }
  catch (e) { toast.erro(api.dbErro(e)); }
}
async function apaga(): Promise<void> {
  if (!tarefa.value) return;
  try { await api.deleteTask(tarefa.value.id); abreDetalhe(null); await carregaQuadro(); }
  catch (e) { toast.erro(api.dbErro(e)); }
}
async function confirmaConclusao(): Promise<void> {
  if (!tarefa.value) return;
  await conclui(tarefa.value.id, outcome.value, outcomeNota.value.trim() || null);
  concluindo.value = false;
}

const STATUS_LABEL = { backlog: 'Backlog', fila: 'Fila', fazendo: 'Fazendo', feito: 'Feito' } as const;
const total = computed(() => sessoes.value.reduce((s, x) => s + (x.ended_at ? duracaoMin(x.started_at, x.ended_at) : 0), 0));
const dataPrazo = computed({
  get: () => tarefa.value?.due_at ? tarefa.value.due_at.slice(0, 10) : '',
  set: (v: string) => salva({ due_at: v ? new Date(`${v}T12:00:00`).toISOString() : null }),
});
</script>

<template>
  <Transition name="drawer">
    <div v-if="tarefa" class="fixed inset-0 z-40 flex justify-end bg-black/50" @click.self="abreDetalhe(null)">
      <aside class="flex h-full w-[560px] max-w-[92vw] flex-col border-l border-rule bg-surface-2 shadow-pop">
        <!-- cabeçalho -->
        <div class="flex items-start gap-3 border-b border-rule px-6 pb-4 pt-5">
          <div class="min-w-0 flex-1">
            <div class="mb-2 flex items-center gap-2">
              <span class="chip bg-surface-3 text-fg-muted">{{ STATUS_LABEL[tarefa.status] }}</span>
              <span v-if="tarefa.project_code" class="chip"
                :style="tarefa.project_color ? { background: `rgb(var(--${tarefa.project_color}) / .15)`, color: `rgb(var(--${tarefa.project_color}))` } : undefined">
                {{ tarefa.project_code }}</span>
              <span v-if="rodandoEsta" class="chip bg-vivo/15 text-vivo-ink">● rodando {{ relogio }}</span>
            </div>
            <input v-model="titulo" @change="salva({ title: titulo.trim() || tarefa.title })"
              class="display w-full bg-transparent text-[24px] leading-tight text-fg outline-none focus:text-fg" />
            <div v-if="tarefa.origem_title" class="mt-1 text-[12px] text-fg-subtle">
              capturada durante <span class="text-reuniao">{{ tarefa.origem_title }}</span>
            </div>
          </div>
          <button class="btn btn-ghost !p-1.5" @click="abreDetalhe(null)"><X class="h-4 w-4" /></button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <!-- ações -->
          <div class="mb-5 flex flex-wrap items-center gap-2">
            <button v-if="rodandoEsta" class="btn" @click="pausa()"><Pause class="h-3.5 w-3.5" />Pausar</button>
            <button v-else-if="tarefa.status !== 'feito'" class="btn btn-accent" @click="move(tarefa.id, 'fazendo')">
              <Play class="h-3.5 w-3.5" />Começar agora</button>
            <button v-if="tarefa.status === 'backlog'" class="btn" @click="move(tarefa.id, 'fila')">→ Fila</button>
            <button v-if="tarefa.status !== 'feito'" class="btn" @click="concluindo = !concluindo">
              <Check class="h-3.5 w-3.5" />Concluir</button>
            <button v-else class="btn" @click="move(tarefa.id, 'fila')">Reabrir</button>
            <span class="med ml-auto text-[13px] font-semibold text-fg-muted">{{ fmtHM(total) }} no total</span>
          </div>

          <!-- concluir com desfecho -->
          <div v-if="concluindo" class="painel mb-5 p-4">
            <div class="rot mb-2">Como terminou?</div>
            <div class="mb-3 grid grid-cols-2 gap-2">
              <button v-for="o in OUTCOMES" :key="o.id" @click="outcome = o.id"
                class="rounded-lg border px-3 py-2 text-left transition"
                :class="outcome === o.id ? 'border-accent bg-accent/10' : 'border-rule hover:border-rule-strong'">
                <div class="text-[13px] font-medium">{{ o.label }}</div>
                <div class="text-[11px] text-fg-subtle">{{ o.desc }}</div>
              </button>
            </div>
            <input v-model="outcomeNota" class="inp mb-3" placeholder="uma linha sobre o porquê (opcional)"
                   @keydown.enter="confirmaConclusao">
            <div class="flex gap-2">
              <button class="btn btn-accent" @click="confirmaConclusao">Concluir</button>
              <button class="btn" @click="concluindo = false">Cancelar</button>
            </div>
          </div>
          <div v-else-if="tarefa.outcome" class="mb-5 rounded-lg border border-rule bg-surface px-3 py-2 text-[12.5px]">
            <span class="chip bg-ok/15 text-ok mr-2">{{ OUTCOMES.find((o) => o.id === tarefa!.outcome)?.label }}</span>
            <span class="text-fg-muted">{{ tarefa.outcome_note }}</span>
          </div>

          <!-- campos -->
          <div class="mb-5 grid grid-cols-2 gap-3">
            <label><span class="rot mb-1 block">Projeto</span>
              <select class="inp" :value="tarefa.project_id ?? ''"
                @change="salva({ project_id: ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null })">
                <option value="">— sem projeto —</option>
                <option v-for="p in projetos" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select></label>
            <label><span class="rot mb-1 block">Tipo</span>
              <select class="inp" :value="tarefa.kind" @change="salva({ kind: ($event.target as HTMLSelectElement).value as any })">
                <option v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
              </select></label>
            <label><span class="rot mb-1 block">Prazo</span>
              <input type="date" class="inp med" v-model="dataPrazo"></label>
            <div><span class="rot mb-1 block">Capturada</span>
              <div class="med px-1 py-2 text-[12.5px] text-fg-muted">{{ relativo(tarefa.created_at) }}</div></div>
          </div>
          <label class="mb-5 block"><span class="rot mb-1 block">Notas</span>
            <textarea v-model="notas" rows="3" class="inp resize-y" placeholder="contexto, links, decisões…"
              @change="salva({ notes: notas.trim() || null })"></textarea></label>

          <!-- sessões -->
          <div class="rot mb-2">Sessões · {{ sessoes.length }}</div>
          <div class="painel mb-5">
            <p v-if="!sessoes.length" class="px-3 py-3 text-[12px] text-fg-subtle">Nenhuma ainda.</p>
            <div v-for="s in sessoes" :key="s.id" class="linha grid-cols-[auto_1fr_auto] !py-2">
              <span class="med text-[11px] text-fg-subtle">{{ s.started_at.slice(5, 10).split('-').reverse().join('/') }}</span>
              <span class="med text-[12px] text-fg-muted">{{ hhmm(s.started_at) }}–{{ s.ended_at ? hhmm(s.ended_at) : '…' }}
                <span v-if="s.source === 'manual'" class="rot ml-2 !text-[9px]">manual</span></span>
              <span class="med text-[12.5px] font-semibold" :class="s.ended_at ? 'text-fg' : 'text-vivo-ink'">
                {{ s.ended_at ? fmtDur(duracaoMin(s.started_at, s.ended_at)) : decorrido(s.started_at, agora) }}</span>
            </div>
          </div>

          <!-- linha do tempo -->
          <div class="rot mb-2">Linha do tempo</div>
          <ol class="relative ml-1.5 border-l border-rule pl-4">
            <li v-for="t in trans" :key="t.id" class="relative mb-3 text-[12.5px]">
              <span class="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full"
                :class="t.para === 'feito' ? 'bg-accent' : t.para === 'fazendo' ? 'bg-trabalho' : 'bg-surface-3'" />
              <span class="text-fg">{{ t.de ? `${STATUS_LABEL[t.de]} → ` : '' }}{{ STATUS_LABEL[t.para] }}</span>
              <span class="med ml-2 text-[11px] text-fg-subtle">{{ relativo(t.at) }}</span>
            </li>
          </ol>
        </div>

        <div class="flex items-center border-t border-rule px-6 py-3">
          <button class="btn btn-ghost !text-danger" @click="apaga"><Trash2 class="h-3.5 w-3.5" />Excluir</button>
          <span class="med ml-auto text-[11px] text-fg-subtle"><Clock class="mr-1 inline h-3 w-3" />esc fecha</span>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active, .drawer-leave-active { transition: opacity .15s ease; }
.drawer-enter-active aside, .drawer-leave-active aside { transition: transform .18s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from aside, .drawer-leave-to aside { transform: translateX(24px); }
</style>
