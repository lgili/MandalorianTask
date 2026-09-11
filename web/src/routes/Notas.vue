<script setup lang="ts">
// Notas: o vault de markdown.
//
// Os arquivos .md numa pasta são a VERDADE; o SQLite guarda só um índice
// reconstruível (notes + FTS5). O Obsidian de verdade abre o mesmo vault, e
// as notas continuam legíveis no dia em que este app morrer. (Decisão da v0.3,
// mantida.)
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { FolderOpen, FilePlus, Search, Trash2, X, Link2, FolderPlus } from 'lucide-vue-next';
import ArvoreNotas from '../components/ArvoreNotas.vue';
import ChipProjeto from '../components/ChipProjeto.vue';
import EditorMarkdown from '../components/EditorMarkdown.vue';
import type { NotaResumo, ResultadoBusca } from '../lib/types';
import * as api from '../lib/db';
import {
  apagaNota, criaNota, criaVaultPadrao, escolheVault, leNota, linksPara, notas, renomeiaNota,
  resolve, salvaNota, segueLink, sincronizando, vaultAberto,
} from '../lib/notas';
import { nomeArquivo } from '../lib/markdown';
import { emite, escuta } from '../lib/eventos';
import { toast } from '../lib/toast';
import { relativo } from '../lib/tempo';

const route = useRoute();
const router = useRouter();

const path = computed(() => (typeof route.query.n === 'string' ? route.query.n : null));
const atual = computed<NotaResumo | null>(() => notas.value.find((n) => n.path === path.value) ?? null);
const pasta = computed(() => (path.value?.includes('/') ? path.value.slice(0, path.value.lastIndexOf('/')) : ''));

const editor = ref<InstanceType<typeof EditorMarkdown> | null>(null);
const texto = ref('');
/**
 * Caminho cujo texto está em `texto` — o save nunca pode ir para a nota errada.
 * É ref porque é a `key` do editor: trocar de nota RECRIA o editor, senão o
 * Ctrl+Z de uma nota desfaria texto da anterior.
 */
const carregado = ref<string | null>(null);
const versao = ref(0);
const sujo = ref(false);
const salvando = ref(false);
const entrada = ref<NotaResumo[]>([]);

// ── abrir e salvar ────────────────────────────────────────────────────────

