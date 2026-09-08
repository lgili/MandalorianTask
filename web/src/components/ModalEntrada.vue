<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import { Trash2 } from 'lucide-vue-next';
import { modaisAbertos } from '../lib/teclado';
import type { DayEntry, EntryKind } from '../lib/types';
import { cards } from '../lib/store';
import { GRAO_MIN, arredonda, minutosDoDia, utcDe, fmtDur } from '../lib/tempo';

const props = defineProps<{
  aberto: boolean;
  dia: string;
  /** Editando um bloco existente, ou null para criar. */
  entrada: DayEntry | null;
  /** Pré-preenchimento vindo de uma lacuna clicada. */
  sugestao: { de: number; ate: number } | null;
}>();

const emit = defineEmits<{
  salvar: [dados: { activity_id: number | null; started_at: string; ended_at: string;
                    kind: EntryKind; note: string | null }];
  excluir: [id: number];
  fechar: [];
}>();

const KINDS: Array<{ v: EntryKind; label: string }> = [
  { v: 'foco', label: 'Foco' },
  { v: 'reuniao', label: 'Reunião' },
  { v: 'admin', label: 'Admin' },
  { v: 'pausa', label: 'Pausa' },
];

const de = ref(540);
const ate = ref(600);
const kind = ref<EntryKind>('foco');
const activityId = ref<number | null>(null);
const nota = ref('');

// ESC no window: o overlay é um <div> sem tabindex, não recebe foco, e o
// keydown nunca chegaria nele por bubbling.
onKeyStroke('Escape', () => { if (props.aberto) emit('fechar'); });

// Enquanto um modal está aberto, atalho de tecla única não dispara.
watch(() => props.aberto, (v) => {
  modaisAbertos.value += v ? 1 : -1;
});

// Reabrir o modal sempre parte de um estado limpo — meio-preenchido de antes é bug.
watch(() => props.aberto, (v) => {
  if (!v) return;
  if (props.entrada) {
    de.value = minutosDoDia(props.entrada.started_at);
    ate.value = minutosDoDia(props.entrada.ended_at);
    kind.value = props.entrada.kind;
    activityId.value = props.entrada.activity_id;
    nota.value = props.entrada.note ?? '';
  } else {
    de.value = props.sugestao?.de ?? 540;
    ate.value = props.sugestao?.ate ?? (props.sugestao?.de ?? 540) + 60;
    kind.value = 'foco';
    activityId.value = cards.value.find((c) => c.status === 'fazendo')?.id ?? null;
    nota.value = '';
  }
});

const duracao = computed(() => ate.value - de.value);
const valido = computed(() => duracao.value >= GRAO_MIN);

/** input[type=time] fala 'HH:MM'; o resto do app fala minutos-do-dia. */
const hm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const paraMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return arredonda(h * 60 + m);
};

/**
 * Aplica o valor arredondado E reescreve o campo.
 * O binding é :value (unidirecional); se o snap cair no valor que o ref já
 * tinha (digitar 09:07 com de=540 volta 540), não há mudança reativa, o DOM
 * não é repintado, e o input mostra 09:07 enquanto o app salva 09:00.
 */
function ajusta(alvo: EventTarget | null, set: (m: number) => void, ler: () => number): void {
  const el = alvo as HTMLInputElement | null;
  if (!el) return;
  set(paraMin(el.value));
  el.value = hm(ler());
}

/**
 * Atividades escolhíveis. A atualmente vinculada entra SEMPRE, mesmo se já foi
 * concluída ou arquivada pela regra dos 14 dias — senão o select abre em branco
 * e salvar desfaz o vínculo sem avisar.
 */
const opcoes = computed(() => {
  const base = cards.value.filter((c) => c.status !== 'feito');
  const atual = cards.value.find((c) => c.id === activityId.value);
  return atual && !base.some((c) => c.id === atual.id) ? [atual, ...base] : base;
});

function salvar(): void {
  if (!valido.value) return;
  emit('salvar', {
    activity_id: activityId.value,
    started_at: utcDe(props.dia, arredonda(de.value)),
    ended_at: utcDe(props.dia, arredonda(ate.value)),
    kind: kind.value,
    note: nota.value.trim() || null,
  });
}
</script>

<template>
  <div v-if="aberto" class="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
       @click.self="emit('fechar')">
    <div class="painel w-full max-w-[440px] shadow-pop">
      <div class="flex items-center gap-3 border-b border-rule px-5 py-3">
        <h2 class="m-0 text-sm font-semibold">{{ entrada ? 'Editar bloco' : 'Novo bloco' }}</h2>
        <span class="ml-auto font-mono text-[11px] tabular-nums"
              :class="valido ? 'text-fg-subtle' : 'text-danger'">
          {{ valido ? fmtDur(duracao) : `mínimo ${GRAO_MIN} min` }}
        </span>
      </div>

      <div class="flex flex-col gap-3.5 p-5">
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="rotulo">Início</span>
            <input class="inp" type="time" :step="GRAO_MIN * 60"
                   :value="hm(de)" @change="ajusta($event.target, (m) => (de = m), () => de)">
          </label>
          <label class="flex flex-col gap-1">
            <span class="rotulo">Fim</span>
            <input class="inp" type="time" :step="GRAO_MIN * 60"
                   :value="hm(ate)" @change="ajusta($event.target, (m) => (ate = m), () => ate)">
          </label>
        </div>

        <div class="flex flex-col gap-1">
          <span class="rotulo">Tipo</span>
          <div class="flex overflow-hidden rounded-md border border-rule-strong">
            <button v-for="k in KINDS" :key="k.v" type="button"
              class="flex-1 border-r border-rule-strong px-2 py-1.5 text-xs last:border-r-0"
              :class="kind === k.v ? 'bg-foco text-on-accent font-medium' : 'text-fg-muted hover:bg-surface-2'"
              @click="kind = k.v">{{ k.label }}</button>
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="rotulo">Atividade</span>
          <select class="inp" v-model="activityId">
            <option :value="null">— sem atividade —</option>
            <option v-for="a in opcoes" :key="a.id" :value="a.id">
              {{ a.project_code ? `[${a.project_code}] ` : '' }}{{ a.title }}
            </option>
          </select>
          <span v-if="!opcoes.length" class="text-[11.5px] text-fg-subtle">
            Nenhuma atividade ainda — crie uma no Quadro.
          </span>
        </label>

        <label class="flex flex-col gap-1">
          <span class="rotulo">Nota</span>
          <input class="inp" v-model="nota" placeholder="opcional">
        </label>
      </div>

      <div class="flex items-center gap-2 border-t border-rule px-5 py-3">
        <button v-if="entrada" class="btn btn-sm !border-danger/40 !text-danger"
                @click="emit('excluir', entrada.id)">
          <Trash2 class="h-3.5 w-3.5" />Excluir
        </button>
        <div class="flex-1" />
        <button class="btn btn-sm" @click="emit('fechar')">Cancelar</button>
        <button class="btn btn-sm btn-pri" :disabled="!valido" @click="salvar">Salvar</button>
      </div>
    </div>
  </div>
</template>
