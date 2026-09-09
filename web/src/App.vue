<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import {
  Inbox, Columns3, Clock, BarChart3, Settings, Square, AlertTriangle, Palette,
} from 'lucide-vue-next';
import ToastHost from './components/ToastHost.vue';
import { alternaTema, temaAtual, TEMAS } from './lib/theme';
import { carregaProjetos, carregaQuadro, carregaDia, rodando, pausa } from './lib/store';
import { arquivaFeitos } from './lib/db';
import { toast } from './lib/toast';
import { agora, decorrido } from './lib/relogio';
import { ehAtalhoDeFuga, podeAtalho } from './lib/teclado';

const route = useRoute();
const router = useRouter();
const tema = ref(temaAtual());
const versao = __APP_VERSION__;

const ICONES = { inbox: Inbox, columns: Columns3, clock: Clock,
  chart: BarChart3, settings: Settings } as const;

const navs = router.getRoutes()
  .filter((r) => r.meta?.tecla)
  .sort((a, b) => a.meta.tecla.localeCompare(b.meta.tecla));

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

const esquecida = computed(() => {
  if (!rodando.value) return false;
  const h = (agora.value.getTime() - new Date(rodando.value.started_at).getTime()) / 3600000;
  return h > 8;
});

function trocaTema(): void {
  tema.value = alternaTema();
  toast.ok(`Tema: ${TEMAS.find((t) => t.id === tema.value)?.nome}`);
}

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
  <div class="grid h-screen grid-cols-[212px_minmax(0,1fr)] max-[900px]:grid-cols-[56px_minmax(0,1fr)]">
    <!-- ── lateral ── -->
    <aside class="flex min-w-0 flex-col border-r border-rule/70 bg-surface-2">
      <div class="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <div class="grid h-6 w-6 flex-none place-items-center rounded-lg bg-accent font-mono
                    text-[11px] font-bold text-on-accent shadow-glow">B</div>
        <div class="text-[14px] font-semibold tracking-tight max-[900px]:hidden">Bancada</div>
      </div>

      <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        <RouterLink v-for="r in navs" :key="r.path" :to="r.path"
          class="grid grid-cols-[18px_1fr_auto] items-center gap-2.5 rounded-lg px-2.5 py-2
                 text-[13px] font-medium transition-colors
                 max-[900px]:grid-cols-[18px] max-[900px]:justify-center"
          :class="route.path === r.path
            ? 'bg-accent/15 text-accent-ink'
            : 'text-fg-muted hover:bg-surface-3/70 hover:text-fg'">
          <component :is="ICONES[r.meta.icone as keyof typeof ICONES]" class="h-4 w-4" />
          <span class="max-[900px]:hidden">{{ r.meta.titulo }}</span>
          <span class="med text-[10px] max-[900px]:hidden"
            :class="route.path === r.path ? 'text-accent-ink/70' : 'text-fg-subtle'">{{ r.meta.tecla }}</span>
        </RouterLink>
      </nav>

      <!-- ── sessão ativa ── -->
      <div class="m-2 rounded-xl border p-3 max-[900px]:hidden"
        :class="rodando ? 'border-vivo/40 bg-vivo/10 shadow-live' : 'border-rule bg-surface/40'">
        <template v-if="rodando">
          <div class="rot mb-1.5 flex items-center gap-1.5 !text-vivo-ink">
            <span class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-vivo opacity-60" />
              <span class="relative inline-flex h-2 w-2 rounded-full bg-vivo" />
            </span>
            rodando
          </div>
          <div class="mb-2 line-clamp-2 text-[12.5px] font-medium leading-snug">{{ rodando.title }}</div>
          <div class="flex items-center gap-2">
            <span class="med text-[20px] font-semibold leading-none text-vivo-ink">{{ relogio }}</span>
            <button class="btn btn-ghost ml-auto !p-1.5" title="Pausar" @click="pausa">
              <Square class="h-3.5 w-3.5" />
            </button>
          </div>
        </template>
        <template v-else>
          <div class="rot mb-1">parado</div>
          <div class="text-[11.5px] leading-snug text-fg-subtle">
            Aperte ▶ num card, ou arraste para <span class="text-fg-muted">Fazendo</span>.
          </div>
        </template>
      </div>

      <div class="flex items-center gap-2 px-3.5 pb-3 pt-1 font-mono text-[10px] text-fg-subtle
                  max-[900px]:hidden">
        <button class="flex items-center gap-1.5 hover:text-fg" title="Trocar tema" @click="trocaTema">
          <Palette class="h-3 w-3" /><span>{{ tema }}</span>
        </button>
        <span class="ml-auto opacity-70">v{{ versao }}</span>
      </div>
    </aside>

    <!-- ── conteúdo ── -->
    <main class="flex min-w-0 flex-col overflow-hidden">
      <div class="flex h-12 flex-none items-center gap-3 border-b border-rule/70 px-5">
        <h1 class="m-0 text-[15px] font-semibold tracking-tight">{{ route.meta.titulo }}</h1>
        <div v-if="rodando" class="ml-auto flex items-center gap-2 rounded-full border border-vivo/30
                                   bg-vivo/10 py-1 pl-2.5 pr-3 text-[12px] text-fg-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-vivo" />
          <span class="max-w-[280px] truncate">{{ rodando.title }}</span>
          <span class="med font-semibold text-vivo-ink">{{ relogio }}</span>
        </div>
      </div>

      <div v-if="esquecida"
        class="flex flex-none items-center gap-2.5 border-b border-warn/40 bg-warn/10 px-5 py-1.5 text-[12.5px]">
        <AlertTriangle class="h-3.5 w-3.5 flex-none text-warn" />
        <span>Esta sessão passa de 8 h — provavelmente ficou aberta da noite para o dia.</span>
        <button class="btn ml-auto" @click="pausa">Encerrar agora</button>
      </div>

      <RouterView />
    </main>

    <ToastHost />
  </div>
</template>
