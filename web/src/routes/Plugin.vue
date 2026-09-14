<script setup lang="ts">
// Hosts a plugin panel. The plugin gets an empty <div> and does whatever it
// wants inside — plain DOM, Vue, Svelte, canvas. All this screen guarantees is
// that its cleanup function runs on the way out, and that a panel that blows up
// shows the error in its place instead of taking the app down with it.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Puzzle } from 'lucide-vue-next';
import { panels } from '../lib/plugins/api';

const route = useRoute();
const router = useRouter();
const panel = computed(() => panels.value.find((p) => p.plugin === route.params.plugin && p.id === route.params.panel));
const host = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);
let cleanup: (() => void) | void;

function unmountPanel(): void {
  try { cleanup?.(); } catch (e) { console.error('[panel] cleanup', e); }
  cleanup = undefined;
}

watch([panel, host], ([p, h]) => {
  unmountPanel();
  error.value = null;
  if (!p || !h) return;
  try {
    cleanup = p.mount(h);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    console.error(`[panel ${p.plugin}/${p.id}]`, e);
  }
}, { flush: 'post' });

onBeforeUnmount(unmountPanel);
</script>

<template>
  <div v-if="panel && !error" ref="host" class="relative min-h-0 flex-1" />

  <div v-else class="grid min-h-0 flex-1 place-items-center p-8">
    <div class="max-w-[420px] text-center">
      <Puzzle class="mx-auto h-6 w-6 text-fg-subtle" />
      <p class="mt-3 text-[14px] text-fg">{{ error ? "This plugin's panel failed." : 'Panel unavailable.' }}</p>
      <p class="mt-1 text-[12px] leading-relaxed text-fg-subtle">
        <template v-if="error"><code class="mono break-all">{{ error }}</code></template>
        <template v-else>The plugin that registers this panel may be disabled.</template>
      </p>
      <button class="btn mt-4" @click="router.push('/settings')">View plugins</button>
    </div>
  </div>
</template>
