<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Outcome, TaskCard } from '../lib/types';
import { OUTCOMES } from '../lib/types';
import * as api from '../lib/db';
import { abreDetalhe, carregaDia, carregaQuadro, rodando, sessoesDia, tarefas, totaisDia } from '../lib/store';
import ChipProjeto from '../components/ChipProjeto.vue';
import { addDays, dayKey, dayRangeUtc, diasEntre, fmtHM, inicioSemana, rotuloDiaLongo } from '../lib/tempo';
import { agora, decorrido } from '../lib/relogio';

const router = useRouter();
const desf = ref<Array<{ outcome: Outcome | null; n: number }>>([]);
const horasSemana = ref(0);
const concluidasSemana = ref(0);

const abertas = computed(() => tarefas.value.filter((t) => t.status === 'fila' || t.status === 'fazendo'));
const emCurso = computed(() => tarefas.value.filter((t) => t.status === 'fazendo').length);
const capturadasHoje = computed(() => tarefas.value
  .filter((t) => dayKey(new Date(t.created_at)) === dayKey()).length);
const atrasadas = computed(() => tarefas.value.filter((t) => t.due_at && t.status !== 'feito' && diasEntre(t.due_at) > 0));
const maisAntigaAtraso = computed(() => Math.max(0, ...atrasadas.value.map((t) => diasEntre(t.due_at!))));
const venceSemana = computed(() => tarefas.value.filter((t) => t.due_at && t.status !== 'feito'
  && diasEntre(t.due_at) <= 0 && diasEntre(t.due_at) >= -7).length);

const emAndamento = computed(() => [...tarefas.value]
  .filter((t) => t.status === 'fazendo' || t.status === 'fila')
  .sort((a, b) => (a.status === b.status ? 0 : a.status === 'fazendo' ? -1 : 1))
  .slice(0, 8));

const resumo = computed(() => {
  const partes: string[] = [];
  if (venceSemana.value) partes.push(`${venceSemana.value === 1 ? 'Uma tarefa vence' : venceSemana.value + ' tarefas vencem'} esta semana.`);
  if (atrasadas.value.length) partes.push(`${atrasadas.value.length === 1 ? 'Uma atrasada' : atrasadas.value.length + ' atrasadas'}, a mais antiga há ${maisAntigaAtraso.value}d.`);
  if (rodando.value) partes.push(`Rodando "${rodando.value.title}" há ${decorrido(rodando.value.started_at, agora.value).slice(0, 5)}.`);
  else partes.push('Nada rodando agora.');
  return partes.join(' ');
});

const totalDesf = computed(() => desf.value.reduce((s, d) => s + d.n, 0));
const labelDesf = (o: Outcome | null) => o ? OUTCOMES.find((x) => x.id === o)?.label ?? o : 'Sem desfecho';
const corDesf = (o: Outcome | null) => ({ entregue: 'bg-ok', descartada: 'bg-surface-3', repassada: 'bg-reuniao', revertida: 'bg-danger' } as Record<string, string>)[o ?? ''] ?? 'bg-rule-strong';

const idade = (t: TaskCard) => { const d = diasEntre(t.created_at); return d === 0 ? 'hoje' : `${d}d`; };
const prazo = (t: TaskCard) => {
  if (!t.due_at) return '—';
  const d = -diasEntre(t.due_at);
  return d < 0 ? `${-d}d atrás` : d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : d < 7 ? ['dom','seg','ter','qua','qui','sex','sáb'][new Date(t.due_at).getDay()] : t.due_at.slice(5, 10).split('-').reverse().join('/');
};
const statusRow = (t: TaskCard) => rodando.value?.task_id === t.id ? { l: 'Rodando', c: 'text-vivo-ink' }
  : t.status === 'fazendo' ? { l: 'Fazendo', c: 'text-trabalho' } : { l: 'Na fila', c: 'text-fg-subtle' };

