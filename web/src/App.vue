<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { Square, AlertTriangle, Plus } from 'lucide-vue-next';
import ToastHost from './components/ToastHost.vue';
import TaskDetail from './components/TaskDetail.vue';
import { abreDetalhe, carregaProjetos, carregaQuadro, carregaDia, rodando, pausa, tarefas, sessoesDia } from './lib/store';
import * as api from './lib/db';
import { toast } from './lib/toast';
import { agora, decorrido } from './lib/relogio';
import { ehAtalhoDeFuga, podeAtalho } from './lib/teclado';
import { addDays, dayKey } from './lib/tempo';

const route = useRoute();
const router = useRouter();
const versao = __APP_VERSION__;
const navs = router.getRoutes().filter((r) => r.meta?.tecla).sort((a, b) => a.meta.tecla.localeCompare(b.meta.tecla));

const contagem = computed<Record<string, number | string>>(() => ({
  '/backlog': tarefas.value.filter((t) => t.status === 'backlog').length,
  '/quadro': tarefas.value.filter((t) => t.status === 'fila' || t.status === 'fazendo').length,
  '/hoje': sessoesDia.value.length,
}));

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
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
    await carregaProjetos();
    await Promise.all([carregaQuadro(), carregaDia(), carregaSemana()]);
    const n = await api.arquivaFeitos(14);
    if (n > 0) toast.ok(`${n} ${n === 1 ? 'tarefa arquivada' : 'tarefas arquivadas'}`);
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
        <div class="display text-[19px] leading-none max-[900px]:hidden">Bancada</div>
      </div>

      <nav class="flex flex-1 flex-col gap-px px-3 pt-2">
        <RouterLink v-for="r in navs" :key="r.path" :to="r.path"
          class="grid grid-cols-[8px_1fr_auto] items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] transition-colors
                 max-[900px]:grid-cols-[8px] max-[900px]:justify-center"
          :class="route.path === r.path ? 'bg-surface-3/70 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg'">
          <span class="h-1.5 w-1.5 rounded-full" :class="route.path === r.path ? 'bg-accent' : 'bg-rule-strong'" />
          <span class="max-[900px]:hidden">{{ r.meta.titulo }}</span>
          <span class="med text-[10.5px] text-fg-subtle max-[900px]:hidden">{{ contagem[r.path] ?? r.meta.tecla }}</span>
        </RouterLink>
      </nav>

      <div class="mx-4 border-t border-rule pb-2 pt-4 max-[900px]:hidden">
        <template v-if="rodando">
          <div class="rot mb-1 flex items-center gap-1.5 !text-accent-ink">
            <span class="relative flex h-1.5 w-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" /></span>
            rodando
          </div>
          <div class="mb-1 line-clamp-2 text-[12.5px] leading-snug text-fg">{{ rodando.title }}</div>
          <div class="flex items-center gap-2">
            <span class="display text-[26px] leading-none text-accent-ink">{{ relogio }}</span>
            <button class="btn btn-ghost ml-auto !p-1.5" title="Pausar" @click="pausa"><Square class="h-3.5 w-3.5" /></button>
          </div>
        </template>
        <template v-else>
          <div class="rot mb-1">esta semana</div>
          <div class="flex items-baseline gap-2">
            <span class="display text-[30px] leading-none">{{ concluidasSemana }}</span>
            <span class="text-[12px] text-fg-muted">{{ concluidasSemana === 1 ? 'tarefa concluída' : 'tarefas concluídas' }}</span>
          </div>
        </template>
        <div class="mt-3 flex h-6 items-end gap-1">
          <div v-for="(n, i) in semana" :key="i" class="flex-1 rounded-[2px]"
            :class="i === 6 ? 'bg-accent' : 'bg-surface-3'"
            :style="{ height: Math.max(3, (n / Math.max(1, ...semana)) * 24) + 'px' }" />
        </div>
      </div>

      <div class="flex items-center px-5 pb-3 font-mono text-[10px] text-fg-subtle max-[900px]:hidden">
        <RouterLink to="/ajustes" class="hover:text-fg">tema</RouterLink>
        <span class="ml-auto opacity-70">v{{ versao }}</span>
      </div>
    </aside>

    <main class="flex min-w-0 flex-col overflow-hidden">
      <div class="flex h-14 flex-none items-center gap-3 border-b border-rule px-8">
        <span class="med text-[11px] uppercase tracking-[0.14em] text-fg-subtle">{{ route.meta.titulo }}</span>
        <div v-if="rodando && route.path !== '/'" class="ml-auto flex items-center gap-2 text-[12px] text-fg-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-accent" />
          <span class="max-w-[260px] truncate">{{ rodando.title }}</span>
          <span class="med font-medium text-accent-ink">{{ relogio }}</span>
        </div>
        <button class="btn btn-accent" :class="!(rodando && route.path !== '/') && 'ml-auto'" @click="router.push('/backlog')">
          <Plus class="h-3.5 w-3.5" />Nova tarefa</button>
      </div>

      <div v-if="esquecida" class="flex flex-none items-center gap-2.5 border-b border-warn/40 bg-warn/10 px-8 py-1.5 text-[12.5px]">
        <AlertTriangle class="h-3.5 w-3.5 flex-none text-warn" />
        <span>Esta sessão passa de 8 h — provavelmente ficou aberta da noite para o dia.</span>
        <button class="btn ml-auto" @click="pausa">Encerrar agora</button>
      </div>

      <RouterView />
    </main>

    <TaskDetail />
    <ToastHost />
  </div>
</template>
