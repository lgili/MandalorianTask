<script setup lang="ts">
// O painel do seletor de projeto. Não tem input próprio: quem digita é o pai
// (a linha de captura, ou o campo de busca do popover). Assim o MESMO painel
// serve o token `#` da captura e o seletor do detalhe da tarefa.
//
// A regra que faz isto funcionar: a linha "criar" nunca vem pré-selecionada
// quando há resultados. Enter rápido não pode fabricar projeto.
import { computed, ref, watch } from 'vue';
import { Plus, Inbox } from 'lucide-vue-next';
import ChipProjeto from './ProjectChip.vue';
import type { Project } from '../lib/types';
import { podeCriar, ranqueia } from '../lib/projects';
import { projetos } from '../lib/store';

const props = withDefaults(defineProps<{
  consulta: string;
  permiteCriar?: boolean;
  /** Mostra "Caixa" (sem projeto) como primeira opção — para reatribuir. */
  incluirCaixa?: boolean;
}>(), { permiteCriar: true, incluirCaixa: false });

const emit = defineEmits<{ escolhe: [Project | null]; cria: [string] }>();

type Item =
  | { tipo: 'caixa' }
  | { tipo: 'projeto'; p: Project & { abertas?: number } }
  | { tipo: 'criar'; nome: string };

const achados = computed(() => ranqueia(props.consulta, projetos.value));

const itens = computed<Item[]>(() => {
  const out: Item[] = [];
  if (props.incluirCaixa && !props.consulta.trim()) out.push({ tipo: 'caixa' });
  for (const p of achados.value) out.push({ tipo: 'projeto', p });
  if (props.permiteCriar && podeCriar(props.consulta, projetos.value)) {
    out.push({ tipo: 'criar', nome: props.consulta.trim() });
  }
  return out;
});

const indice = ref(0);

/**
 * Onde o cursor pousa a cada nova consulta: no primeiro RESULTADO.
 * Só cai na linha de criar quando não há resultado nenhum — senão digitar
 * depressa e bater Enter criaria um projeto duplicado sem querer.
 */
watch(itens, (lista) => {
  const primeiro = lista.findIndex((i) => i.tipo !== 'criar');
  indice.value = primeiro >= 0 ? primeiro : 0;
}, { immediate: true });

function mover(delta: number): void {
  const n = itens.value.length;
  if (!n) return;
  indice.value = (indice.value + delta + n) % n;
}

function escolhe(i: number): void {
  const item = itens.value[i];
  if (!item) return;
  if (item.tipo === 'criar') emit('cria', item.nome);
  else if (item.tipo === 'caixa') emit('escolhe', null);
  else emit('escolhe', item.p);
}

const confirma = (): void => escolhe(indice.value);
const vazio = computed(() => itens.value.length === 0);

defineExpose({ mover, confirma, vazio });
</script>

<template>
  <div class="painel overflow-hidden shadow-pop">
    <div class="max-h-[264px] overflow-y-auto py-1">
      <p v-if="vazio" class="px-3 py-2.5 text-[12px] text-fg-subtle">
        Nenhum projeto com esse nome.
      </p>

      <template v-for="(it, i) in itens" :key="it.tipo === 'projeto' ? it.p.id : it.tipo">
        <div v-if="it.tipo === 'criar'" class="my-1 border-t border-rule" />

        <button type="button"
          class="flex h-8 w-full items-center gap-2.5 px-3 text-left transition-colors"
          :class="i === indice ? 'bg-surface-3' : 'hover:bg-surface-3/50'"
          @mouseenter="indice = i" @click="escolhe(i)">

          <template v-if="it.tipo === 'projeto'">
            <ChipProjeto variante="ponto" :cor="it.p.color" />
            <span class="med w-16 flex-none truncate text-[11px] text-fg-subtle">{{ it.p.code }}</span>
            <span class="min-w-0 flex-1 truncate text-[14px]">{{ it.p.name }}</span>
            <span v-if="it.p.abertas" class="med flex-none text-[11px] text-fg-subtle">{{ it.p.abertas }}</span>
          </template>

          <template v-else-if="it.tipo === 'caixa'">
            <Inbox class="h-3.5 w-3.5 flex-none text-fg-subtle" />
            <span class="min-w-0 flex-1 truncate text-[14px] text-fg-muted">Caixa — sem projeto</span>
          </template>

          <template v-else>
            <Plus class="h-3.5 w-3.5 flex-none text-accent-ink" />
            <span class="min-w-0 flex-1 truncate text-[14px]">
              Criar projeto <span class="font-medium text-accent-ink">{{ it.nome }}</span>
            </span>
          </template>
        </button>
      </template>
    </div>

    <div class="flex items-center gap-3 border-t border-rule bg-surface-2/60 px-3 py-1
                font-mono text-[11px] text-fg-subtle">
      <span>↑↓ navegar</span><span>⏎ escolher</span><span>esc texto puro</span>
    </div>
  </div>
</template>
