<script setup lang="ts">
import { computed } from 'vue';
import { fmtHM } from '../lib/tempo';

/** Barra empilhada por dia. SVG à mão: ~40 linhas contra 250 KB de biblioteca. */
const props = defineProps<{
  dados: Array<{ rotulo: string; trabalho: number; reuniao: number; admin: number }>;
}>();

const W = 720, TOPO = 18, BASE = 190, ESQ = 46, DIR = 12;

const maxMin = computed(() => {
  const m = Math.max(60, ...props.dados.map((d) => d.trabalho + d.reuniao + d.admin));
  return Math.ceil(m / 120) * 120;   // passos de 2h para a escala não ficar torta
});
const escala = (min: number) => (min / maxMin.value) * (BASE - TOPO);

const ticks = computed(() => Array.from({ length: 5 }, (_, i) => {
  const min = (maxMin.value / 4) * i;
  return { min, y: BASE - escala(min), rotulo: `${Math.round(min / 60)}h` };
}));

const barras = computed(() => {
  const n = Math.max(1, props.dados.length);
  const faixa = (W - ESQ - DIR) / n;
  const larg = Math.min(58, faixa * 0.56);
  return props.dados.map((d, i) => {
    const cx = ESQ + faixa * i + faixa / 2;
    const hT = escala(d.trabalho), hR = escala(d.reuniao), hA = escala(d.admin);
    return {
      ...d, cx, x: cx - larg / 2, larg,
      total: d.trabalho + d.reuniao + d.admin,
      yT: BASE - hT, hT,
      yR: BASE - hT - hR, hR,
      yA: BASE - hT - hR - hA, hA,
      topo: BASE - hT - hR - hA,
    };
  });
});
</script>

<template>
  <svg :viewBox="`0 0 ${W} 218`" class="block h-auto w-full min-w-[460px]" role="img"
       aria-label="Horas por dia, separando trabalho, reunião e admin">
    <g v-for="t in ticks" :key="t.min">
      <line :x1="ESQ - 6" :y1="t.y" :x2="W - DIR" :y2="t.y"
            :stroke="t.min === 0 ? 'rgb(var(--rule-strong))' : 'rgb(var(--rule))'" />
      <text :x="ESQ - 11" :y="t.y + 3" text-anchor="end" font-family="JetBrains Mono Variable, JetBrains Mono, monospace"
            font-size="9.5" fill="rgb(var(--fg-subtle))">{{ t.rotulo }}</text>
    </g>
    <g v-for="b in barras" :key="b.rotulo">
      <rect v-if="b.hT > 0" :x="b.x" :y="b.yT" :width="b.larg" :height="b.hT" fill="rgb(var(--trabalho))" />
      <rect v-if="b.hR > 0" :x="b.x" :y="b.yR" :width="b.larg" :height="b.hR" fill="rgb(var(--reuniao))" />
      <rect v-if="b.hA > 0" :x="b.x" :y="b.yA" :width="b.larg" :height="b.hA" fill="rgb(var(--admin))" />
      <text v-if="b.total > 0" :x="b.cx" :y="b.topo - 5" text-anchor="middle"
            font-family="JetBrains Mono Variable, JetBrains Mono, monospace" font-size="9.5"
            fill="rgb(var(--fg-subtle))">{{ fmtHM(b.total) }}</text>
      <text :x="b.cx" :y="BASE + 16" text-anchor="middle" font-family="JetBrains Mono Variable, JetBrains Mono, monospace"
            font-size="10" fill="rgb(var(--fg-muted))">{{ b.rotulo }}</text>
    </g>
  </svg>
</template>