async function carrega(): Promise<void> {
  await Promise.all([carregaQuadro(), carregaDia(dayKey())]);
  const ini = inicioSemana(dayKey());
  const { from } = dayRangeUtc(ini); const { to } = dayRangeUtc(addDays(ini, 6));
  const mes = new Date(); mes.setDate(mes.getDate() - 30);
  const [d, h, f] = await Promise.all([
    api.desfechos(mes.toISOString(), new Date(Date.now() + 86400000).toISOString()),
    api.minutosPorDia(from, to), api.fluxoConcluidas(from, to),
  ]);
  desf.value = d; horasSemana.value = h.reduce((s, x) => s + x.minutos, 0); concluidasSemana.value = f.length;
}
onMounted(carrega);
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-[1120px] px-6 pb-12 pt-7">
      <h1 class="display m-0 text-[44px] leading-none">{{ rotuloDiaLongo() }}</h1>
      <p class="mt-3 text-[16px] text-fg-muted">{{ resumo }}</p>

      <!-- tiles -->
      <!-- Os quatro números tinham barrinhas cujo denominador era inventado
           (abertas*8, concluídas*10, horas/24, atrasadas*25). Régua sem escala
           num app que se diz instrumento de medição. Ficou o número e uma
           segunda linha que é fato, não meta. -->
      <div class="mt-7 grid grid-cols-4 gap-4 max-[1000px]:grid-cols-2">
        <div class="painel p-4">
          <div class="rot">Abertas</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ abertas.length }}</span>
            <span v-if="capturadasHoje" class="med text-[12px] text-accent-ink">+{{ capturadasHoje }} hoje</span>
          </div>
          <div class="mt-2 font-mono text-[11px] text-fg-subtle">
            {{ emCurso }} em curso · {{ abertas.length - emCurso }} na fila
          </div>
        </div>
        <div class="painel p-4">
          <div class="rot">Concluídas / semana</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ concluidasSemana }}</span>
          </div>
          <div class="mt-2 font-mono text-[11px] text-fg-subtle">desde segunda-feira</div>
        </div>
        <div class="painel p-4">
          <div class="rot">Horas / semana</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ fmtHM(horasSemana) }}</span>
          </div>
          <div class="mt-2 font-mono text-[11px] text-fg-subtle">
            {{ fmtHM(totaisDia.total) }} hoje · {{ sessoesDia.length }}
            {{ sessoesDia.length === 1 ? 'sessão' : 'sessões' }}
          </div>
        </div>
        <div class="painel p-4">
          <div class="rot">Atrasadas</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]" :class="atrasadas.length ? 'text-danger' : ''">{{ atrasadas.length }}</span>
          </div>
          <div class="mt-2 font-mono text-[11px]"
            :class="atrasadas.length ? 'text-danger' : 'text-fg-subtle'">
            {{ atrasadas.length ? `a mais antiga há ${maisAntigaAtraso}d` : 'nenhuma vencida' }}
          </div>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-[minmax(0,1fr)_300px] gap-5 max-[1000px]:grid-cols-1">
        <!-- em andamento -->
        <div class="painel">
          <div class="flex items-center border-b border-rule px-4 py-3">
            <span class="text-[14px] font-semibold">Em andamento</span>
            <button class="ml-auto text-[12px] text-fg-muted hover:text-fg" @click="router.push('/quadro')">Quadro →</button>
          </div>
          <p v-if="!emAndamento.length" class="px-4 py-6 text-[14px] text-fg-subtle">Nada na fila. Puxe do backlog.</p>
          <button v-for="t in emAndamento" :key="t.id" @click="abreDetalhe(t.id)"
            class="linha w-full grid-cols-[14px_minmax(0,1fr)_auto_auto_auto] text-left">
            <span class="h-2.5 w-2.5 rounded-full border"
              :class="rodando?.task_id === t.id ? 'border-vivo bg-vivo' : t.status === 'fazendo' ? 'border-trabalho' : 'border-fg-subtle'" />
            <div class="min-w-0">
              <div class="truncate text-[14px] font-medium">{{ t.title }}</div>
              <div class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
                <ChipProjeto v-if="t.project_id" variante="linha" :nome="t.project_name"
                  :cor="t.project_color" />
                <span v-if="t.project_id">·</span>
                <span>{{ fmtHM(t.minutos) }}</span>
                <span v-if="t.kind === 'reuniao'" class="text-reuniao">· reunião</span>
              </div>
            </div>
            <span class="med text-[12px] font-medium" :class="statusRow(t).c">{{ statusRow(t).l }}</span>
            <span class="med w-14 text-right text-[12px]" :class="t.due_at && diasEntre(t.due_at) > 0 ? 'text-danger' : 'text-fg-muted'">{{ prazo(t) }}</span>
            <span class="med w-8 text-right text-[11px] text-fg-subtle">{{ idade(t) }}</span>
          </button>
        </div>

        <div class="flex flex-col gap-5">
          <!-- como terminaram -->
          <div class="painel p-4">
            <div class="mb-3 text-[14px] font-semibold">Como terminaram <span class="rot ml-1 !text-[11px]">30d</span></div>
            <p v-if="!desf.length" class="text-[12px] text-fg-subtle">Nada concluído ainda.</p>
            <div v-for="d in desf" :key="String(d.outcome)" class="mb-2 grid grid-cols-[86px_1fr_auto] items-center gap-2 text-[12px]">
              <span class="text-fg-muted">{{ labelDesf(d.outcome) }}</span>
              <div class="h-[5px] rounded-full bg-surface-3"><div class="h-full rounded-full" :class="corDesf(d.outcome)" :style="{ width: (d.n / totalDesf) * 100 + '%' }" /></div>
              <span class="med text-[11px] text-fg-subtle">{{ d.n }}</span>
            </div>
          </div>

          <!-- hoje -->
          <div class="painel p-4">
            <div class="mb-2 flex items-baseline">
              <span class="text-[14px] font-semibold">Hoje</span>
              <button class="ml-auto text-[12px] text-fg-muted hover:text-fg" @click="router.push('/hoje')">ver dia →</button>
            </div>
            <div class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ fmtHM(totaisDia.total) }}</div>
            <div class="mt-2 flex h-[5px] overflow-hidden rounded-full bg-surface-3">
              <div class="bg-trabalho" :style="{ width: totaisDia.total ? (totaisDia.trabalho / totaisDia.total) * 100 + '%' : '0%' }" />
              <div class="bg-reuniao" :style="{ width: totaisDia.total ? (totaisDia.reuniao / totaisDia.total) * 100 + '%' : '0%' }" />
              <div class="bg-admin" :style="{ width: totaisDia.total ? (totaisDia.admin / totaisDia.total) * 100 + '%' : '0%' }" />
            </div>
            <div class="mt-2 flex gap-3 font-mono text-[11px] text-fg-subtle">
              <span><i class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-trabalho" />{{ fmtHM(totaisDia.trabalho) }}</span>
              <span><i class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-reuniao" />{{ fmtHM(totaisDia.reuniao) }}</span>
              <span><i class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-admin" />{{ fmtHM(totaisDia.admin) }}</span>
            </div>
            <div class="mt-3 border-t border-rule pt-2 text-[12px] text-fg-muted">
              {{ sessoesDia.length }} {{ sessoesDia.length === 1 ? 'sessão' : 'sessões' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
