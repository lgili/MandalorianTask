<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import GraficoBarras from '../components/GraficoBarras.vue';
import * as api from '../lib/db';
import type { Fluxo, LinhaDia, LinhaProjeto } from '../lib/db';
import { toast } from '../lib/toast';
import { addDays, dayKey, dayRangeUtc, fmtHM, inicioSemana, rotuloDia } from '../lib/tempo';

const semana = ref(inicioSemana(dayKey()));
const porDia = ref<LinhaDia[]>([]);
const porProjeto = ref<LinhaProjeto[]>([]);
const fluxo = ref<Fluxo[]>([]);

const dias = computed(() => Array.from({ length: 7 }, (_, i) => addDays(semana.value, i)));

const serie = computed(() => dias.value.map((d) => {
  const l = porDia.value.filter((x) => x.dia === d);
  const pega = (k: string) => l.find((x) => x.kind === k)?.minutos ?? 0;
  return { rotulo: rotuloDia(d).slice(0, 3), trabalho: pega('trabalho'),
           reuniao: pega('reuniao'), admin: pega('admin') };
}));

const total = computed(() => serie.value.reduce((s, d) => s + d.trabalho + d.reuniao + d.admin, 0));
const totalReuniao = computed(() => serie.value.reduce((s, d) => s + d.reuniao, 0));
const pctReuniao = computed(() => total.value ? Math.round((totalReuniao.value / total.value) * 100) : 0);

const medianaCycle = computed(() => {
  const v = fluxo.value.map((f) => f.cycle_h).filter((x): x is number => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
});

async function carrega(): Promise<void> {
  const { from } = dayRangeUtc(semana.value);
  const { to } = dayRangeUtc(addDays(semana.value, 6));
  try {
    [porDia.value, porProjeto.value, fluxo.value] = await Promise.all([
      api.minutosPorDia(from, to), api.horasPorProjeto(from, to), api.fluxoConcluidas(from, to),
    ]);
  } catch (e) { toast.erro(api.dbErro(e)); }
}

function move(n: number): void { semana.value = addDays(semana.value, n * 7); carrega(); }
onMounted(carrega);
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="flex max-w-[980px] flex-col gap-4 px-6 pb-10 pt-3">
      <div class="flex items-center gap-2">
        <button class="btn" @click="move(-1)">←</button>
        <span class="med text-[12px] text-fg-muted">
          {{ rotuloDia(semana) }} — {{ rotuloDia(addDays(semana, 6)) }}</span>
        <button class="btn" @click="move(1)">→</button>
        <button class="btn ml-auto" @click="semana = inicioSemana(dayKey()); carrega()">semana atual</button>
      </div>

      <div class="painel">
        <div class="flex items-center gap-3 border-b border-rule px-6 py-2.5">
          <span class="rot">Horas por dia</span>
          <span class="med ml-auto text-[14px] font-semibold">{{ fmtHM(total) }}</span>
        </div>
        <div class="overflow-x-auto p-3"><GraficoBarras :dados="serie" /></div>
        <div class="flex gap-4 border-t border-rule px-6 py-2 font-mono text-[11px] text-fg-muted">
          <span><i class="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-trabalho" />trabalho</span>
          <span><i class="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-reuniao" />reunião</span>
          <span><i class="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-admin" />admin</span>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="painel">
          <div class="border-b border-rule px-6 py-2.5"><span class="rot">Reunião × trabalho</span></div>
          <div class="p-4">
            <div class="med mb-2 text-[24px] font-semibold leading-none"
                 :class="pctReuniao >= 40 ? 'text-reuniao' : 'text-fg'">{{ pctReuniao }}%</div>
            <p class="text-[12px] leading-relaxed text-fg-subtle">
              {{ total ? `${fmtHM(totalReuniao)} em reunião nesta semana.` : 'Nada registrado nesta semana.' }}
            </p>
          </div>
        </div>

        <div class="painel">
          <div class="border-b border-rule px-6 py-2.5">
            <span class="rot">Cycle time</span>
            <span class="ml-2 text-[11px] text-fg-subtle">de começar até terminar</span>
          </div>
          <div class="p-4">
            <div class="med mb-2 text-[24px] font-semibold leading-none">
              {{ medianaCycle != null ? `${medianaCycle}h` : '—' }}</div>
            <p class="text-[12px] leading-relaxed text-fg-subtle">
              mediana de {{ fluxo.length }} {{ fluxo.length === 1 ? 'tarefa concluída' : 'tarefas concluídas' }}
            </p>
          </div>
        </div>
      </div>

      <div class="painel">
        <div class="border-b border-rule px-6 py-2.5"><span class="rot">Por projeto</span></div>
        <div class="px-6 py-1">
          <p v-if="!porProjeto.length" class="py-3 text-[12px] text-fg-subtle">Nada nesta semana.</p>
          <div v-for="l in porProjeto" :key="String(l.project_id)"
            class="flex items-baseline gap-3 border-b border-rule py-2 text-[14px] last:border-b-0">
            <span class="min-w-0 truncate">{{ l.project_name ?? '— sem projeto —' }}</span>
            <span class="med ml-auto text-[12px] text-fg-muted">{{ fmtHM(l.minutos) }}</span>
            <span class="med w-9 text-right text-[11px] text-fg-subtle">
              {{ total ? Math.round((l.minutos / total) * 100) : 0 }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
