<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Outcome, TaskCard } from '../lib/types';
import { OUTCOMES } from '../lib/types';
import * as api from '../lib/db';
import { openTaskDetail, loadDay, loadBoard, running, daySessions, tasks, dayTotals } from '../lib/store';
import ProjectChip from '../components/ProjectChip.vue';
import { addDays, dayKey, dayRangeUtc, daysBetween, fmtHM, startOfWeek, fmtDayLong } from '../lib/time';
import { now, fmtElapsed } from '../lib/clock';

const router = useRouter();
const outcomes = ref<Array<{ outcome: Outcome | null; n: number }>>([]);
const weekMinutes = ref(0);
const weekCompleted = ref(0);

const openTasks = computed(() => tasks.value.filter((t) => t.status === 'queued' || t.status === 'doing'));
const inProgress = computed(() => tasks.value.filter((t) => t.status === 'doing').length);
const capturedToday = computed(() => tasks.value
  .filter((t) => dayKey(new Date(t.created_at)) === dayKey()).length);
const overdue = computed(() => tasks.value.filter((t) => t.due_at && t.status !== 'done' && daysBetween(t.due_at) > 0));
const oldestOverdue = computed(() => Math.max(0, ...overdue.value.map((t) => daysBetween(t.due_at!))));
const dueThisWeek = computed(() => tasks.value.filter((t) => t.due_at && t.status !== 'done'
  && daysBetween(t.due_at) <= 0 && daysBetween(t.due_at) >= -7).length);

const active = computed(() => [...tasks.value]
  .filter((t) => t.status === 'doing' || t.status === 'queued')
  .sort((a, b) => (a.status === b.status ? 0 : a.status === 'doing' ? -1 : 1))
  .slice(0, 8));

const summary = computed(() => {
  const parts: string[] = [];
  if (dueThisWeek.value) parts.push(`${dueThisWeek.value === 1 ? 'One task is' : dueThisWeek.value + ' tasks are'} due this week.`);
  if (overdue.value.length) parts.push(`${overdue.value.length === 1 ? 'One overdue' : overdue.value.length + ' overdue'}, the oldest ${oldestOverdue.value}d ago.`);
  if (running.value) parts.push(`Running "${running.value.title}" for ${fmtElapsed(running.value.started_at, now.value).slice(0, 5)}.`);
  else parts.push('Nothing running right now.');
  return parts.join(' ');
});

const outcomeTotal = computed(() => outcomes.value.reduce((s, d) => s + d.n, 0));
const outcomeLabel = (o: Outcome | null) => o ? OUTCOMES.find((x) => x.id === o)?.label ?? o : 'No outcome';
const outcomeColor = (o: Outcome | null) => ({ delivered: 'bg-ok', dropped: 'bg-surface-3', handed_off: 'bg-meeting', reverted: 'bg-danger' } as Record<string, string>)[o ?? ''] ?? 'bg-rule-strong';

const age = (t: TaskCard) => { const d = daysBetween(t.created_at); return d === 0 ? 'today' : `${d}d`; };
const dueLabel = (t: TaskCard) => {
  if (!t.due_at) return '—';
  const d = -daysBetween(t.due_at);
  return d < 0 ? `${-d}d ago` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 7 ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(t.due_at).getDay()] : t.due_at.slice(5, 10).split('-').reverse().join('/');
};
const statusRow = (t: TaskCard) => running.value?.task_id === t.id ? { l: 'Running', c: 'text-live-ink' }
  : t.status === 'doing' ? { l: 'Doing', c: 'text-work' } : { l: 'Queued', c: 'text-fg-subtle' };

