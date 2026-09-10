<script setup lang="ts">
// A tela que faltava. Antes, "projeto" era uma linha de formulário abaixo do
// seletor de tema em Ajustes, e não havia nenhum lugar no app que respondesse
// "quais são as tarefas do CF03B04?".
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Archive, Inbox } from 'lucide-vue-next';
import ChipProjeto from '../components/ChipProjeto.vue';
import * as api from '../lib/db';
import { carregaProjetos, criaProjeto, projetos, tarefas } from '../lib/store';
import { toast } from '../lib/toast';
import { fmtHM, relativo } from '../lib/tempo';

const router = useRouter();
const criando = ref(false);
const nome = ref('');
const campo = ref<HTMLInputElement | null>(null);
const mostrarArquivados = ref(false);
const arquivados = ref<api.ProjetoResumo[]>([]);

/** A Caixa não é um projeto, mas é onde metade das capturas cai. */
const caixa = computed(() => {
  const suas = tarefas.value.filter((t) => t.project_id === null);
  return {
    abertas: suas.filter((t) => t.status !== 'feito').length,
    minutos: suas.reduce((s, t) => s + t.minutos, 0),
  };
});

async function abreCriacao(): Promise<void> {
  criando.value = true;
  await nextTick();
  campo.value?.focus();
}

async function cria(): Promise<void> {
  const p = await criaProjeto(nome.value);
  nome.value = '';
  if (!p) return;
  criando.value = false;
  router.push(`/projeto/${p.id}`);
}

async function carregaArquivados(): Promise<void> {
  const todos = await api.resumoProjetos(true);
  arquivados.value = todos.filter((p) => p.archived_at);
}

async function desarquiva(p: api.ProjetoResumo): Promise<void> {
  try {
    await api.updateProject(p.id, { archived_at: null });
    await Promise.all([carregaProjetos(), carregaArquivados()]);
    toast.ok(`${p.name} de volta`);
  } catch (e) { toast.erro(api.dbErro(e)); }
}

onMounted(async () => { await carregaProjetos(); await carregaArquivados(); });
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-[880px] px-6 pb-14 pt-7">
      <div class="flex items-baseline gap-3">
        <h1 class="display m-0 text-[32px] leading-none">Projetos</h1>
        <span class="med text-[12px] text-fg-subtle">{{ projetos.length }}</span>
        <button class="btn btn-accent ml-auto" @click="abreCriacao">
          <Plus class="h-3.5 w-3.5" />Novo projeto
        </button>
      </div>

      <!-- criação inline: um campo, um enter. Cor vem sozinha. -->
      <div v-if="criando" class="mt-4">
        <input ref="campo" v-model="nome" class="inp" placeholder="Nome do projeto"
          spellcheck="false" @keydown.enter="cria" @keydown.esc="criando = false; nome = ''">
        <p class="mt-1.5 font-mono text-[11px] text-fg-subtle">
          enter cria e abre · a cor é escolhida sozinha · código e cor mudam depois
        </p>
      </div>

      <div class="mt-5 grid grid-cols-[16px_minmax(0,1fr)_auto_auto] gap-3 px-3 pb-1">
        <span /><span />
        <span class="rot w-20 text-right !text-[11px]">horas</span>
        <span class="rot w-16 text-right !text-[11px]">abertas</span>
      </div>

      <div class="painel">
        <!-- Caixa primeiro: é onde caem as capturas de reunião -->
        <button class="linha w-full grid-cols-[16px_minmax(0,1fr)_auto_auto] text-left"
          @click="router.push('/projeto/caixa')">
          <Inbox class="h-3.5 w-3.5 text-fg-subtle" />
          <div class="min-w-0">
            <div class="truncate text-[14px] font-medium text-fg-muted">Caixa</div>
            <div class="mt-0.5 text-[11px] text-fg-subtle">capturas sem projeto</div>
          </div>
          <span class="med w-20 text-right text-[12px] text-fg-muted">{{ fmtHM(caixa.minutos) }}</span>
          <span class="med w-16 text-right text-[12px]"
            :class="caixa.abertas ? 'text-fg' : 'text-fg-subtle'">{{ caixa.abertas || '—' }}</span>
        </button>

        <button v-for="p in projetos" :key="p.id"
          class="linha w-full grid-cols-[16px_minmax(0,1fr)_auto_auto] text-left"
          @click="router.push(`/projeto/${p.id}`)">
          <ChipProjeto variante="ponto" tamanho="md" :cor="p.color" />
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="truncate text-[14px] font-medium">{{ p.name }}</span>
              <span v-if="p.code" class="med flex-none text-[11px] text-fg-subtle">{{ p.code }}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
              <span v-if="p.fazendo" class="text-vivo-ink">{{ p.fazendo }} em curso</span>
              <span v-if="p.fazendo">·</span>
              <span>{{ p.feitas }} de {{ p.total }} feitas</span>
              <template v-if="p.ultima_at"><span>·</span><span>{{ relativo(p.ultima_at) }}</span></template>
            </div>
          </div>
          <span class="med w-20 text-right text-[12px] text-fg-muted">{{ fmtHM(p.minutos) }}</span>
          <span class="med w-16 text-right text-[12px]"
            :class="p.abertas ? 'text-fg' : 'text-fg-subtle'">{{ p.abertas || '—' }}</span>
        </button>

        <p v-if="!projetos.length" class="px-4 py-8 text-center text-[14px] text-fg-subtle">
          Nenhum projeto ainda.<br>
          <span class="text-[12px]">Um projeto é só um nome — o resto o app preenche sozinho.</span>
        </p>
      </div>

      <div v-if="arquivados.length" class="mt-7">
        <button class="rot flex items-center gap-1.5 hover:text-fg-muted"
          @click="mostrarArquivados = !mostrarArquivados">
          <Archive class="h-3 w-3" />arquivados · {{ arquivados.length }}
        </button>
        <div v-if="mostrarArquivados" class="painel mt-2">
          <div v-for="p in arquivados" :key="p.id" class="linha grid-cols-[16px_minmax(0,1fr)_auto]">
            <ChipProjeto variante="ponto" :cor="p.color" />
            <span class="truncate text-[14px] text-fg-muted">{{ p.name }}</span>
            <button class="btn !py-1" @click="desarquiva(p)">Restaurar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
