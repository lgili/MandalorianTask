<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import GraficoBarras from '../components/GraficoBarras.vue';
import * as api from '../lib/db';
import type { LinhaDia, LinhaProjeto } from '../lib/db';
import { toast } from '../lib/toast';
import { addDays, dayKey, dayRangeUtc, fmtHM, inicioSemana, rotuloDia } from '../lib/tempo';

const semanaDe = ref(inicioSemana(dayKey()));
const porDia = ref<LinhaDia[]>([]);
const porProjeto = ref<LinhaProjeto[]>([]);

const dias = computed(() => Array.from({ length: 7 }, (_, i) => addDays(semanaDe.value, i)));

const serie = computed(() =>
  dias.value.map((d) => {
    const linhas = porDia.value.filter((l) => l.dia === d);
    const pega = (k: string) => linhas.find((l) => l.kind === k)?.minutes ?? 0;
    return { rotulo: rotuloDia(d).slice(0, 3), foco: pega('foco'),
             reuniao: pega('reuniao'), admin: pega('admin') };
  }));

const total = computed(() => serie.value.reduce((s, d) => s + d.foco + d.reuniao + d.admin, 0));
const totalReuniao = computed(() => serie.value.reduce((s, d) => s + d.reuniao, 0));
const pctReuniao = computed(() => (total.value ? Math.round((totalReuniao.value / total.value) * 100) : 0));

async function carrega(): Promise<void> {
  const { from } = dayRangeUtc(semanaDe.value);
  const { to } = dayRangeUtc(addDays(semanaDe.value, 6));
  try {
    [porDia.value, porProjeto.value] = await Promise.all([
      api.minutosPorDia(from, to),
      api.horasPorProjeto(from, to),
    ]);
  } catch (e) { toast.erro(api.dbErro(e)); }
}

function move(semanas: number): void {
  semanaDe.value = addDays(semanaDe.value, semanas * 7);
  carrega();
}

onMounted(carrega);
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="flex max-w-[1080px] flex-col gap-5 px-5 pb-10 pt-5">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm" @click="move(-1)">← semana</button>
        <span class="font-mono text-[12px] text-fg-muted">
          {{ rotuloDia(semanaDe) }} — {{ rotuloDia(addDays(semanaDe, 6)) }}</span>
        <button class="btn btn-sm" @click="move(1)">semana →</button>
        <button class="btn btn-sm ml-auto" @click="semanaDe = inicioSemana(dayKey()); carrega()">
          semana atual</button>
      </div>

      <div class="painel">
        <div class="flex items-center gap-3 border-b border-rule px-4.5 py-3">
          <h2 class="m-0 text-sm font-semibold">Horas por dia</h2>
          <span class="ml-auto font-mono text-[10.5px] text-fg-subtle">{{ fmtHM(total) }} na semana</span>
        </div>
        <div class="overflow-x-auto p-4">
          <GraficoBarras :dados="serie" />
        </div>
        <div class="flex flex-wrap gap-4 px-4 pb-3.5 font-mono text-[11px] text-fg-muted">
          <span><i class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-foco" />foco</span>
          <span><i class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-reuniao" />reunião</span>
          <span><i class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-admin" />admin</span>
        </div>
      </div>

      <div class="grid gap-5 md:grid-cols-2">
        <div class="painel">
          <div class="border-b border-rule px-4.5 py-3">
            <h2 class="m-0 text-sm font-semibold">Reunião × foco</h2>
          </div>
          <div class="p-4">
            <div v-if="total" class="mb-3 flex h-8 overflow-hidden rounded-md">
              <div class="grid place-items-center bg-foco font-mono text-[11px] font-semibold text-on-accent"
                   :style="{ flex: 100 - pctReuniao }">{{ 100 - pctReuniao }}% foco</div>
              <div class="grid place-items-center bg-reuniao font-mono text-[11px] font-semibold text-on-accent"
                   :style="{ flex: pctReuniao }">{{ pctReuniao }}%</div>
            </div>
            <p class="text-[11.5px] leading-relaxed text-fg-subtle">
              {{ total ? `${fmtHM(totalReuniao)} em reunião nesta semana.`
                       : 'Sem horas confirmadas nesta semana.' }}
            </p>
          </div>
        </div>

        <div class="painel">
          <div class="border-b border-rule px-4.5 py-3">
            <h2 class="m-0 text-sm font-semibold">Por projeto</h2>
          </div>
          <div class="p-4">
            <p v-if="!porProjeto.length" class="text-[11.5px] text-fg-subtle">
              Nada confirmado nesta semana.</p>
            <div v-for="l in porProjeto" :key="String(l.project_id)"
                 class="flex items-baseline gap-3 border-b border-rule py-1.5 text-[13px] last:border-b-0">
              <span class="min-w-0 truncate">{{ l.project_name ?? '— sem projeto —' }}</span>
              <span class="ml-auto font-mono text-[11.5px] tabular-nums text-fg-muted">
                {{ fmtHM(l.minutes) }}</span>
              <span class="w-10 text-right font-mono text-[10.5px] tabular-nums text-fg-subtle">
                {{ total ? Math.round((l.minutes / total) * 100) : 0 }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
