<script setup lang="ts">
// A paleta: um campo, tudo o que existe.
//
// Ctrl+K procura em notas, projetos e tarefas AO MESMO TEMPO — a pergunta
// "onde eu anotei aquilo do snubber?" não deveria exigir saber antes se
// "aquilo" virou nota, tarefa ou projeto. Ctrl+P (ou `>` no começo) troca
// para comandos: o que o app e os plugins sabem fazer.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { FileText, FolderKanban, CheckSquare, Terminal, Search } from 'lucide-vue-next';
import ChipProjeto from './ChipProjeto.vue';
import type { ResultadoBusca } from '../lib/types';
import * as api from '../lib/db';
import { abreDetalhe, paleta, projetos, tarefas } from '../lib/store';
import { notas } from '../lib/notas';
import { ranqueia } from '../lib/projetos';
import { comandos, executaComando } from '../lib/comandos';
import { modaisAbertos } from '../lib/teclado';
import { toast } from '../lib/toast';

const router = useRouter();
const campo = ref<HTMLInputElement | null>(null);
const q = ref(paleta.value === 'comandos' ? '> ' : '');
const indice = ref(0);
const achadas = ref<ResultadoBusca[]>([]);

const emComandos = computed(() => q.value.trimStart().startsWith('>'));
const termo = computed(() => (emComandos.value ? q.value.trimStart().slice(1) : q.value).trim());

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Todas as palavras da busca aparecem no texto, em qualquer ordem. */
const casa = (texto: string, t: string) => norm(t).split(/\s+/).filter(Boolean).every((w) => norm(texto).includes(w));

const buscaNotas = useDebounceFn(async (t: string) => {
  achadas.value = t ? await api.buscaNotas(t, 8) : [];
}, 90);
watch(termo, (t) => { if (!emComandos.value) void buscaNotas(t); }, { immediate: true });

type Item =
  | { tipo: 'nota'; chave: string; titulo: string; detalhe: string; cor: string | null; trecho?: string; path: string }
  | { tipo: 'projeto'; chave: string; titulo: string; detalhe: string; cor: string | null; id: number }
  | { tipo: 'tarefa'; chave: string; titulo: string; detalhe: string; cor: string | null; id: number }
  | { tipo: 'comando'; chave: string; titulo: string; detalhe: string; cor: null; id: string };

const itens = computed<Item[]>(() => {
  if (emComandos.value) {
    return comandos.value
      .filter((c) => !termo.value || casa(c.nome, termo.value))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((c) => ({ tipo: 'comando', chave: `c:${c.id}`, titulo: c.nome,
        detalhe: c.dono === 'bancada' ? (c.tecla ?? '') : c.dono, cor: null, id: c.id }));
  }

  const t = termo.value;
  const out: Item[] = [];

  // notas: com termo, o FTS; sem termo, as editadas por último
  const fonteNotas = t
    ? achadas.value.map((r) => ({ r, n: notas.value.find((n) => n.path === r.path) }))
    : notas.value.slice(0, 5).map((n) => ({ r: null, n }));
  for (const { r, n } of fonteNotas) {
    const path = r?.path ?? n!.path;
    out.push({ tipo: 'nota', chave: `n:${path}`, titulo: r?.title ?? n!.title,
      detalhe: path.split('/').slice(0, -1).join('/'), cor: n?.project_color ?? null,
      trecho: r?.trecho, path });
  }

  for (const p of (t ? ranqueia(t, projetos.value) : projetos.value).slice(0, t ? 5 : 3)) {
    out.push({ tipo: 'projeto', chave: `p:${p.id}`, titulo: p.name,
      detalhe: `${p.abertas} abertas`, cor: p.color, id: p.id });
  }

  const vivas = tarefas.value.filter((x) => x.status !== 'feito');
  const fonteTarefas = t ? tarefas.value.filter((x) => casa(x.title, t)) : vivas.filter((x) => x.status !== 'backlog');
  for (const x of fonteTarefas.slice(0, t ? 6 : 4)) {
    out.push({ tipo: 'tarefa', chave: `t:${x.id}`, titulo: x.title,
      detalhe: ({ backlog: 'captura', fila: 'fila', fazendo: 'fazendo', feito: 'feita' } as const)[x.status],
      cor: x.project_color, id: x.id });
  }
  return out;
});

watch(itens, () => { indice.value = 0; });

const GRUPO = { nota: 'Notas', projeto: 'Projetos', tarefa: 'Tarefas', comando: 'Comandos' } as const;
const ICONE = { nota: FileText, projeto: FolderKanban, tarefa: CheckSquare, comando: Terminal } as const;

function fecha(): void { paleta.value = null; }