async function load(): Promise<void> {
  await Promise.all([loadBoard(), loadDay(dayKey())]);
  const start = startOfWeek(dayKey());
  const { from } = dayRangeUtc(start); const { to } = dayRangeUtc(addDays(start, 6));
  const month = new Date(); month.setDate(month.getDate() - 30);
  const [d, h, f] = await Promise.all([
    api.countOutcomes(month.toISOString(), new Date(Date.now() + 86400000).toISOString()),
    api.sumTimeByDay(from, to), api.listCompletedFlows(from, to),
  ]);
  outcomes.value = d; weekMinutes.value = h.reduce((s, x) => s + x.minutes, 0); weekCompleted.value = f.length;
}
onMounted(load);
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-[1120px] px-6 pb-12 pt-7">
      <h1 class="display m-0 text-[44px] leading-none">{{ fmtDayLong() }}</h1>
      <p class="mt-3 text-[16px] text-fg-muted">{{ summary }}</p>

      <!-- tiles -->
      <!-- The four numbers used to have little bars with a made-up denominator
           (open*8, completed*10, hours/24, overdue*25). A ruler with no scale
           in an app that calls itself a measuring instrument. What stayed is the
           number and a second line that is a fact, not a goal. -->
      <div class="mt-7 grid grid-cols-4 gap-4 max-[1000px]:grid-cols-2">
        <div class="panel p-4">
          <div class="label">Open</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ openTasks.length }}</span>
            <span v-if="capturedToday" class="mono text-[12px] text-accent-ink">+{{ capturedToday }} today</span>
          </div>
          <div class="mt-2 font-mono text-[11px] text-fg-subtle">
            {{ inProgress }} in progress · {{ openTasks.length - inProgress }} queued
          </div>
        </div>
        <div class="panel p-4">
          <div class="label">Completed / week</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ weekCompleted }}</span>
          </div>
          <div class="mt-2 font-mono text-[11px] text-fg-subtle">since Monday</div>
        </div>
        <div class="panel p-4">
          <div class="label">Hours / week</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ fmtHM(weekMinutes) }}</span>
          </div>
          <div class="mt-2 font-mono text-[11px] text-fg-subtle">
            {{ fmtHM(dayTotals.total) }} today · {{ daySessions.length }}
            {{ daySessions.length === 1 ? 'session' : 'sessions' }}
          </div>
        </div>
        <div class="panel p-4">
          <div class="label">Overdue</div>
          <div class="mt-1.5 flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]" :class="overdue.length ? 'text-danger' : ''">{{ overdue.length }}</span>
          </div>
          <div class="mt-2 font-mono text-[11px]"
            :class="overdue.length ? 'text-danger' : 'text-fg-subtle'">
            {{ overdue.length ? `oldest ${oldestOverdue}d ago` : 'none overdue' }}
          </div>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-[minmax(0,1fr)_300px] gap-5 max-[1000px]:grid-cols-1">
        <!-- in progress -->
        <div class="panel">
          <div class="flex items-center border-b border-rule px-4 py-3">
            <span class="text-[14px] font-semibold">In progress</span>
            <button class="ml-auto text-[12px] text-fg-muted hover:text-fg" @click="router.push('/board')">Board →</button>
          </div>
          <p v-if="!active.length" class="px-4 py-6 text-[14px] text-fg-subtle">Nothing queued. Pull from the backlog.</p>
          <button v-for="t in active" :key="t.id" @click="openTaskDetail(t.id)"
            class="row w-full grid-cols-[14px_minmax(0,1fr)_auto_auto_auto] text-left">
            <span class="h-2.5 w-2.5 rounded-full border"
              :class="running?.task_id === t.id ? 'border-live bg-live' : t.status === 'doing' ? 'border-work' : 'border-fg-subtle'" />
            <div class="min-w-0">
              <div class="truncate text-[14px] font-medium">{{ t.title }}</div>
              <div class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
                <ProjectChip v-if="t.project_id" variant="line" :name="t.project_name"
                  :color="t.project_color" />
                <span v-if="t.project_id">·</span>
                <span>{{ fmtHM(t.minutes) }}</span>
                <span v-if="t.kind === 'meeting'" class="text-meeting">· meeting</span>
              </div>
            </div>
            <span class="mono text-[12px] font-medium" :class="statusRow(t).c">{{ statusRow(t).l }}</span>
            <span class="mono w-14 text-right text-[12px]" :class="t.due_at && daysBetween(t.due_at) > 0 ? 'text-danger' : 'text-fg-muted'">{{ dueLabel(t) }}</span>
            <span class="mono w-8 text-right text-[11px] text-fg-subtle">{{ age(t) }}</span>
          </button>
        </div>

        <div class="flex flex-col gap-5">
          <!-- how they ended -->
          <div class="panel p-4">
            <div class="mb-3 text-[14px] font-semibold">How they ended <span class="label ml-1 !text-[11px]">30d</span></div>
            <p v-if="!outcomes.length" class="text-[12px] text-fg-subtle">Nothing completed yet.</p>
            <div v-for="d in outcomes" :key="String(d.outcome)" class="mb-2 grid grid-cols-[86px_1fr_auto] items-center gap-2 text-[12px]">
              <span class="text-fg-muted">{{ outcomeLabel(d.outcome) }}</span>
              <div class="h-[5px] rounded-full bg-surface-3"><div class="h-full rounded-full" :class="outcomeColor(d.outcome)" :style="{ width: (d.n / outcomeTotal) * 100 + '%' }" /></div>
              <span class="mono text-[11px] text-fg-subtle">{{ d.n }}</span>
            </div>
          </div>

          <!-- today -->
          <div class="panel p-4">
            <div class="mb-2 flex items-baseline">
              <span class="text-[14px] font-semibold">Today</span>
              <button class="ml-auto text-[12px] text-fg-muted hover:text-fg" @click="router.push('/today')">see day →</button>
            </div>
            <div class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ fmtHM(dayTotals.total) }}</div>
            <div class="mt-2 flex h-[5px] overflow-hidden rounded-full bg-surface-3">
              <div class="bg-work" :style="{ width: dayTotals.total ? (dayTotals.work / dayTotals.total) * 100 + '%' : '0%' }" />
              <div class="bg-meeting" :style="{ width: dayTotals.total ? (dayTotals.meeting / dayTotals.total) * 100 + '%' : '0%' }" />
              <div class="bg-admin" :style="{ width: dayTotals.total ? (dayTotals.admin / dayTotals.total) * 100 + '%' : '0%' }" />
            </div>
            <div class="mt-2 flex gap-3 font-mono text-[11px] text-fg-subtle">
              <span><i class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-work" />{{ fmtHM(dayTotals.work) }}</span>
              <span><i class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-meeting" />{{ fmtHM(dayTotals.meeting) }}</span>
              <span><i class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-admin" />{{ fmtHM(dayTotals.admin) }}</span>
            </div>
            <div class="mt-3 border-t border-rule pt-2 text-[12px] text-fg-muted">
              {{ daySessions.length }} {{ daySessions.length === 1 ? 'session' : 'sessions' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
