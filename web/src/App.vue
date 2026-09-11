<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { Square, AlertTriangle, Plus, Settings, Puzzle } from 'lucide-vue-next';
import ToastHost from './components/ToastHost.vue';
import TaskDetail from './components/TaskDetail.vue';
import QuickAdd from './components/QuickAdd.vue';
import Paleta from './components/Paleta.vue';
import ChipProjeto from './components/ChipProjeto.vue';
import {
  abreDetalhe, abreQuickAdd, arrastando, carregaProjetos, carregaQuadro, carregaDia,
  criaProjeto, paleta, projetos, quickAdd, rodando, pausa, soltaEmProjeto, tarefas, sessoesDia,
} from './lib/store';
import { corPrevista } from './lib/projetos';
import { abreVault, criaNota, escolheVault, notas, sincroniza, vaultAberto } from './lib/notas';
import { registraComando } from './lib/comandos';
import { iniciaPlugins } from './lib/plugins';
import { paineis } from './lib/plugins/api';
import { alternaTema } from './lib/theme';
import * as api from './lib/db';
import { toast } from './lib/toast';
import { agora, decorrido } from './lib/relogio';
import { ehAtalhoDeFuga, podeAtalho } from './lib/teclado';
import { addDays, dayKey } from './lib/tempo';

const route = useRoute();
const router = useRouter();
const versao = __APP_VERSION__;
const navs = router.getRoutes().filter((r) => r.meta?.tecla)
  .sort((a, b) => a.meta.tecla.localeCompare(b.meta.tecla));

const contagem = computed<Record<string, number | string>>(() => ({
  '/projetos': projetos.value.length,
  '/notas': notas.value.length,
  '/backlog': tarefas.value.filter((t) => t.status === 'backlog').length,
  '/quadro': tarefas.value.filter((t) => t.status === 'fila' || t.status === 'fazendo').length,
  '/hoje': sessoesDia.value.length,
}));

/** Os seis projetos mais ativos. `resumoProjetos` já ordena por atividade. */
const projetosVisiveis = computed(() => projetos.value.slice(0, 6));

// ── criar projeto SEM sair de onde se está ────────────────────────────────
// O `+` daqui só navegava para /projetos, onde ainda era preciso um segundo
// clique para o campo aparecer: duas navegações e dois cliques para a operação
// que o dono mais faz. Agora a linha nasce em edição aqui mesmo.
const criandoProjeto = ref(false);
const nomeProjeto = ref('');
const campoProjeto = ref<HTMLInputElement | null>(null);
/** Acende o ponto com a cor que o projeto VAI receber, antes de confirmar. */
const corDoNovo = computed(() => corPrevista(projetos.value));

async function abreCriacaoProjeto(): Promise<void> {
  criandoProjeto.value = true;
  await nextTick();
  campoProjeto.value?.focus();
}

async function confirmaProjeto(): Promise<void> {
  const p = await criaProjeto(nomeProjeto.value);
  nomeProjeto.value = '';
  if (!p) return;
  criandoProjeto.value = false;
  router.push(`/projeto/${p.id}`);
}

/** Projeto sob o card arrastado. */
const alvoProjeto = ref<number | null>(null);

/** O projeto da tela atual, para o quick-add nascer já vinculado a ele. */
const projetoDaTela = computed(() => {
  if (route.name !== 'projeto') return null;
  const id = Number(route.params.id);
  return Number.isFinite(id) ? id : null;
});

/** Título da faixa de cima: nome do projeto (ou do painel) quando se está dentro de um. */
const tituloTela = computed(() => {
  if (route.name === 'plugin') {
    return paineis.value.find((p) => p.plugin === route.params.plugin && p.id === route.params.painel)?.titulo ?? 'Plugin';
  }
  if (route.name !== 'projeto') return route.meta.titulo;
  if (route.params.id === 'caixa') return 'Caixa';
  return projetos.value.find((p) => p.id === Number(route.params.id))?.name ?? 'Projeto';
});

