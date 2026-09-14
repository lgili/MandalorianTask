<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BarChart from '../components/BarChart.vue';
import * as api from '../lib/db';
import type { TaskFlow, DayTimeRow, ProjectTimeRow } from '../lib/db';
import { toast } from '../lib/toast';
import { addDays, dayKey, dayRangeUtc, fmtHM, startOfWeek, fmtDay } from '../lib/time';

const week = ref(startOfWeek(dayKey()));
const byDay = ref<DayTimeRow[]>([]);
const byProject = ref<ProjectTimeRow[]>([]);
const flows = ref<TaskFlow[]>([]);

const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(week.value, i)));

const series = computed(() => days.value.map((d) => {
  const rows = byDay.value.filter((x) => x.day === d);
  const minutesOf = (k: string) => rows.find((x) => x.kind === k)?.minutes ?? 0;
  return { label: fmtDay(d).slice(0, 3), work: minutesOf('work'),
           meeting: minutesOf('meeting'), admin: minutesOf('admin') };
}));

const total = computed(() => series.value.reduce((s, d) => s + d.work + d.meeting + d.admin, 0));
const meetingTotal = computed(() => series.value.reduce((s, d) => s + d.meeting, 0));
const meetingPct = computed(() => total.value ? Math.round((meetingTotal.value / total.value) * 100) : 0);

const medianCycle = computed(() => {
  const v = flows.value.map((f) => f.cycle_h).filter((x): x is number => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
});

async function load(): Promise<void> {
  const { from } = dayRangeUtc(week.value);
  const { to } = dayRangeUtc(addDays(week.value, 6));
  try {
    [byDay.value, byProject.value, flows.value] = await Promise.all([
      api.sumTimeByDay(from, to), api.sumTimeByProject(from, to), api.listCompletedFlows(from, to),
    ]);
  } catch (e) { toast.error(api.dbError(e)); }
}

function shiftWeek(n: number): void { week.value = addDays(week.value, n * 7); load(); }
onMounted(load);
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="flex max-w-[980px] flex-col gap-4 px-6 pb-10 pt-3">
      <div class="flex items-center gap-2">
        <button class="btn" @click="shiftWeek(-1)">←</button>
        <span class="mono text-[12px] text-fg-muted">
          {{ fmtDay(week) }} — {{ fmtDay(addDays(week, 6)) }}</span>
        <button class="btn" @click="shiftWeek(1)">→</button>
        <button class="btn ml-auto" @click="week = startOfWeek(dayKey()); load()">this week</button>
      </div>

      <div class="panel">
        <div class="flex items-center gap-3 border-b border-rule px-6 py-2.5">
          <span class="label">Hours per day</span>
          <span class="mono ml-auto text-[14px] font-semibold">{{ fmtHM(total) }}</span>
        </div>
        <div class="overflow-x-auto p-3"><BarChart :series="series" /></div>
        <div class="flex gap-4 border-t border-rule px-6 py-2 font-mono text-[11px] text-fg-muted">
          <span><i class="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-work" />work</span>
          <span><i class="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-meeting" />meeting</span>
          <span><i class="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-admin" />admin</span>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="panel">
          <div class="border-b border-rule px-6 py-2.5"><span class="label">Meetings × work</span></div>
          <div class="p-4">
            <div class="mono mb-2 text-[24px] font-semibold leading-none"
                 :class="meetingPct >= 40 ? 'text-meeting' : 'text-fg'">{{ meetingPct }}%</div>
            <p class="text-[12px] leading-relaxed text-fg-subtle">
              {{ total ? `${fmtHM(meetingTotal)} in meetings this week.` : 'Nothing logged this week.' }}
            </p>
          </div>
        </div>

        <div class="panel">
          <div class="border-b border-rule px-6 py-2.5">
            <span class="label">Cycle time</span>
            <span class="ml-2 text-[11px] text-fg-subtle">from start to finish</span>
          </div>
          <div class="p-4">
            <div class="mono mb-2 text-[24px] font-semibold leading-none">
              {{ medianCycle != null ? `${medianCycle}h` : '—' }}</div>
            <p class="text-[12px] leading-relaxed text-fg-subtle">
              median of {{ flows.length }} {{ flows.length === 1 ? 'completed task' : 'completed tasks' }}
            </p>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="border-b border-rule px-6 py-2.5"><span class="label">By project</span></div>
        <div class="px-6 py-1">
          <p v-if="!byProject.length" class="py-3 text-[12px] text-fg-subtle">Nothing this week.</p>
          <div v-for="l in byProject" :key="String(l.project_id)"
            class="flex items-baseline gap-3 border-b border-rule py-2 text-[14px] last:border-b-0">
            <span class="min-w-0 truncate">{{ l.project_name ?? '— no project —' }}</span>
            <span class="mono ml-auto text-[12px] text-fg-muted">{{ fmtHM(l.minutes) }}</span>
            <span class="mono w-9 text-right text-[11px] text-fg-subtle">
              {{ total ? Math.round((l.minutes / total) * 100) : 0 }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
