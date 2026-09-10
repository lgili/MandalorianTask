<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Trash2, ArrowRight } from 'lucide-vue-next';
import CapturaLinha from '../components/CapturaLinha.vue';
import ChipProjeto from '../components/ChipProjeto.vue';
import type { TaskCard } from '../lib/types';
import * as api from '../lib/db';
import { abreDetalhe, backlog, carregaQuadro, tarefas } from '../lib/store';
import { toast } from '../lib/toast';
import { dayKey, rotuloDia } from '../lib/tempo';

const captura = ref<InstanceType<typeof CapturaLinha> | null>(null);
/** Ids mandados para a fila nesta sessão de tela: continuam visíveis, carimbados. */
const enfileirados = ref<Set<number>>(new Set());

/**
 * Agrupa por CONTEXTO DE CAPTURA, não por hora.
 * Tudo que nasceu durante a mesma tarefa em curso vira um bloco — na prática,
 * "as 7 coisas que saíram da reunião de revisão". Ninguém digitou isso.
 */
interface Grupo { chave: string; rotulo: string; contexto: string | null; itens: TaskCard[] }

const grupos = computed<Grupo[]>(() => {
  const out = new Map<string, Grupo>();
  for (const t of backlog.value) {
    // A fronteira do dia é LOCAL: comparar a fatia UTC do ISO erra à noite.
    const d = dayKey(new Date(t.created_at));
    const chave = `${t.origem_id ?? 'solo'}|${d}`;
    if (!out.has(chave)) {
      out.set(chave, {
        chave,
        rotulo: d === dayKey() ? 'Hoje' : rotuloDia(d),
        contexto: t.origem_title,
        itens: [],
      });
    }
    out.get(chave)!.itens.push(t);
  }
  return [...out.values()];
});

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

const capturadasHoje = computed(() => tarefas.value
  .filter((t) => dayKey(new Date(t.created_at)) === dayKey()).length);

const prazoCurto = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

onMounted(() => captura.value?.foca());
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- ── campo de captura: fixo no topo, a lista cresce PARA BAIXO ──
         Campo embaixo estilo chat obrigaria a lista a rolar a cada item, e
         rolar durante reunião mata a captura. -->
    <div class="flex-none border-b border-rule bg-surface px-6 pb-2.5 pt-3">
      <div class="mx-auto max-w-[880px]">
        <CapturaLinha ref="captura" autofoco />
      </div>
    </div>

    <!-- ── lista ── -->
    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
      <div class="mx-auto max-w-[880px]">
      <p v-if="!grupos.length" class="mt-16 text-center text-[14px] text-fg-subtle">
        Nada capturado.<br>
        <span class="text-[12px]">Digite acima e aperte enter — durante a reunião, sem tirar o olho dela.</span>
      </p>

      <div v-for="g in grupos" :key="g.chave" class="mb-5">
        <div class="mb-1.5 flex items-baseline gap-2 border-b border-rule pb-1">
          <span class="rot">{{ g.rotulo }}</span>
          <span v-if="g.contexto" class="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <span class="text-fg-subtle/50">·</span> durante
            <span class="chip bg-reuniao/15 text-reuniao">{{ g.contexto }}</span>
          </span>
          <span class="med ml-auto text-[11px] text-fg-subtle">{{ g.itens.length }}</span>
        </div>

        <div v-for="t in g.itens" :key="t.id"
          class="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2.5 py-2
                 transition-colors hover:bg-surface"
          :class="enfileirados.has(t.id) && 'opacity-55'">
          <div class="flex min-w-0 items-baseline gap-2">
            <button class="truncate text-left text-[14px] leading-snug hover:text-accent-ink"
              @click="abreDetalhe(t.id)">{{ t.title }}</button>
            <span v-if="enfileirados.has(t.id)" class="med flex-none text-[11px] text-ok">→ fila</span>
          </div>

          <div class="flex flex-none items-center gap-2.5">
            <ChipProjeto v-if="t.project_id" :codigo="t.project_code" :nome="t.project_name"
              :cor="t.project_color" />
            <span v-if="t.kind === 'reuniao'" class="chip bg-reuniao/15 text-reuniao">reunião</span>
            <span v-if="t.due_at" class="med text-[11px] text-warn">{{ prazoCurto(t.due_at) }}</span>

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
    </div>

    <div class="flex flex-none items-center gap-3 border-t border-rule bg-surface px-6 py-1.5
                font-mono text-[11px] text-fg-subtle">
      <span>{{ backlog.length }} na captura</span>
      <span>·</span>
      <span>{{ capturadasHoje }} capturadas hoje</span>
    </div>
  </div>
</template>