// ── comandos do próprio app ───────────────────────────────────────────────
// Registrados como qualquer plugin registraria: a paleta não distingue.
async function novaNota(): Promise<void> {
  if (!vaultAberto.value) { router.push('/notas'); return; }
  const p = await criaNota('Sem título');
  router.push({ name: 'notas', query: { n: p } });
}
const COMANDOS = [
  { id: 'nova-tarefa', nome: 'Nova tarefa', tecla: 'n', executa: () => abreQuickAdd(projetoDaTela.value) },
  { id: 'nova-nota', nome: 'Nova nota', tecla: 'ctrl+alt+n', executa: novaNota },
  { id: 'novo-projeto', nome: 'Novo projeto', executa: () => router.push('/projetos') },
  { id: 'buscar', nome: 'Buscar em tudo', tecla: 'ctrl+k', executa: () => { paleta.value = 'busca'; } },
  { id: 'pausar', nome: 'Pausar a tarefa que está rodando', executa: () => pausa() },
  { id: 'alternar-tema', nome: 'Alternar tema', executa: () => { alternaTema(); } },
  { id: 'abrir-vault', nome: 'Abrir outra pasta como vault', executa: async () => { await escolheVault(); } },
  { id: 'reindexar', nome: 'Reindexar o vault', executa: async () => {
    const r = await sincroniza(); toast.ok(`${r.lidas} notas relidas`);
  } },
  ...navs.map((r) => ({ id: `ir:${r.path}`, nome: `Ir para ${r.meta.titulo}`, tecla: r.meta.tecla,
    executa: () => router.push(r.path) })),
];
for (const c of COMANDOS) registraComando({ ...c, dono: 'bancada' });

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  // Ctrl+K / Ctrl+O busca, Ctrl+P comandos — de QUALQUER lugar, inclusive de
  // dentro do editor: é o jeito de sair de uma nota sem tocar no mouse.
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
  if (mod && (e.key === 'k' || e.key === 'o')) { e.preventDefault(); paleta.value = 'busca'; return; }
  if (mod && e.key === 'p') { e.preventDefault(); paleta.value = 'comandos'; return; }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); void novaNota(); return; }

  // `n` abre a captura de qualquer tela — inclusive dentro de um projeto, e aí
  // já vem vinculada a ele.
  if (podeAtalho(e) && e.key === 'n') {
    e.preventDefault();
    abreQuickAdd(projetoDaTela.value);
    return;
  }
  for (const r of navs) {
    if (ehAtalhoDeFuga(e, r.meta.tecla) || (podeAtalho(e) && e.key === r.meta.tecla)) {
      e.preventDefault(); router.push(r.path); return;
    }
  }
});

const relogio = computed(() => rodando.value ? decorrido(rodando.value.started_at, agora.value) : null);
const esquecida = computed(() => rodando.value
  ? (agora.value.getTime() - new Date(rodando.value.started_at).getTime()) / 3600000 > 8 : false);

/** ESTA SEMANA: concluídas + sparkline dos últimos 7 dias. */
const semana = ref<number[]>([0, 0, 0, 0, 0, 0, 0]);
const concluidasSemana = computed(() => semana.value.reduce((a, b) => a + b, 0));
async function carregaSemana(): Promise<void> {
  const rows = await api.concluidasPorDia(7);
  const hoje = dayKey();
  semana.value = Array.from({ length: 7 }, (_, i) => rows.find((r) => r.dia === addDays(hoje, i - 6))?.n ?? 0);
}

