<script setup lang="ts">
import { computed } from 'vue';
import { fmtHM } from '../lib/time';

/** One stacked bar per day. Hand-written SVG: ~40 lines versus 250 KB of library. */
const props = defineProps<{
  series: Array<{ label: string; work: number; meeting: number; admin: number }>;
}>();

const W = 720, TOP = 18, BASE = 190, LEFT = 46, RIGHT = 12;

const maxMin = computed(() => {
  const m = Math.max(60, ...props.series.map((d) => d.work + d.meeting + d.admin));
  return Math.ceil(m / 120) * 120;   // 2h steps so the scale doesn't come out lopsided
});
const scale = (min: number) => (min / maxMin.value) * (BASE - TOP);

const ticks = computed(() => Array.from({ length: 5 }, (_, i) => {
  const min = (maxMin.value / 4) * i;
  return { min, y: BASE - scale(min), label: `${Math.round(min / 60)}h` };
}));

const bars = computed(() => {
  const n = Math.max(1, props.series.length);
  const band = (W - LEFT - RIGHT) / n;
  const width = Math.min(58, band * 0.56);
  return props.series.map((d, i) => {
    const cx = LEFT + band * i + band / 2;
    const hW = scale(d.work), hM = scale(d.meeting), hA = scale(d.admin);
    return {
      ...d, cx, x: cx - width / 2, width,
      total: d.work + d.meeting + d.admin,
      yW: BASE - hW, hW,
      yM: BASE - hW - hM, hM,
      yA: BASE - hW - hM - hA, hA,
      top: BASE - hW - hM - hA,
    };
  });
});
</script>

<template>
  <svg :viewBox="`0 0 ${W} 218`" class="block h-auto w-full min-w-[460px]" role="img"
       aria-label="Hours per day, split into work, meeting and admin">
    <g v-for="t in ticks" :key="t.min">
      <line :x1="LEFT - 6" :y1="t.y" :x2="W - RIGHT" :y2="t.y"
            :stroke="t.min === 0 ? 'rgb(var(--rule-strong))' : 'rgb(var(--rule))'" />
      <text :x="LEFT - 11" :y="t.y + 3" text-anchor="end" font-family="JetBrains Mono Variable, JetBrains Mono, monospace"
            font-size="9.5" fill="rgb(var(--fg-subtle))">{{ t.label }}</text>
    </g>
    <g v-for="b in bars" :key="b.label">
      <rect v-if="b.hW > 0" :x="b.x" :y="b.yW" :width="b.width" :height="b.hW" fill="rgb(var(--work))" />
      <rect v-if="b.hM > 0" :x="b.x" :y="b.yM" :width="b.width" :height="b.hM" fill="rgb(var(--meeting))" />
      <rect v-if="b.hA > 0" :x="b.x" :y="b.yA" :width="b.width" :height="b.hA" fill="rgb(var(--admin))" />
      <text v-if="b.total > 0" :x="b.cx" :y="b.top - 5" text-anchor="middle"
            font-family="JetBrains Mono Variable, JetBrains Mono, monospace" font-size="9.5"
            fill="rgb(var(--fg-subtle))">{{ fmtHM(b.total) }}</text>
      <text :x="b.cx" :y="BASE + 16" text-anchor="middle" font-family="JetBrains Mono Variable, JetBrains Mono, monospace"
            font-size="10" fill="rgb(var(--fg-muted))">{{ b.label }}</text>
    </g>
  </svg>
</template>
