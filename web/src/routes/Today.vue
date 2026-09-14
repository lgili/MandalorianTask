<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-vue-next';
import SessionEditor from '../components/SessionEditor.vue';
import type { SessionCard } from '../lib/types';
import * as api from '../lib/db';
import { loadDay, currentDay, daySessions, dayTotals } from '../lib/store';
import { toast } from '../lib/toast';
import { addDays, dayKey, durationMin, fmtDur, fmtHM, hhmm, fmtDay } from '../lib/time';
import { now, fmtElapsed } from '../lib/clock';

const editing = ref<SessionCard | null>(null);
const isToday = computed(() => currentDay.value === dayKey());

const KIND = { work: 'work', meeting: 'meeting', admin: 'admin' } as const;
const COLOR = { work: 'bg-work', meeting: 'bg-meeting', admin: 'bg-admin' } as const;

const rows = computed(() => daySessions.value.map((s) => ({
  s,
  dur: s.ended_at ? fmtDur(durationMin(s.started_at, s.ended_at)) : fmtElapsed(s.started_at, now.value),
  isOpen: !s.ended_at,
})));

/** Share of each type, for the day's proportion bar. */
const split = computed(() => {
  const t = dayTotals.value;
  if (!t.total) return [];
  return (['work', 'meeting', 'admin'] as const)
    .filter((k) => t[k] > 0)
    .map((k) => ({ k, pct: Math.round((t[k] / t.total) * 100), min: t[k] }));
});

async function onSave(id: number, patch: { started_at: string; ended_at: string }): Promise<void> {
  try {
    await api.updateSession(id, patch);
    editing.value = null;
    await loadDay();
  } catch (e) { toast.error(api.dbError(e)); }
}

async function onDelete(id: number): Promise<void> {
  try {
    await api.deleteSession(id);
    editing.value = null;
    await loadDay();
  } catch (e) { toast.error(api.dbError(e)); }
}

onMounted(() => loadDay());
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-none flex-wrap items-center gap-3 px-6 pb-2.5 pt-3">
      <div class="flex items-center gap-0.5">
        <button class="grid h-6 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
          aria-label="Previous day" @click="loadDay(addDays(currentDay, -1))">
          <ChevronLeft class="h-4 w-4" /></button>
        <span class="px-1.5 text-[14px] font-semibold tracking-tight">{{ fmtDay(currentDay) }}</span>
        <button class="grid h-6 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
          aria-label="Next day" @click="loadDay(addDays(currentDay, 1))">
          <ChevronRight class="h-4 w-4" /></button>
        <button v-if="!isToday" class="btn ml-2" @click="loadDay(dayKey())">today</button>
      </div>

      <div class="ml-auto flex items-baseline gap-1.5">
        <span class="mono text-[24px] font-semibold leading-none">{{ fmtHM(dayTotals.total) }}</span>
        <span class="label">logged</span>
      </div>
    </div>

    <!-- the day's split: one bar, no chart -->
    <div v-if="split.length" class="flex-none px-6 pb-3">
      <div class="flex h-1.5 overflow-hidden rounded-full">
        <div v-for="p in split" :key="p.k" :class="COLOR[p.k]" :style="{ width: p.pct + '%' }"
             :title="`${KIND[p.k]} ${fmtHM(p.min)}`" />
      </div>
      <div class="mt-1.5 flex gap-4 font-mono text-[11px] text-fg-subtle">
        <span v-for="p in split" :key="p.k" class="flex items-center gap-1.5">
          <i class="h-2 w-2 rounded-[2px]" :class="COLOR[p.k]" />
          {{ KIND[p.k] }} {{ fmtHM(p.min) }}
        </span>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
      <div class="max-w-[820px]">
      <p v-if="!rows.length" class="mt-16 text-center text-[14px] text-fg-subtle">
        Nothing logged this day.<br>
        <span class="text-[12px]">Moving a card to <b>Doing</b> on the Board starts the clock.</span>
      </p>

      <div v-for="l in rows" :key="l.s.id"
        class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[5px] border-b
               border-rule px-2 py-[7px] transition-colors hover:bg-surface"
        :class="l.isOpen && 'bg-accent/10'">
        <span class="mono text-[11px] text-fg-subtle">
          {{ hhmm(l.s.started_at) }}–{{ l.s.ended_at ? hhmm(l.s.ended_at) : '…' }}
        </span>

        <div class="flex min-w-0 items-center gap-2">
          <span class="h-3.5 w-[3px] flex-none rounded-full" :class="COLOR[l.s.kind]" />
          <span class="truncate text-[14px]">{{ l.s.title }}</span>
          <span v-if="l.s.project_code" class="mono flex-none text-[11px] text-fg-subtle">
            {{ l.s.project_code }}</span>
          <span v-if="l.s.source === 'manual'" class="label flex-none !text-[11px]">manual</span>
        </div>

        <div class="flex flex-none items-center gap-2">
          <button v-if="!l.isOpen"
            class="rounded-[3px] p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-2
                   hover:text-fg group-hover:opacity-100"
            title="Fix time" @click="editing = l.s">
            <Pencil class="h-3.5 w-3.5" />
          </button>
          <span class="mono w-[68px] text-right text-[14px] font-semibold"
            :class="l.isOpen ? 'text-accent-ink' : 'text-fg-muted'">{{ l.dur }}</span>
        </div>
      </div>
      </div>
    </div>

    <SessionEditor :session="editing" :day="currentDay"
      @save="onSave" @delete="onDelete" @close="editing = null" />
  </div>
</template>