onMounted(async () => {
  try {
    // Projetos criados antes de a cor existir nasciam cinza. Conserto silencioso.
    await api.pintaProjetosSemCor();
    await carregaProjetos();
    await Promise.all([carregaQuadro(), carregaDia(), carregaSemana()]);
    await api.arquivaFeitos(14);   // faxina é silenciosa: ninguém pediu esse aviso
    // O vault abre DEPOIS do quadro: indexar um vault grande não pode
    // atrasar a tela que se usa primeiro de manhã.
    // Plugins sobem DEPOIS do vault: os da comunidade moram dentro dele, e a
    // confiança é por vault. Os de núcleo sobem mesmo sem vault aberto.
    void abreVault()
      .catch((e) => toast.aviso(`Vault indisponível: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => iniciaPlugins());
    const id = Number(new URLSearchParams(location.search).get('tarefa'));
    if (id) abreDetalhe(id);
  } catch (e) {
    toast.erro(`Banco indisponível: ${e instanceof Error ? e.message : String(e)}`);
  }
});
</script>

<template>
  <div class="grid h-screen grid-cols-[236px_minmax(0,1fr)] max-[900px]:grid-cols-[56px_minmax(0,1fr)]">
    <aside class="flex min-w-0 flex-col border-r border-rule bg-surface-2">
      <div class="flex items-center gap-2.5 px-5 pb-3 pt-5">
        <div class="h-5 w-5 flex-none rounded-md bg-accent shadow-[0_0_16px_-2px_rgb(var(--glow)/.7)]" />
        <div class="display text-[20px] leading-none max-[900px]:hidden">Bancada</div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <nav class="flex flex-col gap-px px-3 pt-2">
          <RouterLink v-for="r in navs" :key="r.path" :to="r.path"
            class="grid grid-cols-[8px_1fr_auto] items-center gap-3 rounded-lg px-3 py-[7px] text-[14px] transition-colors
                   max-[900px]:grid-cols-[8px] max-[900px]:justify-center"
            :class="route.path === r.path ? 'bg-surface-3/70 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg'">
            <span class="h-1.5 w-1.5 rounded-full" :class="route.path === r.path ? 'bg-accent' : 'bg-rule-strong'" />
            <span class="max-[900px]:hidden">{{ r.meta.titulo }}</span>
            <span class="med text-[11px] text-fg-subtle max-[900px]:hidden">{{ contagem[r.path] || '' }}</span>
          </RouterLink>
        </nav>

        <!-- ── projetos: separados da navegação por um rótulo de seção, senão
             "Relatórios" e "Flyback rev C" parecem a mesma coisa ── -->
        <div class="mt-5 px-3 max-[900px]:hidden">
          <div class="flex items-center gap-2 px-3 pb-1">
            <span class="rot">Projetos</span>
            <button class="ml-auto rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
              title="Novo projeto" @click="abreCriacaoProjeto">
              <Plus class="h-3 w-3" />
            </button>
          </div>

          <!-- linha nova em edição, com a cor já acesa -->
          <div v-if="criandoProjeto"
            class="grid grid-cols-[10px_1fr] items-center gap-2.5 rounded-lg px-3 py-1">
            <ChipProjeto variante="ponto" :cor="corDoNovo" />
            <input ref="campoProjeto" v-model="nomeProjeto" spellcheck="false"
              class="w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-subtle"
              placeholder="nome do projeto"
              @keydown.enter="confirmaProjeto"
              @keydown.esc="criandoProjeto = false; nomeProjeto = ''"
              @blur="criandoProjeto = false; nomeProjeto = ''">
          </div>

          <!-- soltar um card do quadro aqui reatribui o projeto -->
          <RouterLink v-for="p in projetosVisiveis" :key="p.id" :to="`/projeto/${p.id}`"
            class="grid grid-cols-[10px_1fr_auto] items-center gap-2.5 rounded-lg px-3 py-1 text-[12px] transition-colors"
            :class="[
              route.path === `/projeto/${p.id}` ? 'bg-surface-3/70 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg',
              alvoProjeto === p.id && arrastando ? 'ring-2 ring-inset ring-accent/60 bg-accent/10' : '',
            ]"
            @dragover.prevent="alvoProjeto = p.id" @dragleave="alvoProjeto = null"
            @drop.prevent="alvoProjeto = null; soltaEmProjeto(p.id)">
            <ChipProjeto variante="ponto" :cor="p.color" />
            <span class="truncate">{{ p.name }}</span>
            <span v-if="p.abertas" class="med text-[11px] text-fg-subtle">{{ p.abertas }}</span>
          </RouterLink>

          <RouterLink v-if="projetos.length > 6" to="/projetos"
            class="block px-3 py-1 font-mono text-[11px] text-fg-subtle hover:text-fg">
            ⋯ ver todos ({{ projetos.length }})
          </RouterLink>
          <RouterLink v-if="!projetos.length" to="/projetos"
            class="block px-3 py-1 text-[12px] text-fg-subtle hover:text-fg">
            criar o primeiro →
          </RouterLink>
        </div>

        <!-- ── painéis de plugin: só aparece se algum plugin registrou um ── -->
        <div v-if="paineis.length" class="mt-5 px-3 max-[900px]:hidden">
          <div class="px-3 pb-1"><span class="rot">Plugins</span></div>
          <RouterLink v-for="p in paineis" :key="`${p.plugin}/${p.id}`"
            :to="{ name: 'plugin', params: { plugin: p.plugin, painel: p.id } }"
            class="grid grid-cols-[12px_1fr] items-center gap-2.5 rounded-lg px-3 py-1 text-[12px] transition-colors"
            :class="route.name === 'plugin' && route.params.plugin === p.plugin && route.params.painel === p.id
              ? 'bg-surface-3/70 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg'"
            :title="p.nomePlugin">
            <Puzzle class="h-3 w-3" />
            <span class="truncate">{{ p.titulo }}</span>
          </RouterLink>
        </div>
      </div>

      <div class="mx-4 border-t border-rule pb-2 pt-4 max-[900px]:hidden">
        <template v-if="rodando">
          <div class="rot mb-1 flex items-center gap-1.5 !text-accent-ink">
            <span class="relative flex h-1.5 w-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" /></span>
            rodando
          </div>
          <div class="mb-1 line-clamp-2 text-[12px] leading-snug text-fg">{{ rodando.title }}</div>
          <div class="flex items-center gap-2">
            <span class="med text-[24px] leading-none text-accent-ink font-semibold tracking-[-0.02em]">{{ relogio }}</span>
            <button class="btn btn-ghost btn-icone ml-auto" title="Pausar" @click="pausa"><Square class="h-3.5 w-3.5" /></button>
          </div>
        </template>
        <template v-else>
          <div class="rot mb-1">últimos 7 dias</div>
          <div class="flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ concluidasSemana }}</span>
            <span class="text-[12px] text-fg-muted">{{ concluidasSemana === 1 ? 'tarefa concluída' : 'tarefas concluídas' }}</span>
          </div>
        </template>
        <div class="mt-3 flex h-6 items-end gap-1">
          <div v-for="(n, i) in semana" :key="i" class="flex-1 rounded-[2px]"
            :class="i === 6 ? 'bg-accent' : 'bg-surface-3'"
            :style="{ height: Math.max(3, (n / Math.max(1, ...semana)) * 24) + 'px' }" />
        </div>
      </div>

      <div class="flex items-center gap-1.5 px-5 pb-3 font-mono text-[11px] text-fg-subtle max-[900px]:hidden">
        <RouterLink to="/ajustes" class="flex items-center gap-1 hover:text-fg">
          <Settings class="h-3 w-3" />ajustes
        </RouterLink>
        <span class="ml-auto opacity-70">v{{ versao }}</span>
      </div>
    </aside>

    <main class="flex min-w-0 flex-col overflow-hidden">
      <div class="flex h-14 flex-none items-center gap-3 border-b border-rule px-6">
        <span class="truncate text-[16px] font-semibold tracking-[-0.01em]">{{ tituloTela }}</span>
        <div v-if="rodando && route.path !== '/'" class="ml-auto flex items-center gap-2 text-[12px] text-fg-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-accent" />
          <span class="max-w-[260px] truncate">{{ rodando.title }}</span>
          <span class="med font-medium text-accent-ink">{{ relogio }}</span>
        </div>
        <!-- Antes este botão só navegava para /backlog. Agora ele cria. -->
        <button class="btn btn-accent" :class="!(rodando && route.path !== '/') && 'ml-auto'"
          @click="abreQuickAdd(projetoDaTela)">
          <Plus class="h-3.5 w-3.5" />Nova tarefa
          <span class="med ml-1 rounded bg-black/15 px-1 text-[11px] opacity-70">n</span>
        </button>
      </div>

      <div v-if="esquecida" class="flex flex-none items-center gap-2.5 border-b border-warn/40 bg-warn/10 px-6 py-1.5 text-[12px]">
        <AlertTriangle class="h-3.5 w-3.5 flex-none text-warn" />
        <span>Esta sessão passa de 8 h — provavelmente ficou aberta da noite para o dia.</span>
        <button class="btn ml-auto" @click="pausa">Encerrar agora</button>
      </div>

      <RouterView />
    </main>

    <QuickAdd v-if="quickAdd" />
    <Paleta v-if="paleta" :key="paleta" />
    <TaskDetail />
    <ToastHost />
  </div>
</template>
