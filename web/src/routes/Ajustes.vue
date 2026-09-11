<script setup lang="ts">
// Ajustes voltou a ser ajustes. O CRUD de projeto morava aqui, abaixo do
// seletor de tema — para criar um projeto era preciso sair do que se estava
// fazendo, navegar até a última tela e perder o texto digitado. Agora ele
// vive em /projetos, que é onde a mão já está.
import { useRouter } from 'vue-router';
import { ref } from 'vue';
import { ArrowRight, FolderOpen, RefreshCw } from 'lucide-vue-next';
import { projetos } from '../lib/store';
import { escolheVault, notas, sincroniza, sincronizando, vaultAberto } from '../lib/notas';
import { toast } from '../lib/toast';
import AjustesPlugins from '../components/AjustesPlugins.vue';
import { GRAO_MIN, tzAtual } from '../lib/tempo';
import { TEMAS, aplicaTema, temaAtual } from '../lib/theme';

const router = useRouter();
const tema = ref(temaAtual());
function escolheTema(t: typeof tema.value): void { tema.value = t; aplicaTema(t); }

async function trocaVault(): Promise<void> {
  if (await escolheVault()) toast.ok(`Vault aberto: ${notas.value.length} notas`);
}
async function reindexa(): Promise<void> {
  const r = await sincroniza();
  toast.ok(r.lidas || r.removidas ? `${r.lidas} relidas, ${r.removidas} removidas do índice` : 'Índice já estava em dia');
}
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
        <div class="border-b border-rule px-6 py-2.5"><span class="rot">Vault de notas</span></div>
        <div class="space-y-3 px-6 py-3.5 text-[12px] text-fg-muted">
          <p v-if="vaultAberto">
            <code class="med break-all rounded bg-surface-2 px-1 py-0.5 text-[11px] text-fg">{{ vaultAberto }}</code>
            <span class="ml-1">· {{ notas.length }} notas</span>
          </p>
          <p v-else>Nenhuma pasta aberta.</p>
          <p class="leading-relaxed">
            Os arquivos <code class="med">.md</code> são a verdade; o app guarda só um índice de
            busca, que dá para jogar fora e refazer. Pode ser a mesma pasta do Obsidian.
          </p>
          <div class="flex gap-2">
            <button class="btn" @click="trocaVault"><FolderOpen class="h-3.5 w-3.5" />{{ vaultAberto ? 'Trocar pasta' : 'Abrir pasta' }}</button>
            <button v-if="vaultAberto" class="btn" :disabled="sincronizando" @click="reindexa">
              <RefreshCw class="h-3.5 w-3.5" :class="sincronizando && 'animate-spin'" />Reindexar
            </button>
          </div>
        </div>
      </div>

      <AjustesPlugins />

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
          <span class="med text-fg">ctrl+k</span><span>buscar em notas, projetos e tarefas</span>
          <span class="med text-fg">ctrl+p</span><span>comandos — do app e dos plugins</span>
          <span class="med text-fg">ctrl+alt+n</span><span>nova nota</span>
          <span class="med text-fg">1…7</span><span>navegar</span>
          <span class="med text-fg">alt+1…7</span><span>navegar mesmo com o cursor num campo</span>
          <span class="med text-fg">[[</span><span>link para outra nota, no editor</span>
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
