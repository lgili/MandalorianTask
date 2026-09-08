<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useMagicKeys, whenever } from '@vueuse/core';
import { Clock, Columns3, FileText, BarChart3, Settings, Moon, Sun } from 'lucide-vue-next';
import ToastHost from './components/ToastHost.vue';
import { alternaTema, temaAtual } from './lib/theme';
import { carregaProjetos } from './lib/store';
import { podeAtalho } from './lib/teclado';
import { arquivarFeitosAntigos } from './lib/db';
import { toast } from './lib/toast';
import { ref } from 'vue';

const route = useRoute();
const router = useRouter();
const escuro = ref(temaAtual() === 'dark');
// Global injetado pelo vite: precisa passar pelo <script> para o template enxergar.
const versao = __APP_VERSION__;

const ICONES = { clock: Clock, columns: Columns3, 'file-text': FileText,
  'bar-chart-3': BarChart3, settings: Settings } as const;

const navs = router.getRoutes()
  .filter((r) => r.meta?.tecla)
  .sort((a, b) => a.meta.tecla.localeCompare(b.meta.tecla));

// Atalhos 1..5. useMagicKeys — a dependência que no eBOM está declarada e nunca usada.
// onEventFired dá acesso ao evento cru, que é o único jeito de ver os modificadores:
// sem isso, Ctrl+1 do navegador também trocaria de rota.
let ultimo: KeyboardEvent | null = null;
const keys = useMagicKeys({ onEventFired: (e) => { if (e.type === 'keydown') ultimo = e; } });
for (const r of navs) {
  whenever(keys[r.meta.tecla], () => {
    if (!ultimo || !podeAtalho(ultimo)) return;
    router.push(r.path);
  });
}

function trocaTema(): void {
  escuro.value = alternaTema() === 'dark';
}

onMounted(async () => {
  try {
    await carregaProjetos();
    // Limpeza do quadro na abertura: 'feito' há mais de 14 dias sai da vista.
    const n = await arquivarFeitosAntigos(14);
    if (n > 0) toast.ok(`${n} ${n === 1 ? 'atividade arquivada' : 'atividades arquivadas'}`);
  } catch (e) {
    toast.erro(`Banco indisponível: ${e instanceof Error ? e.message : String(e)}`);
  }
});
</script>

<template>
  <div class="grid h-screen grid-cols-[216px_minmax(0,1fr)] max-[820px]:grid-cols-[64px_minmax(0,1fr)]">
    <aside class="flex min-w-0 flex-col border-r border-rule bg-surface">
      <div class="flex items-center gap-2.5 border-b border-rule px-4 py-4">
        <div class="grid h-7 w-7 flex-none place-items-center rounded-md bg-foco font-mono
                    text-[13px] font-bold text-on-accent">B</div>
        <div class="text-[15px] font-semibold tracking-tight max-[820px]:hidden">Bancada</div>
      </div>

      <nav class="flex flex-1 flex-col gap-px overflow-y-auto p-2">
        <RouterLink v-for="r in navs" :key="r.path" :to="r.path"
          class="grid grid-cols-[18px_1fr_auto] items-center gap-2.5 rounded-md px-2.5 py-2
                 text-[13.5px] text-fg-muted hover:bg-surface-2 hover:text-fg
                 max-[820px]:grid-cols-[18px] max-[820px]:justify-center"
          :class="route.path === r.path && 'bg-foco/10 !text-foco font-semibold'">
          <component :is="ICONES[r.meta.icone as keyof typeof ICONES]" class="h-4 w-4" />
          <span class="max-[820px]:hidden">{{ r.meta.titulo }}</span>
          <span class="font-mono text-[10.5px] text-fg-subtle max-[820px]:hidden">{{ r.meta.tecla }}</span>
        </RouterLink>
      </nav>

      <div class="flex flex-col gap-1.5 border-t border-rule px-3.5 py-3 font-mono
                  text-[10.5px] text-fg-subtle max-[820px]:hidden">
        <button class="flex items-center gap-2 text-left hover:text-fg" @click="trocaTema">
          <component :is="escuro ? Sun : Moon" class="h-3 w-3" />
          <span>{{ escuro ? 'tema claro' : 'tema escuro' }}</span>
        </button>
        <div class="opacity-70">v{{ versao }}</div>
      </div>
    </aside>

    <main class="flex min-w-0 flex-col overflow-hidden">
      <div class="flex h-[52px] flex-none items-center gap-3.5 border-b border-rule bg-surface px-5">
        <h1 class="m-0 text-[15px] font-semibold tracking-tight">{{ route.meta.titulo }}</h1>
      </div>
      <RouterView />
    </main>

    <ToastHost />
  </div>
</template>
