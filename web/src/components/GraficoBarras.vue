<script setup lang="ts">
import { computed } from 'vue';
import { fmtHM } from '../lib/tempo';

/** Barra empilhada foco/reunião/admin por dia. SVG na mão: são 40 linhas
 *  e evita 250 KB de biblioteca de gráfico para um gráfico só. */
const props = defineProps<{
  dados: Array<{ rotulo: string; foco: number; reuniao: number; admin: number }>;
}>();

const W = 720, H = 230, TOPO = 20, BASE = 196, ESQ = 52, DIR = 20;

const maxMin = computed(() => {
  const m = Math.max(60, ...props.dados.map((d) => d.foco + d.reuniao + d.admin));
  // arredonda para cima em passos de 2h para a escala não ficar torta
  return Math.ceil(m / 120) * 120;
});

const escala = (min: number) => (min / maxMin.value) * (BASE - TOPO);

const ticks = computed(() => {
  const passo = maxMin.value / 4;
  return Array.from({ length: 5 }, (_, i) => {
    const min = i * passo;
    return { min, y: BASE - escala(min), rotulo: `${Math.round(min / 60)}h` };
  });
});

const barras = computed(() => {
  const n = Math.max(1, props.dados.length);
  const faixa = (W - ESQ - DIR) / n;
  const larg = Math.min(64, faixa * 0.62);
  return props.dados.map((d, i) => {
    const cx = ESQ + faixa * i + faixa / 2;
    const total = d.foco + d.reuniao + d.admin;
    const hFoco = escala(d.foco), hReu = escala(d.reuniao), hAdm = escala(d.admin);
    return {
      ...d, total, cx, x: cx - larg / 2, larg,
      yFoco: BASE - hFoco, hFoco,
      yReu: BASE - hFoco - hReu, hReu,
      yAdm: BASE - hFoco - hReu - hAdm, hAdm,
      yTopo: BASE - hFoco - hReu - hAdm,
    };
  });
});
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="block h-auto w-full min-w-[520px]" role="img"
       aria-label="Horas por dia, separando foco, reunião e admin">
    <g v-for="t in ticks" :key="t.min">
      <line :x1="ESQ - 6" :y1="t.y" :x2="W - DIR" :y2="t.y"
            :stroke="t.min === 0 ? 'rgb(var(--rule-strong))' : 'rgb(var(--rule))'" stroke-width="1" />
      <text :x="ESQ - 12" :y="t.y + 3" text-anchor="end" font-family="IBM Plex Mono, monospace"
            font-size="9.5" fill="rgb(var(--fg-subtle))">{{ t.rotulo }}</text>
    </g>

    <g v-for="b in barras" :key="b.rotulo">
      <rect v-if="b.hFoco > 0" :x="b.x" :y="b.yFoco" :width="b.larg" :height="b.hFoco"
            fill="rgb(var(--foco))" />
      <rect v-if="b.hReu > 0" :x="b.x" :y="b.yReu" :width="b.larg" :height="b.hReu"
            fill="rgb(var(--reuniao))" />
      <rect v-if="b.hAdm > 0" :x="b.x" :y="b.yAdm" :width="b.larg" :height="b.hAdm"
            fill="rgb(var(--admin))" />
      <text v-if="b.total > 0" :x="b.cx" :y="b.yTopo - 6" text-anchor="middle"
            font-family="IBM Plex Mono, monospace" font-size="9.5"
            fill="rgb(var(--fg-subtle))">{{ fmtHM(b.total) }}</text>
      <text :x="b.cx" :y="BASE + 18" text-anchor="middle" font-family="IBM Plex Mono, monospace"
            font-size="10" fill="rgb(var(--fg-muted))">{{ b.rotulo }}</text>
    </g>
  </svg>
</template>
