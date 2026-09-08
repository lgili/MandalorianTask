<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus } from 'lucide-vue-next';
import * as api from '../lib/db';
import { toast } from '../lib/toast';
import { carregaProjetos, projetos } from '../lib/store';
import { GRAO_MIN, DIA_INICIO_H, DIA_FIM_H, tzAtual } from '../lib/tempo';

const novoNome = ref('');
const novoCodigo = ref('');

async function criaProjeto(): Promise<void> {
  const n = novoNome.value.trim();
  if (!n) return;
  try {
    await api.createProject(n, novoCodigo.value.trim() || null);
    novoNome.value = ''; novoCodigo.value = '';
    await carregaProjetos();
    toast.ok('Projeto criado');
  } catch (e) { toast.erro(api.dbErro(e)); }
}

async function arquiva(id: number, nome: string): Promise<void> {
  try {
    await api.updateProject(id, { archived_at: new Date().toISOString() });
    await carregaProjetos();
    toast.ok(`${nome} arquivado`);
  } catch (e) { toast.erro(api.dbErro(e)); }
}

onMounted(carregaProjetos);
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="flex max-w-[680px] flex-col gap-5 px-5 pb-10 pt-5">

      <div class="painel">
        <div class="border-b border-rule px-4.5 py-3">
          <h2 class="m-0 text-sm font-semibold">Projetos</h2>
        </div>
        <div class="px-4.5 py-2">
          <div v-for="p in projetos" :key="p.id"
               class="flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
            <span class="text-[13.5px] font-medium">{{ p.name }}</span>
            <span v-if="p.code" class="font-mono text-[10.5px] text-fg-subtle">{{ p.code }}</span>
            <button class="btn btn-sm ml-auto" @click="arquiva(p.id, p.name)">Arquivar</button>
          </div>
          <p v-if="!projetos.length" class="py-2.5 text-[12px] text-fg-subtle">
            Nenhum projeto ainda. Crie o primeiro — atividades sem projeto continuam funcionando,
            mas o relatório por projeto fica vazio.
          </p>

          <div class="flex items-center gap-2 border-t border-rule py-3">
            <input class="inp max-w-[240px]" v-model="novoNome" placeholder="Nome do projeto"
                   @keydown.enter="criaProjeto">
            <input class="inp max-w-[120px]" v-model="novoCodigo" placeholder="Código"
                   @keydown.enter="criaProjeto">
            <button class="btn btn-sm btn-pri" @click="criaProjeto">
              <Plus class="h-3.5 w-3.5" />Criar</button>
          </div>
        </div>
      </div>

      <div class="painel">
        <div class="border-b border-rule px-4.5 py-3">
          <h2 class="m-0 text-sm font-semibold">Expediente</h2>
        </div>
        <div class="px-4.5 py-2">
          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3">
            <div><div class="text-[13.5px] font-medium">Janela do dia</div></div>
            <span class="font-mono text-[11.5px] text-fg-muted">
              {{ String(DIA_INICIO_H).padStart(2, '0') }}:00 – {{ String(DIA_FIM_H).padStart(2, '0') }}:00</span>
          </div>
          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3">
            <div>
              <div class="text-[13.5px] font-medium">Granularidade</div>
              <div class="mt-0.5 text-[12px] leading-snug text-fg-subtle">
                Tudo arredonda. Precisão maior gera ansiedade, não informação.</div>
            </div>
            <span class="font-mono text-[11.5px] text-fg-muted">{{ GRAO_MIN }} min</span>
          </div>
          <div class="grid grid-cols-[1fr_auto] items-center gap-4 py-3">
            <div><div class="text-[13.5px] font-medium">Fuso</div></div>
            <span class="font-mono text-[11.5px] text-fg-muted">{{ tzAtual() }}</span>
          </div>
        </div>
      </div>

      <div class="painel">
        <div class="border-b border-rule px-4.5 py-3">
          <h2 class="m-0 text-sm font-semibold">Google Agenda</h2>
          <span class="rotulo">v0.2</span>
        </div>
        <div class="px-4.5 py-4 text-[12.5px] leading-relaxed text-fg-muted">
          <p class="mb-2">
            Ainda não conectado. Conta corporativa: o alvo é criar o projeto no Google Cloud
            <b class="text-fg">dentro da organização</b> e usar o tipo de usuário
            <code class="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">Internal</code> —
            que não expira o refresh token em 7 dias nem exige verificação.
          </p>
          <p class="text-fg-subtle">
            Se o admin bloquear, o plano B é o endereço iCal privado (somente leitura, até 24 h de atraso).
          </p>
        </div>
      </div>

      <div class="painel">
        <div class="border-b border-rule px-4.5 py-3">
          <h2 class="m-0 text-sm font-semibold">Dados</h2>
        </div>
        <div class="px-4.5 py-4 text-[12.5px] leading-relaxed text-fg-muted">
          O banco é um arquivo SQLite em <code class="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">
          %APPDATA%\Bancada\bancada.db</code>. Backup é copiar o arquivo.
        </div>
      </div>

    </div>
  </div>
</template>
