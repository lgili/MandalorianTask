<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import Card from '../components/Card.vue';
import CaptureLine from '../components/CaptureLine.vue';
import type { TaskCard, TaskStatus } from '../lib/types';
import { draggingTaskId, loadProjects, loadBoard, complete, move, pause, running, tasks } from '../lib/store';
import { fmtHM } from '../lib/time';
import { ref } from 'vue';

// The backlog has a screen of its own (Capture), so the board has three wide
// columns instead of four cramped ones — which also makes it fit on Windows at 150% scaling.
const COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'queued', label: 'Queue' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done · 14d' },
];

const dragOver = ref<TaskStatus | null>(null);

const tasksIn = (id: TaskStatus) => tasks.value.filter((t) => t.status === id);
const columns = computed(() => COLUMNS.map((c) => ({ ...c, items: tasksIn(c.id) })));

/** Only ONE task runs at a time, even with several in "Doing". */
const runningId = computed(() => running.value?.task_id ?? null);

function runningSince(t: TaskCard): string | null {
  return t.id === runningId.value ? running.value!.started_at : null;
}

const columnTotal = (items: TaskCard[]) => fmtHM(items.reduce((s, t) => s + t.minutes, 0));

async function onDrop(status: TaskStatus): Promise<void> {
  const id = draggingTaskId.value;
  draggingTaskId.value = null;
  dragOver.value = null;
  if (id != null) await move(id, status);
}

onMounted(async () => { await loadProjects(); await loadBoard(); });
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- A permanent field, not a button that opens and closes: the old pattern
         cost one click per task. And here capture understands `#project`,
         so the board stopped producing orphan tasks. -->
    <div class="flex flex-none items-start gap-3 px-6 pb-2 pt-3">
      <div class="max-w-[420px] flex-1">
        <CaptureLine initial-status="queued" :hints="false"
          placeholder="new task in the queue…" @created="loadBoard" />
      </div>
      <span class="mt-2 ml-auto font-mono text-[11px] text-fg-subtle">
        ▶ on a card starts the clock · drag to move
      </span>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-hidden px-6 pb-4">
      <div v-for="col in columns" :key="col.id"
        class="lane flex min-h-0 flex-col transition-colors"
        :class="dragOver === col.id && 'ring-2 ring-inset ring-accent/60 !bg-accent/10'"
        @dragover.prevent="dragOver = col.id" @dragleave="dragOver = null" @drop.prevent="onDrop(col.id)">

        <div class="flex flex-none items-center gap-2 px-2.5 pb-1.5 pt-2.5">
          <span class="label !text-fg-muted">{{ col.label }}</span>
          <span class="chip bg-surface-3 text-fg-muted">{{ col.items.length }}</span>
          <!-- three in progress, one running: the distinction the app makes -->
          <span v-if="col.id === 'doing' && running"
            class="chip bg-live/15 text-live-ink gap-1">
            <span class="h-1.5 w-1.5 rounded-full bg-live" />1 running
          </span>
          <span class="mono ml-auto text-[11px] font-semibold text-fg-muted">{{ columnTotal(col.items) }}</span>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          <div v-for="t in col.items" :key="t.id" draggable="true"
            :class="draggingTaskId === t.id && 'opacity-40'"
            @dragstart="draggingTaskId = t.id" @dragend="draggingTaskId = null; dragOver = null">
            <Card :card="t" :running-since="runningSince(t)"
                  @start="move($event, 'doing')" @pause="pause()"
                  @complete="complete($event, 'delivered', null)" />
          </div>
          <!-- 'empty' was a dev placeholder, and it was what a new user saw
               in two of the three columns the first time they opened the Board. -->
          <p v-if="!col.items.length" class="px-1 py-3 text-[12px] leading-relaxed text-fg-subtle">
            <template v-if="col.id === 'queued'">
              Nothing picked for now.<br>
              <RouterLink to="/capture" class="text-accent-ink hover:underline">pull from capture →</RouterLink>
            </template>
            <template v-else-if="col.id === 'doing'">
              Nothing in progress.<br>Drag a card here — that's what starts the clock.
            </template>
            <template v-else>Nothing completed in the last 14 days.</template>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
