<script setup lang="ts">
// Ajustes > Plugins. Núcleo liga e desliga à vontade; comunidade exige sair
// do modo restrito PRIMEIRO, com o aviso na cara — plugin roda com acesso
// total ao app, igual ao Obsidian, e a pessoa precisa saber disso ao ligar.
import { computed, ref } from 'vue';
import { AlertTriangle, RefreshCw, Download } from 'lucide-vue-next';
import { alterna, defineRestrito, instalaExemplo, plugins, recarregaComunidade, restrito } from '../lib/plugins';
import { vaultAberto } from '../lib/notas';
import { toast } from '../lib/toast';

const nucleo = computed(() => plugins.value.filter((p) => p.origem === 'nucleo'));
const comunidade = computed(() => plugins.value.filter((p) => p.origem === 'comunidade'));
const confirmando = ref(false);
const ocupado = ref(false);

async function troca(id: string, ligar: boolean): Promise<void> {
  ocupado.value = true;
  try {
    await alterna(id, ligar);
    const p = plugins.value.find((x) => x.manifesto.id === id);
    if (ligar && p?.erro) toast.erro(`${p.manifesto.nome}: ${p.erro}`);
  } finally { ocupado.value = false; }
}

async function sairDoRestrito(): Promise<void> {
  confirmando.value = false;
  await defineRestrito(false);
}

async function exemplo(): Promise<void> {
  const id = await instalaExemplo();
  toast.ok(`Plugin de exemplo instalado em .bancada/plugins/${id} — ligue-o abaixo`);
}

async function recarrega(): Promise<void> {
  await recarregaComunidade();
  toast.ok(`${comunidade.value.length} ${comunidade.value.length === 1 ? 'plugin encontrado' : 'plugins encontrados'}`);
}
</script>

<template>
  <div class="painel">
    <div class="border-b border-rule px-6 py-2.5"><span class="rot">Plugins</span></div>

    <!-- núcleo -->
    <div class="px-6 pb-2 pt-3">
      <div class="mb-1 text-[12px] font-medium text-fg-muted">Vêm com o app</div>
      <div v-for="p in nucleo" :key="p.manifesto.id" class="flex items-start gap-3 border-b border-rule py-2.5 last:border-b-0">
        <div class="min-w-0 flex-1">
          <div class="text-[14px] text-fg">{{ p.manifesto.nome }}</div>
          <div class="text-[12px] text-fg-subtle">{{ p.manifesto.descricao }}</div>
          <div v-if="p.erro" class="mt-1 text-[12px] text-danger">{{ p.erro }}</div>
        </div>
        <button role="switch" :aria-checked="p.ligado" :disabled="ocupado"
          class="relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors"
          :class="p.ligado ? 'bg-accent' : 'bg-surface-3'"
          :title="p.ligado ? 'Desligar' : 'Ligar'"
          @click="troca(p.manifesto.id, !p.ligado)">
          <span class="absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-card transition-all"
            :class="p.ligado ? 'left-[18px]' : 'left-0.5'" />
        </button>
      </div>
    </div>

    <!-- comunidade -->
    <div class="border-t border-rule px-6 pb-4 pt-3">
      <div class="mb-1 text-[12px] font-medium text-fg-muted">Da comunidade</div>

      <p v-if="!vaultAberto" class="py-2 text-[12px] text-fg-subtle">
        Plugins da comunidade moram dentro do vault. Abra um vault em Notas primeiro.
      </p>

      <template v-else-if="restrito">
        <p class="py-2 text-[12px] leading-relaxed text-fg-subtle">
          <b class="text-fg">Modo restrito ligado</b> neste vault: plugins da pasta
          <code class="med">.bancada/plugins/</code> não são carregados.
          <template v-if="comunidade.length"> Há {{ comunidade.length }} {{ comunidade.length === 1 ? 'instalado' : 'instalados' }}.</template>
        </p>
        <div v-if="confirmando" class="painel mt-1 !border-warn/50 bg-warn/5 p-3">
          <div class="flex gap-2 text-[12px] leading-relaxed">
            <AlertTriangle class="mt-0.5 h-4 w-4 flex-none text-warn" />
            <span>
              Plugins rodam com <b>acesso total</b> ao app: leem e escrevem suas notas, tarefas e o banco.
              Só ligue plugins em que você confia. A decisão vale para <b>este vault</b> e fica gravada no
              app — um vault copiado de outra pessoa sempre abre em modo restrito.
            </span>
          </div>
          <div class="mt-3 flex gap-2">
            <button class="btn btn-accent" @click="sairDoRestrito">Entendi, confiar neste vault</button>
            <button class="btn" @click="confirmando = false">Cancelar</button>
          </div>
        </div>
        <button v-else class="btn mt-1" @click="confirmando = true">Desligar modo restrito</button>
      </template>

      <template v-else>
        <div v-for="p in comunidade" :key="p.manifesto.id" class="flex items-start gap-3 border-b border-rule py-2.5 last:border-b-0">
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="text-[14px] text-fg">{{ p.manifesto.nome }}</span>
              <span class="med text-[11px] text-fg-subtle">{{ p.manifesto.versao }}</span>
              <span v-if="p.manifesto.autor" class="text-[11px] text-fg-subtle">· {{ p.manifesto.autor }}</span>
            </div>
            <div v-if="p.manifesto.descricao" class="text-[12px] text-fg-subtle">{{ p.manifesto.descricao }}</div>
            <div v-if="p.erro" class="mt-1 text-[12px] text-danger">{{ p.erro }}</div>
          </div>
          <button role="switch" :aria-checked="p.ligado" :disabled="ocupado || p.manifesto.versao === '?'"
            class="relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors disabled:opacity-40"
            :class="p.ligado ? 'bg-accent' : 'bg-surface-3'"
            @click="troca(p.manifesto.id, !p.ligado)">
            <span class="absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-card transition-all"
              :class="p.ligado ? 'left-[18px]' : 'left-0.5'" />
          </button>
        </div>
        <p v-if="!comunidade.length" class="py-2 text-[12px] text-fg-subtle">
          Nenhum plugin em <code class="med">.bancada/plugins/</code>. Copie a pasta de um plugin para lá,
          ou instale o de exemplo.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="btn" @click="recarrega"><RefreshCw class="h-3.5 w-3.5" />Procurar de novo</button>
          <button class="btn" @click="exemplo"><Download class="h-3.5 w-3.5" />Instalar o plugin de exemplo</button>
          <button class="btn btn-ghost ml-auto" @click="defineRestrito(true)">Voltar ao modo restrito</button>
        </div>
      </template>
    </div>
  </div>
</template>
