<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import {
  Inbox, Columns3, Clock, BarChart3, Settings, Moon, Sun, Square, AlertTriangle,
} from 'lucide-vue-next';
import ToastHost from './components/ToastHost.vue';
import { alternaTema, temaAtual } from './lib/theme';
import { carregaProjetos, carregaQuadro, carregaDia, rodando, pausa } from './lib/store';
import { arquivaFeitos } from './lib/db';
import { toast } from './lib/toast';
import { agora, decorrido } from './lib/relogio';
import { ehAtalhoDeFuga, podeAtalho } from './lib/teclado';

const route = useRoute();
const router = useRouter();
const escuro = ref(temaAtual() === 'dark');
const versao = __APP_VERSION__;

const ICONES = { inbox: Inbox, columns: Columns3, clock: Clock,
  chart: BarChart3, settings: Settings } as const;

const navs = router.getRoutes()
  .filter((r) => r.meta?.tecla)
  .sort((a, b) => a.meta.tecla.localeCompare(b.meta.tecla));

// Alt+N funciona mesmo digitando; N nu só fora de campo. Sem o primeiro, o
// Backlog — que mantém o cursor no campo — seria um beco sem saída de teclado.
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  for (const r of navs) {
    if (ehAtalhoDeFuga(e, r.meta.tecla) || (podeAtalho(e) && e.key === r.meta.tecla)) {
      e.preventDefault();
      router.push(r.path);
      return;
    }
  }
});

const relogio = computed(() => rodando.value ? decorrido(rodando.value.started_at, agora.value) : null);

/**
 * Sessão que atravessou a noite. O app não soma 14 horas calado: avisa e deixa
 * a pessoa decidir. É a única forma de o número ficar desonesto sozinho.
 */
const esquecida = computed(() => {
  if (!rodando.value) return false;
  const h = (agora.value.getTime() - new Date(rodando.value.started_at).getTime()) / 3600000;
  return h > 8;
});

function trocaTema(): void { escuro.value = alternaTema() === 'dark'; }

onMounted(async () => {
  try {
    await carregaProjetos();
    await Promise.all([carregaQuadro(), carregaDia()]);
    const n = await arquivaFeitos(14);
    if (n > 0) toast.ok(`${n} ${n === 1 ? 'tarefa arquivada' : 'tarefas arquivadas'}`);
  } catch (e) {
    toast.erro(`Banco indisponível: ${e instanceof Error ? e.message : String(e)}`);
  }
});
</script>

<template>
  <div class="grid h-screen grid-cols-[188px_minmax(0,1fr)] max-[900px]:grid-cols-[52px_minmax(0,1fr)]">
    <!-- ── lateral ── -->
    <aside class="flex min-w-0 flex-col border-r border-rule bg-surface-2">
      <div class="flex items-center gap-2 border-b border-rule px-3.5 py-3">
        <div class="grid h-5 w-5 flex-none place-items-center rounded-[4px] bg-fg font-mono
                    text-[11px] font-bold text-surface">B</div>
        <div class="text-[13.5px] font-semibold tracking-tight max-[900px]:hidden">Bancada</div>
      </div>

      <nav class="flex flex-1 flex-col gap-px overflow-y-auto p-1.5">
        <RouterLink v-for="r in navs" :key="r.path" :to="r.path"
          class="grid grid-cols-[16px_1fr_auto] items-center gap-2.5 rounded-[5px] px-2 py-1.5
                 text-[13px] text-fg-muted transition-colors hover:text-fg
                 max-[900px]:grid-cols-[16px] max-[900px]:justify-center"
          :class="route.path === r.path
            ? 'bg-surface !text-fg font-semibold shadow-card'
            : 'hover:bg-surface/60'">
          <component :is="ICONES[r.meta.icone as keyof typeof ICONES]" class="h-[15px] w-[15px]" />
          <span class="max-[900px]:hidden">{{ r.meta.titulo }}</span>
          <span class="med text-[10px] text-fg-subtle max-[900px]:hidden">{{ r.meta.tecla }}</span>
        </RouterLink>
      </nav>

      <!-- ── sessão ativa: o único lugar com cor saturada ── -->
      <div class="m-2 rounded-[6px] border px-2.5 py-2 max-[900px]:hidden"
        :class="rodando ? 'border-vivo/40 bg-vivo-halo' : 'border-rule bg-surface/50'">
        <template v-if="rodando">
          <div class="rot mb-1 flex items-center gap-1.5 !text-vivo">
            <span class="relative flex h-1.5 w-1.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-vivo opacity-60" />
              <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-vivo" />
            </span>
            em curso
          </div>
          <div class="mb-1.5 line-clamp-2 text-[12.5px] font-medium leading-snug">
            {{ rodando.title }}
          </div>
          <div class="flex items-center gap-2">
            <span class="med text-[18px] font-semibold leading-none text-vivo">{{ relogio }}</span>
            <button class="btn btn-sm ml-auto !px-1.5 !py-1" title="Pausar" @click="pausa">
              <Square class="h-3 w-3" />
            </button>
          </div>
        </template>
        <template v-else>
          <div class="rot mb-1">parado</div>
          <div class="text-[11.5px] leading-snug text-fg-subtle">
            Mover um card para <span class="text-fg-muted">Fazendo</span> começa a contar.
          </div>
        </template>
      </div>

      <div class="flex items-center gap-2 border-t border-rule px-3 py-2 font-mono text-[10px]
                  text-fg-subtle max-[900px]:hidden">
        <button class="hover:text-fg" :title="escuro ? 'Tema claro' : 'Tema escuro'" @click="trocaTema">
          <component :is="escuro ? Sun : Moon" class="h-3 w-3" />
        </button>
        <span class="ml-auto opacity-70">v{{ versao }}</span>
      </div>
    </aside>

    <!-- ── conteúdo ── -->
    <main class="flex min-w-0 flex-col overflow-hidden">
      <div class="flex h-11 flex-none items-center gap-3 border-b border-rule bg-surface-2 px-4">
        <h1 class="m-0 text-[14px] font-semibold tracking-tight">{{ route.meta.titulo }}</h1>
        <div v-if="rodando" class="ml-auto flex items-center gap-2 text-[12px] text-fg-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-vivo" />
          <span class="max-w-[280px] truncate">{{ rodando.title }}</span>
          <span class="med font-semibold text-vivo">{{ relogio }}</span>
        </div>
      </div>

      <!-- recuperação de sessão esquecida: uma linha, não um modal -->
      <div v-if="esquecida"
        class="flex flex-none items-center gap-2.5 border-b border-warn/40 bg-warn/10 px-4 py-1.5
               text-[12.5px]">
        <AlertTriangle class="h-3.5 w-3.5 flex-none text-warn" />
        <span>Esta sessão passa de 8 h — provavelmente ficou aberta da noite para o dia.</span>
        <button class="btn btn-sm ml-auto" @click="pausa">Encerrar agora</button>
      </div>

      <RouterView />
    </main>

    <ToastHost />
  </div>
</template>
