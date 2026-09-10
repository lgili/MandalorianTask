<script setup lang="ts">
// Ajustes voltou a ser ajustes. O CRUD de projeto morava aqui, abaixo do
// seletor de tema — para criar um projeto era preciso sair do que se estava
// fazendo, navegar até a última tela e perder o texto digitado. Agora ele
// vive em /projetos, que é onde a mão já está.
import { useRouter } from 'vue-router';
import { ref } from 'vue';
import { ArrowRight } from 'lucide-vue-next';
import { projetos } from '../lib/store';
import { GRAO_MIN, tzAtual } from '../lib/tempo';
import { TEMAS, aplicaTema, temaAtual } from '../lib/theme';

const router = useRouter();
const tema = ref(temaAtual());
function escolheTema(t: typeof tema.value): void { tema.value = t; aplicaTema(t); }
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="flex max-w-[620px] flex-col gap-4 px-6 pb-10 pt-3">
      <div class="painel">
        <div class="border-b border-rule px-6 py-2.5"><span class="rot">Aparência</span></div>
        <div class="grid grid-cols-3 gap-2 p-3">
          <button v-for="t in TEMAS" :key="t.id" @click="escolheTema(t.id)"
            class="rounded-xl border p-3 text-left transition"
            :class="tema === t.id ? 'border-accent bg-accent/10 shadow-glow' : 'border-rule hover:border-rule-strong'">
            <div class="text-[14px] font-semibold">{{ t.nome }}</div>
            <div class="text-[11px] text-fg-subtle">{{ t.desc }}</div>
          </button>
        </div>
      </div>

      <button class="painel flex items-center gap-3 px-6 py-3 text-left transition hover:border-rule-strong"
        @click="router.push('/projetos')">
        <div>
          <div class="text-[14px] font-semibold">Projetos</div>
          <div class="text-[12px] text-fg-subtle">
            {{ projetos.length }} {{ projetos.length === 1 ? 'projeto' : 'projetos' }} ·
            criar, renomear, cor, código e arquivo ficam na tela de Projetos
          </div>
        </div>
        <ArrowRight class="ml-auto h-4 w-4 flex-none text-fg-subtle" />
      </button>

      <div class="painel">
        <div class="border-b border-rule px-6 py-2.5"><span class="rot">Como o tempo é medido</span></div>
        <div class="space-y-2.5 px-6 py-3.5 text-[12px] leading-relaxed text-fg-muted">
          <p>
            Mover um card para <b class="text-fg">Fazendo</b> abre uma sessão; tirar de lá fecha.
            Não existe botão de cronômetro — o tempo é consequência do quadro.
          </p>
          <p>
            <b class="text-fg">Só uma sessão roda por vez</b>, garantido pelo banco. Começar uma
            tarefa encerra a anterior, então é impossível contar a mesma hora duas vezes.
          </p>
          <p>
            O tempo medido guarda o minuto cheio. O passo de {{ GRAO_MIN }} min existe só quando você
            <b class="text-fg">corrige um horário à mão</b> em Hoje — medida não se arredonda,
            estimativa sim.
          </p>
        </div>
      </div>

      <div class="painel">
        <div class="border-b border-rule px-6 py-2.5"><span class="rot">Atalhos</span></div>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-6 py-3.5 text-[12px] text-fg-muted">
          <span class="med text-fg">n</span><span>nova tarefa, de qualquer tela</span>
          <span class="med text-fg">1…6</span><span>navegar</span>
          <span class="med text-fg">alt+1…6</span><span>navegar mesmo com o cursor num campo</span>
          <span class="med text-fg">#</span><span>projeto, na linha de captura</span>
          <span class="med text-fg">!</span><span>prazo: <span class="med">hoje · qui · 12/09 · +3d</span></span>
          <span class="med text-fg">@</span><span>tipo: <span class="med">reuniao · admin</span></span>
          <span class="med text-fg">esc</span><span>fecha o que estiver aberto</span>
        </div>
      </div>

      <div class="painel">
        <div class="border-b border-rule px-6 py-2.5"><span class="rot">Dados</span></div>
        <div class="px-6 py-3.5 text-[12px] leading-relaxed text-fg-muted">
          Um arquivo SQLite em
          <code class="med rounded bg-surface-2 px-1 py-0.5 text-[11px]">%APPDATA%\com.lgili.bancada\</code>.
          Backup é copiar o arquivo. Fuso: <span class="med">{{ tzAtual() }}</span>.
        </div>
      </div>
    </div>
  </div>
</template>
