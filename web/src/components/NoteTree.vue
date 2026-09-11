<script setup lang="ts">
// A árvore de pastas do vault, a partir do índice — não do disco. Ler o
// índice é uma query; ler o disco seriam centenas de chamadas.
import { computed, ref } from 'vue';
import { ChevronRight, FileText } from 'lucide-vue-next';
import ChipProjeto from './ProjectChip.vue';
import type { NotaResumo } from '../lib/types';
import { nomeArquivo } from '../lib/markdown';

const props = defineProps<{ notas: NotaResumo[]; atual: string | null }>();
const emit = defineEmits<{ abre: [path: string] }>();

interface Pasta { nome: string; caminho: string; pastas: Pasta[]; notas: NotaResumo[] }

const arvore = computed<Pasta>(() => {
  const raiz: Pasta = { nome: '', caminho: '', pastas: [], notas: [] };
  for (const n of props.notas) {
    const partes = n.path.split('/');
    let aqui = raiz;
    for (const seg of partes.slice(0, -1)) {
      const caminho = aqui.caminho ? `${aqui.caminho}/${seg}` : seg;
      let p = aqui.pastas.find((x) => x.nome === seg);
      if (!p) { p = { nome: seg, caminho, pastas: [], notas: [] }; aqui.pastas.push(p); }
      aqui = p;
    }
    aqui.notas.push(n);
  }
  const ordena = (p: Pasta) => {
    p.pastas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    p.notas.sort((a, b) => nomeArquivo(a.path).localeCompare(nomeArquivo(b.path), 'pt-BR'));
    p.pastas.forEach(ordena);
  };
  ordena(raiz);
  return raiz;
});

/** Pastas FECHADAS (e não abertas): pasta nova aparece aberta por padrão. */
function lembradas(): string[] {
  try { return JSON.parse(localStorage.getItem('bancada-pastas-fechadas') ?? '[]'); } catch { return []; }
}
const fechadas = ref<Set<string>>(new Set(lembradas()));
function alterna(caminho: string): void {
  const s = new Set(fechadas.value);
  if (s.has(caminho)) s.delete(caminho); else s.add(caminho);
  fechadas.value = s;
  try { localStorage.setItem('bancada-pastas-fechadas', JSON.stringify([...s])); } catch { /* sem storage, sem memória */ }
}

/** A pasta da nota aberta nunca fica escondida. */
const doAtual = computed(() => {
  const s = new Set<string>();
  if (!props.atual) return s;
  const partes = props.atual.split('/').slice(0, -1);
  partes.forEach((_, i) => s.add(partes.slice(0, i + 1).join('/')));
  return s;
});
const aberta = (c: string) => doAtual.value.has(c) || !fechadas.value.has(c);

/** Lista achatada com profundidade: renderizar recursivo em Vue custa um componente por nível. */
const linhas = computed(() => {
  const out: Array<{ tipo: 'pasta'; p: Pasta; nivel: number } | { tipo: 'nota'; n: NotaResumo; nivel: number }> = [];
  const desce = (p: Pasta, nivel: number) => {
    for (const f of p.pastas) {
      out.push({ tipo: 'pasta', p: f, nivel });
      if (aberta(f.caminho)) desce(f, nivel + 1);
    }
    for (const n of p.notas) out.push({ tipo: 'nota', n, nivel });
  };
  desce(arvore.value, 0);
  return out;
});
</script>

<template>
  <div class="py-1">
    <template v-for="l in linhas" :key="l.tipo === 'pasta' ? `p:${l.p.caminho}` : l.n.path">
      <button v-if="l.tipo === 'pasta'" type="button"
        class="flex w-full items-center gap-1 rounded-md py-[3px] pr-2 text-left text-[12px] font-medium text-fg-muted
               transition-colors hover:bg-surface-3/50 hover:text-fg"
        :style="{ paddingLeft: `${8 + l.nivel * 12}px` }"
        @click="alterna(l.p.caminho)">
        <ChevronRight class="h-3 w-3 flex-none transition-transform" :class="aberta(l.p.caminho) && 'rotate-90'" />
        <span class="truncate">{{ l.p.nome }}</span>
      </button>

      <button v-else type="button"
        class="flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12px] transition-colors"
        :class="l.n.path === atual ? 'bg-surface-3/80 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg'"
        :style="{ paddingLeft: `${20 + l.nivel * 12}px` }"
        :title="l.n.path"
        @click="emit('abre', l.n.path)">
        <ChipProjeto v-if="l.n.project_id" variante="ponto" :cor="l.n.project_color" />
        <FileText v-else class="h-3 w-3 flex-none opacity-50" />
        <span class="truncate">{{ nomeArquivo(l.n.path) }}</span>
      </button>
    </template>
  </div>
</template>
