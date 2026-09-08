<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus } from 'lucide-vue-next';
import * as api from '../lib/db';
import { toast } from '../lib/toast';
import { carregaProjetos, projetos } from '../lib/store';
import { GRAO_MIN, tzAtual } from '../lib/tempo';

const nome = ref('');
const codigo = ref('');

async function cria(): Promise<void> {
  if (!nome.value.trim()) return;
  try {
    await api.createProject(nome.value, codigo.value.trim() || null);
    nome.value = ''; codigo.value = '';
    await carregaProjetos();
    toast.ok('Projeto criado');
  } catch (e) { toast.erro(api.dbErro(e)); }
}

async function arquiva(id: number, n: string): Promise<void> {
  try {
    await api.updateProject(id, { archived_at: new Date().toISOString() });
    await carregaProjetos();
    toast.ok(`${n} arquivado`);
  } catch (e) { toast.erro(api.dbErro(e)); }
}

onMounted(carregaProjetos);
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="flex max-w-[620px] flex-col gap-4 px-4 pb-10 pt-3">
      <div class="painel">
        <div class="border-b border-rule px-4 py-2.5">
          <span class="rot">Projetos</span>
          <span class="ml-2 text-[10.5px] text-fg-subtle">use <code class="med">#código</code> na captura</span>
        </div>
        <div class="px-4 py-1">
          <div v-for="p in projetos" :key="p.id"
            class="flex items-center gap-3 border-b border-rule py-2 last:border-b-0">
            <span class="text-[13px] font-medium">{{ p.name }}</span>
            <span v-if="p.code" class="med text-[10.5px] text-fg-subtle">{{ p.code }}</span>
            <button class="btn ml-auto" @click="arquiva(p.id, p.name)">Arquivar</button>
          </div>
          <p v-if="!projetos.length" class="py-2.5 text-[12px] text-fg-subtle">
            Nenhum projeto ainda. Sem projeto o app funciona, mas o relatório por projeto fica vazio.
          </p>
          <div class="flex items-center gap-2 border-t border-rule py-2.5">
            <input class="inp max-w-[220px]" v-model="nome" placeholder="Nome" @keydown.enter="cria">
            <input class="inp max-w-[110px]" v-model="codigo" placeholder="Código" @keydown.enter="cria">
            <button class="btn btn-vivo" @click="cria"><Plus class="h-3.5 w-3.5" />Criar</button>
          </div>
        </div>
      </div>

      <div class="painel">
        <div class="border-b border-rule px-4 py-2.5"><span class="rot">Como o tempo é medido</span></div>
        <div class="space-y-2.5 px-4 py-3.5 text-[12.5px] leading-relaxed text-fg-muted">
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
        <div class="border-b border-rule px-4 py-2.5"><span class="rot">Dados</span></div>
        <div class="px-4 py-3.5 text-[12.5px] leading-relaxed text-fg-muted">
          Um arquivo SQLite em
          <code class="med rounded bg-surface-2 px-1 py-0.5 text-[11px]">%APPDATA%\Bancada\bancada.db</code>.
          Backup é copiar o arquivo. Fuso: <span class="med">{{ tzAtual() }}</span>.
        </div>
      </div>
    </div>
  </div>
</template>