async function salvaAgora(): Promise<void> {
  if (!sujo.value || !carregado.value) return;
  const p = carregado.value;
  const t = texto.value;
  sujo.value = false;
  salvando.value = true;
  try {
    await salvaNota(p, t);
  } catch (e) {
    sujo.value = true;
    toast.erro(`Não salvou: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    salvando.value = false;
  }
}
/** 600 ms depois da última tecla: rápido o bastante para não perder nada. */
const salvaLogo = useDebounceFn(salvaAgora, 600);

function editou(t: string): void {
  texto.value = t;
  sujo.value = true;
  void salvaLogo();
}

async function abre(p: string | null): Promise<void> {
  await salvaAgora();   // a nota anterior sai salva, sempre
  carregado.value = null;
  entrada.value = [];
  if (!p) { texto.value = ''; return; }
  try {
    texto.value = await leNota(p);
    carregado.value = p;
    sujo.value = false;
    entrada.value = await linksPara(p);
    emite('nota:aberta', { path: p });
  } catch {
    toast.erro('Essa nota não existe mais.');
    router.replace({ query: {} });
  }
}

watch(path, (p) => { void abre(p); }, { immediate: true });

// Recarrega os "links para esta nota" quando qualquer nota muda.
watch(notas, async () => {
  versao.value++;
  if (carregado.value) entrada.value = await linksPara(carregado.value);
});

// Mudou no disco por fora (Obsidian, git): recarrega se não há edição pendente.
const paraDeEscutar = escuta('nota:externa', async ({ path: p }) => {
  if (p !== carregado.value || sujo.value) return;
  texto.value = await leNota(p);
});

onBeforeRouteLeave(async () => { await salvaAgora(); });
onBeforeUnmount(() => { paraDeEscutar(); void salvaAgora(); });

// ── links ─────────────────────────────────────────────────────────────────

const opcoes = () => notas.value.map((n) => ({
  alvo: nomeArquivo(n.path),
  pasta: n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : '',
}));
const existe = (alvo: string) => !!resolve(alvo);

async function abreLink(alvo: string): Promise<void> {
  await salvaAgora();
  const antes = notas.value.length;
  const p = await segueLink(alvo, pasta.value);
  if (notas.value.length > antes) toast.ok(`Nota ${nomeArquivo(p)} criada`);
  router.push({ query: { n: p } });
}

function abreTag(tag: string): void {
  busca.value = tag;
  campoBusca.value?.focus();
}

// ── título = nome do arquivo ──────────────────────────────────────────────

const titulo = ref('');
const campoTitulo = ref<HTMLInputElement | null>(null);
watch(path, (p) => { titulo.value = p ? nomeArquivo(p) : ''; }, { immediate: true });

async function renomeia(): Promise<void> {
  if (!carregado.value) return;
  const novoNome = titulo.value.trim();
  if (!novoNome || novoNome === nomeArquivo(carregado.value)) { titulo.value = nomeArquivo(carregado.value); return; }
  await salvaAgora();
  try {
    const qtdAntes = entrada.value.length;
    const novo = await renomeiaNota(carregado.value, novoNome);
    if (qtdAntes) toast.ok(`Renomeada — ${qtdAntes} ${qtdAntes === 1 ? 'link atualizado' : 'links atualizados'}`);
    router.replace({ query: { n: novo } });
  } catch (e) {
    toast.erro(e instanceof Error ? e.message : String(e));
    titulo.value = nomeArquivo(carregado.value);
  }
}

function tituloEnter(): void {
  campoTitulo.value?.blur();   // o blur chama renomeia
  editor.value?.foca();
}

// ── criar e apagar ────────────────────────────────────────────────────────

async function nova(emPasta = pasta.value): Promise<void> {
  await salvaAgora();
  const p = await criaNota('Sem título', { pasta: emPasta });
  await router.push({ query: { n: p } });
  await nextTick();
  campoTitulo.value?.focus();
  campoTitulo.value?.select();
}

const confirmandoApagar = ref(false);
async function apaga(): Promise<void> {
  if (!carregado.value) return;
  const p = carregado.value;
  sujo.value = false;
  carregado.value = null;
  confirmandoApagar.value = false;
  await apagaNota(p);
  toast.ok(`${nomeArquivo(p)} foi para a lixeira do vault (.trash)`);
  router.replace({ query: {} });
}
watch(path, () => { confirmandoApagar.value = false; });

// ── busca ─────────────────────────────────────────────────────────────────

const busca = ref('');
const campoBusca = ref<HTMLInputElement | null>(null);
const resultados = ref<ResultadoBusca[]>([]);
const buscaAgora = useDebounceFn(async (q: string) => {
  resultados.value = q.trim() ? await api.buscaNotas(q) : [];
}, 120);
watch(busca, (q) => { void buscaAgora(q); });

/** O snippet do FTS5 marca os termos com os caracteres de controle 2 e 3. */
const INI = String.fromCharCode(2);
const FIM = String.fromCharCode(3);

/** Trecho do FTS em pedaços, para destacar os termos achados. */
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

// ── vazio ─────────────────────────────────────────────────────────────────

const recentes = computed(() => notas.value.slice(0, 8));

async function abrePasta(): Promise<void> {
  if (await escolheVault()) toast.ok(`Vault aberto: ${notas.value.length} notas`);
}
async function criaPadrao(): Promise<void> {
  if (await criaVaultPadrao()) {
    toast.ok('Vault criado em Documentos/Bancada');
    const bv = notas.value[0];
    if (bv) router.push({ query: { n: bv.path } });
  }
}

onMounted(() => { if (!path.value) campoBusca.value?.focus(); });
</script>

<template>
  <!-- ── sem vault ── -->
  <div v-if="!vaultAberto" class="grid min-h-0 flex-1 place-items-center p-8">
    <div class="max-w-[460px] text-center">
      <h1 class="display m-0 text-[32px] leading-none">Notas</h1>
      <p class="mt-3 text-[14px] leading-relaxed text-fg-muted">
        Cada nota é um arquivo <code class="med rounded bg-surface-2 px-1 py-0.5 text-[12px]">.md</code>
        numa pasta sua. Se você usa o Obsidian, aponte para o mesmo vault — os dois apps
        leem e escrevem os mesmos arquivos.
      </p>
      <div class="mt-6 flex flex-col items-center gap-2">
        <button class="btn btn-accent" @click="abrePasta"><FolderOpen class="h-4 w-4" />Abrir uma pasta existente</button>
        <button class="btn btn-ghost" @click="criaPadrao"><FolderPlus class="h-4 w-4" />Criar vault novo em Documentos</button>
      </div>
    </div>
  </div>

  <div v-else class="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-[200px_minmax(0,1fr)]">
    <!-- ── coluna da esquerda: busca + árvore ── -->
    <aside class="flex min-h-0 flex-col border-r border-rule bg-surface-2/40">
      <div class="flex-none space-y-2 p-3">
        <div class="relative">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input ref="campoBusca" v-model="busca" class="inp !py-1.5 !pl-8 !text-[12px]"
            placeholder="buscar nas notas…" spellcheck="false" @keydown.esc="busca = ''">
          <button v-if="busca" class="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
            @click="busca = ''"><X class="h-3.5 w-3.5" /></button>
        </div>
        <button class="btn w-full justify-center !py-1.5" @click="nova()">
          <FilePlus class="h-3.5 w-3.5" />Nova nota
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <!-- resultados de busca -->
        <template v-if="busca.trim()">
          <p v-if="!resultados.length" class="px-2 py-4 text-[12px] text-fg-subtle">Nada com “{{ busca }}”.</p>
          <button v-for="r in resultados" :key="r.path" type="button"
            class="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-3/50"
            :class="r.path === path && 'bg-surface-3/80'"
            @click="router.push({ query: { n: r.path } })">
            <div class="truncate text-[12px] font-medium text-fg">{{ r.title }}</div>
            <div class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fg-subtle">
              <template v-for="(p, i) in pedacos(r.trecho)" :key="i">
                <mark v-if="p.realce" class="rounded-sm bg-accent/25 px-0.5 text-fg">{{ p.s }}</mark>
                <template v-else>{{ p.s }}</template>
              </template>
            </div>
          </button>
        </template>

        <ArvoreNotas v-else :notas="notas" :atual="path" @abre="(p) => router.push({ query: { n: p } })" />
      </div>

      <div class="flex-none truncate border-t border-rule px-3 py-1.5 font-mono text-[11px] text-fg-subtle"
        :title="vaultAberto">
        {{ sincronizando ? 'indexando…' : `${notas.length} notas` }} · {{ vaultAberto.split(/[\\/]/).pop() }}
      </div>
    </aside>

    <!-- ── nota aberta ── -->
    <section class="min-h-0 overflow-y-auto">
      <div v-if="path" class="mx-auto max-w-[760px] px-10 pb-[35vh] pt-8">
        <div class="mb-1 flex items-center gap-2 font-mono text-[11px] text-fg-subtle">
          <span class="truncate">{{ pasta || 'raiz' }}</span>
          <span class="ml-auto">{{ salvando ? 'salvando…' : sujo ? 'editando' : 'salvo' }}</span>
          <button class="rounded p-1 hover:bg-surface-3 hover:text-danger" title="Apagar nota"
            @click="confirmandoApagar = true"><Trash2 class="h-3.5 w-3.5" /></button>
        </div>

        <!-- título = nome do arquivo (inline title do Obsidian) -->
        <input ref="campoTitulo" v-model="titulo" spellcheck="false"
          class="w-full bg-transparent text-[32px] font-semibold leading-tight tracking-[-0.02em] text-fg outline-none
                 placeholder:text-fg-subtle"
          placeholder="Sem título"
          @blur="renomeia" @keydown.enter.prevent="tituloEnter" @keydown.esc="titulo = nomeArquivo(path!)">

        <div class="mb-6 mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
          <button v-if="atual?.project_id" class="hover:underline" @click="router.push(`/projeto/${atual.project_id}`)">
            <ChipProjeto variante="linha" :nome="atual.project_name" :cor="atual.project_color" />
          </button>
          <span v-for="t in atual?.tags ?? []" :key="t"
            class="cursor-pointer rounded-full bg-accent/10 px-2 py-px text-[11px] text-accent-ink hover:bg-accent/20"
            @click="abreTag(t)">#{{ t }}</span>
          <span v-if="atual" class="ml-auto font-mono text-[11px]">editada {{ relativo(new Date(atual.mtime).toISOString()) }}</span>
        </div>

        <div v-if="confirmandoApagar" class="painel mb-5 flex flex-wrap items-center gap-3 !border-danger/40 p-3 text-[12px]">
          <span>Mandar <b>{{ nomeArquivo(path) }}</b> para a lixeira do vault?
            <span v-if="entrada.length" class="text-warn">{{ entrada.length }} {{ entrada.length === 1 ? 'nota aponta' : 'notas apontam' }} para ela.</span>
          </span>
          <button class="btn btn-perigo ml-auto" @click="apaga">Apagar</button>
          <button class="btn" @click="confirmandoApagar = false">Cancelar</button>
        </div>

        <EditorMarkdown ref="editor" :key="carregado ?? 'vazio'" :model-value="texto"
          :opcoes="opcoes" :existe="existe" :versao-notas="versao"
          placeholder="Comece a escrever. [[ para linkar outra nota, # para tag."
          @update:model-value="editou" @abre-link="abreLink" @abre-tag="abreTag" />

        <!-- quem aponta para esta nota -->
        <div v-if="entrada.length" class="mt-10 border-t border-rule pt-4">
          <div class="rot mb-2 flex items-center gap-1.5"><Link2 class="h-3.5 w-3.5" />
            Links para esta nota · {{ entrada.length }}</div>
          <button v-for="n in entrada" :key="n.path" type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] transition-colors hover:bg-surface"
            @click="router.push({ query: { n: n.path } })">
            <ChipProjeto variante="ponto" :cor="n.project_color" />
            <span class="truncate">{{ n.title }}</span>
            <span class="ml-auto truncate font-mono text-[11px] text-fg-subtle">{{ n.path.split('/').slice(0, -1).join('/') }}</span>
          </button>
        </div>
      </div>

      <!-- nenhuma nota aberta: recentes -->
      <div v-else class="mx-auto max-w-[560px] px-10 pt-16">
        <h1 class="display m-0 text-[32px] leading-none">Notas</h1>
        <p class="mt-2 text-[14px] text-fg-muted">
          {{ notas.length }} {{ notas.length === 1 ? 'nota' : 'notas' }} no vault.
          Ctrl+K busca em tudo.
        </p>
        <div class="rot mb-2 mt-8">Editadas por último</div>
        <div class="painel">
          <button v-for="n in recentes" :key="n.path" class="linha w-full grid-cols-[12px_minmax(0,1fr)_auto] text-left"
            @click="router.push({ query: { n: n.path } })">
            <ChipProjeto variante="ponto" :cor="n.project_color" />
            <span class="truncate text-[14px]">{{ n.title }}</span>
            <span class="font-mono text-[11px] text-fg-subtle">{{ relativo(new Date(n.mtime).toISOString()) }}</span>
          </button>
          <p v-if="!recentes.length" class="px-4 py-6 text-center text-[12px] text-fg-subtle">Vault vazio.</p>
        </div>
        <button class="btn btn-accent mt-4" @click="nova('')"><FilePlus class="h-3.5 w-3.5" />Nova nota</button>
      </div>
    </section>
  </div>
</template>
