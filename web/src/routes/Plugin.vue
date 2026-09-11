<script setup lang="ts">
// Hospeda um painel de plugin. O plugin recebe um <div> vazio e faz o que
// quiser dentro — DOM puro, Vue, Svelte, canvas. Aqui só se garante que a
// função de limpeza dele roda ao sair, e que um painel que explode mostra o
// erro no lugar dele em vez de levar o app junto.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Puzzle } from 'lucide-vue-next';
import { paineis } from '../lib/plugins/api';

const route = useRoute();
const router = useRouter();
const painel = computed(() => paineis.value.find((p) => p.plugin === route.params.plugin && p.id === route.params.painel));
const host = ref<HTMLElement | null>(null);
const erro = ref<string | null>(null);
let limpa: (() => void) | void;

function desmonta(): void {
  try { limpa?.(); } catch (e) { console.error('[painel] limpeza', e); }
  limpa = undefined;
}

watch([painel, host], ([p, h]) => {
  desmonta();
  erro.value = null;
  if (!p || !h) return;
  try {
    limpa = p.monta(h);
  } catch (e) {
    erro.value = e instanceof Error ? e.message : String(e);
    console.error(`[painel ${p.plugin}/${p.id}]`, e);
  }
}, { flush: 'post' });

onBeforeUnmount(desmonta);
</script>

<template>
  <div v-if="painel && !erro" ref="host" class="relative min-h-0 flex-1" />

  <div v-else class="grid min-h-0 flex-1 place-items-center p-8">
    <div class="max-w-[420px] text-center">
      <Puzzle class="mx-auto h-6 w-6 text-fg-subtle" />
      <p class="mt-3 text-[14px] text-fg">{{ erro ? 'O painel deste plugin falhou.' : 'Painel indisponível.' }}</p>
      <p class="mt-1 text-[12px] leading-relaxed text-fg-subtle">
        <template v-if="erro"><code class="med break-all">{{ erro }}</code></template>
        <template v-else>O plugin que registra este painel pode estar desligado.</template>
      </p>
      <button class="btn mt-4" @click="router.push('/ajustes')">Ver plugins</button>
    </div>
  </div>
</template>