async function escolhe(it: Item | undefined): Promise<void> {
  if (!it) return;
  fecha();
  if (it.tipo === 'nota') router.push({ name: 'notas', query: { n: it.path } });
  else if (it.tipo === 'projeto') router.push(`/projeto/${it.id}`);
  else if (it.tipo === 'tarefa') abreDetalhe(it.id);
  else {
    try { await executaComando(it.id); } catch (e) { toast.erro(`O comando falhou: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

function tecla(e: KeyboardEvent): void {
  const n = itens.value.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (n) indice.value = (indice.value + 1) % n; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) indice.value = (indice.value - 1 + n) % n; }
  else if (e.key === 'Enter') { e.preventDefault(); void escolhe(itens.value[indice.value]); }
  else if (e.key === 'Escape') { e.preventDefault(); fecha(); }
}

/** Trecho do FTS: os termos vêm entre os caracteres de controle 2 e 3. */
const INI = String.fromCharCode(2);
const FIM = String.fromCharCode(3);
function pedacos(t: string): Array<{ s: string; realce: boolean }> {
  const out: Array<{ s: string; realce: boolean }> = [];
  let i = 0;
  while (i < t.length) {
    const a = t.indexOf(INI, i);
    if (a < 0) { out.push({ s: t.slice(i), realce: false }); break; }
    if (a > i) out.push({ s: t.slice(i, a), realce: false });
    const b = t.indexOf(FIM, a + 1);
    if (b < 0) { out.push({ s: t.slice(a + 1), realce: false }); break; }
    out.push({ s: t.slice(a + 1, b), realce: true });
    i = b + 1;
  }
  return out;
}

onMounted(async () => {
  modaisAbertos.value++;
  await nextTick();
  campo.value?.focus();
  if (emComandos.value) campo.value?.setSelectionRange(q.value.length, q.value.length);
});
onBeforeUnmount(() => { modaisAbertos.value = Math.max(0, modaisAbertos.value - 1); });
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[14vh]" @click.self="fecha">
    <div class="painel w-[640px] max-w-[92vw] overflow-hidden shadow-pop">
      <div class="flex items-center gap-2.5 border-b border-rule px-4">
        <Terminal v-if="emComandos" class="h-4 w-4 flex-none text-accent-ink" />
        <Search v-else class="h-4 w-4 flex-none text-fg-subtle" />
        <input ref="campo" v-model="q" spellcheck="false" autocomplete="off"
          class="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-0"
          :placeholder="emComandos ? 'o que fazer…' : 'buscar em notas, projetos e tarefas…'"
          @keydown="tecla">
        <span class="med flex-none text-[11px] text-fg-subtle">{{ emComandos ? 'comandos' : '> para comandos' }}</span>
      </div>

      <div class="max-h-[52vh] overflow-y-auto py-1">
        <p v-if="!itens.length" class="px-4 py-6 text-center text-[14px] text-fg-subtle">
          {{ emComandos ? 'Nenhum comando com esse nome.' : `Nada com “${termo}”.` }}
        </p>

        <template v-for="(it, i) in itens" :key="it.chave">
          <div v-if="i === 0 || itens[i - 1].tipo !== it.tipo"
            class="rot px-4 pb-1 pt-3 !text-[11px]">{{ GRUPO[it.tipo] }}</div>
          <button type="button"
            class="flex w-full items-start gap-3 px-4 py-2 text-left transition-colors"
            :class="i === indice ? 'bg-surface-3' : 'hover:bg-surface-3/50'"
            @mouseenter="indice = i" @click="escolhe(it)">
            <span class="mt-[3px] flex h-4 w-4 flex-none items-center justify-center">
              <ChipProjeto v-if="it.cor" variante="ponto" :cor="it.cor" />
              <component :is="ICONE[it.tipo]" v-else class="h-3.5 w-3.5 text-fg-subtle" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] text-fg">{{ it.titulo }}</span>
              <span v-if="it.tipo === 'nota' && it.trecho" class="mt-0.5 block truncate text-[12px] text-fg-subtle">
                <template v-for="(p, k) in pedacos(it.trecho)" :key="k">
                  <mark v-if="p.realce" class="rounded-sm bg-accent/25 px-0.5 text-fg">{{ p.s }}</mark>
                  <template v-else>{{ p.s }}</template>
                </template>
              </span>
            </span>
            <span class="med mt-[3px] flex-none truncate text-[11px] text-fg-subtle">{{ it.detalhe }}</span>
          </button>
        </template>
      </div>

      <div class="flex items-center gap-3 border-t border-rule bg-surface-2/60 px-4 py-1.5 font-mono text-[11px] text-fg-subtle">
        <span>↑↓ navegar</span><span>⏎ abrir</span><span>esc fechar</span>
        <span class="ml-auto">ctrl+k busca · ctrl+p comandos</span>
      </div>
    </div>
  </div>
</template>
