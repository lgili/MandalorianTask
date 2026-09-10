<script setup lang="ts">
// A ÚNICA forma de criar tarefa no app.
//
// Antes eram quatro: o botão da topbar (que só navegava), a linha do Backlog
// (a única com tokens), o campo do Quadro (sem tokens, criava órfã) e um
// wrapper morto no store. Mesma aparência, gramáticas diferentes.
//
// Aqui `#` deixa de ser adivinhação: abre a lista, e o projeto vira um pill
// dentro do campo. Enter com a lista aberta ESCOLHE; Enter com ela fechada
// GRAVA. Um Enter servindo para duas coisas é o bug clássico desta tela.
import { computed, nextTick, ref, watch } from 'vue';
import { CornerDownLeft, X } from 'lucide-vue-next';
import ChipProjeto from './ChipProjeto.vue';
import ListaProjetos from './ListaProjetos.vue';
import type { Project, TaskStatus } from '../lib/types';
import { analisa } from '../lib/captura';
import * as api from '../lib/db';
import { criaProjeto, projetoDe, projetos, recarregaTudo } from '../lib/store';
import { toast } from '../lib/toast';

const props = withDefaults(defineProps<{
  /** Estar na tela do projeto JÁ é a atribuição — não se digita `#` ali. */
  projetoFixo?: number | null;
  /** Onde a tarefa nasce. O Quadro cria direto na fila; o resto, no backlog. */
  statusInicial?: TaskStatus;
  autofoco?: boolean;
  placeholder?: string;
  /** Dicas de token embaixo do campo. Some no quick-add, que é mais enxuto. */
  dicas?: boolean;
}>(), {
  projetoFixo: null, statusInicial: 'backlog', autofoco: false, dicas: true,
  placeholder: 'o que precisa ser feito…',
});

const emit = defineEmits<{ criada: [number] }>();

const campo = ref<HTMLInputElement | null>(null);
const lista = ref<InstanceType<typeof ListaProjetos> | null>(null);
const linha = ref('');
const escolhido = ref<Project | null>(null);
/** Posição do `#` que abriu a lista. null = lista fechada. */
const tokenIni = ref<number | null>(null);
const consulta = ref('');

const fixo = computed(() => projetoDe(props.projetoFixo ?? null) ?? null);
/** O que vai valer ao gravar: escolhido > digitado > o da tela. */
const previa = computed(() => analisa(linha.value, projetos.value));
const projetoFinal = computed(() => escolhido.value ?? previa.value.projeto ?? fixo.value);
const aberta = computed(() => tokenIni.value !== null);

/** Acha o `#` que o caret está editando. Só abre em início de palavra. */
function detecta(): void {
  const el = campo.value;
  if (!el) return;
  const caret = el.selectionStart ?? 0;
  const antes = linha.value.slice(0, caret);
  const h = antes.lastIndexOf('#');
  if (h < 0 || (h > 0 && !/\s/.test(antes[h - 1]))) { tokenIni.value = null; return; }
  const q = antes.slice(h + 1);
  // duas palavras sem escolher nada: quem está digitando texto, não buscando
  if (q.length > 40 || /\s\s/.test(q)) { tokenIni.value = null; return; }
  tokenIni.value = h;
  consulta.value = q;
}

watch(linha, () => nextTick(detecta));

/** Escolher tira o `#texto` do campo: o vínculo passa a viver no pill. */
function fixaProjeto(p: Project | null): void {
  escolhido.value = p;
  const ini = tokenIni.value;
  tokenIni.value = null;
  if (ini == null || !campo.value) return;
  const el = campo.value;
  const caret = el.selectionStart ?? 0;
  linha.value = (linha.value.slice(0, ini) + linha.value.slice(caret)).replace(/\s{2,}/g, ' ');
  nextTick(() => { el.focus(); el.setSelectionRange(ini, ini); });
}

async function criaEFixa(nome: string): Promise<void> {
  const p = await criaProjeto(nome);
  if (p) { fixaProjeto(p); toast.ok(`Projeto ${p.name} criado`); }
}

async function registra(paraFila: boolean): Promise<void> {
  const a = analisa(linha.value, projetos.value);
  if (!a.titulo) { linha.value = ''; return; }   // linha vazia não é erro, é nada
  const destino: TaskStatus = paraFila ? 'fila' : props.statusInicial;
  try {
    const id = await api.capturaTarefa(a.titulo, projetoFinal.value?.id ?? null, a.kind, a.prazo);
    if (destino !== 'backlog') await api.moveTask(id, destino);
    linha.value = '';
    escolhido.value = null;
    tokenIni.value = null;
    await recarregaTudo();
    emit('criada', id);
    // O cursor não pode andar: a próxima tarefa vem logo atrás.
    await nextTick();
    campo.value?.focus();
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

function tecla(e: KeyboardEvent): void {
  if (aberta.value) {
    if (e.key === 'ArrowDown') { e.preventDefault(); lista.value?.mover(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); lista.value?.mover(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); lista.value?.confirma(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tokenIni.value = null; return; }
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    registra(e.ctrlKey || e.metaKey);
  }
}

defineExpose({ foca: () => campo.value?.focus() });
</script>

<template>
  <div class="relative">
    <div class="inp flex items-center gap-2 !py-1.5 focus-within:border-accent/70 focus-within:ring-2
                focus-within:ring-accent/20">
      <CornerDownLeft class="h-3.5 w-3.5 flex-none text-fg-subtle" />

      <!-- projeto da tela: contexto, não escolha -->
      <ChipProjeto v-if="fixo && !escolhido" :codigo="fixo.code" :nome="fixo.name" :cor="fixo.color" />

      <!-- projeto escolhido nesta linha: removível -->
      <span v-else-if="escolhido" class="inline-flex flex-none items-center gap-1">
        <ChipProjeto :codigo="escolhido.code" :nome="escolhido.name" :cor="escolhido.color" />
        <button type="button" class="text-fg-subtle hover:text-fg" title="Tirar o projeto"
          @click="escolhido = null; campo?.focus()"><X class="h-3 w-3" /></button>
      </span>

      <input ref="campo" v-model="linha" :autofocus="autofoco" spellcheck="false" autocomplete="off"
        class="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
        :placeholder="placeholder"
        @keydown="tecla" @click="detecta" @keyup="detecta"
        @blur="tokenIni = null">

      <span v-if="previa.prazo" class="chip flex-none bg-warn/15 text-warn">
        {{ new Date(previa.prazo).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }}
      </span>
      <span v-if="previa.kind !== 'trabalho'" class="chip flex-none"
        :class="previa.kind === 'reuniao' ? 'bg-reuniao/15 text-reuniao' : 'bg-surface-3 text-fg-muted'">
        {{ previa.kind === 'reuniao' ? 'reunião' : 'admin' }}
      </span>
    </div>

    <!-- a lista do `#`: ancorada no campo, não no caret -->
    <div v-if="aberta" class="absolute left-0 top-[calc(100%+6px)] z-50 w-[320px]"
         @mousedown.prevent>
      <ListaProjetos ref="lista" :consulta="consulta" @escolhe="fixaProjeto" @cria="criaEFixa" />
    </div>

    <div v-if="dicas" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
      <span><b class="font-semibold text-fg-muted">enter</b> registra</span>
      <span><b class="font-semibold text-fg-muted">ctrl+enter</b> vai pra fila</span>
      <span><b class="font-semibold text-fg-muted">#</b> projeto</span>
      <span><b class="font-semibold text-fg-muted">!</b> prazo</span>
      <span><b class="font-semibold text-fg-muted">@</b> reunião · admin</span>
    </div>
  </div>
</template>
