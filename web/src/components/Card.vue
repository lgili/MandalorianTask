<script setup lang="ts">
import { computed } from 'vue';
import { Clock, Repeat, Play, Pause, Check } from 'lucide-vue-next';
import ProjectChip from './ProjectChip.vue';
import type { TaskCard } from '../lib/types';
import { fmtHM } from '../lib/time';
import { now, fmtElapsed, elapsedMinutes } from '../lib/clock';
import { openTaskDetail } from '../lib/store';

const props = defineProps<{ card: TaskCard; runningSince?: string | null }>();
const emit = defineEmits<{ start: [id: number]; pause: []; complete: [id: number] }>();

const totalTime = computed(() => props.runningSince
  ? fmtHM(props.card.minutes + elapsedMinutes(props.runningSince, now.value))
  : fmtHM(props.card.minutes));
const clock = computed(() => props.runningSince ? fmtElapsed(props.runningSince, now.value) : null);

const daysLeft = computed(() => {
  if (!props.card.due_at) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(props.card.due_at); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
});
const due = computed(() => {
  const n = daysLeft.value;
  if (n === null) return null;
  if (n < 0) return `${-n}d overdue`;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n <= 6) return `${n}d`;
  return new Date(props.card.due_at!).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
});
</script>

<template>
  <div class="group relative cursor-grab rounded-xl border bg-surface p-3 transition-[transform,box-shadow,border-color]
              hover:-translate-y-px hover:shadow-pop active:cursor-grabbing"
    :class="runningSince ? 'border-accent/60 shadow-live' : 'border-rule hover:border-rule-strong'">

    <!-- background glow on whatever is running -->
    <div v-if="runningSince" class="pointer-events-none absolute inset-0 rounded-xl bg-accent/[0.06]" />

    <div class="relative flex items-start gap-2">
      <span class="mt-[5px] flex-none">
        <ProjectChip variant="dot" size="md" :color="card.project_color" />
      </span>
      <div class="min-w-0 flex-1">
        <button class="line-clamp-2 text-left text-[14px] font-semibold leading-[1.35] tracking-[-0.01em] hover:text-accent-ink"
                @click.stop="openTaskDetail(card.id)">{{ card.title }}</button>
        <div v-if="card.origin_title" class="mt-0.5 truncate text-[11px] text-fg-subtle">
          from {{ card.origin_title }}
        </div>
      </div>

      <!-- actions: they show on hover; the running one is always visible -->
      <div class="flex flex-none items-center gap-0.5 -mr-1 -mt-1"
           :class="runningSince ? '' : 'opacity-0 transition-opacity group-hover:opacity-100'">
        <button v-if="runningSince" class="btn btn-ghost btn-icon !text-live-ink" title="Pause"
                @click.stop="emit('pause')"><Pause class="h-3.5 w-3.5" /></button>
        <button v-else class="btn btn-ghost btn-icon" title="Start now"
                @click.stop="emit('start', card.id)"><Play class="h-3.5 w-3.5" /></button>
        <button v-if="card.status !== 'done'" class="btn btn-ghost btn-icon" title="Complete"
                @click.stop="emit('complete', card.id)"><Check class="h-3.5 w-3.5" /></button>
      </div>
    </div>

    <div class="relative mt-2.5 flex items-center gap-2 font-mono text-[11px] text-fg-subtle">
      <ProjectChip v-if="card.project_id" :code="card.project_code" :name="card.project_name"
        :color="card.project_color" />
      <span v-if="card.kind === 'meeting'" class="chip bg-meeting/15 text-meeting">meeting</span>
      <span v-else-if="card.kind === 'admin'" class="chip bg-surface-3 text-fg-muted">admin</span>
      <span v-if="due" class="flex items-center gap-1 font-medium"
        :class="daysLeft !== null && daysLeft <= 1 ? 'text-danger' : 'text-warn'">
        <Clock class="h-3 w-3" />{{ due }}
      </span>
      <span v-if="card.session_count > 2" class="flex items-center gap-0.5" :title="`${card.session_count} sessions`">
        <Repeat class="h-3 w-3" />{{ card.session_count }}
      </span>
      <span class="ml-auto text-[12px] font-semibold leading-none"
        :class="runningSince ? 'text-live-ink' : 'text-fg-muted'">{{ clock ?? totalTime }}</span>
    </div>
  </div>
</template>
